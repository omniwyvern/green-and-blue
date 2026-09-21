// boosts.js
//
// Every global multiplier on a resource; producers ask boostResource()

import { D } from "../utils/decimal.js";

const sources = [];

// amount(resourceId) returns the multiplier, 1 for unaffected resources
export function registerBoost(name, amount) {
    sources.push({ name, amount });
}

// What one resource's production is multiplied by, everywhere it is produced
export function boostResource(resourceId) {
    let total = D(1);
    for (const source of sources) total = total.mul(source.amount(resourceId) ?? 1);
    return total;
}

// The same, split up to show where the numbers came from
export function boostParts(resourceId) {
    const parts = [];
    for (const source of sources) {
        const value = D(source.amount(resourceId) ?? 1);
        if (!value.eq(1)) parts.push({ name: source.name, value });
    }
    return parts;
}
