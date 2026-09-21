// iceField.js
//
// Snow is pressed from fresh to ice; high pressure scatters snow, a full gauge collapses the pack

import { getLayerState } from "../../../core/state.js";
import { levelsIn } from "../../../core/resources.js";
import { boostResource } from "../../../core/boosts.js";
import { D } from "../../../utils/decimal.js";
import { coreNodeBought } from "../../../core/nodes.js";
import { clamp, clamp01 } from "../../../utils/math.js";
import {
    worldState, countOf, tilesOf, tileKind, adjacentOfKind,
    fallingKind, contributeTileOutput, contributeMapRadius,
} from "./worldMap.js";
import { cardBonus, cardActive } from "./cards.js";
import { traitBonus, traitHas } from "./evolutionTraits.js";
import { challengeMod, challengeDone } from "./challenges.js";

export const iceState = () => getLayerState("ice");
const level = levelsIn("ice");


//    !!! HOW MANY FIELD TILES ARE THERE !!!

const FIELD = "ice-field";

export const fieldTiles = (s = worldState()) => countOf(FIELD, s);

export const fieldIsBare = () => fieldTiles() === 0;

const SCALE_POWER = 2;

export const fieldScale = (world = worldState()) =>
    Math.pow(Math.max(1, fieldTiles(world)), SCALE_POWER);

// Adjacent ice tiles are better than multiple groups
function drifting(world = worldState()) {
    let seams = 0;
    for (const id of tilesOf(FIELD, world)) {
        seams += adjacentOfKind(world, id, FIELD);
    }
    return seams / 2;
}


//    !!! THE STRATA !!!

export const STRATA = [
    {
        id: "fresh", name: "Fresh Snow", color: "#f4f9ff",
        blurb: "Loose snow. Presses add it to the pack.",
    },
    {
        id: "packed", name: "Packed Snow", color: "#d3e8f8",
        blurb: "Pressed down, with most of the air out.",
    },
    {
        id: "dense", name: "Dense Snow", color: "#9ccbec",
        blurb: "Heavy, grainy snow. Pays Green Essence as well as Blue.",
    },
    {
        id: "firn", name: "Firn", color: "#6cadda",
        blurb: "Old snow. Takes high pressure to turn into ice.",
    },
    {
        id: "ice", name: "Ice", color: "#3f8ec6",
        blurb: "Solid ice. The last layer.",
    },
];

const TOP_LAYER = STRATA.length - 1;

// Each step is worth about 30x the one above, so ice is worth a million fresh snow
export const STRATUM_YIELD = [
    { blueEssence: 5e8 },
    { blueEssence: 1.5e10 },
    { blueEssence: 5e11, greenEssence: 2e11 },
    { blueEssence: 1.5e13, greenEssence: 6e12 },
    { blueEssence: 5e14, greenEssence: 2e14 },
];

export const blankPack = () => STRATA.map(() => 0);

export function packOf(s = iceState()) {
    if (!Array.isArray(s.icePack)) s.icePack = blankPack();
    while (s.icePack.length < STRATA.length) s.icePack.push(0);
    s.icePack.length = STRATA.length;
    for (let i = 0; i < s.icePack.length; i++) {
        if (!Number.isFinite(s.icePack[i]) || s.icePack[i] < 0) s.icePack[i] = 0;
    }
    return s.icePack;
}

export const packTotal = (s = iceState()) => packOf(s).reduce((total, mass) => total + mass, 0);

// Snow lying on top presses down, so a bed carrying a load boosts production
const LOAD_WORTH = 2.5;
const LOAD_HALF = 60;

export function loadOn(index, s = iceState()) {
    const pack = packOf(s);
    let above = 0;
    for (let i = 0; i < index; i++) above += pack[i];
    return above;
}

const loadReach = () => (1 + BEARING_PER_LEVEL * level("firnLine")) * (1 + cardBonus("loadWorth"));

export function loadBonus(index, s = iceState()) {
    const above = loadOn(index, s);
    return 1 + LOAD_WORTH * loadReach() * (above / (above + LOAD_HALF));
}


//    !!! LOOSE SNOW !!!

const SNOWFALL_BASE = 0.55;
const SNOWFALL_PER_TILE = 0.4;
const SNOWFALL_PER_SEAM = 0.35;

const SNOWING_BONUS = 3;

export const isSnowing = (world = worldState()) => fallingKind(world) === "snow";

const snowingBonus = (world) => isSnowing(world) ? SNOWING_BONUS
    : 1 + (SNOWING_BONUS - 1) * Math.min(1, cardBonus("whiteout"));

// Snow falls slower as pressure gets higher
const GATHER_LOSS = 0.75;

const gatherEase = (s = iceState()) => 1 - GATHER_LOSS * pressureOf(s);

export function snowfallRate(world = worldState(), s = iceState()) {
    const tiles = fieldTiles(world);
    if (tiles === 0) return 0;
    return (SNOWFALL_BASE + SNOWFALL_PER_TILE * tiles + SNOWFALL_PER_SEAM * drifting(world))
        * (1 + SNOWFALL_PER_LEVEL * level("snowfall"))
        * (1 + cardBonus("snowfall")) * (1 + traitBonus("snowfall"))
        * snowingBonus(world)
        * gatherEase(s);
}

const LOOSE_BASE = 30;
const LOOSE_PER_TILE = 14;

export const looseCapacity = (world = worldState()) =>
    (LOOSE_BASE + LOOSE_PER_TILE * fieldTiles(world)) * (1 + CORNICE_PER_LEVEL * level("cornice"))
    * (1 + cardBonus("snowDrift")) * (1 + traitBonus("looseDepth"));

export const looseSnow = (s = iceState()) => Math.max(0, s.snowLoose || 0);

export const looseFraction = (s = iceState(), world = worldState()) =>
    Math.min(1, looseSnow(s) / Math.max(1, looseCapacity(world)));

export const looseFull = (s = iceState(), world = worldState()) =>
    looseSnow(s) >= looseCapacity(world) - 1e-6;

const SCOUR_RATE = 1 / 260;

const scourRate = (s = iceState()) => traitHas("eternalIce") ? 0 :
    SCOUR_RATE * looseSnow(s) * Math.max(0, 1 - SHELTER_PER_LEVEL * level("shelter") - traitBonus("scour"));


//    !!! PRESSURE !!!

// Each step of the bar presses a different stratum
const EDGE = [0.07, 0.36, 0.58, 0.80, 0.95];

export const STEPS = EDGE.length - 1;

export const windowLow = (index) => index >= STEPS ? EDGE[STEPS]
    : EDGE[index] * (1 - Math.min(0.5, EVEN_LOAD_PER_LEVEL * level("evenLoad")));

export const windowHigh = (index) => windowLow(index + 1);

export const workFloor = () => windowLow(0);

export const pressureOf = (s = iceState()) => clamp01(s.icePressure || 0);

export const inWindow = (index, s = iceState()) => {
    const at = pressureOf(s);
    return at >= windowLow(index)
        && (index === STEPS - 1 ? at <= windowHigh(index) : at < windowHigh(index));
};

// The deepest window the pressure is in
export function activeStep(s = iceState()) {
    for (let i = STEPS - 1; i >= 0; i--) if (inWindow(i, s)) return i;
    return -1;
}

export const overloaded = (s = iceState()) => pressureOf(s) > windowHigh(STEPS - 1);

const PRESS_BASE = 0.07;

export const pressStrength = () => PRESS_BASE * (1 + TAMP_PER_LEVEL * level("tamping")) * (1 + traitBonus("pressStrength"));

// Pressure creeps down faster when it's higher
const creepRate = (s = iceState()) =>
    0.1 * (0.3 + 3.2 * pressureOf(s) * pressureOf(s))
        * Math.max(0.25, 1 - CREEP_PER_LEVEL * level("coldCreep"))
        / (1 + cardBonus("deepCold"));

// Hold Fast stops the creep at the bottom of whatever window the pressure is in
function creepFloor(s = iceState()) {
    if (!cardActive("holdFast")) return 0;
    const step = activeStep(s);
    return step < 0 ? 0 : windowLow(step);
}


//    !!! COLLAPSE !!!

// How much of each stratum maxing the bar loses
const SPILL = [0.4, 0.22, 0.1, 0.04, 0];

const SETTLE_SECONDS = 12;
const SETTLE_WORK = 0.35;

const spillShare = (index) => cardActive("permafrost") ? 0
    : SPILL[index] * Math.max(0, 1 - SLAB_PER_LEVEL * level("slabBonding") - traitBonus("collapseKeep"));

const settleSeconds = () =>
    SETTLE_SECONDS * Math.max(0.2, 1 - FRACTURE_PER_LEVEL * level("fractureLines")) / (1 + traitBonus("settle"));

export const settlingLeft = (s = iceState()) => Math.max(0, s.iceSettling || 0);

export const isSettling = (s = iceState()) => settlingLeft(s) > 0;

const settleFactor = (s = iceState()) => isSettling(s) ? SETTLE_WORK : 1;

export const spillIfCollapsed = (s = iceState()) =>
    packOf(s).reduce((total, mass, index) => total + mass * spillShare(index), 0);

function collapsePack(s = iceState()) {
    const pack = packOf(s);
    for (let i = 0; i < pack.length; i++) pack[i] -= pack[i] * spillShare(i);

    s.icePressure = 0;
    s.iceSettling = settleSeconds();
    s.iceCollapses = (s.iceCollapses || 0) + 1;
}

export const RELIEF = 0.35;

export const canEase = (s = iceState()) => easeOpen() && pressureOf(s) > 0;

export function easeOff(s = iceState()) {
    if (!canEase(s)) return false;
    s.icePressure = Math.max(0, pressureOf(s) - RELIEF);
    return true;
}


//    !!! COMPACTION !!!

// What share of a stratum one press moves down
const BITE = [0.1, 0.07, 0.05, 0.035];

const STEP_UPGRADE = ["grainGrowth", "recrystallize", "overburden", "glacialPress"];

export const stepRate = (index) =>
    BITE[index] * (1 + [GRAIN_PER_LEVEL, SINTER_STEP_PER_LEVEL, OVERBURDEN_PER_LEVEL,
        GLACIAL_PER_LEVEL][index] * level(STEP_UPGRADE[index]))
        * (1 + cardBonus("compaction")) * (1 + traitBonus("compaction"));

// Clicking presses a stratum based on which window the pressure is in, and a bit of the one just above it
const SPREAD = 0.2;

export const spreadShare = (lvl = level("loadSpread")) =>
    Math.min(0.8, SPREAD * (1 + SPREAD_PER_LEVEL * lvl));

function stepReach(index, s = iceState()) {
    const step = activeStep(s);
    if (index === step) return 1;
    if (index === step - 1) return spreadShare();
    return 0;
}

// Compacting takes 5 units to make 1, and less dense snow gets lost when compacting denser snow
function stepRatio(index, s = iceState()) {
    const over = pressureOf(s) - windowHigh(index);
    if (over <= 0) return 0.2;
    const loss = 0.85 * Math.max(0.2, 1 - ANNEAL_PER_LEVEL * level("annealing"));
    return 0.2 * Math.max(0.1, 1 - loss * Math.min(1, over / 0.45));
}

const stepBite = (index, s = iceState()) =>
    Math.min(1, stepRate(index) * stepReach(index, s) * settleFactor(s));

// One click, goes one layer at a time so it can't have one bit fall all the way through to ice
function compactPack(s = iceState(), strength = 1) {
    const pack = packOf(s);
    const moved = [];
    for (let i = 0; i < STEPS; i++) {
        moved.push(Math.min(pack[i], pack[i] * stepBite(i, s) * strength));
    }

    let wasted = 0;
    for (let i = 0; i < STEPS; i++) {
        const kept = moved[i] * stepRatio(i, s);
        pack[i] -= moved[i];
        pack[i + 1] += kept;
        wasted += moved[i] - kept;
    }
    return wasted;
}


//    !!! PRESSING !!!

export const loadSize = () => 4 * (1 + SHOVEL_PER_LEVEL * level("shoveling"));
const loadDraw = (s = iceState()) => loadSize() * (1 + 1.8 * pressureOf(s));

// Heavier presses lose the upper part(s) of the snowpack depending on how heavy
const crushShare = (s = iceState()) => {
    const at = pressureOf(s);
    if (at <= 0.6 || cardActive("permafrost")) return 0;
    return 0.14 * (at - 0.6) / 0.4
        * Math.max(0.2, 1 - CRUST_PER_LEVEL * level("windCrust"));
};

// A press with nothing loose to hand still leans on the pack, so the meter holds while the drift refills
const canPress = (s = iceState()) => !fieldIsBare() && pressureOf(s) < 1;

export function pressPack(s = iceState()) {
    if (!canPress(s)) return false;

    s.icePressure = Math.min(1, pressureOf(s) + pressStrength());
    s.iceWasted = (s.iceWasted || 0) + compactPack(s, 1);

    const pack = packOf(s);
    const crushed = pack[0] * crushShare(s);
    pack[0] -= crushed;
    s.iceWasted += crushed;

    const taken = Math.min(looseSnow(s), loadDraw(s));
    const landed = taken * loadSize() / loadDraw(s);
    s.snowLoose = looseSnow(s) - taken;
    pack[0] += landed;
    s.iceWasted += taken - landed;

    if (pressureOf(s) >= 1) collapsePack(s);
    return true;
}


//    !!! UPGRADE EFFECTS !!!

export const SNOWFALL_PER_LEVEL = 0.05;        // More snow gathering on the field
export const CORNICE_PER_LEVEL = 0.3;          // A deeper drift before it blows away
export const SHELTER_PER_LEVEL = 0.15;         // Less of the drift scoured off
export const SHOVEL_PER_LEVEL = 0.25;          // More snow moved by one press
export const CREEP_PER_LEVEL = 0.1;            // Pressure bleeds off slower
export const TAMP_PER_LEVEL = 0.12;            // A press leans harder
export const EVEN_LOAD_PER_LEVEL = 0.015;      // Every window starts lower down the meter
export const ANNEAL_PER_LEVEL = 0.16;          // Less thrown away working over a window
const SPREAD_PER_LEVEL = 0.15;          // A press reaches further up the pack
export const CRUST_PER_LEVEL = 0.18;           // Less fresh snow blown off by a heavy press
export const SLAB_PER_LEVEL = 0.15;            // Less thrown off by a collapse
export const FRACTURE_PER_LEVEL = 0.15;        // Shorter settling after one
export const GRAIN_PER_LEVEL = 0.2;            // Fresh into packed
export const SINTER_STEP_PER_LEVEL = 0.22;     // Packed into dense
export const OVERBURDEN_PER_LEVEL = 0.24;      // Dense into firn
export const GLACIAL_PER_LEVEL = 0.25;         // Firn into ice
export const BEARING_PER_LEVEL = 0.2;          // Overlying snow is worth more

export const easeOpen = () => level("windScour") > 0;
const creepOpen = () => level("settlingCreep") > 0;

// Never reaches past the first window on its own, so it holds a floor to press up from
export const CREEP_LOAD = 0.35;
const CREEP_PRESSES = 0.25;
const CREEP_PRESSURE = 0.05;

const creepLoad = () => CREEP_LOAD * level("settlingCreep");
const creepPresses = () => CREEP_PRESSES * level("settlingCreep");
const creepPressure = () => CREEP_PRESSURE * level("settlingCreep");


//    !!! WHAT THE FIELD IS WORTH !!!

function stratumProduction(index, mass, scale) {
    const output = {};
    const cards = (1 + cardBonus("iceOutput")) * (1 + traitBonus("iceOutput")) * challengeMod("iceOutput")
        * (coreNodeBought("ecoFrostHeave") ? 1.3 : 1)
        * (traitHas("eternalIce") ? 1 + Math.min(0.5, 0.02 * (iceState().iceCollapses || 0)) : 1);
    for (const resourceId in STRATUM_YIELD[index]) {
        output[resourceId] = D(STRATUM_YIELD[index][resourceId]).mul(mass).mul(scale).mul(cards);
    }
    return output;
}

export const stratumUnitYield = (index, s = iceState(), world = worldState()) =>
    stratumProduction(index, 1, fieldScale(world) * loadBonus(index, s));

export function fieldProduction(s = iceState(), world = worldState()) {
    const total = {};
    if (fieldIsBare()) return total;

    const scale = fieldScale(world);
    const pack = packOf(s);
    for (let i = 0; i < pack.length; i++) {
        const output = stratumProduction(i, pack[i], scale * loadBonus(i, s));
        for (const resourceId in output) {
            total[resourceId] = D(total[resourceId] || 0).add(output[resourceId]);
        }
    }
    for (const resourceId in total) {
        total[resourceId] = total[resourceId].mul(boostResource(resourceId));
    }
    return total;
}


//    !!! WHAT THE MAP GETS OUT OF IT !!!

const FIELD_BLUE_BASE = 5e9;
const PACK_WORTH = 3000;
const PACK_FULL = 60;

// How much of the pack there is counted in units of ice, so the tiles climb as the pack is worked down
const packShare = (s = iceState()) => {
    const top = STRATUM_YIELD[TOP_LAYER].blueEssence;
    const worth = packOf(s).reduce((total, mass, index) => total + mass * STRATUM_YIELD[index].blueEssence / top, 0);
    return Math.min(1, worth / PACK_FULL);
};

function fieldOutput(world, id) {
    if (tileKind(world, id) !== FIELD) return {};
    return { blueEssence: FIELD_BLUE_BASE * (1 + PACK_WORTH * packShare(iceState())) };
}

contributeTileOutput(FIELD, fieldOutput);

// The cold needs room of its own, so finishing Long Winter pushes the map out a ring
contributeMapRadius("longWinter", () => challengeDone("longWinter") ? 1 : 0);


//    !!! THE TICK !!!

export function tickIceField(dt, s = iceState()) {
    const world = worldState();
    if (fieldIsBare()) return;

    const capacity = looseCapacity(world);
    const gathered = looseSnow(s) + (snowfallRate(world) - scourRate(s)) * dt;
    s.snowLoose = clamp(gathered, 0, capacity);

    if (isSettling(s)) s.iceSettling = Math.max(0, settlingLeft(s) - dt);

    if (creepOpen()) {
        const taken = Math.min(looseSnow(s), creepLoad() * dt);
        s.snowLoose = looseSnow(s) - taken;
        packOf(s)[0] += taken;
        s.iceWasted = (s.iceWasted || 0) + compactPack(s, creepPresses() * dt);
        if (pressureOf(s) < workFloor()) {
            s.icePressure = Math.min(workFloor(), pressureOf(s) + creepPressure() * dt);
        }
    }

    const floor = Math.min(pressureOf(s), creepFloor(s));
    s.icePressure = Math.max(floor, pressureOf(s) - creepRate(s) * dt);
}
