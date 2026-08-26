// resources.js
//
// Costs are maps of {resourceId: amount} rather than a single number, so an upgrade can
// charge for more than one resource at once - which is what the "green and blue"
// upgrades need. A single-resource cost is just a one-entry map. Amounts are Decimals.

import { state, getLayerState } from "./state.js";
import { D } from "../utils/decimal.js";
import { formatNumber } from "../utils/format.js";

// Resources can be shared between layers, but they all have one layer they belong to
export function resourceHolderId(layer, resourceId) {
    const def = layer.resources ? layer.resources[resourceId] : null;
    return def && def.from ? def.from : layer.stateKey;
}

export function resourceHolder(layer, resourceId) {
    return getLayerState(resourceHolderId(layer, resourceId));
}

export function getResource(layer, resourceId) {
    return D(resourceHolder(layer, resourceId).resources[resourceId] || 0);
}


export function addResource(layer, resourceId, amount) {
    const holder = resourceHolder(layer, resourceId);
    holder.resources[resourceId] = D(holder.resources[resourceId] || 0).add(amount);
}

export function setResource(layer, resourceId, value) {
    const holder = resourceHolder(layer, resourceId);
    holder.resources[resourceId] = D(value);
}

export function canAfford(layer, cost) {
    for (const resourceId in cost) {
        if (getResource(layer, resourceId).lt(cost[resourceId])) return false;
    }
    return true;
}

const spendListeners = [];
export const onSpend = (listener) => spendListeners.push(listener);

// Makes sure that you don't have a partial spend, it's all or nothing
export function spend(layer, cost) {
    if (!canAfford(layer, cost)) return false;
    for (const resourceId in cost) {
        const holderId = resourceHolderId(layer, resourceId);
        const holder = getLayerState(holderId);
        holder.resources[resourceId] = D(holder.resources[resourceId]).sub(cost[resourceId]);
        noteSpend(holderId, resourceId, cost[resourceId]);
        for (const listener of spendListeners) listener(resourceId, cost[resourceId], holderId);
    }
    return true;
}


// For tracking resource generation
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

export function productionRate(layer, resourceId) {
    return rates[`${resourceHolderId(layer, resourceId)}:${resourceId}`] || D(0);
}

// Big boosts make the production rate look reaaally off, so this makes them the actual rate
export function resyncProduction() {
    for (const key in lastSeen) delete lastSeen[key];
    for (const key in spentSince) delete spentSince[key];
    for (const key in rates) delete rates[key];
}

// When multiple currencies are used at the same time same amount, this makes it shorten the display of it
const costGroups = [];

/**
 * @param {object} def
 * @param {string[]} def.ids    
 *                              
 * @param {string} def.name     
 * @param {string} [def.color]  
 */

export function registerCostGroup({ ids, name, color = null }) {
    if (!ids || ids.length < 2) throw new Error(`Cost group "${name}" needs at least two resource ids.`);
    costGroups.push({ ids, name, color });
}

// A cost split into the pieces it should be read as
export function costParts(cost, resourceDefs = {}) {
    const unclaimed = { ...cost };
    const parts = [];

    for (const id in cost) {
        if (!(id in unclaimed)) continue;

        const group = groupFilledBy(id, unclaimed);
        if (group) {
            parts.push({ ids: [...group.ids], label: group.name, color: group.color, amount: formatNumber(unclaimed[id]) });
            for (const memberId of group.ids) delete unclaimed[memberId];
            continue;
        }

        const def = resourceDefs[id];
        parts.push({ ids: [id], label: def ? def.name : id, color: (def && def.color) || null, amount: formatNumber(unclaimed[id]) });
        delete unclaimed[id];
    }

    return parts;
}

// The first group where all members are still unclaimed and asking for the same amount
function groupFilledBy(id, unclaimed) {
    return costGroups.find(group => group.ids.includes(id) && group.ids.every(
        memberId => memberId in unclaimed && D(unclaimed[memberId]).eq(unclaimed[id]))) || null;
}

export function formatCost(cost, resourceDefs = {}) {
    return costParts(cost, resourceDefs).map(part => `${part.amount} ${part.label}`).join(" + ");
}

// How many times a repeatable upgrade has been bought
export function getLevel(layerState, upgradeId) {
    return Number(layerState.purchasedUpgrades[upgradeId]) || 0;
}
