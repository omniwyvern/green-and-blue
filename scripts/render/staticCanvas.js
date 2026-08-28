// staticCanvas.js
//
// Renders a static canvas, basically it just doesn't move.
// It either holds a scene, which is just layer/sublayer-specific content, or it
// holds upgrads, which are just a grid of buttons
// Everything is built once and then patched, rather than rebuilt every render.

import { getLayerState } from "../core/state.js";
import { canAfford, spend, getLevel } from "../core/resources.js";
import { markDirty } from "./canvasRouter.js";
import { setText, setDisplay } from "../utils/dom.js";
import { setRichText, costHtml } from "./richText.js";

// Cache built DOM nodes per layer, so it doesn't rebuild everything every time something changes
const builtCanvases = new Map();

// This is for completely removing a canvas
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
    if (built.note) setRichText(built.note, layer.note(layerState));
    updateDrawers(layer, built, layerState);
    updateUpgrades(layer, built, layerState);
}

function buildCanvas(layer, container) {
    const built = { parent: container, scene: null, note: null, buttons: {}, drawer: null };

    // Lets a layer restyle the canvas its pieces are laid out on
    if (layer.canvasClass) container.classList.add(layer.canvasClass);

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
            <div class="upgrade-foot">
                <div class="upgrade-cost"></div>
                <span class="upgrade-max" title="Buys every level you can afford right now">Max</span>
            </div>
        `;
        btn.querySelector(".upgrade-title").textContent = def.title;
        // Descriptions name what a purchase is for, so they read through the colored text writer
        if (typeof def.description !== "function") {
            setRichText(btn.querySelector(".upgrade-description"), def.description);
        }
        btn.addEventListener("click", () => purchaseUpgrade(layer, upgradeId));
        // The Max pill sits beside the cost; caught here so a click doesn't also buy one level
        btn.querySelector(".upgrade-max").addEventListener("click", (event) => {
            event.stopPropagation();
            purchaseUpgrade(layer, upgradeId, true);
        });

        grid.appendChild(btn);
        built.buttons[upgradeId] = btn;
    }
    return grid;
}

// Drawers, basically just a container you can open that holds upgrades and stuff,
// opened/closed with a little tab on it
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

    // Open/close tab moves with the drawer
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
            setRichText(pages[drawerId].querySelector(".canvas-note"), def.note(layerState));
        }
    }
    setDisplay(el, anyShown);
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
        const affordable = !maxed && canAfford(cost);

        const order = maxed ? "1" : "0";
        if (btn.style.order !== order) btn.style.order = order;

        // Only changes the DOM when a value changes instead of once per tick
        const wantState = maxed ? "owned" : affordable ? "affordable" : "locked";
        if (btn.dataset.state !== wantState) {
            btn.className = `upgrade-button ${wantState}`;
            btn.dataset.state = wantState;
        }

        // Descriptions that quote live numbers come in as functions, so they refresh here
        if (typeof def.description === "function") {
            setRichText(btn.querySelector(".upgrade-description"), def.description(layerState, level));
        }

        // Only repeatable upgrades show the purchase count, and only unmaxed ones the Max shortcut
        setText(btn.querySelector(".upgrade-level"), max > 1 ? `${level}/${max}` : "");
        setDisplay(btn.querySelector(".upgrade-max"), max > 1 && !maxed);
        setRichText(btn.querySelector(".upgrade-cost"),
            maxed ? (max > 1 ? "Maxed" : "Purchased") : `Cost: ${costHtml(cost)}`);
    }
}

function purchaseUpgrade(layer, upgradeId, buyMax = false) {
    const layerState = getLayerState(layer.stateKey);
    const def = layer.upgrades[upgradeId];

    const max = def.max || 1;
    let level = getLevel(layerState, upgradeId);
    let bought = 0;
    // One purchase per pass; on Max it keeps going until the pools run dry or the cap is hit
    while (level < max) {
        if (!spend(def.cost(layerState, level))) break;
        level += 1;
        layerState.purchasedUpgrades[upgradeId] = level;
        if (def.onPurchase) def.onPurchase(layerState, level);
        bought += 1;
        if (!buyMax) break;
    }
    if (bought > 0) markDirty(layer.stateKey);
}


