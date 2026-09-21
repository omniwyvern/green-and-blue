// woodlandLayer.js
//
// Holds the forest and its save data

import { registerLayer } from "../../../core/registry.js";
import { getLayerState } from "../../../core/state.js";
import { tickForest, waitingTrees } from "../systems/forestTrees.js";
import { FOREST_VIEW } from "../sublayers/forestSublayer.js";

const WOODLAND_RESOURCES = ["greenEssence", "blueEssence"];

registerLayer("woodland", {
    categoryId: "main",
    group: "world",
    name: "Woodland",
    color: "#3d9455",
    order: 5,
    startUnlocked: false,

    resources: WOODLAND_RESOURCES,

    initialState: {
        trees: [],
        oldGrowth: [],
        nextTreeId: 1,
        forestSelection: null,
        forestSummaryOpen: false,
        holdMature: true,
    },

    onTick(dt, layer) {
        tickForest(dt, getLayerState(layer.stateKey));
    },

    // Marks the sidebar tab whenever a tree is waiting on a growth choice
    tabMark: (s) => waitingTrees(s).length > 0 ? "!" : null,

    subLayers: {
        forest: { ...FOREST_VIEW, order: 0 },
    },
});
