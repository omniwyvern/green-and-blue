// guides.js
//
// Registries for layer popups and glossary terms

import { layers, resourceDefs } from "./registry.js";
import { getLayerState, hasSeen } from "./state.js";

export const guides = {};

export function registerGuide(id, { layer, subLayer = null, title, body, order = 0, when = null }) {
    if (guides[id]) throw new Error(`Guide "${id}" is registered twice.`);
    if (!layers[layer]) {
        throw new Error(`Guide "${id}" references unknown layer "${layer}". Register the layer first.`);
    }
    if (subLayer && !(layers[layer].subLayers && layers[layer].subLayers[subLayer])) {
        throw new Error(`Guide "${id}" references unknown sub-layer "${subLayer}" of layer "${layer}".`);
    }
    guides[id] = { id, layer, subLayer, title, body, order, when };
}

// Sorted once per layer, safe since registration finishes at startup
const sortedByLayer = new Map();

const forLayer = (layerId) => {
    let sorted = sortedByLayer.get(layerId);
    if (!sorted) {
        sorted = Object.values(guides)
            .filter(guide => guide.layer === layerId)
            .sort((a, b) => a.order - b.order);
        sortedByLayer.set(layerId, sorted);
    }
    return sorted;
};

export function availableGuides(layerId) {
    if (!layers[layerId]) return [];
    const layerState = getLayerState(layerId);
    const openSubLayer = layerState.activeSubLayer; // null on a layer that has none
    return forLayer(layerId)
        .filter(guide => !guide.subLayer || guide.subLayer === openSubLayer)
        .filter(guide => !guide.when || guide.when(layerState, layerId));
}

// A list of guides, since multiple can come on one frame
export function pendingGuides(layerId) {
    return availableGuides(layerId).filter(guide => !hasSeen("guides", guide.id));
}

// Glossary terms, left out entirely until when() says the player has met them
export const terms = {};

export function registerTerm(id, { resource = null, term = null, short = null, body,
    order = 0, when = null }) {
    if (terms[id]) throw new Error(`Glossary term "${id}" is registered twice.`);
    if (resource && !resourceDefs[resource]) {
        throw new Error(`Glossary term "${id}" references unknown resource "${resource}".`
            + ` Resources are defined in content/resourceDefs.js.`);
    }
    const def = resource ? resourceDefs[resource] : null;
    const name = term || (def && def.name);
    const shorthand = short || (def && def.short);
    if (!name) throw new Error(`Glossary term "${id}" needs either a resource or a term.`);

    terms[id] = {
        id,
        resource,
        term: name,
        // A short that only repeats the name says nothing, so it's dropped
        short: shorthand && shorthand !== name ? shorthand : null,
        color: (def && def.color) || null,
        body,
        order,
        when,
    };
}

let sortedTerms = null;

export function availableTerms() {
    if (!sortedTerms) sortedTerms = Object.values(terms).sort((a, b) => a.order - b.order);
    return sortedTerms.filter(entry => !entry.when || entry.when());
}
