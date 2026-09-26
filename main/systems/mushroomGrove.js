// mushroomGrove.js
//
// Mushrooms drain Biomass while growing, then drop spores or fruit for a big boost

import { getLayerState } from "../../../core/state.js";
import { spend, addResource, getResource, setResource, levelsIn } from "../../../core/resources.js";
import { registerBoost } from "../../../core/boosts.js";
import { traitBonus } from "./evolutionTraits.js";
import { D } from "../../../utils/decimal.js";
import {
    worldState, countOf, tileKind, tileById, neighboringTiles, isClaimed,
    contributeTileOutput, contributeNeighborBoost,
} from "./worldMap.js";

export const groveState = () => getLayerState("fungi");
const level = levelsIn("fungi");

const GROVE = "mushroom-grove";


//    !!! HOW MUCH GROVE THERE IS !!!

export const groveTiles = (world = worldState()) => countOf(GROVE, world);

export const groveOpen = (world = worldState()) => groveTiles(world) > 0;


//    !!! THE MUSHROOMS !!!

// grow is seconds to come up, sap is the share of all Biomass it eats every second while it does
export const SPECIES = {
    inkCap: { name: "Common Ink Cap", color: "#b8b3ac",
        wild: true, grow: 240, sap: 0, spores: 0.35, cost: 0,
        blurb: "Pops up in empty spots, then melts into ink before it can be fruited." },

    oyster: { name: "Oyster Mushroom", color: "#cfc6b4",
        grow: 300, sap: 0.006, spores: 0.3, cost: 12, found: 0,
        fruit: { kind: "greenEssence", base: 10, name: "Green Essence" },
        blurb: "Pale shelves stacked up the side of a stump." },

    shiitake: { name: "Shiitake", color: "#9a6a44",
        grow: 300, sap: 0.006, spores: 0.3, cost: 20, found: 0,
        fruit: { kind: "blueEssence", base: 10, name: "Blue Essence" },
        blurb: "Brown caps flecked with cream, sprouting from old hardwood." },

    enoki: { name: "Enoki", color: "#ece6cf",
        grow: 240, sap: 0.005, spores: 0.25, cost: 35, found: 1,
        fruit: { kind: "growth", base: 4, name: "mushroom growth" },
        blurb: "A tangle of long thin stems, each with a pinhead cap." },

    morel: { name: "Morel", color: "#b89560",
        grow: 540, sap: 0.011, spores: 0.5, cost: 90, found: 3,
        fruit: { kind: "biomass", base: 40, name: "Biomass" },
        blurb: "A honeycombed cone that turns up where the ground has burned." },

    chanterelle: { name: "Chanterelle", color: "#e3a43a",
        grow: 480, sap: 0.01, spores: 0.6, cost: 150, found: 5,
        fruit: { kind: "spores", base: 8, name: "Spores" },
        blurb: "Golden trumpets with ridges running down the stem instead of gills." },

    lionsMane: { name: "Lion's Mane", color: "#f1ece0",
        grow: 600, sap: 0.012, spores: 0.6, cost: 260, found: 8,
        fruit: { kind: "adjacency", base: 1.5, name: "tile adjacency" },
        blurb: "A white mass of hanging spines." },

    reishi: { name: "Reishi", color: "#a8402e",
        grow: 600, sap: 0.012, spores: 0.7, cost: 420, found: 12,
        fruit: { kind: "stillness", base: 1, name: "stillness" },
        blurb: "A lacquered red fan that feels more like wood than flesh." },

    flyAgaric: { name: "Fly Agaric", color: "#d8392b",
        grow: 660, sap: 0.015, spores: 0.8, cost: 800, found: 18,
        fruit: { kind: "essence", base: 25, name: "Green and Blue Essence" },
        blurb: "The red cap with white spots. Nothing else in the grove looks like it." },
};

export const SPECIES_IDS = Object.keys(SPECIES);
export const PLANTABLE = SPECIES_IDS.filter(id => !SPECIES[id].wild);
const WILD = "inkCap";

export const isFound = (id, s = groveState()) => (s.groveFruited || 0) >= (SPECIES[id].found || 0);

export const fruitsToFind = (id, s = groveState()) => Math.max(0, (SPECIES[id].found || 0) - (s.groveFruited || 0));

export const plantCost = (id) => ({ spores: D(SPECIES[id].cost * (1 - traitBonus("plantCost"))) });


//    !!! THE BEDS !!!

// x across the clearing in percent, d from back (0) to front (1), in opening order and staggered
export const BEDS = [
    { x: 37, d: 0.5 }, { x: 63, d: 0.5 }, { x: 50, d: 0.12 },
    { x: 24, d: 1 }, { x: 76, d: 1 }, { x: 15, d: 0.27 },
    { x: 85, d: 0.27 },
];

const START_BEDS = 2;
const BEDS_FROM_TILES = 3;

export const bedCount = (s = groveState(), world = worldState()) => Math.min(BEDS.length,
    START_BEDS + Math.min(BEDS_FROM_TILES, groveTiles(world)) + level("clearing"));

export function beds(s = groveState()) {
    if (!Array.isArray(s.groveBeds)) s.groveBeds = [];
    for (let i = 0; i < s.groveBeds.length; i++) {
        const bed = s.groveBeds[i];
        if (bed && !SPECIES[bed.species]) s.groveBeds[i] = null;
    }
    return s.groveBeds;
}

export const bedAt = (i, s = groveState()) => beds(s)[i] || null;

export const growTime = (bed) => SPECIES[bed.species].grow;

export const isMature = (bed) => !!bed && bed.grown >= growTime(bed);

export const growthShare = (bed) => bed ? Math.min(1, bed.grown / growTime(bed)) : 0;

export const secondsToMature = (bed) => Math.max(0, (growTime(bed) - bed.grown) / growthSpeed());

export const anyPlanted = (s = groveState()) => beds(s).slice(0, bedCount(s)).some(Boolean);

export function plant(i, id, s = groveState()) {
    const def = SPECIES[id];
    if (!def || def.wild || !isFound(id, s) || i >= bedCount(s) || bedAt(i, s)) return false;
    if (!spend(plantCost(id))) return false;
    beds(s)[i] = { species: id, grown: 0 };
    return true;
}

// Fruiting spends the mushroom. The same kind again adds its time on, up to a limit
export const canFruit = (bed) => isMature(bed) && !!SPECIES[bed.species].fruit;

const FRUIT_SPORE_RETURN = 0.35;

export function fruit(i, s = groveState()) {
    const bed = bedAt(i, s);
    if (!canFruit(bed)) return false;
    const id = bed.species;
    const boosts = activeBoosts(s);
    boosts[id] = Math.min(fruitSeconds() * (FRUIT_STACK + traitBonus("fruitStack")), (boosts[id] || 0) + fruitSeconds());
    addResource("spores", D(SPECIES[id].cost * FRUIT_SPORE_RETURN * (1 + traitBonus("fruitReturn"))));
    beds(s)[i] = null;
    s.groveFruited = (s.groveFruited || 0) + 1;
    return true;
}


//    !!! FRUITING BOOSTS !!!

const FRUIT_SECONDS = 30;
const FRUIT_STACK = 3;

export const fruitSeconds = () => FRUIT_SECONDS + LINGER_PER_LEVEL * level("lingering") + traitBonus("fruitLength");

export const fruitPotency = () => (1 + POTENCY_PER_LEVEL * level("fruitingBody")) * (1 + traitBonus("fruitPotency"));

export const fruitMultiplier = (id) => 1 + (SPECIES[id].fruit.base - 1) * fruitPotency();

// Lion's Mane is worth this much per claimed tile touching each tile, not a flat multiplier
export const adjacencyPerNeighbor = () => SPECIES.lionsMane.fruit.base * fruitPotency();

export function activeBoosts(s = groveState()) {
    if (!s.groveBoosts || typeof s.groveBoosts !== "object") s.groveBoosts = {};
    for (const id in s.groveBoosts) {
        if (!SPECIES[id]?.fruit || !(s.groveBoosts[id] > 0)) delete s.groveBoosts[id];
    }
    return s.groveBoosts;
}

export const boostLeft = (id, s = groveState()) => activeBoosts(s)[id] || 0;

const kindActive = (kind, s = groveState()) =>
    PLANTABLE.some(id => SPECIES[id].fruit.kind === kind && boostLeft(id, s) > 0);

const kindMultiplier = (kind, s = groveState()) => {
    let total = 1;
    for (const id of PLANTABLE) {
        if (SPECIES[id].fruit.kind === kind && boostLeft(id, s) > 0) total *= fruitMultiplier(id);
    }
    return total;
};

const ESSENCES = new Set(["greenEssence", "blueEssence"]);

registerBoost("Grove: Fruiting", (resourceId) => {
    if (ESSENCES.has(resourceId)) return kindMultiplier(resourceId) * kindMultiplier("essence");
    return resourceId === "biomass" ? kindMultiplier("biomass") : 1;
});

export const growthSpeed = (s = groveState()) =>
    (1 + SOIL_PER_LEVEL * level("richSoil")) * kindMultiplier("growth", s)
    * (1 + traitBonus("growth") + traitBonus("groveGrowth"));

export const sporeMultiplier = (s = groveState()) =>
    (1 + PRINT_PER_LEVEL * level("sporePrint")) * kindMultiplier("spores", s) * (1 + traitBonus("spores"));

export const stillnessActive = (s = groveState()) => kindActive("stillness", s);


//    !!! SPORES AND BIOMASS !!!

export function sporeRate(s = groveState()) {
    let total = 0;
    for (const bed of beds(s).slice(0, bedCount(s))) if (isMature(bed)) total += SPECIES[bed.species].spores;
    return D(total * sporeMultiplier(s));
}

export const sapShare = () => Math.max(0.2, 1 - MULCH_PER_LEVEL * level("mulch") - traitBonus("sapShare"));

// Each growing mushroom's share of Biomass eaten per second, added up
export function sapRate(s = groveState()) {
    let total = 0;
    for (const bed of beds(s).slice(0, bedCount(s))) {
        if (bed && !isMature(bed)) total += SPECIES[bed.species].sap;
    }
    return total * sapShare();
}


//    !!! WHAT THE MAP GETS OUT OF IT !!!

const GROVE_GREEN_BASE = 6e7;
const GROVE_PER_MATURE = 1.5;

export const matureCount = (s = groveState()) => beds(s).slice(0, bedCount(s)).filter(isMature).length;

function groveOutput(world, id) {
    if (tileKind(world, id) !== GROVE) return {};
    return { greenEssence: GROVE_GREEN_BASE * (1 + GROVE_PER_MATURE * matureCount()) };
}

contributeTileOutput(GROVE, groveOutput);

function groveNeighborBoost(world, id) {
    if (!kindActive("adjacency")) return 1;
    const tile = tileById(id);
    if (!tile) return 1;
    const touching = neighboringTiles(tile).filter(n => isClaimed(world, n.id)).length;
    return 1 + adjacencyPerNeighbor() * touching;
}

contributeNeighborBoost("mushroomGrove", groveNeighborBoost);


//    !!! UPGRADE EFFECTS !!!

export const SOIL_PER_LEVEL = 0.12;        // Mushrooms grow faster
export const PRINT_PER_LEVEL = 0.25;       // Mature mushrooms shed more spores
export const POTENCY_PER_LEVEL = 0.2;      // Fruiting boosts are stronger
export const LINGER_PER_LEVEL = 5;         // Fruiting boosts last longer
export const MULCH_PER_LEVEL = 0.1;        // Growing mushrooms sap less Biomass


//    !!! THE TICK !!!

export const cheapestFound = (s = groveState()) =>
    PLANTABLE.filter(id => isFound(id, s)).reduce((low, id) => Math.min(low, SPECIES[id].cost), Infinity);

export const wildDue = (s = groveState()) => !anyPlanted(s) && getResource("spores").lt(cheapestFound(s));

export function tickGrove(dt, s = groveState()) {
    if (!groveOpen()) return;
    const count = bedCount(s);
    s.groveFruited = Number(s.groveFruited) || 0;
    beds(s).length = Math.min(beds(s).length, count);

    if (wildDue(s)) beds(s)[0] = { species: WILD, grown: 0 };

    const sap = sapRate(s);
    if (sap > 0) {
        const biomass = getResource("biomass");
        if (biomass.gt(0)) setResource("biomass", biomass.mul(Math.exp(-sap * dt)));
    }

    const speed = growthSpeed(s);
    for (const bed of beds(s)) {
        if (bed && !isMature(bed)) bed.grown = Math.min(growTime(bed), bed.grown + dt * speed);
    }

    const spores = sporeRate(s);
    if (spores.gt(0)) addResource("spores", spores.mul(dt));

    const boosts = activeBoosts(s);
    const still = stillnessActive(s);
    for (const id in boosts) {
        if (still && SPECIES[id].fruit.kind !== "stillness") continue;
        boosts[id] -= dt;
        if (boosts[id] <= 0) delete boosts[id];
    }
}

export const groveNeedsAttention = (s = groveState()) => {
    if (!groveOpen()) return false;
    const empty = beds(s).length < bedCount(s) || beds(s).slice(0, bedCount(s)).some(bed => !bed);
    return empty && getResource("spores").gte(cheapestFound(s));
};
