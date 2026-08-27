// dragCanvas.js
//
// Draggable canvas class. Stores its pan position per-layer.
// Uses pointer events, so it works on mouse or touch
// Panning is through CSS transform, makes things smoother and quicker and easier

import { state, getLayerState } from "../core/state.js";
import { canAfford, spend, formatCost, costParts } from "../core/resources.js";
import { parentsOf, nodeOwned, nodeVisible, prereqMet } from "../core/nodes.js";
import { formatNumber } from "../utils/format.js";
import { hexToPixel, neighboursOf, areNeighbours } from "../utils/hex.js";
import { setText } from "../utils/dom.js";
import { setRichText } from "./richText.js";
import { markDirty, refreshCanvasControls } from "./canvasRouter.js";

const SVG_NS = "http://www.w3.org/2000/svg";

// core: green and blue cores themselves
// major: unlocks a layer, usually (sometimes just very important stuff)
// sublayer: unlocks a sub-layer, usually
// unlock: normal upgrade nodes

const NODE_SIZE = { core: 150,  major: 115, layer: 90, sublayer: 70, unlock: 65 };

const anonymousTitle = () => "???";

// Little bit of wiggle room for what counts as a click vs. a drag
const DRAG_ROOM = 4;

// Fixed zoom steps, because it sucks to end up at like 81% zoom and not be at a good size
const ZOOM_STEPS = [0.6, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75];

// The map opens at whatever size the rest of the interface has scaled itself to
const uiScale = () => parseFloat(getComputedStyle(document.documentElement).fontSize) / 16 || 1;

// Some layers are larger, so this just sets whatever the starting zoom should be for a layer
const defaultZoomStep = (layer) => {
    const want = uiScale() * (layer.defaultZoom || 1);
    return ZOOM_STEPS.reduce((best, step, i) =>
        Math.abs(step - want) < Math.abs(ZOOM_STEPS[best] - want) ? i : best, 0);
};

// How far apart two fingers have to move before a pinch takes a zoom step
const PINCH_STEP = 1.22;

// How long the view takes to slide when something asks to be centered on
const PAN_TWEEN_MS = 420;

// How far out past the nodes that you can pan, so that you have some space but you won't
// be able to just pan super far away
const PAN_MARGIN = 400;
const PAN_MARGIN_SHARE = 0.75;
const panMargin = (viewportSize) => Math.max(PAN_MARGIN, viewportSize * PAN_MARGIN_SHARE);

const instances = new Map();

export function getDragCanvas(layer, container) {
    let instance = instances.get(layer.id);
    if (!instance || instance.container !== container) {
        instance = new DragCanvas(layer, container);
        instances.set(layer.id, instance);
    }
    return instance;
}

// This is just for the dev function that lets you see canvas coordinates of the mouse
export function refreshCoordReadouts() {
    for (const instance of instances.values()) instance._updateCoords();
}

// This is for completely getting rid of a canvas rather than just hiding it 
export function forgetDragCanvas(layerId) {
    const instance = instances.get(layerId);
    if (!instance) return;
    if (instance._resizeObserver) instance._resizeObserver.disconnect();
    instances.delete(layerId);
}

class DragCanvas {
    constructor(layer, container) {
        this.layer = layer;
        this.container = container;
        this.panX = 0;
        this.panY = 0;
        this.zoomStep = defaultZoomStep(layer);
        this.isDragging = false;
        this.lastPointer = { x: 0, y: 0 };
        this.pointers = new Map(); // Live touches on the canvas, so two of them can be a pinch
        this.pinchSpan = 0;
        this.subWindowEls = {};
        this.sceneEl = null;
        this.panFrame = null;
        this._rectCache = null;     // Viewport size, re-read only once the observer says it moved
        this._boundsCache = null;   // Content bounds in canvas units, remade when state renders
        this._boundsStale = true;
        this.nodeEls = {};
        this.connectorEls = {};
        this.tileEls = {};
        this.hascenterd = false;

        this.viewport = document.createElement("div");
        this.viewport.className = "drag-canvas-viewport";
        if (layer.viewportClass) this.viewport.classList.add(layer.viewportClass);

        this.inner = document.createElement("div");
        this.inner.className = "drag-canvas-inner";

        this.overlayEl = document.createElement("div");
        this.overlayEl.className = "canvas-overlay";
        this.overlayEl.style.display = "none";

        this.hudEl = document.createElement("div");
        this.hudEl.className = "canvas-hud";

        this.hudEl.addEventListener("pointerdown", (e) => e.stopPropagation());
        this.hudEl.addEventListener("click", (e) => e.stopPropagation());

        // Again just for dev function that lets you see cursor coordinates
        this.coordEl = document.createElement("div");
        this.coordEl.className = "canvas-coords";
        this.coordEl.style.display = "none";
        this.pointerClient = null;

        this.viewport.append(this.inner, this.overlayEl, this.hudEl, this.coordEl);
        container.appendChild(this.viewport);

        this._bindDragEvents();
        this._updateCoords();
        this._buildSubWindows();
        this._buildNodes();
        this._buildScene();
        if (layer.hud) layer.hud.build(this.hudEl, getLayerState(layer.stateKey), layer, this);
    }

    _bindDragEvents() {
        this.viewport.addEventListener("pointerdown", (e) => {
            this._stopPanTween();
            this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (this.pointers.size >= 2) return this._startPinch();

            this.pressing = true;
            this.isDragging = false;
            this.movedWhileDown = false;
            this.lastPointer = { x: e.clientX, y: e.clientY };
            this.pressOrigin = { x: e.clientX, y: e.clientY };
        });

        this.viewport.addEventListener("pointermove", (e) => {
            this.pointerClient = { x: e.clientX, y: e.clientY };
            if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (this.pointers.size >= 2) return this._pinchMove();

            if (this.pressing && !this.isDragging
                && Math.abs(e.clientX - this.pressOrigin.x) + Math.abs(e.clientY - this.pressOrigin.y) > DRAG_ROOM) {
                this.isDragging = true;
                this.movedWhileDown = true;
                this.inner.classList.add("panning");
                this.viewport.setPointerCapture(e.pointerId);
            }

            if (this.isDragging) {
                const dx = e.clientX - this.lastPointer.x;
                const dy = e.clientY - this.lastPointer.y;
                this.lastPointer = { x: e.clientX, y: e.clientY };
                this.panX += dx;
                this.panY += dy;
                this._applyTransform();
            }

            this._updateCoords();
        });

        this.viewport.addEventListener("pointerleave", () => {
            this.pointerClient = null;
            this._updateCoords();
        });

        // Zoom in and out with the mouse wheel if you don't want to use the buttons. Still uses the zoom steps.
        // A wheel over the HUD is the player scrolling a panel, not zooming the map, so it's
        // left alone to do what it would have done
        this.viewport.addEventListener("wheel", (e) => {
            if (this.hudEl.contains(e.target)) return;
            e.preventDefault();
            if (this.stepZoom(e.deltaY < 0 ? 1 : -1, e.clientX, e.clientY)) refreshCanvasControls();
        }, { passive: false });


        // Click on the canvas itself and not an object on it
        this.viewport.addEventListener("click", (e) => {
            if (!this.layer.onCanvasClick || this.movedWhileDown) return;
            if (e.target.closest(".hex-tile, .node, .sub-window, .scene-hit")) return;
            this.layer.onCanvasClick(getLayerState(this.layer.stateKey));
            markDirty(this.layer.stateKey);
        });


        this._resizeObserver = new ResizeObserver(() => {
            this._rectCache = null; // The viewport changed size; next reader measures again
            if (this.hascenterd) this._applyTransform();
            else this.recenter();
        });
        this._resizeObserver.observe(this.viewport);

        const stopDragging = (e) => {
            this.pointers.delete(e.pointerId);
            this.pressing = false;
            this.isDragging = false;
            this.inner.classList.remove("panning");
        };
        this.viewport.addEventListener("pointerup", stopDragging);
        this.viewport.addEventListener("pointercancel", stopDragging);
    }

    // Two fingers down is a pinch rather than a drag, so whatever the first one was doing stops.
    // movedWhileDown stays set so lifting off doesn't land as a click on whatever was underneath
    _startPinch() {
        this.pressing = false;
        this.isDragging = false;
        this.movedWhileDown = true;
        this.inner.classList.remove("panning");
        this.pinchSpan = this._pinchSpan();
    }

    _pinchPair() {
        const [a, b] = this.pointers.values();
        return [a, b];
    }

    _pinchSpan() {
        const [a, b] = this._pinchPair();
        return Math.hypot(a.x - b.x, a.y - b.y);
    }

    _pinchMove() {
        const span = this._pinchSpan();
        if (!this.pinchSpan || !span) return;

        const ratio = span / this.pinchSpan;
        const direction = ratio > PINCH_STEP ? 1 : ratio < 1 / PINCH_STEP ? -1 : 0;
        if (!direction) return;

        // Measured from here on, so a long pinch keeps stepping instead of stopping at one
        this.pinchSpan = span;
        const [a, b] = this._pinchPair();
        if (this.stepZoom(direction, (a.x + b.x) / 2, (a.y + b.y) / 2)) refreshCanvasControls();
    }

    _buildSubWindows() {
        const layerState = getLayerState(this.layer.stateKey);

        for (const subId in this.layer.subWindows) {
            const def = this.layer.subWindows[subId];
            const pos = layerState.subWindowPositions[subId] || def.defaultPosition;

            const el = document.createElement("div");
            el.className = "sub-window";
            el.style.left = `${pos.x}px`;
            el.style.top = `${pos.y}px`;
            el.innerHTML = `
                <div class="sub-window-title">${def.title}</div>
                <div class="sub-window-body"></div>
            `;

            // Makes it so clicking on a tab and dragging the background don't interfere with each othe
            el.addEventListener("pointerdown", (e) => e.stopPropagation());

            if (def.onClick) {
                el.classList.add("clickable");
                el.addEventListener("click", () => {
                    def.onClick(getLayerState(this.layer.stateKey));
                    markDirty(this.layer.stateKey);       // Any click changes the layer's data, so it always redraws
                });
            }

            this.inner.appendChild(el);
            this.subWindowEls[subId] = el;
        }
    }


    // Whatever a layer draws for itself, panned and zoomed along with the nodes
    _buildScene() {
        if (!this.layer.scene) return;
        this.sceneEl = document.createElement("div");
        this.sceneEl.className = "drag-scene";
        this.inner.appendChild(this.sceneEl);
        this.layer.scene.build(this.sceneEl, getLayerState(this.layer.stateKey), this.layer, this);
    }

    _buildNodes() {
        const nodes = this.layer.nodes;
        if (!nodes || Object.keys(nodes).length === 0) return;

        const svg = document.createElementNS(SVG_NS, "svg");
        svg.setAttribute("class", "node-connectors");
        this.inner.appendChild(svg);

        for (const nodeId in nodes) {
            const def = nodes[nodeId];
            const lines = [];

            for (const parentId of parentsOf(def)) {
                const parent = nodes[parentId];
                if (!parent) throw new Error(`Node "${nodeId}" has unknown parent "${parentId}".`);

                const line = document.createElementNS(SVG_NS, "line");
                line.setAttribute("class", "node-connector");
                line.setAttribute("x1", parent.position.x);
                line.setAttribute("y1", parent.position.y);
                line.setAttribute("x2", def.position.x);
                line.setAttribute("y2", def.position.y);
                svg.appendChild(line);
                lines.push({ line, parentId });
            }

            // Lines can be hidden based on other hidden nodes or not-unlocked nodes
            if (lines.length) this.connectorEls[nodeId] = lines;
        }

        for (const nodeId in nodes) {
            const def = nodes[nodeId];
            const size = NODE_SIZE[def.kind] || NODE_SIZE.unlock;

            const el = document.createElement("div");
            el.className = `node node-${def.kind}`;
            el.style.width = `${size}px`;
            el.style.height = `${size}px`;
            el.style.left = `${def.position.x - size / 2}px`;
            el.style.top = `${def.position.y - size / 2}px`;
            if (def.color) el.style.setProperty("--node-color", def.color);

            if (def.aura) el.classList.add(`aura-${def.aura}`);
            if (def.split) el.classList.add("node-split");

            // Aura and split fill are separate so they can animate right
            el.innerHTML = `
                ${def.aura ? auraMarkup() : ""}
                <div class="node-ring"></div>
                <div class="node-face">
                    ${def.combo ? '<div class="node-combo"></div>' : ""}
                    ${def.split ? '<div class="node-split-fill"></div>' : ""}
                    ${def.badge ? '<div class="node-badge"></div>' : ""}
                    <div class="node-title"></div>
                    <div class="node-value"></div>
                    <div class="node-detail"></div>
                </div>
                <div class="node-tooltip"></div>
            `;

            // Makes sure that it doesn't start dragging if you click on a node
            el.addEventListener("pointerdown", (e) => e.stopPropagation());
            el.addEventListener("click", () => this._clickNode(nodeId, def));

            this.inner.appendChild(el);
            this.nodeEls[nodeId] = el;
        }
    }


    _clickNode(nodeId, def) {
        const layerState = getLayerState(this.layer.stateKey);

        // Makes you unable to interact with a node you can't see and/or meet prereqs for
        if (!this._nodeVisible(nodeId, def, layerState)) return;
        if (!this._prereqMet(def, layerState)) return;

        if (def.cost) {
            if (layerState.purchasedUpgrades[nodeId]) return;
            if (!spend(def.cost(layerState))) return;
            layerState.purchasedUpgrades[nodeId] = true;
            if (def.onPurchase) def.onPurchase(layerState);
        } else if (def.onClick) {
            def.onClick(layerState);
        } else {
            return;
        }

        markDirty(this.layer.stateKey);
    }

    _prereqMet(def, layerState) { return prereqMet(this.layer, def, layerState); }
    _nodeVisible(nodeId, def, layerState) { return nodeVisible(this.layer, nodeId, layerState); }

    _renderNodes(layerState) {
        for (const nodeId in this.nodeEls) {
            const def = this.layer.nodes[nodeId];
            const el = this.nodeEls[nodeId];

            // Three visibility tiers, in order of how much they give away:
            //   hidden, not drawn at all
            //   unmet, node that reads "???" and has a vague tooltip
            //   normal, a node you can buy
            const hidden = !this._nodeVisible(nodeId, def, layerState);
            const display = hidden ? "none" : "";
            if (el.style.display !== display) el.style.display = display;

            // Lines are drawn only from parents the player already owns
            for (const { line, parentId } of this.connectorEls[nodeId] || []) {
                const lineDisplay = !hidden && nodeOwned(this.layer, parentId, layerState) ? "" : "none";
                if (line.style.display !== lineDisplay) line.style.display = lineDisplay;
            }
            if (hidden) continue;

            const owned = !!layerState.purchasedUpgrades[nodeId];

            // Owning something counts as meeting its prereqs. Caused problems before without this
            const met = owned || this._prereqMet(def, layerState);

            // Meter drives the ring fill, as a 0 to 1 fraction
            const fill = def.meter ? Math.max(0, Math.min(1, def.meter(layerState))) : 0;
            const fillText = fill.toFixed(3);
            if (el.dataset.fill !== fillText) {
                el.style.setProperty("--node-fill", fill);
                el.dataset.fill = fillText;
            }

            // A running-out bonus, drawn as the node's own color draining off the top of its
            // face. Set as a bare custom property rather than a class, since the state block
            // below rewrites className outright
            if (def.combo) {
                el.style.setProperty("--node-combo",
                    met ? Math.max(0, Math.min(1, def.combo(layerState))) : 0);
            }

            setText(el.querySelector(".node-title"), met ? def.title : anonymousTitle(def));
            setText(el.querySelector(".node-value"), met && def.value ? def.value(layerState) : "");
            setRichText(el.querySelector(".node-detail"), met && def.detail ? def.detail(layerState) : "");
            if (def.badge) this._renderBadge(el, met ? def.badge(layerState) : null);


            // Owned is checked before the price, so that nodes can appear right in the ecosystem layer
            let wantState = "core";
            if (!met) wantState = "unmet";
            else if (owned) wantState = "owned";
            else if (def.cost) {
                wantState = canAfford(def.cost(layerState)) ? "affordable" : "locked";
            }
            if (el.dataset.state !== wantState) {
                el.className = `node node-${def.kind} ${wantState}`
                    + (def.aura ? ` aura-${def.aura}` : "")
                    + (def.split ? " node-split" : "");
                el.dataset.state = wantState;
            }

            let tooltip;
            // Gives a hint for node prereqs that aren't on the tree
            if (!met) tooltip = def.hint ? def.hint(layerState) : "Something is missing...";
            else if (def.cost && !owned) tooltip = `${def.description}\nCost: ${formatCost(def.cost(layerState))}`;
            else tooltip = def.tooltip ? def.tooltip(layerState) : (def.description || "");
            setRichText(el.querySelector(".node-tooltip"), tooltip);
        }
    }

    // For the blue core combo counter. It's through web animations instead of CSS because
    // CSS ended up being weird but animate() just works
    _renderBadge(el, badge) {
        const badgeEl = el.querySelector(".node-badge");
        if (!badgeEl) return;

        if (!badge) {
            badgeEl.style.display = "none";
            badgeEl.dataset.shown = "";
            return;
        }

        badgeEl.style.display = "";
        badgeEl.classList.toggle("full", !!badge.full);

        // early return below, since it changes on frames where the number doesn't
        if (badgeEl.dataset.shown === badge.text) return;
        const first = !badgeEl.dataset.shown;
        badgeEl.dataset.shown = badge.text;
        badgeEl.textContent = badge.text;
        if (first) return;
        // Badge is centered with translateX(-50%) but the animation messes it up
        // So the offset has to go through each keyframe or else it keeps moving
        badgeEl.animate(
            [
                { transform: "translateX(-50%) scale(1)" },
                { transform: "translateX(-50%) scale(1.45)" },
                { transform: "translateX(-50%) scale(1)" },
            ],
            { duration: 260, easing: "ease-out" },
        );
    }

    // Bounds don't move on their own - what counts as content moves only when game state does -
    // so these are remembered between renders instead of being walked out again on every pan step
    _contentBounds() {
        if (!this._boundsStale) return this._boundsCache;
        this._boundsCache = this._measureContentBounds();
        this._boundsStale = false;
        return this._boundsCache;
    }

    _measureContentBounds() {
        const layerState = getLayerState(this.layer.stateKey);
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        const include = (x, y, halfW, halfH) => {
            minX = Math.min(minX, x - halfW); maxX = Math.max(maxX, x + halfW);
            minY = Math.min(minY, y - halfH); maxY = Math.max(maxY, y + halfH);
        };

        for (const nodeId in this.layer.nodes) {
            const def = this.layer.nodes[nodeId];
            if (!this._nodeVisible(nodeId, def, layerState)) continue;
            const half = (NODE_SIZE[def.kind] || NODE_SIZE.unlock) / 2;
            include(def.position.x, def.position.y, half, half);
        }
        for (const subId in this.layer.subWindows) {
            const def = this.layer.subWindows[subId];
            const pos = layerState.subWindowPositions[subId] || def.defaultPosition;
            // Sub-window positions are a top-left corner, so this needs middle offset
            include(pos.x + 110, pos.y + 60, 110, 60);
        }
        const scene = this.layer.scene;
        if (scene && scene.bounds) {
            const box = scene.bounds(layerState);
            if (box) {
                include(box.minX, box.minY, 0, 0);
                include(box.maxX, box.maxY, 0, 0);
            }
        }
        const tiles = this.layer.tiles;
        if (tiles && !(tiles.hidden && tiles.hidden(layerState))) {
            for (const tile of tiles.list(layerState)) {
                const { x, y } = hexToPixel(tile, tiles.size);
                include(x, y, Math.sqrt(3) * tiles.size / 2, tiles.size);
            }
        }

        if (minX === Infinity) return null;
        return { minX, minY, maxX, maxY };
    }

    // Keeps the viewport in a reasonable area, so you can't go ultra far away
    _clampPan() {
        const bounds = this._contentBounds();
        if (!bounds) return;

        const { width, height } = this._viewportRect();
        if (!width || !height) return;

        const clampAxis = (pan, min, max, viewportSize) => {
            // Bounds need to be scaled before they can work with panning
            min *= this.zoom;
            max *= this.zoom;
            // Wider direction gets more room to pan
            const margin = panMargin(viewportSize);
            const lowest = viewportSize - max - margin; // Right edge can't go further left than this
            const highest = margin - min;               // Left edge can't go further right than this
            // If it's narrow instead of wide, this corrects it to midpoint stuff
            return lowest > highest ? (lowest + highest) / 2 : Math.min(highest, Math.max(lowest, pan));
        };

        this.panX = clampAxis(this.panX, bounds.minX, bounds.maxX, width);
        this.panY = clampAxis(this.panY, bounds.minY, bounds.maxY, height);
    }

    // It's where the canvas defaults to, and what the recenter button goes to.
    _viewcenter() {
        if (this.layer.defaultView) return this.layer.defaultView;

        const cores = Object.values(this.layer.nodes || {}).filter(n => n.kind === "core");
        if (cores.length > 0) {
            const xs = cores.map(n => n.position.x);
            const ys = cores.map(n => n.position.y + 50);
            return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
        }

        const bounds = this._contentBounds();
        if (!bounds) return { x: 0, y: 0 };
        return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
    }

    // Reads the viewport through a cache. ResizeObserver resets the cache whenever
    // the real size moves, which is the only moment a fresh number matters anyway
    _viewportRect() {
        if (!this._rectCache) this._rectCache = this.viewport.getBoundingClientRect();
        return this._rectCache;
    }

    // Since centering goes to the direct center of the whole window, it looks off depending
    // on if stuff is covering the sides of the screen. So this makes it go based on
    // how much room there really is for the canvas to be seen
    _openCenter(rect) {
        const width = rect.width;
        const height = rect.height;
        const spot = { x: width / 2, y: height / 2 };
        if (!this.hudEl) return spot;

        const view = rect;
        for (const cover of this.hudEl.querySelectorAll("[data-canvas-cover]")) {
            const box = cover.getBoundingClientRect();
            if (!box.width || !box.height) continue; // Not on screen right now

            if (box.width < width * 0.6) {
                const left = Math.max(0, box.right - view.left);
                const right = Math.max(0, view.right - box.left);
                if (left < right) spot.x = (left + width) / 2;
                else spot.x = (width - right) / 2;
            }
            if (box.height < height * 0.6) {
                const top = Math.max(0, box.bottom - view.top);
                const bottom = Math.max(0, view.bottom - box.top);
                if (top < bottom) spot.y = (top + height) / 2;
                else spot.y = (height - bottom) / 2;
            }
        }
        return spot;
    }

    // Centers the view on something, with a smooth pan
    centerOn(x, y, smooth = true) {
        const rect = this._viewportRect();
        if (!rect.width || !rect.height) return;

        this._stopPanTween();
        this.hascenterd = true;
        const open = this._openCenter(rect);
        const toX = open.x - x * this.zoom;
        const toY = open.y - y * this.zoom;

        if (!smooth) {
            this.panX = toX;
            this.panY = toY;
            this._applyTransform();
            return;
        }

        const fromX = this.panX;
        const fromY = this.panY;
        const started = performance.now();
        const step = (now) => {
            const part = Math.min(1, (now - started) / PAN_TWEEN_MS);
            const eased = part < 0.5 ? 2 * part * part : 1 - Math.pow(-2 * part + 2, 2) / 2;
            this.panX = fromX + (toX - fromX) * eased;
            this.panY = fromY + (toY - fromY) * eased;
            this._applyTransform();
            this.panFrame = part < 1 ? requestAnimationFrame(step) : null;
        };
        this.panFrame = requestAnimationFrame(step);
    }

    // Any touch on the canvas takes the view back off the tween
    _stopPanTween() {
        if (!this.panFrame) return;
        cancelAnimationFrame(this.panFrame);
        this.panFrame = null;
    }

    // Is the actual recentering
    recenter() {
        const rect = this._viewportRect();
        if (!rect.width || !rect.height) return;

        const center = this._viewcenter();
        this.panX = rect.width / 2 - center.x * this.zoom;
        this.panY = rect.height / 2 - 1.5 * center.y * this.zoom;
        this.hascenterd = true;
        this._applyTransform();
    }

    // Scale after translation, but makes sure not to shift everything
    _applyTransform() {
        this._clampPan();
        this.inner.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    }

    
    get zoom() {
        return ZOOM_STEPS[this.zoomStep];
    }

    canZoom(direction) {
        const next = this.zoomStep + direction;
        return next >= 0 && next < ZOOM_STEPS.length;
    }

    stepZoom(direction, clientX, clientY) {
        if (!this.canZoom(direction)) return false;

        const rect = this._viewportRect();
        const atX = clientX === undefined ? rect.width / 2 : clientX - rect.left;
        const atY = clientY === undefined ? rect.height / 2 : clientY - rect.top;

        // The content coordinate under that point, worked out before the zoom changes
        const heldX = (atX - this.panX) / this.zoom;
        const heldY = (atY - this.panY) / this.zoom;

        this.zoomStep += direction;
        this.panX = atX - heldX * this.zoom;
        this.panY = atY - heldY * this.zoom;
        this._applyTransform();
        this._updateCoords();
        return true;
    }

    _updateCoords() {
        const shown = !!state.settings.showCanvasCoords;
        const display = shown ? "" : "none";
        if (this.coordEl.style.display !== display) this.coordEl.style.display = display;
        if (!shown) return;

        if (!this.pointerClient) {
            setText(this.coordEl, "x —  y —");
            return;
        }

        const rect = this._viewportRect();
        const x = Math.round((this.pointerClient.x - rect.left - this.panX) / this.zoom);
        const y = Math.round((this.pointerClient.y - rect.top - this.panY) / this.zoom);
        setText(this.coordEl, `x ${x}  y ${y}`);
    }

   


    // Hex tiles
    _renderTiles(layerState) {
        const def = this.layer.tiles;
        if (!def) return;

        const hidden = def.hidden ? def.hidden(layerState) : false;
        const tiles = def.list(layerState);
        const unlocked = layerState.tiles || {};

        // A tile is for sale where it sits next to an owned one. Previously it
        // was checking for all neighbors for all tiles like every tick so this just
        // makes it not absolutely horrible on performance 
        const listed = new Map(tiles.map(tile => [tile.id, tile]));
        const reachableIds = new Set();
        if (!hidden) {
            for (const id in unlocked) {
                const ownedTile = unlocked[id] && listed.get(id);
                if (!ownedTile) continue;
                for (const n of neighboursOf(ownedTile)) {
                    if (listed.has(n.id)) reachableIds.add(n.id);
                }
            }
        }

        for (const tile of tiles) {
            // Built on demand, so the canvas doesn't need to be rebuilt
            const el = this.tileEls[tile.id] || this._buildTile(tile, def);

            const display = hidden ? "none" : "";
            if (el.style.display !== display) el.style.display = display;
            if (hidden) continue;

            const isUnlocked = !!unlocked[tile.id];
            const reachable = isUnlocked || reachableIds.has(tile.id);
            const cost = !isUnlocked && reachable && def.cost ? def.cost(layerState, tile) : null;
            const affordable = cost ? canAfford(cost) : false;

            const state = isUnlocked ? "unlocked" : !reachable ? "unreachable"
                : affordable ? "affordable" : "locked";
            const extra = def.tileClass ? def.tileClass(layerState, tile) : null;
            const wantClass = `hex-tile hex-${state}${extra ? ` ${extra}` : ""}`;
            if (el.className !== wantClass) el.className = wantClass;

            if (def.tileVars) {
                const vars = def.tileVars(layerState, tile) || {};
                const key = JSON.stringify(vars);
                if (el.__vars !== key) {
                    for (const name in vars) el.style.setProperty(name, vars[name]);
                    el.__vars = key;
                }
            }

            setText(el.querySelector(".hex-label"), isUnlocked && def.label ? def.label(layerState, tile) : "");
            this._renderTileTooltip(el, layerState, tile, cost, reachable && !isUnlocked, def);

            // Whatever the content draws on the tile
            if (def.content) {
                const html = def.content(layerState, tile) || "";
                if (el.__content !== html) {
                    el.querySelector(".hex-content").innerHTML = html;
                    el.__content = html;
                }
            }
        }
    }

    _buildTile(tile, def) {
        const el = document.createElement("div");
        el.className = "hex-tile";
        el.dataset.tileId = tile.id;

        const { x, y } = hexToPixel(tile, def.size);
        const width = Math.sqrt(3) * def.size;
        const height = 2 * def.size;
        el.style.width = `${width}px`;
        el.style.height = `${height}px`;
        el.style.left = `${x - width / 2}px`;
        el.style.top = `${y - height / 2}px`;

        el.innerHTML = `
            <div class="hex-shape">
                <div class="hex-face">
                    <div class="hex-content"></div>
                    <span class="hex-label"></span>
                    ${LOCK_ICON}
                </div>
            </div>
            <div class="hex-tooltip">
                <div class="hex-cost"></div>
                <div class="hex-action"></div>
            </div>
        `;

        // Lets you click on tiles but still lets you drag if you started it on one
        el.addEventListener("click", () => {
            if (this.movedWhileDown) return; // If it was a pan, don't click
            this._clickTile(tile, def);
        });

        this.inner.appendChild(el);
        this.tileEls[tile.id] = el;
        return el;
    }

    _renderTileTooltip(el, layerState, tile, cost, forSale, def) {
        const tooltip = el.querySelector(".hex-tooltip");
        const costEl = el.querySelector(".hex-cost");
        const actionEl = el.querySelector(".hex-action");

        const own = !forSale && def.tooltip ? def.tooltip(layerState, tile) : "";
        if (own && own.cost) {
            cost = own.cost;
            forSale = true;
        }

        const display = (forSale && cost) || own ? "" : "none";
        if (tooltip.style.display !== display) tooltip.style.display = display;
        if (display === "none") return;

        if (!forSale) {
            setText(costEl, "");
            setText(actionEl, own);
            return;
        }

        const parts = costParts(cost);
        const single = parts.length === 1 ? parts[0] : null;

        const color = single ? single.color || "" : "";
        if (costEl.style.color !== color) costEl.style.color = color;
        setText(costEl, !single ? formatCost(cost)
            : single.ids.length === 1 ? single.amount
            : `${single.amount} ${single.label}`);
        setText(actionEl, (own && own.action) || def.buyLabel || "Buy this tile");
    }

    _clickTile(tile, def) {
        const layerState = getLayerState(this.layer.stateKey);
        if (def.hidden && def.hidden(layerState)) return;

        if (!layerState.tiles) layerState.tiles = {};
        if (layerState.tiles[tile.id]) {
            if (def.onClick) def.onClick(layerState, tile, this.layer);
            markDirty(this.layer.stateKey);
            return;
        }

        const tiles = def.list(layerState);
        const reachable = tiles.some(other => layerState.tiles[other.id] && areNeighbours(tile, other));
        if (!reachable) return;
        if (def.cost && !spend(def.cost(layerState, tile))) return;

        layerState.tiles[tile.id] = true;
        if (def.onUnlock) def.onUnlock(layerState, tile);
        markDirty(this.layer.stateKey);
    }

    _renderOverlay(layerState) {
        const text = this.layer.overlay ? this.layer.overlay(layerState) : null;
        const display = text ? "" : "none";
        if (this.overlayEl.style.display !== display) this.overlayEl.style.display = display;
        if (text) setText(this.overlayEl, text);
    }

    // Called by canvasRouter whenever this layer is dirty and visible
    render() {
        const layerState = getLayerState(this.layer.stateKey);
        // Game state just moved, so whatever bounded the content before may not bound it now
        this._boundsStale = true;

        for (const subId in this.layer.subWindows) {
            const def = this.layer.subWindows[subId];
            const bodyEl = this.subWindowEls[subId].querySelector(".sub-window-body");
            setRichText(bodyEl, def.render(layerState));
        }
        this._renderNodes(layerState);
        this._renderTiles(layerState);
        this._renderOverlay(layerState);
        if (this.sceneEl && this.layer.scene.update) {
            this.layer.scene.update(this.sceneEl, layerState, this.layer, this);
        }
        if (this.layer.hud && this.layer.hud.update) this.layer.hud.update(this.hudEl, layerState, this.layer, this);
    }
}

// A padlock, for a tile that hasn't been claimed
const LOCK_ICON = `
    <svg class="hex-lock" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M5 7.4V5a3 3 0 0 1 6 0v2.4"/>
        <rect x="3.4" y="7.4" width="9.2" height="6.4" rx="1.3"/>
    </svg>`;

function wavePath(radius, amplitude, lobes, samples = 120) {
    const points = [];
    for (let i = 0; i < samples; i++) {
        const t = (i / samples) * Math.PI * 2;
        const r = radius + amplitude * Math.sin(lobes * t);
        points.push(`${(r * Math.cos(t)).toFixed(2)},${(r * Math.sin(t)).toFixed(2)}`);
    }
    return `M${points.join("L")}Z`;
}

function auraMarkup() {
    return `
        <div class="node-aura">
            <svg class="aura-ring aura-ring-a" viewBox="-50 -50 100 100" aria-hidden="true">
                <path d="${wavePath(44, 3.5, 8)}"/>
            </svg>
            <svg class="aura-ring aura-ring-b" viewBox="-50 -50 100 100" aria-hidden="true">
                <path d="${wavePath(47, 2.5, 6)}"/>
            </svg>
        </div>
    `;
}
