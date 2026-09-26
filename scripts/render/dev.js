// dev.js
//
// Dev cheats; delete this file, its import, and #dev-button/#dev-overlay to remove them

import { state, getLayerState, saveState } from "../core/state.js";
import { layers, resourceDefs } from "../core/registry.js";
import { resyncProduction } from "../core/resources.js";
import { parentsOf, prereqMet } from "../core/nodes.js";
import { refreshCoordReadouts } from "./dragCanvas.js";
import { D } from "../utils/decimal.js";
import { formatNumber } from "../utils/format.js";
import { buildModal, makeButton } from "./modal.js";
import { getGameSpeed, setGameSpeed } from "../core/loop.js";

// The nodes that open a layer or lead to one; ordinary upgrades are left to be bought normally
const LAYER_NODE_KINDS = new Set(["layer", "sublayer", "major"]);

const LOTS = "1e250";
const SPEEDS = [1, 2, 5, 10, 25];

const overlay = document.getElementById("dev-overlay");
const openButton = document.getElementById("dev-button");

let statusEl = null;
let setOpen = null;
let resourceFields = []; // One per pool, filled in by buildResourceFields
let coordsButton = null;
let interactionsButton = null;
let fastGrassButton = null;
let fastTreesButton = null;
let unlimitedPotentialButton = null;
let unlimitedNotionsButton = null;


//    !!! THE WINDOW !!!

export function initDev() {
    if (!overlay || !openButton) return;

    buildWindow();
    openButton.addEventListener("click", () => setOpen(true));
}

function buildWindow() {
    const built = buildModal(overlay, `
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
                add. Commas and scientific notation work: 40,000, 1e20, 2.5e120. Blank leaves one alone.</div>
        </div>
        <div class="settings-section">
            <div class="settings-label">View</div>
            <div class="settings-row view-row"></div>
        </div>
        <div class="settings-section">
            <div class="settings-label">Settlements</div>
            <div class="settings-row settlement-row"><select class="dev-settlement"></select></div>
        </div>
        <div class="settings-section">
            <div class="settings-label">Game speed</div>
            <div class="settings-row dev-speed-row">
                <input class="dev-speed" type="range" min="0" max="${SPEEDS.length - 1}" step="1" value="0">
                <span class="dev-speed-value">1x</span>
            </div>
        </div>
        <div class="settings-status"></div>
    `, (open) => {
        if (!open) return;
        setStatus("");
        readResourceFields(); // So the boxes always show what the game currently holds
        fillSettlementPicker();
    });
    setOpen = built.setOpen;
    const panel = built.panel;

    const row = panel.querySelector(".dev-row");
    row.appendChild(makeButton("Unlock all layers", unlockAllLayers));
    row.appendChild(makeButton("Zero all resources", zeroResources));
    row.appendChild(makeButton("Complete all challenges", completeAllChallenges));
    row.appendChild(makeButton("Clear challenge progress", clearChallenges));

    buildResourceFields(panel.querySelector(".dev-resource-list"));
    const resourceRow = panel.querySelector(".resource-row");
    resourceRow.appendChild(makeButton("Apply amounts", applyResourceAmounts));
    resourceRow.appendChild(makeButton("Apply lots", applyLots));

    const viewRow = panel.querySelector(".view-row");
    coordsButton = makeButton("Canvas coordinates", toggleCoords);
    interactionsButton = makeButton("World dev interactions", toggleInteractions);
    fastGrassButton = makeButton("Fast grass", toggleFastGrass);
    fastTreesButton = makeButton("Fast trees", toggleFastTrees);
    unlimitedPotentialButton = makeButton("Unlimited evolution meters", toggleUnlimitedPotential);
    unlimitedNotionsButton = makeButton("Unlimited notions", toggleUnlimitedNotions);
    viewRow.append(coordsButton, interactionsButton, fastGrassButton, fastTreesButton, unlimitedPotentialButton, unlimitedNotionsButton);
    refreshToggleButtons();

    settlementPicker = panel.querySelector(".dev-settlement");
    const settlementRow = panel.querySelector(".settlement-row");
    settlementRow.appendChild(makeButton("Remove settlement", () => dropSettlement(false)));
    settlementRow.appendChild(makeButton("Make it die out", () => dropSettlement(true)));
    settlementRow.appendChild(makeButton("Reset known words", resetKnownWords));

    const speed = panel.querySelector(".dev-speed");
    const speedValue = panel.querySelector(".dev-speed-value");
    speed.value = Math.max(0, SPEEDS.indexOf(getGameSpeed()));
    speed.addEventListener("input", () => {
        setGameSpeed(SPEEDS[Number(speed.value)]);
        speedValue.textContent = `${getGameSpeed()}x`;
    });

    statusEl = panel.querySelector(".settings-status");
}


//    !!! OPENING EVERYTHING !!!

// Buying the nodes themselves instead of setting the layers to be unlocked, so onPurchase conditions trigger
function unlockAllLayers() {
    // Sub-layers keep their own trees (the biome hexagon is one), which is where most sub-layers get opened
    let bought = 0;
    for (const layerId in layers) {
        bought += buyLayerNodes(layers[layerId]);
        for (const key in layers[layerId].subLayers || {}) bought += buyLayerNodes(layers[layerId].subLayers[key]);
    }

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

// Loaded on use rather than imported, to stay out of the content modules' load order
const challenges = () => import("../content/main/systems/challenges.js");
const settlementRules = () => import("../content/humanity/systems/settlements.js");
const languageRules = () => import("../content/humanity/systems/language.js");

let settlementPicker = null;

async function fillSettlementPicker() {
    const { settlements } = await settlementRules();
    const list = settlements();
    settlementPicker.innerHTML = list.length
        ? list.map(t => `<option value="${t.id}">${t.name} (${t.pops} pop)</option>`).join("")
        : `<option value="">No settlements</option>`;
    settlementPicker.disabled = !list.length;
}

async function dropSettlement(diedOut) {
    const { removeSettlement } = await settlementRules();
    const removed = settlementPicker.value && removeSettlement(Number(settlementPicker.value), diedOut);
    if (!removed) return setStatus("No settlement picked.");
    await fillSettlementPicker();
    saveState();
    setStatus(`${diedOut ? "Let" : "Removed"} ${removed.name}${diedOut ? " die out" : ""}. Its land is no longer protected.`);
}

// The settlement tab picked on the Language page, not the one in the picker
async function resetKnownWords() {
    const [{ activeSettlement }, { languageOf, restartLanguage }] = await Promise.all([settlementRules(), languageRules()]);
    const t = activeSettlement();
    const lang = t && languageOf(t);
    if (!lang) return setStatus("The selected settlement has no language yet.");
    const had = lang.learned.length;
    restartLanguage(t);
    saveState();
    setStatus(`${t.name} forgot ${had} known word${had === 1 ? "" : "s"}.`);
}

// Finishes every challenge and hands out what each one gives, the same way claiming one does
async function completeAllChallenges() {
    const { CHALLENGE_IDS, REWARD_ACTIONS, challengeState, challengeDone } = await challenges();
    const s = challengeState();

    let finished = 0;
    for (const id of CHALLENGE_IDS) {
        if (challengeDone(id)) continue;
        s.completed[id] = true;
        if (REWARD_ACTIONS[id]) REWARD_ACTIONS[id]();
        finished++;
    }
    s.active = null;
    s.confirming = null;

    setStatus(finished
        ? `Finished ${finished} challenge${finished === 1 ? "" : "s"}.`
        : "Every challenge is already finished.");
}

// Forgets every completion and the running challenge; rewards already opened stay open
async function clearChallenges() {
    const { completedCount, challengeState } = await challenges();
    const s = challengeState();

    const had = completedCount();
    const running = !!s.active;
    s.completed = {};
    s.active = null;
    s.confirming = null;

    setStatus(had || running
        ? `Cleared ${had} completion${had === 1 ? "" : "s"}. Anything a reward opened is still open.`
        : "No challenges were finished.");
}

function buyLayerNodes(layer) {
    if (!layer.nodes) return 0;

    const layerState = getLayerState(layer.stateKey);
    const ordered = [];
    for (const nodeId in layer.nodes) {
        if (LAYER_NODE_KINDS.has(layer.nodes[nodeId].kind)) addWithParents(layer, nodeId, ordered, new Set());
    }

    // Parents come before children, so e.g. environment bought with land still grows the map
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

    // Biome nodes have no cost, they're opened by challenge rewards instead
    if (def.kind !== "core" && (def.cost || LAYER_NODE_KINDS.has(def.kind))) ordered.push(nodeId);
}

function buyNode(layer, nodeId, layerState) {
    layerState.purchasedUpgrades[nodeId] = true;
    const def = layer.nodes[nodeId];
    if (def.onPurchase) def.onPurchase(layerState);
}


//    !!! THE RESOURCE BOXES !!!

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

// Decimal quietly accepts anything, so a typo would wipe the pool without this check
const NUMERIC = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

function readResourceFields() {
    for (const field of resourceFields) field.input.value = formatNumber(currentAmount(field));
}

// Every box is checked before anything is written, so one typo doesn't half-apply the rest
function applyResourceAmounts() {
    const bad = [];
    const changes = [];

    for (const field of resourceFields) {
        // Commas are dropped, since the boxes fill in with numbers like 40,000
        const text = field.input.value.trim().replace(/,/g, "");
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
    setStatus(saveState() ? `Set ${summary}. Saved.` : `Set ${summary}. Not saved because saving is off.`);
}


//    !!! FILLING AND EMPTYING !!!

// Fills every pool with a number big enough that nothing stays out of reach
function applyLots() {
    for (const field of resourceFields) field.input.value = LOTS;
    applyResourceAmounts();
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


//    !!! THE TOGGLES !!!

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

// Grass runs through its stages at speed
function toggleFastGrass() {
    state.settings.enableFastGrass = !state.settings.enableFastGrass;
    refreshToggleButtons();
    saveState();
    setStatus(state.settings.enableFastGrass
        ? "Fast grass maturating enabled."
        : "Fast grass maturating disabled.");
}

// Trees put on growth, and finish standing, at speed
function toggleFastTrees() {
    state.settings.enableFastTrees = !state.settings.enableFastTrees;
    refreshToggleButtons();
    saveState();
    setStatus(state.settings.enableFastTrees
        ? "Fast tree growth enabled."
        : "Fast tree growth disabled.");
}

// Evolution meters stay full and never run down when spent
function toggleUnlimitedPotential() {
    state.settings.enableUnlimitedPotential = !state.settings.enableUnlimitedPotential;
    refreshToggleButtons();
    saveState();
    setStatus(state.settings.enableUnlimitedPotential
        ? "Evolution meters are unlimited."
        : "Evolution meters are back to normal.");
}

// Every notion is known and none run out
function toggleUnlimitedNotions() {
    state.settings.enableUnlimitedNotions = !state.settings.enableUnlimitedNotions;
    refreshToggleButtons();
    saveState();
    setStatus(state.settings.enableUnlimitedNotions
        ? "Notions are unlimited."
        : "Notions are back to normal.");
}

function refreshToggleButtons() {
    setToggle(coordsButton, "Canvas coordinates", state.settings.showCanvasCoords);
    setToggle(interactionsButton, "World dev interactions", state.settings.showDevInteractions);
    setToggle(fastGrassButton, "Fast grass", state.settings.enableFastGrass);
    setToggle(fastTreesButton, "Fast trees", state.settings.enableFastTrees);
    setToggle(unlimitedPotentialButton, "Unlimited evolution meters", state.settings.enableUnlimitedPotential);
    setToggle(unlimitedNotionsButton, "Unlimited notions", state.settings.enableUnlimitedNotions);
}

function setToggle(button, label, on) {
    button.textContent = `${label}: ${on ? "on" : "off"}`;
    button.classList.toggle("active", !!on);
}

function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
}
