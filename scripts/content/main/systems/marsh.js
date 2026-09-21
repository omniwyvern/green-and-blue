// marsh.js
//
// Zones cycle dry/saturated/flooded/receding and drift together; plants follow average wetness


import { getLayerState } from "../../../core/state.js";
import { levelsIn } from "../../../core/resources.js";
import { boostResource } from "../../../core/boosts.js";
import { D } from "../../../utils/decimal.js";
import {
    worldState, countOf, tileKind, adjacentOfKind, fallingKind,
    contributeTileOutput, contributeNeighborBoost, soften,
} from "./worldMap.js";
import { clamp, clamp01 } from "../../../utils/math.js";
import { cardBonus, cardActive } from "./cards.js";
import { traitBonus, traitHas, pastCapGain } from "./evolutionTraits.js";
import { challengeMod } from "./challenges.js";
import { coreNodeBought } from "../../../core/nodes.js";

export const marshState = () => getLayerState("wetlands");
const level = levelsIn("wetlands");


//    !!! HOW MUCH MARSH THERE IS !!!

// Only the marsh itself. Swamp and mangrove are their own thing and will bring their own basin
const MARSH = "marsh";

export const marshTiles = (s = worldState()) => countOf(MARSH, s);

export const marshIsBare = () => marshTiles() === 0;

// How many zones there are based on the world's marsh tiles
const ZONE_STEPS = [1, 2, 4, 7];
export const MOST_ZONES = ZONE_STEPS.length;

export function zoneCount(world = worldState()) {
    const tiles = marshTiles(world);
    let count = 0;
    for (const at of ZONE_STEPS) if (tiles >= at) count++;
    return count;
}

// A marsh is worth the square of how many tiles it runs
const SCALE_POWER = 2;

export const marshScale = (world = worldState()) =>
    Math.pow(Math.max(1, marshTiles(world)), SCALE_POWER);

// Penalty for when you only have one zone
const SINGLE_ZONE_PENALTY = 0.25;

export const marshTooSmall = (world = worldState()) =>
    marshTiles(world) > 0 && zoneCount(world) < 2;

export const sizePenalty = (world = worldState()) => marshTooSmall(world) ? SINGLE_ZONE_PENALTY : 1;

// What the next zone is waiting on, for the readout under the basin
export function nextZoneAt(world = worldState()) {
    const count = zoneCount(world);
    return count >= MOST_ZONES ? null : ZONE_STEPS[count];
}


//    !!! THE CYCLE !!!

export const DRY = "dry", SATURATED = "saturated", FLOODED = "flooded", RECEDING = "receding";

// In the order they come around in, which is the order they're listed in wherever all four show
export const STAGE_ORDER = [DRY, SATURATED, FLOODED, RECEDING];

export const STAGES = {
    [DRY]: {
        name: "Dry",
        color: "#c0a55f",
        blurb: "Dry, cracked mud. Pays Vitality.",
    },
    [SATURATED]: {
        name: "Saturated",
        color: "#6fae7a",
        blurb: "Filling up. Pays Biomass.",
    },
    [FLOODED]: {
        name: "Flooded",
        color: "#3f8fc4",
        blurb: "Underwater. Silt settles, and it pays Blue Essence.",
    },
    [RECEDING]: {
        name: "Receding",
        color: "#8fc46a",
        blurb: "Draining. Pays Green Essence, but washes silt away.",
    },
};

// Where the bands sit on a zone's 0-1 water level
const DRY_UPTO = 0.3;
const FLOOD_FROM = 0.75;

export function stageOf(zone) {
    if (zone.water >= FLOOD_FROM) return FLOODED;
    if (zone.water <= DRY_UPTO) return DRY;
    return zone.rising ? SATURATED : RECEDING;
}

export const stageName = (zone) => STAGES[stageOf(zone)].name;

// How far through its current band the zone is, for the bar under each zone
export function stageProgress(zone) {
    const stage = stageOf(zone);
    if (stage === FLOODED) return zone.rising
        ? (zone.water - FLOOD_FROM) / (2 * (1 - FLOOD_FROM))
        : 0.5 + (1 - zone.water) / (2 * (1 - FLOOD_FROM));
    if (stage === DRY) return zone.rising
        ? 0.5 + zone.water / (2 * DRY_UPTO)
        : (DRY_UPTO - zone.water) / (2 * DRY_UPTO);
    const through = (zone.water - DRY_UPTO) / (FLOOD_FROM - DRY_UPTO);
    return zone.rising ? through : 1 - through;
}


//    !!! THE ZONES THEMSELVES !!!

// Each zone handles water differently
export const ZONE_KINDS = [
    {
        id: "shallows", name: "Shallows",
        fill: 1.9, drain: 1.05,
        blurb: "Barely a dip in the ground, so it floods very quickly.",
    },
    {
        id: "basin", name: "Deep Basin",
        fill: 0.8, drain: 0.4,
        blurb: "Low ground. Slow to fill, slower to drain.",
    },
    {
        id: "bank", name: "Sand Bank",
        fill: 0.95, drain: 2.2,
        blurb: "Coarse ground that drains almost as fast as it fills.",
    },
    {
        id: "flat", name: "Open Flat",
        fill: 1.15, drain: 1.15,
        blurb: "Level ground. Fills and drains at the same pace.",
    },
];

export const zoneKind = (zone) => ZONE_KINDS[zone.kind] || ZONE_KINDS[0];


//    !!! WHAT GROWS IN THEM !!!

// wants = wetness band, needs = sediment, hold = silt kept, slow = how much it slows water
export const PLANTS = [
    {
        id: "bare", name: "Bare Mud", color: "#8f8158", look: "none", rank: 0,
        wants: [0, 1], output: 0, biomass: 0, needs: 0, hold: 0, slow: 0,
        blurb: "Mud, and whatever the last flood left on it.",
    },
    {
        id: "pioneer", name: "Pioneer Growth", color: "#9fbb63", look: "wisp", rank: 1,
        wants: [0, 1], output: 1, biomass: 1, needs: 0, hold: 0.15, slow: 0.05,
        blurb: "First to grow on bare ground, and quick to die.",
    },
    {
        id: "meadow", name: "Wet Meadow", color: "#a9c268", look: "sward", rank: 2,
        wants: [0, 0.42], output: 6, biomass: 6, needs: 0.18, hold: 0.45, slow: 0.12,
        blurb: "Fine grasses that drown in too much water.",
    },
    {
        id: "sedge", name: "Sedge Beds", color: "#79ad5c", look: "tuft", rank: 2,
        wants: [0.28, 0.7], output: 7, biomass: 5.5, needs: 0.22, hold: 0.5, slow: 0.24,
        blurb: "Likes wet ground with a changing water level.",
    },
    {
        id: "reed", name: "Reed Beds", color: "#5f9e63", look: "reed", rank: 2,
        wants: [0.56, 1], output: 5.5, biomass: 5, needs: 0.22, hold: 0.55, slow: 0.4,
        blurb: "Built for standing water, and thick enough to hold onto sediment."
        + " These give a chance for other plants to grow.",
    },
    {
        id: "tussock", name: "Tussock Fen", color: "#6fae5a", look: "tussock", rank: 3,
        wants: [0.12, 0.5], output: 45, biomass: 40, needs: 0.5, hold: 0.7, slow: 0.26,
        blurb: "Grows on silt. Needs a zone that gets fully dry.",
    },
    {
        id: "cattail", name: "Cattail Marsh", color: "#4f9a70", look: "cattail", rank: 3,
        wants: [0.5, 1], output: 40, biomass: 50, needs: 0.5, hold: 0.68, slow: 0.42,
        blurb: "Gives the most Biomass, as long as it stays wet.",
    },
    {
        id: "carr", name: "Fen Carr", color: "#3d8f63", look: "carr", rank: 4,
        wants: [0.22, 0.66], output: 300, biomass: 360, needs: 0.78, hold: 0.85, slow: 0.34,
        blurb: "Willow and alder on deep peat. Needs the water to keep changing.",
    },
];

export const TOP_RANK = PLANTS.reduce((best, plant) => Math.max(best, plant.rank), 0);
export const plantOf = (zone) => PLANTS[zone.plant] || PLANTS[0];

// How wet a zone has been over a bit of time
const WETNESS_MEMORY = 0.005;

// Keeps plants from changing in one cycle
const STAGE_MEMORY = 0.004;

export const blankShares = () => ({ dry: 0.25, saturated: 0.25, flooded: 0.25, receding: 0.25 });

// The stage the zone is in most of the time, determines what is growing
export function heldStage(zone) {
    const shares = zone.stages || blankShares();
    return STAGE_ORDER.reduce((best, stage) =>
        (shares[stage] || 0) > (shares[best] || 0) ? stage : best, DRY);
}

// Flood tolerance is what lets a community sit further into standing water than it would
export const wetBand = (plant) => [plant.wants[0], Math.min(1, plant.wants[1] + floodTolerance())];

export function suitsZone(plant, zone) {
    const [low, high] = wetBand(plant);
    return zone.wetness >= low && zone.wetness <= high;
}

// Everything that would take this zone as it is being kept, and has the silt it asks for
const availableTo = (zone) =>
    PLANTS.filter(plant => suitsZone(plant, zone) && zone.sediment >= plant.needs);

// The step up from here, which is the lowest-ranked thing above the current community
export function nextPlant(zone) {
    const rank = plantOf(zone).rank;
    return availableTo(zone)
        .filter(plant => plant.rank > rank)
        .reduce((best, plant) => best === null || plant.rank < best.rank ? plant : best, null);
}

// What it falls back to when the conditions turn against it
export function fallbackPlant(zone) {
    const rank = plantOf(zone).rank;
    return availableTo(zone)
        .filter(plant => plant.rank < rank)
        .reduce((best, plant) => best === null || plant.rank > best.rank ? plant : best, PLANTS[0]);
}

export const plantIndex = (plant) => PLANTS.indexOf(plant);


//    !!! UPGRADE EFFECTS !!!

// Named here since the model and descriptions both read them, so each upgrade's text matches its next level
export const TEMPO_PER_LEVEL = 0.12;       // Both halves of the cycle run quicker
export const TOLERANCE_PER_LEVEL = 0.06;   // Standing growth holds in wetter ground
export const SILT_PER_LEVEL = 0.15;        // Less sediment washed back out
export const ALLUVIUM_PER_LEVEL = 0.2;     // More sediment settling out of standing water
export const PEAT_PER_LEVEL = 0.15;        // Plants read a longer average
export const HARDY_PER_LEVEL = 0.15;       // Slower dieback outside the band
export const MOSAIC_PER_LEVEL = 0.3;     // More out of a varied marsh
export const KEYSTONE_PER_LEVEL = 0.5;     // More for every separate community held
export const LEVEE_PER_LEVEL = 0.1;        // Less seep between zones
export const CATCHMENT_PER_LEVEL = 0.05;   // Bigger water store
export const SEEPAGE_PER_LEVEL = 0.25;     // Faster refill

export const tempo = () => (1 + TEMPO_PER_LEVEL * level("tempo")) * (1 + cardBonus("marshTempo")) * (1 + traitBonus("marshTempo"));
export const floodTolerance = () => Math.min(0.3, TOLERANCE_PER_LEVEL * level("floodTolerance"));
export const siltHold = () => Math.min(0.85, SILT_PER_LEVEL * level("siltTraps"));
export const alluvium = () => 1 + ALLUVIUM_PER_LEVEL * level("alluvium");
export const memoryStretch = () => 1 + PEAT_PER_LEVEL * level("peatMemory");
export const dieback = () => Math.max(0.2, 1 - HARDY_PER_LEVEL * level("hardyStands"));
export const sluicesOpen = () => level("sluiceGates") > 0;
export const floodPrecise = () => level("floodPrecision") > 0;
export const drawdownOpen = () => level("drawdown") > 0;

// Share of a zone a full flood fills, in one place for anything that extends floods
export const PART_SHARE = 0.25;


//    !!! WATER LEVELS !!!

const RISE_BASE = 1 / 135;
const FALL_BASE = 1 / 175;

// How much zones pull toward average level of the marsh (how quick the zones synchronize)
const SEEP_BASE = 0.014;

export const seepRate = () =>
    SEEP_BASE * Math.max(0, 1 - LEVEE_PER_LEVEL * level("levees")) / (1 + cardBonus("marshSeep"));

// Tempo speeds both halves equally, so a zone cycles faster without moving the level it settles around
export const riseRate = (zone) => RISE_BASE * zoneKind(zone).fill * tempo();

// Plants hold back water, some more than others
export const fallRate = (zone) =>
    FALL_BASE * zoneKind(zone).drain * (1 - plantOf(zone).slow) * tempo();


//    !!! SEDIMENT !!!

const SILT_GAIN = 1 / 150;   // Per second while a zone is under water
const SILT_LOSS = 1 / 320;   // Per second while the water is running off it

export const siltGain = (zone) =>
    SILT_GAIN * (1 + plantOf(zone).slow * 2) * alluvium() * (1 + cardBonus("marshSilt")) * (1 + traitBonus("marshSilt"));
export const siltLoss = (zone) => cardActive("settledGround") ? 0
    : SILT_LOSS * (1 - plantOf(zone).hold) * (1 - siltHold()) * (1 - traitBonus("siltHold"));


//    !!! GROWTH AND SUCCESSION !!!

// How long it takes for plants to be able to change, so that they aren't changing rapidly per cycle
const GROWTH_SECONDS = 600;

// Changes growth rate based on wetness and current plant
export function growthFactor(zone) {
    const plant = plantOf(zone);
    if (plant.rank > 0 && !suitsZone(plant, zone)) {
        if (cardActive("floatingMats")) return 0;
        const [low, high] = wetBand(plant);
        const off = zone.wetness > high ? zone.wetness - high : low - zone.wetness;
        return -(0.25 + 1.5 * off) * dieback() * (1 - traitBonus("dieback")) * (traitHas("floatingRoots") ? 0.5 : 1);
    }

    const stage = heldStage(zone);
    if (stage === DRY) return plant.rank === 0 ? 1.4 : 0.45;
    if (stage === SATURATED) return 0.9;
    if (stage === RECEDING) return 1.9;
    return 0.25;
}

// Succession only speeds growth up, never dieback
export function growthRate(zone) {
    const factor = growthFactor(zone);
    const boost = (1 + cardBonus("marshSuccession")) * (1 + traitBonus("growth") + traitBonus("marshSuccession"));
    return (factor > 0 ? factor * boost : factor) / GROWTH_SECONDS;
}

// What the zone would be growing into next if it had the silt for it
export function heldBySilt(zone) {
    if (nextPlant(zone) !== null) return null;
    const rank = plantOf(zone).rank;
    const waiting = PLANTS
        .filter(plant => plant.rank > rank && suitsZone(plant, zone) && zone.sediment < plant.needs)
        .reduce((best, plant) => best === null || plant.needs < best.needs ? plant : best, null);
    return waiting;
}


//    !!! HOW VARIED THE MARSH IS !!!

export const activeZones = (s = marshState(), world = worldState()) =>
    (s.marshZones || []).slice(0, zoneCount(world));

export const stagesHeld = (s = marshState(), world = worldState()) =>
    new Set(activeZones(s, world).map(stageOf));

// Every stage held at once multiplies the marsh again rather than adding to it
const STAGE_STEP = 2;

export const stageMultiplier = () =>
    1 + STAGE_STEP * (1 + MOSAIC_PER_LEVEL * level("mosaic"));

// Both kinds of variety pay nothing for one, and another multiple per one past that
const varietyBonus = (held, multiplier) => held <= 1 ? 1 : Math.pow(multiplier, held - 1);

export const diversityBonus = (s = marshState(), world = worldState()) =>
    varietyBonus(stagesHeld(s, world).size, stageMultiplier());

// Distinct communities standing, bare mud aside, so this is variety in what grows rather than the water
export const communitiesHeld = (s = marshState(), world = worldState()) =>
    new Set(activeZones(s, world).filter(zone => plantOf(zone).rank > 0).map(zone => zone.plant)).size;

export const communityMultiplier = () => 1 + KEYSTONE_PER_LEVEL * Math.min(8, level("keystone"));

export const keystoneBonus = (s = marshState(), world = worldState()) =>
    varietyBonus(communitiesHeld(s, world), communityMultiplier());

// A zone's vegetation averaged across the marsh, as a share of what a full one would be
const zoneAverage = (s, world, rankOf) => {
    const zones = activeZones(s, world);
    if (zones.length === 0) return 0;
    return Math.min(1, zones.reduce((total, zone) => total + rankOf(zone), 0) / (zones.length * TOP_RANK));
};

// 0 for bare mud and 1 for four mature zones
export const marshHealth = (s = marshState(), world = worldState()) =>
    zoneAverage(s, world, (zone) => plantOf(zone).rank + zone.growthShare);


//    !!! THE WATER STORE !!!

const WATER_BASE = 50;
const WATER_PER_TILE = 1.2;

const priceStore = (world = worldState()) =>
    (WATER_BASE + WATER_PER_TILE * marshTiles(world))
    * (1 + CATCHMENT_PER_LEVEL * level("catchment") / 2);

// Flooding the whole marsh costs the whole bar,
const RELEASE_SHARE = 1;
const FLOOD_SHARE = 0.75;

// Rain refills the store faster; bigger marshes just get a bigger meter
const REFILL_BASE = 0.15;
const REFILL_PER_TILE = 0.01;
const REFILL_PER_FLOODED = 0.05;

export const waterCapacity = (world = worldState()) =>
    (WATER_BASE + WATER_PER_TILE * marshTiles(world)) * (1 + CATCHMENT_PER_LEVEL * level("catchment")) * (1 + traitBonus("marshWater"));

export const storedWater = (s = marshState()) => Math.max(0, s.marshWater || 0);

export const waterFraction = (s = marshState(), world = worldState()) =>
    Math.min(1, storedWater(s) / Math.max(1, waterCapacity(world)));

const OOZE_REFILL = 3;

// Rain that fell on the marsh, plus whatever the flooded zones are holding back
export function refillRate(s = marshState(), world = worldState()) {
    const tiles = marshTiles(world);
    if (tiles === 0) return 0;
    const flooded = activeZones(s, world).filter(zone => stageOf(zone) === FLOODED).length;
    return (REFILL_BASE + REFILL_PER_TILE * tiles + REFILL_PER_FLOODED * flooded)
        * (1 + SEEPAGE_PER_LEVEL * level("seepage"))
        * (1 + cardBonus("marshRefill")) * (1 + traitBonus("marshRefill"))
        * (traitHas("stormBreeders") && fallingKind(world) ? OOZE_REFILL : 1);
}

// How much one flood lifts a zone
export const FLOOD_LIFT = 0.5;
export const RELEASE_LIFT = 0.25;

export const floodLift = (share = 1) => FLOOD_LIFT * share;

// Opening a gate always costs something, so a nearly full zone can't be topped off for nothing
const LEAST_SHARE = 0.4;

// Priced by lift, so topping off costs less than filling a dry zone, down to the floor above
const liftPrice = (full, lift, room) =>
    full * Math.max(LEAST_SHARE, Math.min(lift, Math.max(0, room)) / lift);

// A part flood costs its own share of a whole one
export const floodCost = (zone, share = 1, world = worldState()) =>
    Math.round(liftPrice(priceStore(world) * FLOOD_SHARE * share * (1 - traitBonus("floodCost")), floodLift(share), 1 - zone.water));

export function releaseCost(s = marshState(), world = worldState()) {
    const zones = activeZones(s, world);
    if (zones.length === 0) return 0;
    const each = priceStore(world) * RELEASE_SHARE / zones.length;
    return zones.reduce((total, zone) =>
        total + liftPrice(each, RELEASE_LIFT, 1 - zone.water), 0);
}

// How far a drawdown drops a zone, and the small share of water it returns
export const DRAIN_LIFT = 0.25;
const DRAIN_RETURN = 0.3;

export const drainYield = (zone, world = worldState()) =>
    Math.round(priceStore(world) * FLOOD_SHARE * DRAIN_RETURN
        * Math.min(DRAIN_LIFT, zone.water) / FLOOD_LIFT);

const lift = (zone, amount) => {
    zone.water = Math.min(1, zone.water + amount);
    zone.rising = zone.water < 1;
};

const drop = (zone, amount) => {
    zone.water = Math.max(0, zone.water - amount);
    if (zone.water <= 0) zone.rising = true;
};

// Flooding a zone manually
export function floodZone(s, index, share = 1, world = worldState()) {
    if (!sluicesOpen()) return false;
    if (share !== 1 && !floodPrecise()) return false;
    const zone = activeZones(s, world)[index];
    if (!zone || zone.water >= 1) return false;

    const cost = floodCost(zone, share, world);
    if (storedWater(s) < cost) return false;

    s.marshWater = storedWater(s) - cost;
    lift(zone, floodLift(share));
    return true;
}

// Letting a zone off by hand, which is the only way to pull one down early
export function drainZone(s, index, world = worldState()) {
    if (!drawdownOpen()) return false;
    const zone = activeZones(s, world)[index];
    if (!zone || zone.water <= 0) return false;

    s.marshWater = Math.min(waterCapacity(world), storedWater(s) + drainYield(zone, world));
    drop(zone, DRAIN_LIFT);
    return true;
}

// Flooding the whole marsh
export function releaseWater(s, world = worldState()) {
    const zones = activeZones(s, world);
    if (zones.length === 0) return false;

    const cost = Math.round(releaseCost(s, world));
    if (cost <= 0 || storedWater(s) < cost) return false;

    s.marshWater = storedWater(s) - cost;
    if (cardActive("floodPulse")) pulseZones(zones);
    else for (const zone of zones) lift(zone, RELEASE_LIFT);
    return true;
}

// Where Flood Pulse sets a zone down in each stage, as [water, rising]
const PULSE_SPOTS = {
    [DRY]: [0.15, true],
    [SATURATED]: [0.52, true],
    [FLOODED]: [0.9, false],
    [RECEDING]: [0.52, false],
};

// The first zone keeps its stage, and the rest are spaced evenly around the cycle from it
function pulseZones(zones) {
    const start = STAGE_ORDER.indexOf(stageOf(zones[0]));
    zones.forEach((zone, i) => {
        const stage = STAGE_ORDER[(start + Math.floor(i * STAGE_ORDER.length / zones.length)) % STAGE_ORDER.length];
        [zone.water, zone.rising] = PULSE_SPOTS[stage];
    });
}


//    !!! WHAT A ZONE IS WORTH !!!

// Base values before boosts; Vitality uses a root so it stays small
const DRY_VITALITY = 2;
const SATURATED_BIOMASS = 500;
const FLOODED_BLUE = 5e4;
const RECEDING_GREEN = 1.5e8;

// Keystone scales the zones' own pay rather than the tile output, so the world map doesn't run away with it
const zoneScale = (s, world) =>
    marshScale(world) * diversityBonus(s, world) * keystoneBonus(s, world) * sizePenalty(world);

function baseStageProduction(plant, stage, scale) {
    switch (stage) {
        case DRY:
            return { vitality: D(DRY_VITALITY).mul(Math.sqrt(1 + plant.output)).mul(Math.sqrt(scale)) };
        case SATURATED:
            return plant.biomass > 0
                ? { biomass: D(SATURATED_BIOMASS).mul(plant.biomass).mul(scale) }
                : {};
        case FLOODED:
            return { blueEssence: D(FLOODED_BLUE).mul(1 + 0.5 * plant.output).mul(scale) };
        default:
            return plant.output > 0
                ? { greenEssence: D(RECEDING_GREEN).mul(plant.output).mul(scale) }
                : {};
    }
}

export function stageProduction(plant, stage, scale) {
    const output = baseStageProduction(plant, stage, scale);
    const cards = (1 + cardBonus("marshOutput")) * (1 + traitBonus("marshOutput")) * challengeMod("marshOutput")
        * (coreNodeBought("ecoBogMat") ? 1.3 : 1)
        * pastCapGain("keystone", level("keystone"));
    for (const resourceId in output) output[resourceId] = output[resourceId].mul(cards);
    return output;
}

export const zoneProduction = (s, zone, world = worldState()) =>
    stageProduction(plantOf(zone), stageOf(zone), zoneScale(s, world) * zoneTraits(zone));

// Mud Builders pays for the silt a zone holds, Floating Roots for a zone with nowhere left to grow
const zoneTraits = (zone) =>
    (traitHas("mudBuilders") ? 1 + 0.5 * clamp01(zone.sediment || 0) : 1)
    * (traitHas("floatingRoots") && zone.growth >= 1 && nextPlant(zone) === null ? 1.5 : 1);

// What one community would pay in each of the four stages, for the reference to read off
export function plantYields(plant, s = marshState(), world = worldState()) {
    const scale = zoneScale(s, world);
    return STAGE_ORDER.map((stage) => [stage, stageProduction(plant, stage, scale)]);
}

// Everything the zones pay together
export function marshProduction(s = marshState(), world = worldState()) {
    const total = {};
    for (const zone of activeZones(s, world)) {
        const output = zoneProduction(s, zone, world);
        for (const resourceId in output) {
            total[resourceId] = D(total[resourceId] || 0).add(output[resourceId]);
        }
    }
    for (const resourceId in total) total[resourceId] = total[resourceId].mul(boostResource(resourceId));
    return total;
}

// The same thing for one zone, for the tooltip on it
export function zoneProductionBoosted(s, zone, world = worldState()) {
    const output = zoneProduction(s, zone, world);
    for (const resourceId in output) output[resourceId] = output[resourceId].mul(boostResource(resourceId));
    return output;
}


//    !!! WHAT THE MAP GETS OUT OF IT !!!

// What a marsh tile produces per second, increased by water level variety
const MARSH_GREEN_BASE = 1e11;

// What a fully grown marsh is worth to its own tiles over a bare one
const HEALTH_WORTH = 150;

export function marshOutput(world, id) {
    if (tileKind(world, id) !== MARSH) return {};
    const s = marshState();
    const worth = (1 + HEALTH_WORTH * marshHealth(s, world))
        * diversityBonus(s, world) * sizePenalty(world);
    return { greenEssence: MARSH_GREEN_BASE * worth };
}

contributeTileOutput(MARSH, marshOutput);

export const NEIGHBOR_PER_TILE = 1.5;
const NEIGHBOR_CEILING = 100;

export function marshNeighborShare(world = worldState()) {
    const s = marshState();
    return marshHealth(s, world) * diversityBonus(s, world) * sizePenalty(world);
}

// How much one tile is boosted by neighboring marshes
export function marshNeighborBoost(world, id) {
    if (tileKind(world, id) === MARSH) return 1;

    const touching = adjacentOfKind(world, id, MARSH);
    if (touching === 0) return 1;

    return 1 + soften(NEIGHBOR_PER_TILE * touching * marshNeighborShare(world) * (1 + traitBonus("marshNeighbor")), NEIGHBOR_CEILING);
}

contributeNeighborBoost(MARSH, marshNeighborBoost);


//    !!! THE TICK !!!

// Zones are staggered as they arrive, so a new one doesn't turn up in step with the rest
function newZone(index) {
    return {
        kind: index % ZONE_KINDS.length,
        water: Math.min(0.95, 0.12 + 0.27 * index),
        rising: index % 2 === 0,
        plant: 0,
        wetness: Math.min(0.95, 0.12 + 0.27 * index),
        growth: 0,
        growthShare: 0,
        sediment: 0,
        stages: blankShares(),
    };
}

// Razing a marsh hides a zone rather than removing everything in it
export function ensureZones(s, world = worldState()) {
    if (!Array.isArray(s.marshZones)) s.marshZones = [];
    while (s.marshZones.length < zoneCount(world)) s.marshZones.push(newZone(s.marshZones.length));
    for (const zone of s.marshZones) repairZone(zone);
}

// For save migration or marshes that messed up their ticks
function repairZone(zone) {
    if (!Number.isFinite(zone.water)) zone.water = 0;
    if (!Number.isFinite(zone.growth)) zone.growth = 0;
    if (!Number.isFinite(zone.sediment)) zone.sediment = 0;
    if (!Number.isInteger(zone.plant)) zone.plant = 0;
    zone.plant = clamp(zone.plant, 0, PLANTS.length - 1);
    if (!Number.isFinite(zone.wetness)) zone.wetness = zone.water;
    if (!zone.stages) zone.stages = blankShares();
    for (const stage of STAGE_ORDER) {
        if (!Number.isFinite(zone.stages[stage])) zone.stages[stage] = 0.25;
    }
    zone.growthShare = zone.growth > 0 ? zone.growth : 0;
}

function tickWater(s, zone, mean, dt) {
    if (zone.rising) {
        zone.water += riseRate(zone) * dt;
        if (zone.water >= 1) { zone.water = 1; zone.rising = false; }
    } else {
        zone.water -= fallRate(zone) * dt;
        if (zone.water <= 0) { zone.water = 0; zone.rising = true; }
    }

    // The seep between zones, applied after so it zone can't go right back to where it was
    zone.water += seepRate() * (mean - zone.water) * dt;
    zone.water = clamp01(zone.water);
}

function tickSediment(s, zone, dt) {
    if (stageOf(zone) === FLOODED) zone.sediment += siltGain(zone) * dt;
    else if (!zone.rising) zone.sediment -= siltLoss(zone) * dt;
    zone.sediment = clamp01(zone.sediment);
}

function tickGrowth(s, zone, dt) {
    const stretch = memoryStretch();
    zone.wetness += (zone.water - zone.wetness) * (WETNESS_MEMORY / stretch) * dt;

    const stage = stageOf(zone);
    for (const held of STAGE_ORDER) {
        zone.stages[held] += ((held === stage ? 1 : 0) - zone.stages[held]) * (STAGE_MEMORY / stretch) * dt;
    }

    zone.growth += growthRate(zone) * dt;

    if (zone.growth >= 1) {
        const next = nextPlant(zone);
        if (next === null) zone.growth = 1;
        else { zone.plant = plantIndex(next); zone.growth = 0; }
    } else if (zone.growth <= -1) {
        const back = fallbackPlant(zone);
        if (plantIndex(back) === zone.plant) zone.growth = 0;
        else { zone.plant = plantIndex(back); zone.growth = 0; }
    }

    zone.growthShare = Math.max(0, zone.growth);
}

export function tickMarsh(dt, s = marshState()) {
    const world = worldState();
    if (marshIsBare()) return;

    ensureZones(s, world);
    const zones = activeZones(s, world);
    if (zones.length === 0) return;

    const mean = zones.reduce((total, zone) => total + zone.water, 0) / zones.length;
    for (const zone of zones) {
        tickWater(s, zone, mean, dt);
        tickSediment(s, zone, dt);
        tickGrowth(s, zone, dt);
    }

    s.marshWater = Math.min(waterCapacity(world), storedWater(s) + refillRate(s, world) * dt);
}
