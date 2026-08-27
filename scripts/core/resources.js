// resources.js
//
// Reading, spending and rate-tracking the pools. What a resource is, and which layer holds it,
// is declared in content/resourceDefs.js.
//
// Costs are maps of {resourceId: amount} rather than a single number, so an upgrade can
// charge for more than one resource at once - which is what the "green and blue"
// upgrades need. A single-resource cost is just a one-entry map. Amounts are Decimals.

import { state, getLayerState } from "./state.js";
import { resourceDef, resourceDefs } from "./registry.js";
import { D } from "../utils/decimal.js";
import { formatNumber } from "../utils/format.js";

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

export function canAfford(cost) {
    for (const resourceId in cost) {
        if (getResource(resourceId).lt(cost[resourceId])) return false;
    }
    return true;
}

const spendListeners = [];
export const onSpend = (listener) => spendListeners.push(listener);

// Makes sure that you don't have a partial spend, it's all or nothing
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

export function productionRate(resourceId) {
    return rates[`${resourceHolderId(resourceId)}:${resourceId}`] || D(0);
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
 * @param {string} [def.short]
 * @param {string} [def.color]
 */

export function registerCostGroup({ ids, name, short = null, color = null }) {
    if (!ids || ids.length < 2) throw new Error(`Cost group "${name}" needs at least two resource ids.`);
    costGroups.push({ ids, name, short: short || name, color });
}

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

// How many times a repeatable upgrade has been bought
export function getLevel(layerState, upgradeId) {
    return Number(layerState.purchasedUpgrades[upgradeId]) || 0;
}
