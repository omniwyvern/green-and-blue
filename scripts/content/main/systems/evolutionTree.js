// evolutionTree.js
//
// Evolution numbers: potential, converting adaptation points, and buying traits

import { state } from "../../../core/state.js";
import { getResource, spend } from "../../../core/resources.js";
import { boostResource } from "../../../core/boosts.js";
import { D } from "../../../utils/decimal.js";
import { PRESSURE_IDS, pressureAmount } from "./pressures.js";
import { diversityMultiplier } from "../layers/adaptationLayer.js";
import { vitalityTotal } from "../sublayers/grassSublayer.js";
import {
    TREES, evolutionState, evolutionOpen, evolutionMod, traitDef, traitEntry,
    traitCost, traitOwned, traitParents, traitsInGeneration, ownedCount, registerScale, DRIFT_PER_SECOND,
} from "./evolutionTraits.js";


//    !!! PRESSURE !!!

// Counting pressure walks every claimed tile, so it's read a few times a second at most
const FELT_SECONDS = 0.25;
const feltCache = new Map();

function rawPressure(id) {
    const now = performance.now() / 1000;
    const hit = feltCache.get(id);
    if (hit && now - hit.at < FELT_SECONDS) return hit.value;
    const value = pressureAmount(id);
    feltCache.set(id, { at: now, value });
    return value;
}

registerScale("pressure", rawPressure);

export const feltPressure = (id) => {
    const pressure = rawPressure(id);
    return pressure > 0 ? pressure + evolutionMod("pressure") : 0;
};


//    !!! POTENTIAL AND OVERFLOW !!!

// One pool per pressure, small enough to stay plain numbers
const BASE_CAPACITY = 100;
const CAPACITY_PER_GENERATION = 2;

const unlimited = () => !!state.settings.enableUnlimitedPotential;   // Dev tool

export const potentialOf = (id, s = evolutionState()) =>
    unlimited() ? capacityOf(id, s) : Number((s.potential || {})[id]) || 0;

// Doubles for each generation past the first that the pressure's own tree has opened
export const capacityOf = (id, s = evolutionState()) =>
    (BASE_CAPACITY + evolutionMod("capacity", s) + evolutionMod(`${id}Capacity`, s)) * (1 + evolutionMod("capacityMult", s))
        * Math.pow(CAPACITY_PER_GENERATION, generationsOpen(id, s) - 1);

const roomIn = (id, s) => Math.max(0, capacityOf(id, s) - potentialOf(id, s));

export const overflowing = (s = evolutionState()) => evolutionMod("overflow", s) > 0;

// The meters sit in a ring, and a full one spills into the two beside it
const neighbors = (id) => {
    const at = PRESSURE_IDS.indexOf(id);
    const count = PRESSURE_IDS.length;
    return [PRESSURE_IDS[(at + count - 1) % count], PRESSURE_IDS[(at + 1) % count]];
};

const spillShare = (s) => Math.min(1, evolutionMod("overflow", s));

const spillTargets = (id, s) => overflowing(s) ? neighbors(id).filter(other => other !== id && feltPressure(other) > 0) : [];

// Fills one meter and splits any overflow between its neighbors; returns what was used
function pourInto(id, amount, s) {
    if (!s.potential) s.potential = {};
    const own = Math.min(amount, roomIn(id, s));
    s.potential[id] = potentialOf(id, s) + own;
    let left = amount - own;
    const share = spillShare(s);
    const targets = spillTargets(id, s).sort((a, b) => roomIn(a, s) - roomIn(b, s));
    targets.forEach((target, index) => {
        const added = Math.min(left / (targets.length - index) * share, roomIn(target, s));
        if (added <= 0) return;
        s.potential[target] = potentialOf(target, s) + added;
        left -= added / share;
    });
    return amount - left;
}

// With overflow, a full meter still has somewhere to pour, though most of it is lost on the way
const pourRoom = (id, s) => roomIn(id, s) + spillTargets(id, s)
    .reduce((total, other) => total + roomIn(other, s), 0) / Math.max(1e-9, spillShare(s));

// Moves up to amount out of a meter and returns what was actually there
function takePotential(id, amount, s) {
    if (unlimited()) return Math.max(0, amount);
    const taken = Math.min(potentialOf(id, s), Math.max(0, amount));
    if (!s.potential) s.potential = {};
    s.potential[id] = potentialOf(id, s) - taken;
    return taken;
}


//    !!! CONVERTING POINTS INTO POTENTIAL !!!

// 25 adaptation points per potential at baseline, scaled by pressure; 0 with no pressure
export const BASE_RATE = 0.04;
const MOD_CAP = 6;
const MOD_HALF = 12;

export const conversionMod = (id) => {
    const pressure = feltPressure(id);
    if (pressure <= 0) return 0;
    return MOD_CAP * (pressure / (pressure + MOD_HALF)) * (1 + evolutionMod("conversion"));
};

// Holding a button speeds up the longer it's held, capped at a ceiling
const ramp = (base, power, ceiling) => (heldSeconds) => Math.min(ceiling, base * Math.pow(1 + heldSeconds, power));

const holdRamp = ramp(25, 3.2, 50000);  // Adaptation points per second into a meter
const drainRamp = ramp(12, 2.8, 4000);  // Potential per second out of each meter into a trait
const holdRate = (heldSeconds) => holdRamp(heldSeconds) * (1 + evolutionMod("haste"));
const drainRate = (heldSeconds) => drainRamp(heldSeconds) * (1 + evolutionMod("haste"));

// Spends adaptation points on one pressure's potential, limited by hold speed, points held and meter room
export function convertPressure(id, seconds, heldSeconds) {
    const rate = BASE_RATE * conversionMod(id);
    if (rate <= 0) return 0;

    const s = evolutionState();
    const room = pourRoom(id, s);
    if (room <= 0) return 0;

    const wanted = D(holdRate(heldSeconds) * seconds).min(getResource("adaptationPoints")).min(room / rate);
    if (wanted.lte(0) || !spend({ adaptationPoints: wanted })) return 0;

    return pourInto(id, wanted.toNumber() * rate, s);
}

// What drift grows with; 1 until it's decided
const driftScale = () => 1;

// Drift: each felt meter takes a flat amount of adaptation points per second, if there are any
export function driftPotential(seconds) {
    const s = evolutionState();
    const drift = evolutionMod("drift", s);
    if (drift <= 0 || unlimited()) return;
    if (!s.potential) s.potential = {};
    for (const id of PRESSURE_IDS) {
        const rate = BASE_RATE * conversionMod(id);
        if (rate <= 0) continue;
        const wanted = Math.min(DRIFT_PER_SECOND * driftScale() * drift * seconds, roomIn(id, s) / rate);
        if (wanted <= 0 || getResource("adaptationPoints").lt(wanted) || !spend({ adaptationPoints: D(wanted) })) continue;
        s.potential[id] = potentialOf(id, s) + wanted * rate;
    }
}


//    !!! PASSIVE POINTS !!!

// Passive adaptation points, driven by the same things that pay out on a reset
const PASSIVE_BASE = 0.02;
const VITALITY_FLOOR = 2;      // log10, so nothing until 100 vitality
const VITALITY_POWER = 0.5;
const DIVERSITY_POWER = 1.5;
const PER_NODE = 0.05;

export function passiveAdaptationRate() {
    if (!evolutionOpen()) return D(0);

    const reach = vitalityTotal().add(1).log10().sub(VITALITY_FLOOR).max(0);
    if (reach.lte(0)) return D(0);

    return D(PASSIVE_BASE)
        .mul(reach.pow(VITALITY_POWER))
        .mul(Math.pow(diversityMultiplier(), DIVERSITY_POWER))
        .mul(1 + PER_NODE * ownedCount())
        .mul(1 + evolutionMod("passive"))
        .mul(boostResource("adaptationPoints"));
}


//    !!! GENERATIONS !!!

// Generations are counted per tree, so every pressure climbs on its own
const ownedInGeneration = (treeId, index, s) =>
    traitsInGeneration(treeId, index).filter(id => traitOwned(id, s)).length;

export const generationNeeds = (treeId, index, s = evolutionState()) =>
    index === 0 ? 0 : Math.max(1, TREES[treeId].generations[index].needs - evolutionMod("lineage", s));

export function generationOpen(treeId, index, s = evolutionState()) {
    if (index === 0) return true;
    return ownedInGeneration(treeId, index - 1, s) >= generationNeeds(treeId, index, s);
}

export const generationShort = (treeId, index, s = evolutionState()) =>
    Math.max(0, generationNeeds(treeId, index, s) - ownedInGeneration(treeId, index - 1, s));

export const generationsOpen = (treeId, s = evolutionState()) =>
    TREES[treeId].generations.filter((_, index) => generationOpen(treeId, index, s)).length;

export const missingParents = (id, s = evolutionState()) =>
    traitParents(id).filter(parentId => !traitOwned(parentId, s));

export const nodeVisible = (id, s = evolutionState()) => {
    const entry = traitEntry(id);
    return generationOpen(entry.tree, entry.generation, s);
};

// Unowned and either its generation or a parent isn't there yet
export const nodeLocked = (id, s = evolutionState()) =>
    !traitOwned(id, s) && (!nodeVisible(id, s) || missingParents(id, s).length > 0);


//    !!! WHAT A TRAIT STILL COSTS !!!

const paidOn = (id, pressureId, s) => Number(((s.paid || {})[id] || {})[pressureId]) || 0;

export const leftOn = (id, pressureId, s = evolutionState()) =>
    Math.max(0, (traitCost(id, s)[pressureId] || 0) - paidOn(id, pressureId, s));

const sumOf = (values) => values.reduce((total, value) => total + value, 0);

const nodeRemaining = (id, s) => sumOf(Object.keys(traitCost(id)).map(pressureId => leftOn(id, pressureId, s)));

export const nodeProgress = (id, s = evolutionState()) =>
    traitOwned(id, s) ? 1 : 1 - nodeRemaining(id, s) / sumOf(Object.values(traitCost(id)));

export const nodeStalled = (id, s = evolutionState()) =>
    Object.keys(traitCost(id)).every(pressureId => leftOn(id, pressureId, s) > 0 && potentialOf(pressureId, s) <= 0);

// Drains each meter the trait asks for at the hold's speed; true on the step that finishes it
export function drainIntoNode(id, seconds, heldSeconds) {
    const s = evolutionState();
    if (!traitDef(id) || nodeLocked(id, s) || traitOwned(id, s)) return false;

    const budget = drainRate(heldSeconds) * seconds;
    if (!s.paid) s.paid = {};
    if (!s.paid[id]) s.paid[id] = {};

    for (const pressureId in traitCost(id)) {
        const left = leftOn(id, pressureId, s);
        if (left <= 0) continue;
        const taken = takePotential(pressureId, Math.min(left, budget), s);
        if (taken > 0) s.paid[id][pressureId] = paidOn(id, pressureId, s) + taken;
    }

    if (nodeRemaining(id, s) > 0) return false;
    const refund = Math.min(1, evolutionMod("refund", s));
    const cost = traitCost(id, s);
    if (!s.owned) s.owned = {};
    s.owned[id] = true;
    delete s.paid[id];
    if (refund > 0 && !unlimited()) {
        for (const pressureId in cost) {
            s.potential[pressureId] = Math.min(capacityOf(pressureId, s), potentialOf(pressureId, s) + cost[pressureId] * refund);
        }
    }
    return true;
}
