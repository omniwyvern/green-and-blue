// state.js
//
// This is the whole gamestate. All save data is here.


import { layers, categories, getOrderedSubLayers, getOrderedCategories, getOrderedLayers } from "./registry.js";
import { D, isDecimal } from "../utils/decimal.js";

const SAVE_KEY = "incrementalGameSave";

function defaultState() {
    return {
        lastSaveTime: Date.now(),
        totalTimePlayed: 0,
        activeCategory: null,
        activeLayer: null,

        // Most of these are just dev tools.
        settings: { theme: "dark", hideNav: false, showCanvasCoords: false, showDevInteractions: false, enableFastGrass: false },
        // Which tabs the player has seen, so they don't flash.
        seen: { layers: {}, subLayers: {}, guides: {} },
        layers: {}, // Per-layer save data.
    };
}

// ES modules use "live bindings" so this isn't a const
export let state = defaultState();

// Makes it not re-save after you deleted.
let savingBlocked = false;

export function saveState() {
    if (savingBlocked) return;
    state.lastSaveTime = Date.now();
    // Decimals are stored as strings, getLayerState() turns them back into Decimals. 
    localStorage.setItem(SAVE_KEY, JSON.stringify(state, (key, value) =>
        isDecimal(value) ? value.toString() : value));
}

export function loadState() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
        state = defaultState();
        return state;
    }
    try {
        state = migrateState(JSON.parse(raw));
    } catch (err) {
        console.error("Save file was corrupted, starting fresh.", err);
        state = defaultState();
    }
    return state;
}

// Old saves are made compatible with current version. 
function migrateState(loaded) {
    if (!loaded || typeof loaded !== "object") return defaultState();

    const fresh = defaultState();
    const migrated = reconcile(fresh, loaded);

    migrated.settings = reconcile(fresh.settings, asObject(loaded.settings));
    migrated.seen = { ...fresh.seen, ...asObject(loaded.seen) };
    for (const kind in migrated.seen) migrated.seen[kind] = asObject(migrated.seen[kind]);

    migrated.layers = asObject(migrated.layers);
    const declared = declaredBySlot();
    for (const layerId in migrated.layers) {
        // A layer that no longer exists takes its whole slot with it.
        if (!layers[layerId]) {
            delete migrated.layers[layerId];
            continue;
        }
        migrated.layers[layerId] = migrateSlot(layers[layerId], asObject(migrated.layers[layerId]), declared[layerId]);
    }

    return migrated;
}

// Drops whatever this layer no longer declares. getLayerState() will rebuild it better. Stronger.
function migrateSlot(def, slot, declared) {
    slot.resources = asObject(slot.resources);
    slot.purchasedUpgrades = asObject(slot.purchasedUpgrades);
    slot.subWindowPositions = asObject(slot.subWindowPositions);

    prune(slot.resources, declared.resources);
    prune(slot.purchasedUpgrades, declared.purchases);
    prune(slot.subWindowPositions, declared.subWindows);

    // The fixed slot fields, plus whatever the layer declares as state of its own.
    const keep = new Set(["unlocked", "resources", "purchasedUpgrades", "subWindowPositions",
        "activeSubLayer", ...Object.keys(def.initialState || {})]);
    if (def.tiles) keep.add("tiles"); // A hex map's unlocked tiles, which don't need to be declared.
    prune(slot, keep);

    // Makes you not stay on a renamed or removed sub-layer.
    if (!(def.subLayers && def.subLayers[slot.activeSubLayer])) slot.activeSubLayer = null;

    return slot;
}

// What the content declares, so that it's easier to fix saves.
function declaredBySlot() {
    const slots = {};
    const claim = (stateKey, view) => {
        const slot = slots[stateKey] || (slots[stateKey] =
            { resources: new Set(), purchases: new Set(), subWindows: new Set() });
        for (const id in view.resources) slot.resources.add(id);
        // Nodes are bought out of the same map as upgrades, so they share a set here too.
        for (const id in view.upgrades) slot.purchases.add(id);
        for (const id in view.nodes) slot.purchases.add(id);
        for (const id in view.subWindows) slot.subWindows.add(id);
    };

    for (const layerId in layers) {
        const def = layers[layerId];
        claim(def.stateKey, def);
        for (const subLayer of Object.values(def.subLayers || {})) claim(subLayer.stateKey, subLayer);
    }
    return slots;
}

// Keeps only the fields still declared, and takes the default for whichever of those are missing.
function reconcile(fresh, loaded) {
    const out = {};
    for (const key in fresh) out[key] = key in loaded ? loaded[key] : fresh[key];
    return out;
}

function prune(object, allowed) {
    for (const key in object) {
        if (!allowed.has(key)) delete object[key];
    }
}

// Anything that should be a map but isn't gets replaced.
function asObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function deleteSave() {
    savingBlocked = true;
    localStorage.removeItem(SAVE_KEY);
    window.location.reload();
}

export function hasSave() {
    return localStorage.getItem(SAVE_KEY) !== null;
}


// Run once at startup so that tabs don't flash on every load.
export function markSeenTabs() {
    if (!state.seen) state.seen = { layers: {}, subLayers: {}, guides: {} };

    for (const layerId in layers) {
        if (!getLayerState(layerId).unlocked) continue;
        state.seen.layers[layerId] = true;
        for (const subLayer of getOrderedSubLayers(layerId)) {
            state.seen.subLayers[subLayer.id] = true;
        }
    }
}

export function claimUnseen(kind, id) {
    const bucket = seenBucket(kind);
    if (bucket[id]) return false;
    bucket[id] = true;
    return true;
}

export function hasSeen(kind, id) {
    return !!seenBucket(kind)[id];
}

// A bucket can be missing on saves written before that kind existed, so this makes
// them on demand rather than making every new kind a migration.
function seenBucket(kind) {
    if (!state.seen) state.seen = {};
    if (!state.seen[kind]) state.seen[kind] = {};
    return state.seen[kind];
}

// The renderer assumes an id given to it is real, so this makes sure that it doesn't crash or render nothing.
export function resolveActiveSelection() {
    const orderedCategories = getOrderedCategories();
    if (orderedCategories.length === 0) return;

    if (!categories[state.activeCategory]) state.activeCategory = orderedCategories[0].id;

    const inCategory = getOrderedLayers(state.activeCategory);
    const current = layers[state.activeLayer];
    if (!current || current.categoryId !== state.activeCategory) {
        state.activeLayer = inCategory.length > 0 ? inCategory[0].id : null;
    }
}

// Returns the layer's save data.
export function getLayerState(layerId) {
    const def = layers[layerId];

    if (!state.layers[layerId]) {
        const firstSubLayer = getOrderedSubLayers(layerId)[0];
        state.layers[layerId] = {
            unlocked: def ? def.startUnlocked : true,
            resources: {},
            purchasedUpgrades: {},
            subWindowPositions: {},
            activeSubLayer: firstSubLayer ? firstSubLayer.key : null,
        };
    }

    const slot = state.layers[layerId];

    if (def) {
        for (const resourceId in def.resources) {
            if (!(resourceId in slot.resources)) slot.resources[resourceId] = D(0);
            else if (!isDecimal(slot.resources[resourceId])) slot.resources[resourceId] = D(slot.resources[resourceId]);
        }
        for (const field in def.initialState) {
            const initial = def.initialState[field];
            if (!(field in slot)) slot[field] = cloneInitial(initial);
            else if (isDecimal(initial) && !isDecimal(slot[field])) slot[field] = D(slot[field]);
        }
    }

    return slot;
}

function cloneInitial(value) {
    if (isDecimal(value)) return D(value);
    if (value && typeof value === "object") return structuredClone(value);
    return value;
}
