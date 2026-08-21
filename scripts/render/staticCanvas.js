// staticCanvas.js
//
// Renders a static canvas, basically it just doesn't move.
// It either holds a scene, which is just layer/sublayer-specific content, or it
// holds upgrads, which are just a grid of buttons
// Everything is built once and then patched, rather than rebuilt every render.

import { getLayerState } from "../core/state.js";
import { canAfford, spend, formatCost, getLevel } from "../core/resources.js";
import { markDirty } from "./canvasRouter.js";

// Cache built DOM nodes per layer, so it doesn't rebuild everything every time something changes
const builtCanvases = new Map();

// This is for completely removing a canvas.
export function forgetStaticCanvas(layerId) {
    builtCanvases.delete(layerId);
}

export function renderStaticCanvas(layer, container) {
    let built = builtCanvases.get(layer.id);

    if (!built || built.parent !== container) {
        container.innerHTML = "";
        built = buildCanvas(layer, container);
        builtCanvases.set(layer.id, built);
    }

    const layerState = getLayerState(layer.stateKey);
    if (built.scene && layer.scene.update) layer.scene.update(built.scene, layerState, layer);
    if (built.note) setText(built.note, layer.note(layerState));
    updateDrawers(layer, built, layerState);
    updateUpgrades(layer, built, layerState);
}

function buildCanvas(layer, container) {
    const built = { parent: container, scene: null, note: null, buttons: {}, drawer: null };

    if (layer.scene) {
        const sceneEl = document.createElement("div");
        sceneEl.className = "static-scene";
        container.appendChild(sceneEl);
        layer.scene.build(sceneEl, getLayerState(layer.stateKey), layer);
        built.scene = sceneEl;
    }

    if (layer.note) {
        const noteEl = document.createElement("div");
        noteEl.className = "canvas-note";
        container.appendChild(noteEl);
        built.note = noteEl;
    }

    const loose = Object.keys(layer.upgrades)
        .filter(id => !Object.values(layer.drawers || {}).some(d => d.upgradeIds.includes(id)));
    if (loose.length > 0) container.appendChild(buildGrid(layer, built, loose));

    const drawerIds = Object.keys(layer.drawers || {});
    if (drawerIds.length > 0) built.drawer = buildDrawer(layer, built, drawerIds, container);

    return built;
}

function buildGrid(layer, built, upgradeIds) {
    const grid = document.createElement("div");
    grid.className = "upgrade-grid";

    for (const upgradeId of upgradeIds) {
        const def = layer.upgrades[upgradeId];

        const btn = document.createElement("button");
        btn.className = "upgrade-button";
        btn.innerHTML = `
            <div class="upgrade-head">
                <span class="upgrade-title"></span>
                <span class="upgrade-level"></span>
            </div>
            <div class="upgrade-description"></div>
            <div class="upgrade-cost"></div>
        `;
        btn.querySelector(".upgrade-title").textContent = def.title;
        btn.querySelector(".upgrade-description").textContent = def.description;
        btn.addEventListener("click", () => purchaseUpgrade(layer, upgradeId));

        grid.appendChild(btn);
        built.buttons[upgradeId] = btn;
    }
    return grid;
}

// Drawers, basically just a container you can open that holds upgrades and stuff,
// opened/closed with a little tab on it.
function buildDrawer(layer, built, drawerIds, container) {
    const drawer = document.createElement("div");
    drawer.className = "upgrade-drawer";

    const tabs = document.createElement("div");
    tabs.className = "drawer-tabs";

    const panel = document.createElement("div");
    panel.className = "drawer-panel";

    const handles = {};
    const pages = {};
    for (const drawerId of drawerIds) {
        const def = layer.drawers[drawerId];

        const handle = document.createElement("button");
        handle.className = "drawer-handle";
        handle.dataset.drawerId = drawerId;
        handle.setAttribute("aria-label", def.label);
        if (def.color) handle.style.setProperty("--drawer-color", def.color);
        handle.innerHTML = `<span class="drawer-chevron">^</span><span class="drawer-label"></span>`;
        handle.querySelector(".drawer-label").textContent = def.label;
        handle.addEventListener("click", () => openDrawer(built, drawer.dataset.open === drawerId ? null : drawerId));
        tabs.appendChild(handle);
        handles[drawerId] = handle;

        const page = document.createElement("div");
        page.className = "drawer-page";
        page.style.display = "none";
        if (def.note) {
            const noteEl = document.createElement("div");
            noteEl.className = "canvas-note";
            page.appendChild(noteEl);
        }
        page.appendChild(buildGrid(layer, built, def.upgradeIds));
        panel.appendChild(page);
        pages[drawerId] = page;
    }

    // Open/close tab moves with the drawer.
    const slide = document.createElement("div");
    slide.className = "drawer-slide";
    slide.append(tabs, panel);
    drawer.appendChild(slide);
    container.appendChild(drawer);

    return { el: drawer, handles, pages };
}

function openDrawer(built, drawerId) {
    const { el, handles, pages } = built.drawer;
    el.dataset.open = drawerId || "";
    el.classList.toggle("open", !!drawerId);
    for (const id in pages) pages[id].style.display = id === drawerId ? "" : "none";
    for (const id in handles) handles[id].classList.toggle("active", id === drawerId);
}

function updateDrawers(layer, built, layerState) {
    if (!built.drawer) return;
    const { el, handles, pages } = built.drawer;

    let anyShown = false;
    for (const drawerId in handles) {
        const def = layer.drawers[drawerId];
        const shown = !(def.hidden && def.hidden(layerState));
        setDisplay(handles[drawerId], shown);
        anyShown = anyShown || shown;

        if (!shown && el.dataset.open === drawerId) openDrawer(built, null);
        if (def.note && el.dataset.open === drawerId) {
            setText(pages[drawerId].querySelector(".canvas-note"), def.note(layerState));
        }
    }
    setDisplay(el, anyShown);
}

function setDisplay(el, shown) {
    const display = shown ? "" : "none";
    if (el.style.display !== display) el.style.display = display;
}

function updateUpgrades(layer, built, layerState) {
    for (const upgradeId in built.buttons) {
        const def = layer.upgrades[upgradeId];
        const btn = built.buttons[upgradeId];

        const shown = !(def.hidden && def.hidden(layerState));
        setDisplay(btn, shown);
        if (!shown) continue;

        const max = def.max || 1;
        const level = getLevel(layerState, upgradeId);
        const maxed = level >= max;
        const cost = maxed ? null : def.cost(layerState, level);
        const affordable = !maxed && canAfford(layer, cost);

        const order = maxed ? "1" : "0";
        if (btn.style.order !== order) btn.style.order = order;

        // Only changes the DOM when a value changes instead of once per tick.
        const wantState = maxed ? "owned" : affordable ? "affordable" : "locked";
        if (btn.dataset.state !== wantState) {
            btn.className = `upgrade-button ${wantState}`;
            btn.dataset.state = wantState;
        }

        // Only repeatable upgrades show the purchase count.
        setText(btn.querySelector(".upgrade-level"), max > 1 ? `${level}/${max}` : "");
        setText(btn.querySelector(".upgrade-cost"),
            maxed ? (max > 1 ? "Maxed" : "Purchased") : `Cost: ${formatCost(cost, layer.resources)}`);
    }
}

function purchaseUpgrade(layer, upgradeId) {
    const layerState = getLayerState(layer.stateKey);
    const def = layer.upgrades[upgradeId];

    const max = def.max || 1;
    const level = getLevel(layerState, upgradeId);
    if (level >= max) return;
    if (!spend(layer, def.cost(layerState, level))) return;

    layerState.purchasedUpgrades[upgradeId] = level + 1;
    if (def.onPurchase) def.onPurchase(layerState, level + 1);

    markDirty(layer.stateKey);
}

function setText(el, text) {
    if (el.textContent !== text) el.textContent = text;
}
