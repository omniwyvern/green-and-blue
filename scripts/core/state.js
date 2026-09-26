// state.js
//
// The whole gamestate: save data, loading, migrating and encoding

import * as registry from "./registry.js";
import { D, isDecimal } from "../utils/decimal.js";

// No real name yet; internally this was "incremental game" for a while
const SAVE_KEY = "greenBlueSave";
const SAVE_VERSION = 6;

// The save as this session found it, and one this build couldn't read; written only, so both stay undoable
const BACKUP_KEY = `${SAVE_KEY}.backup`;
const BROKEN_KEY = `${SAVE_KEY}.broken`;


//    !!! MIGRATIONS !!!

// Keyed by the version each step arrives at, and run before anything is pruned
const MIGRATIONS = {
    // "Evolution" became "Adaptation", so the layer slot and its pool move to the new ids
    2: (save) => {
        const layers = save.layers;
        if (!layers || typeof layers !== "object") return save;

        renameKey(layers, "evolution", "adaptation");
        for (const id in layers) renameKey(layers[id]?.resources, "evolutionPoints", "adaptationPoints");
        renameKey(layers.cores?.purchasedUpgrades, "evolution", "adaptation");

        const seen = save.seen;
        renameKey(seen?.layers, "evolution", "adaptation");
        renameKey(seen?.subLayers, "evolve", "adapt");
        renameKey(seen?.guides, "evolution-intro", "adaptation-intro");
        renameKey(seen?.guides, "evolution-cards", "adaptation-cards");

        if (save.activeLayer === "evolution") save.activeLayer = "adaptation";
        return save;
    },

    // Biome nodes now open one sub-layer each, so older saves get the first tier of every biome they had
    3: (save) => {
        const bought = save.layers && save.layers.environment && save.layers.environment.purchasedUpgrades;
        if (!bought || typeof bought !== "object") return save;

        const FIRST_TIER = {
            biomeWetlands: "marsh",
            biomeIce: "iceField",
            biomeReef: "reef",
            biomeFungi: "mushroomGrove",
        };
        for (const face in FIRST_TIER) {
            if (bought[face] && !bought[FIRST_TIER[face]]) bought[FIRST_TIER[face]] = 1;
        }

        return save;
    },

    // "Forest" became "Woodland", so the layer slot and its tab move to the new id
    4: (save) => {
        const layers = save.layers;
        if (!layers || typeof layers !== "object") return save;

        renameKey(layers, "forest", "woodland");
        renameKey(save.seen?.layers, "forest", "woodland");

        if (save.activeLayer === "forest") save.activeLayer = "woodland";
        return save;
    },

    // The Forest node opened "biomeForest", which isn't on the Ecosystem canvas, so buyers get Woodlands instead
    5: (save) => {
        const layers = save.layers;
        const cores = layers && layers.cores && layers.cores.purchasedUpgrades;
        if (!cores || !cores.forest) return save;

        const environment = layers.environment = asObject(layers.environment);
        const bought = environment.purchasedUpgrades = asObject(environment.purchasedUpgrades);
        delete bought.biomeForest;
        bought.biomeWoodlands = 1;
        bought.forest = 1;
        return save;
    },

    // Cores unlock nodes were retuned and renamed after their titles, so bought ones move to the new ids
    6: (save) => {
        const bought = save.layers?.cores?.purchasedUpgrades;
        if (!bought || typeof bought !== "object") return save;

        const RENAMED = {
            grassRunners: "grassCreepingStems",
            grassThick: "grassSodLayer",
            rainUpdraft: "rainRisingAir",
            adaptPressed: "adaptPressedLeaves",
            adaptSeedBank: "adaptHoardedSeeds",
            envLoam: "envTopsoil",
            oceanCurrents: "oceanWarmCurrents",
            oceanUpwelling: "oceanRichShallows",
            forestHeartwood: "forestGrowthRings",
            ecoMarsh: "ecoBogMat",
            ecoIce: "ecoFrostHeave",
        };
        for (const from in RENAMED) renameKey(bought, from, RENAMED[from]);
        return save;
    },
};

function renameKey(map, from, to) {
    if (map && typeof map === "object" && from in map) {
        map[to] = map[from];
        delete map[from];
    }
}


//    !!! A FRESH GAME !!!

function defaultState() {
    return {
        saveVersion: SAVE_VERSION,
        lastSaveTime: Date.now(),
        totalTimePlayed: 0,
        activeCategory: null,
        activeLayer: null,

        // Most of these are just dev tools
        settings: { theme: "dark", autosave: true, hideNav: false, hideFlyout: false, showCanvasCoords: false, showDevInteractions: false, enableFastGrass: false, enableFastTrees: false, enableUnlimitedPotential: false, enableUnlimitedNotions: false },
        seen: { layers: {}, subLayers: {}, guides: {} },  // Which tabs the player has seen, so they don't flash
        layers: {}, // Per-layer save data
    };
}

export let state = defaultState();

// Blocks a re-save after a delete
let savingBlocked = false;
let saveProblem = ""; // Why saving is off, for the settings window to show

// Stays off until the page is reloaded, rather than overwriting a save this build shouldn't write
export function blockSaving(reason) {
    savingBlocked = true;
    saveProblem = reason;
}


//    !!! SAVING !!!

export function saveState() {
    if (savingBlocked) return false;
    try {
        localStorage.setItem(SAVE_KEY, encodeSave(serializeState()));
    } catch (err) {
        // Out of storage, or private mode refusing it
        console.error("Saving failed, so the save on disk is unchanged.", err);
        saveProblem = "Saving failed because the browser refused to write. Use Save to file instead.";
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


//    !!! ENCODING !!!

// Masked and base64'd, not as a lock but so currency can't just be typed into the save
const SAVE_MAGIC = "GNB";
const MAGIC_RE = /^GNB\d+/; // Any version's magic decodes, so bumping SAVE_VERSION doesn't orphan saves
const MASK_KEY = "green-and-blue";

// XOR so one pass encodes and decodes, with the index mixed in so repeated text doesn't show the key length
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


//    !!! READING A SAVE IN !!!

// Throws before touching storage if the text isn't a save, so a wrong file leaves the current save alone
export function importSave(raw) {
    const json = decodeSave(raw);
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || !parsed.layers || !parsed.settings) {
        throw new Error("not a save");
    }
    const replaced = localStorage.getItem(SAVE_KEY);
    localStorage.setItem(SAVE_KEY, encodeSave(json));
    loadState();

    // After the load, which writes its own backup, so the replaced save is the one kept
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
        // Keeps the bytes and blocks saving, so an autosave can't write an empty game over them
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


//    !!! MIGRATING !!!

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

    // Pruning against a registry that never finished loading would delete most of the save
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

// Too many unknown layer ids means the registry, not the save, is what's wrong
function registryLooksBroken(loadedLayers) {
    const ids = Object.keys(loadedLayers);
    if (ids.length === 0) return false;
    return ids.filter(id => registry.layers[id]).length * 2 < ids.length;
}

// Walks a save up to the current version, one step per version, before any pruning happens
function applyVersionSteps(loaded) {
    const from = Number.isInteger(loaded.saveVersion) ? loaded.saveVersion : 0;

    // A save from a newer build still loads, but writing it back would drop what the newer build added
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

// Older saves kept a pool on every layer showing a resource, so what's in them is moved to the holder
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

// Drops whatever this layer no longer declares, since getLayerState() rebuilds it better
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

    // Stops you sitting on a renamed or removed sub-layer
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


//    !!! DELETING AND EXPORTING !!!

export function deleteSave() {
    savingBlocked = true;
    for (const key of [SAVE_KEY, BACKUP_KEY, BROKEN_KEY]) localStorage.removeItem(key);
    window.location.reload();
}

export function hasBackup() {
    return localStorage.getItem(BACKUP_KEY) !== null;
}

// Puts back the save this session started from, and blocks saving until the reload
export function restoreBackup() {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) return false;
    localStorage.setItem(SAVE_KEY, raw);
    blockSaving("Backup restored. Reload the page to play it.");
    return true;
}

// With saving off, the save on disk is exported rather than the (maybe empty) running state
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

// Empty when nothing is wrong
export function getSaveProblem() {
    return saveProblem;
}


//    !!! WHAT HAS BEEN SEEN !!!

// Run once at startup so that tabs don't flash on every load
export function markSeenTabs() {
    for (const layerId in registry.layers) {
        if (!layerUnlocked(layerId)) continue;
        seenBucket("layers")[layerId] = true;
        for (const subLayer of registry.getOrderedSubLayers(layerId)) seenBucket("subLayers")[subLayer.id] = true;
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

// Made on demand, since older saves can be missing a bucket
function seenBucket(kind) {
    if (!state.seen) state.seen = {};
    if (!state.seen[kind]) state.seen[kind] = {};
    return state.seen[kind];
}


//    !!! WHAT IS ON SCREEN !!!

// The renderer assumes an id given to it is real, so this makes sure that it doesn't crash or render nothing
export function resolveActiveSelection() {
    const orderedCategories = registry.getOrderedCategories();
    if (orderedCategories.length === 0) return;

    if (!registry.categories[state.activeCategory]) state.activeCategory = orderedCategories[0].id;

    const current = registry.layers[state.activeLayer];
    // A locked layer draws nothing, so this falls back to an open one
    if (!current || current.categoryId !== state.activeCategory
        || !layerUnlocked(current.id)) {
        state.activeLayer = defaultLayerId(state.activeCategory);
    }
}

export function defaultLayerId(categoryId) {
    const preferred = registry.categories[categoryId].defaultLayer;
    if (preferred && layerUnlocked(preferred)) return preferred;
    const inCategory = registry.getOrderedLayers(categoryId);
    const open = inCategory.find(layer => layerUnlocked(layer.id)) || inCategory[0];
    return open ? open.id : null;
}


//    !!! A LAYER'S SLOT !!!

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

export const layerUnlocked = (layerId) => !!getLayerState(layerId).unlocked;

export const unlockLayer = (layerId) => { getLayerState(layerId).unlocked = true; };

function cloneInitial(value) {
    if (isDecimal(value)) return D(value);
    if (value && typeof value === "object") return structuredClone(value);
    return value;
}
