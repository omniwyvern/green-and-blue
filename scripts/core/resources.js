// resources.js
//
// Reading, spending and tracking pools; costs are {resourceId: Decimal} maps

import { state, getLayerState } from "./state.js";
import { resourceDef, resourceDefs } from "./registry.js";
import { D } from "../utils/decimal.js";
import { formatNumber } from "../utils/format.js";


//    !!! THE POOLS !!!

// However many layers show a resource, its pool is stored on exactly one
export const resourceHolderId = (resourceId) => resourceDef(resourceId).holder;

export const resourceHolder = (resourceId) => getLayerState(resourceHolderId(resourceId));

export function getResource(resourceId) {
    return D(resourceHolder(resourceId).resources[resourceId] || 0);
}


export function addResource(resourceId, amount) {
    const holder = resourceHolder(resourceId);
    holder.resources[resourceId] = D(holder.resources[resourceId] || 0).add(amount);
}

export function setResource(resourceId, value) {
    const holder = resourceHolder(resourceId);
    holder.resources[resourceId] = D(value);
}


//    !!! SPENDING !!!

export function canAfford(cost) {
    for (const resourceId in cost) {
        if (getResource(resourceId).lt(cost[resourceId])) return false;
    }
    return true;
}

const spendListeners = [];
export const onSpend = (listener) => spendListeners.push(listener);

// All or nothing, so a spend can't half-apply
export function spend(cost) {
    if (!canAfford(cost)) return false;
    for (const resourceId in cost) {
        const holderId = resourceHolderId(resourceId);
        const holder = getLayerState(holderId);
        holder.resources[resourceId] = D(holder.resources[resourceId]).sub(cost[resourceId]);
        noteSpend(holderId, resourceId, cost[resourceId]);
        for (const listener of spendListeners) listener(resourceId, cost[resourceId], holderId);
    }
    return true;
}


//    !!! PRODUCTION RATES !!!

// What each pool gained since the last sample
const lastSeen = {};
const spentSince = {};
const rates = {};

// Smooths out the rate so things appear less like spikes and more like rates
const SMOOTHING = 0.05;

function noteSpend(holderId, resourceId, amount) {
    const key = `${holderId}:${resourceId}`;
    spentSince[key] = D(spentSince[key] || 0).add(amount);
}

// Called once per simulation tick, after every layer did its thing
export function sampleProduction(dt) {
    if (dt <= 0) return;

    for (const layerId in state.layers) {
        const pools = state.layers[layerId].resources;
        if (!pools) continue;

        for (const resourceId in pools) {
            const key = `${layerId}:${resourceId}`;
            const now = D(pools[resourceId] || 0);
            const previous = lastSeen[key];
            lastSeen[key] = now;
            if (previous === undefined) continue;

            const produced = now.sub(previous).add(spentSince[key] || 0);
            delete spentSince[key];

            const rate = produced.div(dt);
            rates[key] = rates[key] === undefined
                ? rate
                : rates[key].mul(1 - SMOOTHING).add(rate.mul(SMOOTHING));
        }
    }
}

export function productionRate(resourceId) {
    return rates[`${resourceHolderId(resourceId)}:${resourceId}`] || D(0);
}

// A big boost leaves the smoothed rate far behind, so it is resynced to the real one
export function resyncProduction() {
    for (const key in lastSeen) delete lastSeen[key];
    for (const key in spentSince) delete spentSince[key];
    for (const key in rates) delete rates[key];
}


//    !!! COST GROUPS !!!

// Several resources spent at the same amount are read as one group
const costGroups = [];


export function registerCostGroup({ ids, name, short = null, color = null }) {
    if (!ids || ids.length < 2) throw new Error(`Cost group "${name}" needs at least two resource ids.`);
    costGroups.push({ ids, name, short: short || name, color });
}

// For rich text, so a group's name typed into a sentence gets colored like a lone resource's would
export const registeredCostGroups = () => costGroups;

// A cost split into the pieces it should be read as
export function costParts(cost) {
    const unclaimed = { ...cost };
    const parts = [];

    for (const id in cost) {
        if (!(id in unclaimed)) continue;

        const group = groupFilledBy(id, unclaimed);
        if (group) {
            parts.push({ ids: [...group.ids], label: group.name, short: group.short, color: group.color, amount: formatNumber(unclaimed[id]) });
            for (const memberId of group.ids) delete unclaimed[memberId];
            continue;
        }

        const def = resourceDefs[id];
        parts.push({ ids: [id], label: def ? def.name : id, short: def ? def.short : id,
            color: (def && def.color) || null, amount: formatNumber(unclaimed[id]) });
        delete unclaimed[id];
    }

    return parts;
}

// The first group where all members are still unclaimed and asking for the same amount
function groupFilledBy(id, unclaimed) {
    return costGroups.find(group => group.ids.includes(id) && group.ids.every(
        memberId => memberId in unclaimed && D(unclaimed[memberId]).eq(unclaimed[id]))) || null;
}

export function formatCost(cost) {
    return costParts(cost).map(part => `${part.amount} ${part.label}`).join(" + ");
}


//    !!! UPGRADE LEVELS !!!

// How many times a repeatable upgrade has been bought
export function getLevel(layerState, upgradeId) {
    return Number(layerState.purchasedUpgrades[upgradeId]) || 0;
}

// Binds a layer's state once so content doesn't look it up every call
export const levelsIn = (layerId) => (upgradeId) => getLevel(getLayerState(layerId), upgradeId);

// The (+x%) tail quoting what one more level buys, dropped once the upgrade sits at its cap
export const stepNote = (level, max, gain) => level >= max ? null : gain;
export const nextStep = (s, id, max, gain) => stepNote(getLevel(s, id), max, gain);
