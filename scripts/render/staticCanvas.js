// staticCanvas.js
//
// A non-moving canvas holding a scene or an upgrade grid, built once then patched

import { getLayerState } from "../core/state.js";
import { setRichText } from "./richText.js";
import { buildGrid, buildDrawer, updateDrawers, updateUpgrades } from "./upgradePanel.js";

// Built DOM per layer, so a change doesn't rebuild everything
const builtCanvases = new Map();

// Throws a canvas away, where the router normally only hides one
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
