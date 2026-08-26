// boosts.js
//
// One place for every multiplier that applies to a resource wherever that resource is made.
//
// Whenever there's a global boost to something, it registers it here. Everything that produces
// that resource just asks boostResource() for it, so you only need to ask in one place.
//
// This is only for boosts that follow the RESOURCE. A bonus that belongs to one mechanic -
// the core's charge, a pond card, a single region's upgrade - stays where it is, because it
// isn't about the resource, it's about that thing.

import { D } from "../utils/decimal.js";

const sources = [];

/**
 * @param {string} name       what the boost is, for readouts
 * @param {(resourceId: string) => (number|object)} amount
 *        Its multiplier for that resource, and 1 for the resources it doesn't touch.
 */
export function registerBoost(name, amount) {
    sources.push({ name, amount });
}

// What one resource's production is multiplied by, everywhere it is produced
export function boostResource(resourceId) {
    let total = D(1);
    for (const source of sources) total = total.mul(source.amount(resourceId) ?? 1);
    return total;
}

// The same, split up, for anything that wants to say where the number came from. Sources
// sitting at 1 are left out, since they have nothing to say.
export function boostParts(resourceId) {
    const parts = [];
    for (const source of sources) {
        const value = D(source.amount(resourceId) ?? 1);
        if (!value.eq(1)) parts.push({ name: source.name, value });
    }
    return parts;
}
