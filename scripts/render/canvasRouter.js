// canvasRouter.js
//
// One wrapper div per layer, that's created once and never destroyed.
// Just toggling display lets it keep drag position across switching away and back.


import { state, getLayerState } from "../core/state.js";
import { layers, getOrderedSubLayers, getVisibleSubLayers } from "../core/registry.js";
import { getResource, productionRate } from "../core/resources.js";
import { renderStaticCanvas, forgetStaticCanvas } from "./staticCanvas.js";
import { getDragCanvas, forgetDragCanvas } from "./dragCanvas.js";
import { formatNumber } from "../utils/format.js";

const dirtyLayers = new Set();
const canvasEl = document.getElementById("canvas");


const layerContainers = new Map(); // layerId is { wrapper, pointsEl, body }

function getLayerContainer(layerId) {
    let entry = layerContainers.get(layerId);
    if (entry) return entry;

    const wrapper = document.createElement("div");
    wrapper.className = "layer-canvas";
    wrapper.style.display = "none";

    const header = document.createElement("div");
    header.className = "layer-header";

    // One display per resource the layer declares, the render only rewrites it.
    const resourceEls = {};
    const rateEls = {};
    const chipEls = {};
    const layer = layers[layerId];
    for (const resourceId in layer ? layer.resources : {}) {
        const def = layer.resources[resourceId];

        const chip = document.createElement("span");
        chip.className = "resource-chip";
        if (def.color) chip.style.setProperty("--resource-color", def.color);

        const label = document.createElement("span");
        label.className = "resource-name";
        label.textContent = def.name;

        const value = document.createElement("span");
        value.className = "resource-value";

        const rate = document.createElement("span");
        rate.className = "resource-tooltip";

        chip.append(label, value, rate);
        header.appendChild(chip);
        resourceEls[resourceId] = value;
        rateEls[resourceId] = rate;
        chipEls[resourceId] = chip;
    }

    // This was used for a thing in the pond, but it's not really used anymore.
    // Keeping it for if I want something like it later.
    // This just is for a display at the top that isn't numerical.
    const indicatorEls = {};
    for (const indicatorId in layer ? layer.indicators : {}) {
        const el = document.createElement("span");
        el.className = "header-indicator";
        layer.indicators[indicatorId].build(el, getLayerState(layer.stateKey), layer);
        header.appendChild(el);
        indicatorEls[indicatorId] = el;
    }

    const body = document.createElement("div");
    body.className = "layer-body";

    wrapper.appendChild(header);
    wrapper.appendChild(body);
    canvasEl.appendChild(wrapper);

    entry = { wrapper, header, resourceEls, rateEls, chipEls, indicatorEls, body };
    layerContainers.set(layerId, entry);
    return entry;
}

const subLayerContainers = new Map(); // subLayerId -> div, appended into that layer's .layer-body

function getSubLayerContainer(layerId, subLayer) {
    let container = subLayerContainers.get(subLayer.id);
    if (container) return container;

    container = document.createElement("div");
    container.className = "sub-layer-canvas";
    container.style.display = "none";
    getLayerContainer(layerId).body.appendChild(container);

    subLayerContainers.set(subLayer.id, container);
    return container;
}

// The header of whichever layer is on screen.
export function activeHeaderElement() {
    const entry = layerContainers.get(state.activeLayer);
    return entry ? entry.header : null;
}

// Called whenever a layer's data changes (aka every sim tick).
// Doesn't touch the DOM itself, just says that a redraw is owed.
export function markDirty(layerId) {
    dirtyLayers.add(layerId);
}

// For when layers are absorbed into another as a sublayer. (e.g. the pond layer for aquatic)
export function absorbedInto(layer) {
    if (!layer || !layer.absorbedBy) return null;
    const host = layers[layer.absorbedBy];
    if (!host || !getLayerState(host.id).unlocked) return null;
    return host;
}

// Throws away a layer's canvas and everything cached for it.
export function releaseLayerCanvas(layerId) {
    const entry = layerContainers.get(layerId);
    if (!entry) return;

    for (const [subId, container] of subLayerContainers) {
        if (subId.startsWith(`${layerId}:`)) {
            forgetStaticCanvas(subId);
            forgetDragCanvas(subId);
            container.remove();
            subLayerContainers.delete(subId);
        }
    }

    forgetStaticCanvas(layerId);
    forgetDragCanvas(layerId);
    entry.wrapper.remove();
    layerContainers.delete(layerId);
    dirtyLayers.delete(layerId);
}

// Called when the player clicks a different layer tab.
export function switchToLayer(layerId) {
    const layer = layers[layerId];
    if (!layer) return;

    const host = absorbedInto(layer);
    if (host) {
        switchToLayer(host.id);
        if (host.subLayers && host.subLayers[layerId]) switchToSubLayer(host.id, layerId);
        return;
    }

    if (!getLayerState(layerId).unlocked) return;

    for (const entry of layerContainers.values()) entry.wrapper.style.display = "none";
    getLayerContainer(layerId).wrapper.style.display = "flex";

    state.activeLayer = layerId;
    markDirty(layerId);
    renderActiveLayer(true); 
}

// Called every animation frame, skips all the DOM work unless the active layer is marked dirty.
export function renderActiveLayer(force = false) {
    const layerId = state.activeLayer;
    if (!force && !dirtyLayers.has(layerId)) return;
    dirtyLayers.delete(layerId);

    const layer = layers[layerId];
    if (!layer) return;

    const layerState = getLayerState(layer.stateKey);
    const entry = getLayerContainer(layerId);

    // One shared set of resources per layer, not per sub-layer.
    for (const resourceId in entry.resourceEls) {
        const def = layer.resources[resourceId];
        const chip = entry.chipEls[resourceId];
        const shown = !(def.hidden && def.hidden(layerState));
        const display = shown ? "" : "none";
        if (chip.style.display !== display) chip.style.display = display;
        if (!shown) continue;

        const amount = getResource(layer, resourceId);
        const text = formatNumber(amount);
        const el = entry.resourceEls[resourceId];
        if (el.textContent !== text) el.textContent = text;

        const rate = productionRate(layer, resourceId);
        let rateText;
        if (!rate.abs().lt(0.0005)) {
            rateText = `${rate.gt(0) ? "+" : "-"}${formatNumber(rate.abs())}/s`;
        } else {
            // When the rate is really small compared to the pool, it ignores it and says this.
            rateText = amount.layer >= 1 ? "Too little production to count." : "0/s";
        }
        if (def.note) rateText += `\n${def.note(layerState)}`;
        const rateEl = entry.rateEls[resourceId];
        if (rateEl.textContent !== rateText) rateEl.textContent = rateText;
    }

    for (const indicatorId in entry.indicatorEls) {
        layer.indicators[indicatorId].update(entry.indicatorEls[indicatorId], layerState, layer);
    }

    if (layer.subLayers) {
        renderActiveSubLayer(layer, layerState);
    } else if (layer.canvasType === "static") {
        renderStaticCanvas(layer, entry.body);
    } else if (layer.canvasType === "drag") {
        getDragCanvas(layer, entry.body).render();
    }

    refreshCanvasControls();
}

// Canvas controls. 
const recenterButton = document.getElementById("recenter-button");
const zoomControls = document.getElementById("zoom-controls");
const zoomInButton = document.getElementById("zoom-in-button");
const zoomOutButton = document.getElementById("zoom-out-button");

function activeDragCanvas() {
    const layer = layers[state.activeLayer];
    if (!layer) return null;

    if (layer.subLayers) {
        const subLayer = layer.subLayers[getLayerState(layer.stateKey).activeSubLayer];
        if (!subLayer || subLayer.canvasType !== "drag") return null;
        return getDragCanvas(subLayer, getSubLayerContainer(layer.id, subLayer));
    }
    return layer.canvasType === "drag" ? getDragCanvas(layer, getLayerContainer(layer.id).body) : null;
}

// Called at the end of every render and whenever the scroll wheel changes zoom.
export function refreshCanvasControls() {
    const canvas = activeDragCanvas();
    if (recenterButton) recenterButton.hidden = canvas === null;
    if (!zoomControls) return;

    zoomControls.hidden = canvas === null;
    if (!canvas) return;
    zoomInButton.disabled = !canvas.canZoom(1);
    zoomOutButton.disabled = !canvas.canZoom(-1);
}

if (recenterButton) {
    recenterButton.addEventListener("click", () => {
        const canvas = activeDragCanvas();
        if (canvas) canvas.recenter();
    });
}

for (const [button, direction] of [[zoomInButton, 1], [zoomOutButton, -1]]) {
    if (!button) continue;
    button.addEventListener("click", () => {
        const canvas = activeDragCanvas();
        if (canvas) canvas.stepZoom(direction);
        refreshCanvasControls();
    });
}

function renderActiveSubLayer(layer, layerState) {
    const current = layer.subLayers[layerState.activeSubLayer];
    if (!current || (current.hidden && current.hidden(layerState))) {
        const firstVisible = getVisibleSubLayers(layer.id, layerState)[0];
        if (!firstVisible) return;
        layerState.activeSubLayer = firstVisible.key;
    }
    const activeKey = layerState.activeSubLayer;

    for (const key in layer.subLayers) {
        const subLayer = layer.subLayers[key];
        getSubLayerContainer(layer.id, subLayer).style.display = key === activeKey ? "flex" : "none";
    }

    const activeSubLayer = layer.subLayers[activeKey];
    if (!activeSubLayer) return; // Shouldn't happen, but don't crash the render loop over a bad save.
    const target = getSubLayerContainer(layer.id, activeSubLayer);

    if (activeSubLayer.canvasType === "static") {
        renderStaticCanvas(activeSubLayer, target);
    } else if (activeSubLayer.canvasType === "drag") {
        getDragCanvas(activeSubLayer, target).render();
    }
}

// Called when the player clicks a sub-layer button in the sidebar flyout.
export function switchToSubLayer(layerId, subLayerKey) {
    const layer = layers[layerId];
    if (!layer || !layer.subLayers || !layer.subLayers[subLayerKey]) return;
    if (!getLayerState(layer.stateKey).unlocked) return;

    const subLayer = layer.subLayers[subLayerKey];
    if (subLayer.hidden && subLayer.hidden(getLayerState(layer.stateKey))) return;

    getLayerState(layer.stateKey).activeSubLayer = subLayerKey;
    markDirty(layerId);
    if (state.activeLayer === layerId) renderActiveLayer(true);
}
