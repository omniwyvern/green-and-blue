// Development-only cheats, in the same window shell the settings use.
//
// Self-contained, so to remove it later just delete this file, its import line
// in main.js, and the #dev-button / #dev-overlay elements in index.html
//
// made it pretty since it's basically just the settings menu

import { state, getLayerState, saveState } from "../core/state.js";
import { layers, getVisibleSubLayers } from "../core/registry.js";
import { addResource, resourceHolderId } from "../core/resources.js";
import { refreshCoordReadouts } from "./dragCanvas.js";
import { D } from "../utils/decimal.js";

const GRANT = D("1.00e12");

const overlay = document.getElementById("dev-overlay");
const openButton = document.getElementById("dev-button");

let statusEl = null;
let coordsButton = null;
let interactionsButton = null;
let fastGrassButton = null;

export function initDev() {
    if (!overlay || !openButton) return;

    buildWindow();
    openButton.addEventListener("click", () => setOpen(true));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) setOpen(false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); });
}

function setOpen(open) {
    overlay.hidden = !open;
    if (open) setStatus("");
}

function buildWindow() {
    const panel = document.createElement("div");
    panel.className = "settings-window";
    panel.innerHTML = `
        <div class="settings-header">
            <h2>Dev tools</h2>
            <button class="settings-close" aria-label="Close">&times;</button>
        </div>
        <div class="settings-section">
            <div class="settings-label">Cheats</div>
            <div class="settings-row dev-row"></div>
        </div>
        <div class="settings-section">
            <div class="settings-label">View</div>
            <div class="settings-row view-row"></div>
        </div>
        <div class="settings-status"></div>
    `;
    panel.querySelector(".settings-close").addEventListener("click", () => setOpen(false));

    const row = panel.querySelector(".dev-row");
    row.appendChild(makeButton("Unlock all layers", unlockAllLayers));
    row.appendChild(makeButton("Grant this layer's resources", grantHere));
    row.appendChild(makeButton("Zero all resources", zeroResources));

    const viewRow = panel.querySelector(".view-row");
    coordsButton = makeButton("Canvas coordinates", toggleCoords);
    interactionsButton = makeButton("World dev interactions", toggleInteractions);
    fastGrassButton = makeButton("Fast grass", toggleFastGrass);
    viewRow.append(coordsButton, interactionsButton, fastGrassButton);
    refreshToggleButtons();

    statusEl = panel.querySelector(".settings-status");
    overlay.appendChild(panel);
}

function makeButton(label, onClick) {
    const btn = document.createElement("button");
    btn.className = "settings-button-secondary";
    btn.textContent = label;
    btn.addEventListener("click", onClick);
    return btn;
}

function unlockAllLayers() {
    let unlocked = 0;
    for (const layerId in layers) {
        const layerState = getLayerState(layerId);
        if (layerState.unlocked) continue;
        layerState.unlocked = true;
        unlocked++;
    }

    setStatus(unlocked ? `Unlocked ${unlocked} layer${unlocked === 1 ? "" : "s"}.` : "Everything is already unlocked.");
}

// Whichever layer, or sub-layer of one, is on screen right now.
function activeView() {
    const layer = layers[state.activeLayer];
    if (!layer) return null;
    if (!layer.subLayers) return layer;

    const layerState = getLayerState(layer.stateKey);
    return layer.subLayers[layerState.activeSubLayer]
        || getVisibleSubLayers(layer.id, layerState)[0]
        || null;
}

// The resources a view holds itself, rather than the ones it only borrows to display -
// green essence on the pond, say. A view that holds none falls back to everything it shows,
// so the button is never a no-op on a layer that only spends what other layers make.
function grantableResources(view) {
    const ids = Object.keys(view.resources || {});
    const owned = ids.filter(id => resourceHolderId(view, id) === view.stateKey);
    return owned.length ? owned : ids;
}

function grantHere() {
    const view = activeView();
    if (!view) return setStatus("No layer open to grant resources to.");

    const ids = grantableResources(view);
    if (!ids.length) return setStatus(`${view.name} has no resources.`);

    for (const id of ids) addResource(view, id, GRANT);
    const names = ids.map(id => view.resources[id].name).join(", ");
    setStatus(`Granted ${GRANT.toString()} ${names} on ${view.name}.`);
}


// Empties every pool without touching anything that fills them - upgrades, nodes and growth
// stages are all left alone, so what this shows is what the game makes from here.
function zeroResources() {
    let emptied = 0;
    for (const layerId in state.layers) {
        const pools = state.layers[layerId].resources;
        for (const resourceId in pools) {
            if (D(pools[resourceId] || 0).eq(0)) continue;
            pools[resourceId] = D(0);
            emptied++;
        }
    }
    setStatus(emptied ? `Emptied ${emptied} pool${emptied === 1 ? "" : "s"}.` : "Everything is already empty.");
}

// Readout of the cursor's current coordinates, so node positioning is easier
function toggleCoords() {
    state.settings.showCanvasCoords = !state.settings.showCanvasCoords;
    refreshToggleButtons();
    refreshCoordReadouts();
    saveState();
    setStatus(state.settings.showCanvasCoords
        ? "Coordinates shown on draggable canvases."
        : "Coordinates hidden.");
}


// World interactions, like instant grass growth or instant tile -> water
function toggleInteractions() {
    state.settings.showDevInteractions = !state.settings.showDevInteractions;
    refreshToggleButtons();
    saveState();
    setStatus(state.settings.showDevInteractions
        ? "Dev interactions added to the world drawer."
        : "Dev interactions removed from the world drawer.");
}

// Makes grass go through stages really fast
function toggleFastGrass() {
    state.settings.enableFastGrass = !state.settings.enableFastGrass;
    refreshToggleButtons();
    saveState();
    setStatus(state.settings.enableFastGrass
        ? "Fast grass maturating enabled."
        : "Fast grass maturating disabled.");
}

function refreshToggleButtons() {
    setToggle(coordsButton, "Canvas coordinates", state.settings.showCanvasCoords);
    setToggle(interactionsButton, "World dev interactions", state.settings.showDevInteractions);
    setToggle(fastGrassButton, "Fast grass", state.settings.enableFastGrass);
}

function setToggle(button, label, on) {
    button.textContent = `${label}: ${on ? "on" : "off"}`;
    button.classList.toggle("active", !!on);
}

function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
}
