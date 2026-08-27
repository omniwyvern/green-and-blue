// Development-only cheats, in the same window shell the settings use.
//
// Self-contained, so to remove it later just delete this file, its import line
// in main.js, and the #dev-button / #dev-overlay elements in index.html

import { state, getLayerState, saveState } from "../core/state.js";
import { layers, resourceDefs, getVisibleSubLayers } from "../core/registry.js";
import { addResource, resourceHolderId, resyncProduction } from "../core/resources.js";
import { parentsOf, prereqMet } from "../core/nodes.js";
import { refreshCoordReadouts } from "./dragCanvas.js";
import { D } from "../utils/decimal.js";
import { formatNumber } from "../utils/format.js";

// The nodes that stand for a layer, or for a step on the way to one. Everything else in a tree
// is an ordinary upgrade, and the button leaves those to be bought the normal way
const LAYER_NODE_KINDS = new Set(["layer", "sublayer", "major"]);

const overlay = document.getElementById("dev-overlay");
const openButton = document.getElementById("dev-button");

let statusEl = null;
let resourceFields = []; // One per pool, filled in by buildResourceFields
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
    if (!open) return;
    setStatus("");
    readResourceFields(); // So the boxes always show what the game currently holds
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
            <div class="settings-label">Set resources</div>
            <div class="dev-resource-list"></div>
            <div class="settings-row resource-row"></div>
            <div class="settings-note"\n>Type the amount you want to end up with, not the amount to
                add. Scientific notation works: 1e20, 2.5e120. Blank leaves one alone.</div>
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
    row.appendChild(makeButton("Zero all resources", zeroResources));

    buildResourceFields(panel.querySelector(".dev-resource-list"));
    const resourceRow = panel.querySelector(".resource-row");
    resourceRow.appendChild(makeButton("Apply amounts", applyResourceAmounts));

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

// Buying the nodes themselves instead of setting the layers to be unlocked, so onPurchase conditions trigger
function unlockAllLayers() {
    let bought = 0;
    for (const layerId in layers) bought += buyLayerNodes(layers[layerId]);

    // Anything with no node behind it, so the button still opens every layer either way
    let unlocked = 0;
    for (const layerId in layers) {
        const layerState = getLayerState(layerId);
        if (layerState.unlocked) continue;
        layerState.unlocked = true;
        unlocked++;
    }

    setStatus(bought || unlocked
        ? `Bought ${bought} node${bought === 1 ? "" : "s"}, opened ${unlocked} more layer${unlocked === 1 ? "" : "s"}.`
        : "Everything is already unlocked.");
}

function buyLayerNodes(layer) {
    if (!layer.nodes) return 0;

    const layerState = getLayerState(layer.stateKey);
    const ordered = [];
    for (const nodeId in layer.nodes) {
        if (LAYER_NODE_KINDS.has(layer.nodes[nodeId].kind)) addWithParents(layer, nodeId, ordered, new Set());
    }

    // Parents are in the list ahead of their children already. Makes some things work better.
    // Like if you buy environment at the same time as land, the world map size doesn't increase
    let bought = 0;
    for (let sweeping = true; sweeping; ) {
        sweeping = false;
        for (const nodeId of ordered) {
            if (layerState.purchasedUpgrades[nodeId]) continue;
            if (!prereqMet(layer, layer.nodes[nodeId], layerState)) continue;
            buyNode(layer, nodeId, layerState);
            bought++;
            sweeping = true;
        }
    }

    for (const nodeId of ordered) {
        if (layerState.purchasedUpgrades[nodeId]) continue;
        buyNode(layer, nodeId, layerState);
        bought++;
    }
    return bought;
}

// Depth first through the parents, so a node lands in the list behind everything in the tree before it
function addWithParents(layer, nodeId, ordered, walking) {
    const def = layer.nodes[nodeId];
    if (!def || walking.has(nodeId) || ordered.includes(nodeId)) return;

    walking.add(nodeId);
    for (const parentId of parentsOf(def)) addWithParents(layer, parentId, ordered, walking);
    walking.delete(nodeId);

    if (def.kind !== "core" && def.cost) ordered.push(nodeId);
}

function buyNode(layer, nodeId, layerState) {
    layerState.purchasedUpgrades[nodeId] = true;
    const def = layer.nodes[nodeId];
    if (def.onPurchase) def.onPurchase(layerState);
}

// Whichever layer, or sub-layer of one, is on screen right now
function activeView() {
    const layer = layers[state.activeLayer];
    if (!layer) return null;
    if (!layer.subLayers) return layer;

    const layerState = getLayerState(layer.stateKey);
    return layer.subLayers[layerState.activeSubLayer]
        || getVisibleSubLayers(layer.id, layerState)[0]
        || null;
}

// The resources a view holds itself, rather than the ones it only borrows to display
function grantableResources(view) {
    const ids = Object.keys(view.resources || {});
    const owned = ids.filter(id => resourceHolderId(id) === view.stateKey);
    return owned.length ? owned : ids;
}

function grantHere() {
    const view = activeView();
    if (!view) return setStatus("No layer open to grant resources to.");

    const ids = grantableResources(view);
    if (!ids.length) return setStatus(`${view.name} has no resources.`);

    for (const id of ids) addResource(id, GRANT);
    resyncProduction();
    readResourceFields(); // The boxes below are showing these same pools
    const names = ids.map(id => view.resources[id].name).join(", ");
    setStatus(`Granted ${GRANT.toString()} ${names} on ${view.name}.`);
}


// One box per pool, not per layer showing it
const resourcePools = () => Object.values(resourceDefs)
    .map(def => ({ holderId: def.holder, resourceId: def.id, def }));

function buildResourceFields(container) {
    resourceFields = [];

    for (const pool of resourcePools()) {
        const row = document.createElement("label");
        row.className = "dev-resource";

        const name = document.createElement("span");
        name.className = "dev-resource-name";
        name.textContent = pool.def.name || pool.resourceId;
        if (pool.def.color) name.style.color = pool.def.color;

        const input = document.createElement("input");
        input.type = "text";
        input.className = "dev-resource-input";
        input.spellcheck = false;
        input.autocomplete = "off";
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") applyResourceAmounts(); });

        row.append(name, input);
        container.appendChild(row);
        resourceFields.push({ ...pool, input });
    }
}

const currentAmount = ({ holderId, resourceId }) => D(getLayerState(holderId).resources[resourceId] || 0);

// Decimal takes anything and quietly calls it a number, a typo wipes the pool instead of rejecting
// so this makes it check if it's a number first
const NUMERIC = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

function readResourceFields() {
    for (const field of resourceFields) field.input.value = formatNumber(currentAmount(field));
}

// Sets each pool to what's in its box. Every box is checked before anything is written, so a typo
// in one doesn't leave the rest half-applied
function applyResourceAmounts() {
    const bad = [];
    const changes = [];

    for (const field of resourceFields) {
        const text = field.input.value.trim();
        if (text === "") continue;

        if (!NUMERIC.test(text)) {
            bad.push(field.def.name || field.resourceId);
            continue;
        }

        const value = D(text);
        if (value.isNan() || !value.isFinite()) {
            bad.push(field.def.name || field.resourceId);
            continue;
        }
        if (value.eq(currentAmount(field))) continue;
        changes.push({ field, value });
    }

    if (bad.length) return setStatus(`Not a number: ${bad.join(", ")}. Nothing changed.`);
    if (!changes.length) return setStatus("Every box already matches what the game holds.");

    for (const { field, value } of changes) {
        getLayerState(field.holderId).resources[field.resourceId] = value;
    }
    resyncProduction();
    readResourceFields();

    const summary = changes.map(c => `${c.field.def.name || c.field.resourceId} to ${formatNumber(c.value)}`).join(", ");
    setStatus(saveState() ? `Set ${summary}. Saved.` : `Set ${summary}. Not saved - saving is off.`);
}

// Empties every pool
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
    resyncProduction();
    readResourceFields();
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
