// guides.js
// Registry for the explanation popups that show when a layer is first opened.

import { layers } from "./registry.js";
import { getLayerState, hasSeen } from "./state.js";

export const guides = {};

/**
 * @param {string} id               
 * @param {object} def
 * @param {string} def.layer        
 * @param {string} [def.subLayer]
 * @param {string} def.title
 * @param {string} def.body
 * @param {number} [def.order]
 * @param {function} [def.when]
 */
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

// Sorted per layer once rather than filtered and sorted on every check. Registration
// finishes during startup, before anything can ask, so the memo can't miss a guide
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
