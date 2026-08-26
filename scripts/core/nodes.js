// nodes.js
//
// This is for draggable canvas nodes.

import { canAfford } from "./resources.js";

// Some nodes are fed by two branches at once, so `parents` takes an array
export function parentsOf(def) {
    if (def.parents) return def.parents;
    return def.parent ? [def.parent] : [];
}

export function nodeOwned(layer, nodeId, layerState) {
    const def = layer.nodes[nodeId];
    return !!def && (def.kind === "core" || !!layerState.purchasedUpgrades[nodeId]);
}

// Reachable once all its prerequisites are met, unless content overrides with prereq()
export function prereqMet(layer, def, layerState) {
    if (def.prereq) return def.prereq(layerState);
    return parentsOf(def).every(parentId => nodeOwned(layer, parentId, layerState));
}

// Nodes show up once their parents are bought
export function nodeVisible(layer, nodeId, layerState) {
    const def = layer.nodes[nodeId];
    if (!def) return false;
    if (layerState.purchasedUpgrades[nodeId]) return true; // never hide something already bought
    if (def.hidden && def.hidden(layerState)) return false;
    const parents = parentsOf(def);
    if (!parents.length) return true; // the cores themselves
    return parents.some(parentId => nodeOwned(layer, parentId, layerState));
}

// Checks if the node is on screen, reachable, not already bought, and affordable
export function nodeBuyable(layer, nodeId, layerState) {
    const def = layer.nodes[nodeId];
    if (!def || !def.cost) return false;
    if (layerState.purchasedUpgrades[nodeId]) return false;
    if (!nodeVisible(layer, nodeId, layerState)) return false;
    if (!prereqMet(layer, def, layerState)) return false;
    return canAfford(layer, def.cost(layerState));
}
