// pressures.js
//
// One environmental pressure per tile family; more tiles means more pressure

import {
    claimedTiles, tileKind, tierOf, worldState,
    AQUATIC_KINDS, WOODLAND_KINDS, WETLANDS_KINDS, REEF_KINDS, ICE_KINDS, FUNGUS_KINDS,
} from "./worldMap.js";
import { openRegionCount } from "../sublayers/oceanSublayer.js";
import { getLayerState } from "../../../core/state.js";
import { oldGrowth } from "./forestTrees.js";

// Ocean regions and old growth aren't tiles but still add pressure
const REGION_PRESSURE = 0.5;    // Per open ocean region
const OLD_GROWTH_PRESSURE = 0.2; // Per piece of old growth standing behind the woodland


//    !!! EVERY PRESSURE !!!

// name, color, kinds (tile family, each worth its tier), extra (non-tile sources), text (tooltip)
export const PRESSURES = {
    tidal: {
        name: "Tidal",
        color: "#4a90d9",
        kinds: AQUATIC_KINDS,
        extra: () => REGION_PRESSURE * openRegionCount(getLayerState("aquatic")),
        text: "Water that never sits still, and everything in it moving with it.",
    },
    canopy: {
        name: "Canopy",
        color: "#3d9455",
        kinds: WOODLAND_KINDS,
        extra: () => OLD_GROWTH_PRESSURE * oldGrowth().length,
        text: "Shade, and the long reach upward it takes to get out of it.",
    },
    stagnant: {
        name: "Stagnant",
        color: "#6f9e63",
        kinds: WETLANDS_KINDS,
        text: "Standing water with no way out of it, and the little air left in the ground.",
    },
    saline: {
        name: "Saline",
        color: "#37b3c6",
        kinds: REEF_KINDS,
        text: "Salt, hard rock, and light that has to be caught before it's gone.",
    },
    frigid: {
        name: "Frigid",
        color: "#7fc4e2",
        kinds: ICE_KINDS,
        text: "Cold that doesn't break and freezes out other life.",
    },
    decay: {
        name: "Decay",
        color: "#a06bc0",
        kinds: FUNGUS_KINDS,
        text: "Everything that fell, and everything living off of what fell.",
    },
};

export const PRESSURE_IDS = Object.keys(PRESSURES);


//    !!! READING A PRESSURE !!!

// Kind -> pressure, built once. The meters ask per frame, so this saves walking every family
const PRESSURE_OF_KIND = {};
for (const id of PRESSURE_IDS) {
    for (const kind in PRESSURES[id].kinds) PRESSURE_OF_KIND[kind] = id;
}

export const pressureOfKind = (kind) => PRESSURE_OF_KIND[kind] || null;

export const pressureDef = (id) => PRESSURES[id];

// What one tile of a family is worth to its pressure by tier
const TIER_WEIGHT = { 1: 1, 2: 3, 3: 10 };

export const weightOfKind = (kind) => TIER_WEIGHT[tierOf(kind)] || 0;

// How hard one pressure is pushing right now
export function pressureAmount(id, s = worldState()) {
    const def = PRESSURES[id];
    if (!def) return 0;

    let total = 0;
    for (const tile of claimedTiles(s)) {
        if (PRESSURE_OF_KIND[tileKind(s, tile)] === id) total += weightOfKind(tileKind(s, tile));
    }
    return total + (def.extra ? def.extra() : 0);
}

// Every pressure at once, for the readouts that show all six side by side
export const allPressures = (s = worldState()) =>
    Object.fromEntries(PRESSURE_IDS.map(id => [id, pressureAmount(id, s)]));

// Whether the world has ever pushed this way, to have stuff hidden
export const pressureFelt = (id, s = worldState()) => pressureAmount(id, s) > 0;
