// state.js
//
// This is the whole gamestate. All save data is here, including loading and encrypting.


import * as registry from "./registry.js";
import { D, isDecimal } from "../utils/decimal.js";

const SAVE_KEY = "greenBlueSave"; // we do be having no real name yet. internally was "incremental game" for a hot minute
const SAVE_VERSION = 1;           // it genuinely might just stay as "green and blue" lmao

// The save as it was when this session started, and a save this build couldn't read. Both are
// only ever written, never loaded on their own, so a bad session or a bad build stays undoable
const BACKUP_KEY = `${SAVE_KEY}.backup`;
const BROKEN_KEY = `${SAVE_KEY}.broken`;

// Keyed by the version each step arrives at, so a save two versions behind runs both in order.
// They see the save before anything is pruned, which is what makes renaming an id survivable
const MIGRATIONS = {
    // 2: (save) => { ...move or rescale fields here... },
};

function defaultState() {
    return {
        saveVersion: SAVE_VERSION,
        lastSaveTime: Date.now(),
        totalTimePlayed: 0,
        activeCategory: null,
        activeLayer: null,

        // Most of these are just dev tools
        settings: { theme: "dark", autosave: true, hideNav: false, showCanvasCoords: false, showDevInteractions: false, enableFastGrass: false },
        seen: { layers: {}, subLayers: {}, guides: {} },  // Which tabs the player has seen, so they don't flash
        layers: {}, // Per-layer save data
    };
}

export let state = defaultState();

// Makes it not re-save after you deleted
let savingBlocked = false;
let saveProblem = ""; // Why saving is off, for the settings window to show

// Saving is switched off rather than left to overwrite a save this build shouldn't be writing.
// It stays off until the page is reloaded, since there's no way back to a good state without one
export function blockSaving(reason) {
    savingBlocked = true;
    saveProblem = reason;
}

export function saveState() {
    if (savingBlocked) return false;
    try {
        localStorage.setItem(SAVE_KEY, encodeSave(serializeState()));
    } catch (err) {
        // Out of storage, or a browser refusing it in private mode. Saying so beats a "Saved."
        // that isn't true, and the save already on disk is still whatever it was
        console.error("Saving failed, so the save on disk is unchanged.", err);
        saveProblem = "Saving failed - the browser refused to write. Use Save to file instead.";
        return false;
    }
    saveProblem = "";
    return true;
}

// Decimals are stored as strings, getLayerState() turns them back into Decimals
export function serializeState() {
    state.lastSaveTime = Date.now();
    return JSON.stringify(state, (key, value) => isDecimal(value) ? value.toString() : value);
}

// Saves are masked and base64'd, not as a full lock but just so that it's a bit harder to
// directly manipulate save file variables and add in currency
const SAVE_MAGIC = "GNB";
const MAGIC_RE = /^GNB\d+/; // Any version's magic decodes, so bumping SAVE_VERSION doesn't orphan saves
const MASK_KEY = "green-and-blue";

// XOR so the same pass encodes and decodes. Index is in there too, otherwise a save full of
// repeated text shows the key's own length as a pattern
const mask = (byte, i) => byte ^ ((MASK_KEY.charCodeAt(i % MASK_KEY.length) + i) & 0xff);

export function encodeSave(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(mask(bytes[i], i));
    return SAVE_MAGIC + SAVE_VERSION + btoa(binary);
}

export function decodeSave(raw) {
    const text = raw.trim();
    // Plain JSON is still read, so files exported before this and hand-written saves keep working
    const magic = text.match(MAGIC_RE);
    if (!magic) return text;

    const binary = atob(text.slice(magic[0].length).replace(/\s+/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = mask(binary.charCodeAt(i), i);
    return new TextDecoder().decode(bytes);
}

// Takes the contents of an exported save. Throws before touching storage if it isn't one, so a
// wrong file picked by mistake leaves the save that's already there alone
export function importSave(raw) {
    const json = decodeSave(raw);
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || !parsed.layers || !parsed.settings) {
        throw new Error("not a save");
    }
    const replaced = localStorage.getItem(SAVE_KEY);
    localStorage.setItem(SAVE_KEY, encodeSave(json));
    loadState();

    // After the load, which writes a backup of its own. The save that was just replaced is the
    // one worth keeping here, so importing the wrong file is still undoable
    if (replaced) {
        try { localStorage.setItem(BACKUP_KEY, replaced); } catch { /* the imported save is in */ }
    }
}

export function loadState() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
        state = defaultState();
        return state;
    }

    let loaded;
    try {
        loaded = JSON.parse(decodeSave(raw));
    } catch (err) {
        // This used to start a fresh game and leave saving on, so the next autosave wrote that
        // empty game over the save. Now the bytes are kept and nothing is allowed to write
        try { localStorage.setItem(BROKEN_KEY, raw); } catch { /* nothing to do if it won't fit */ }
        blockSaving("This build couldn't read your save, so it has been left untouched and saving"
            + " is off. Use Save to file to keep a copy of it before playing on.");
        console.error("Save file couldn't be read. It's been left alone and saving is off.", err);
        state = defaultState();
        return state;
    }

    // The save exactly as this session found it, so a session that goes wrong can be undone
    try { localStorage.setItem(BACKUP_KEY, raw); } catch { /* the live save matters more */ }

    state = migrateState(loaded);
    return state;
}

// Old saves are made compatible with current version
function migrateState(loaded) {
    if (!loaded || typeof loaded !== "object") return defaultState();

    loaded = applyVersionSteps(loaded);

    const fresh = defaultState();
    const migrated = reconcile(fresh, loaded);

    migrated.settings = reconcile(fresh.settings, asObject(loaded.settings));
    migrated.seen = { ...fresh.seen, ...asObject(loaded.seen) };
    for (const kind in migrated.seen) migrated.seen[kind] = asObject(migrated.seen[kind]);

    migrated.layers = asObject(migrated.layers);
    migrated.saveVersion = SAVE_VERSION;

    // Pruning against a registry that never finished loading would delete most of the save, so
    // that load keeps its hands off and refuses to write over what's already there
    if (registryLooksBroken(migrated.layers)) {
        blockSaving("Part of the game didn't load, so your save has been left alone and saving is"
            + " off. Reload the page.");
        console.error("Part of the game didn't load, so the save has been left alone and saving is"
            + " off until the page is reloaded.");
        return migrated;
    }

    const declared = declaredBySlot();
    rehomePools(migrated.layers);
    for (const layerId in migrated.layers) { // A layer that no longer exists takes its whole slot with it
        if (!registry.layers[layerId]) {
            delete migrated.layers[layerId];
            continue;
        }
        migrated.layers[layerId] = migrateSlot(registry.layers[layerId], asObject(migrated.layers[layerId]), declared[layerId]);
    }

    return migrated;
}

// Checks for layers the registry hasn't heard of and for if a ton of missing ones are gone
function registryLooksBroken(loadedLayers) {
    const ids = Object.keys(loadedLayers);
    if (ids.length === 0) return false;
    return ids.filter(id => registry.layers[id]).length * 2 < ids.length;
}

// Walks a save up to the current version, one step per version, before any pruning happens
function applyVersionSteps(loaded) {
    const from = Number.isInteger(loaded.saveVersion) ? loaded.saveVersion : 0;

    // A save from a newer build, which happens with a cached page or a rolled-back deploy. It
    // still loads so the player can look at it, but pruning it down to what this build knows
    // and then writing that back would throw away whatever the newer build added
    if (from > SAVE_VERSION) {
        blockSaving(`This save is from a newer version of the game (save v${from}, this build`
            + ` reads v${SAVE_VERSION}), so it's open read-only and saving is off.`);
        return loaded;
    }

    for (let version = from + 1; version <= SAVE_VERSION; version++) {
        if (MIGRATIONS[version]) loaded = MIGRATIONS[version](loaded) || loaded;
    }
    return loaded;
}

// Saves written before pools belonged to holders carry one on every layer that displayed the
// resource. They prune away below, but anything left in one is moved rather than dropped
function rehomePools(loadedLayers) {
    for (const layerId in loadedLayers) {
        const pools = asObject(asObject(loadedLayers[layerId]).resources);

        for (const resourceId in pools) {
            const def = registry.resourceDefs[resourceId];
            if (!def || def.holder === layerId) continue;

            const amount = D(pools[resourceId] || 0);
            if (amount.lte(0)) continue;

            const holder = loadedLayers[def.holder];
            if (!holder) continue;
            holder.resources = asObject(holder.resources);
            holder.resources[resourceId] = D(holder.resources[resourceId] || 0).add(amount);
            console.warn(`Moved ${amount} ${resourceId} off "${layerId}" onto its holder "${def.holder}".`);
        }
    }
}

// Drops whatever this layer no longer declares. getLayerState() will rebuild it better. Stronger.
function migrateSlot(def, slot, declared) {
    slot.resources = asObject(slot.resources);
    slot.purchasedUpgrades = asObject(slot.purchasedUpgrades);
    slot.subWindowPositions = asObject(slot.subWindowPositions);

    prune(slot.resources, declared.resources);
    prune(slot.purchasedUpgrades, declared.purchases);
    prune(slot.subWindowPositions, declared.subWindows);

    // The fixed slot fields, plus whatever the layer declares as state of its own
    const keep = new Set(["unlocked", "resources", "purchasedUpgrades", "subWindowPositions",
        "activeSubLayer", ...Object.keys(def.initialState || {})]);
    if (def.tiles) keep.add("tiles"); // A hex map's unlocked tiles, which don't need to be declared
    prune(slot, keep);

    // Makes you don't stay on a renamed or removed sub-layer
    if (!(def.subLayers && def.subLayers[slot.activeSubLayer])) slot.activeSubLayer = null;

    return slot;
}

// What the content declares, so that it's easier to fix saves
function declaredBySlot() {
    const slots = {};
    const slotFor = (stateKey) => slots[stateKey] || (slots[stateKey] =
        { resources: new Set(), purchases: new Set(), subWindows: new Set() });

    const claim = (stateKey, view) => {
        const slot = slotFor(stateKey);
        // Nodes are bought out of the same map as upgrades, so they share a set here too
        for (const id in view.upgrades) slot.purchases.add(id);
        for (const id in view.nodes) slot.purchases.add(id);
        for (const id in view.subWindows) slot.subWindows.add(id);
    };

    for (const id in registry.resourceDefs) slotFor(registry.resourceDefs[id].holder).resources.add(id);

    for (const layerId in registry.layers) {
        const def = registry.layers[layerId];
        claim(def.stateKey, def);
        for (const subLayer of Object.values(def.subLayers || {})) claim(subLayer.stateKey, subLayer);
    }
    return slots;
}

// Keeps only the fields still declared, and takes the default for whichever of those are missing
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

// Anything that should be a map but isn't gets replaced
function asObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function deleteSave() {
    savingBlocked = true;
    for (const key of [SAVE_KEY, BACKUP_KEY, BROKEN_KEY]) localStorage.removeItem(key);
    window.location.reload();
}

export function hasBackup() {
    return localStorage.getItem(BACKUP_KEY) !== null;
}

// Puts back the save as it was when this session started. Saving stays off from here so nothing
// writes over what was just restored before the caller reloads
export function restoreBackup() {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) return false;
    localStorage.setItem(SAVE_KEY, raw);
    blockSaving("Backup restored. Reload the page to play it.");
    return true;
}

// What "Save to file" writes out. With saving off, the thing worth keeping is the save sitting on
// disk, not the state the game is running - which may be the empty one it fell back to
export function exportSave() {
    if (savingBlocked) {
        const raw = localStorage.getItem(BROKEN_KEY) || localStorage.getItem(SAVE_KEY);
        if (raw) return raw;
    }
    saveState();
    return encodeSave(serializeState());
}

export function hasSave() {
    return localStorage.getItem(SAVE_KEY) !== null;
}

export function isSavingBlocked() {
    return savingBlocked;
}

// Empty when nothing is wrong
export function getSaveProblem() {
    return saveProblem;
}


// Run once at startup so that tabs don't flash on every load
export function markSeenTabs() {
    if (!state.seen) state.seen = { layers: {}, subLayers: {}, guides: {} };

    for (const layerId in registry.layers) {
        if (!getLayerState(layerId).unlocked) continue;
        state.seen.layers[layerId] = true;
        for (const subLayer of registry.getOrderedSubLayers(layerId)) {
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
// them on demand rather than making every new kind a migration
function seenBucket(kind) {
    if (!state.seen) state.seen = {};
    if (!state.seen[kind]) state.seen[kind] = {};
    return state.seen[kind];
}

// The renderer assumes an id given to it is real, so this makes sure that it doesn't crash or render nothing
export function resolveActiveSelection() {
    const orderedCategories = registry.getOrderedCategories();
    if (orderedCategories.length === 0) return;

    if (!registry.categories[state.activeCategory]) state.activeCategory = orderedCategories[0].id;

    const inCategory = registry.getOrderedLayers(state.activeCategory);
    const current = registry.layers[state.activeLayer];
    if (!current || current.categoryId !== state.activeCategory) {
        state.activeLayer = inCategory.length > 0 ? inCategory[0].id : null;
    }
}

// Returns the layer's save data
export function getLayerState(layerId) {
    const def = registry.layers[layerId];

    if (!state.layers[layerId]) {
        const firstSubLayer = registry.getOrderedSubLayers(layerId)[0];
        state.layers[layerId] = {
            unlocked: def ? def.startUnlocked : true,
            resources: {},
            purchasedUpgrades: {},
            subWindowPositions: {},
            activeSubLayer: firstSubLayer ? firstSubLayer.key : null,
        };
    }

    const slot = state.layers[layerId];

    // What it holds, not what it displays
    for (const resourceId of registry.heldResourceIds(layerId)) {
        if (!(resourceId in slot.resources)) slot.resources[resourceId] = D(0);
        else if (!isDecimal(slot.resources[resourceId])) slot.resources[resourceId] = D(slot.resources[resourceId]);
    }

    if (def) {
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
