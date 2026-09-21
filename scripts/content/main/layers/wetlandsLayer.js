// wetlandsLayer.js
//
// Holds the marsh and its save data

import { registerLayer } from "../../../core/registry.js";
import { getLayerState } from "../../../core/state.js";
import { addResource } from "../../../core/resources.js";
import { MARSH_VIEW } from "../sublayers/marshSublayer.js";
import { biomeOpen } from "../sublayers/ecosystemSublayer.js";
import { tickMarsh, marshProduction } from "../systems/marsh.js";

const WETLANDS_RESOURCES = ["greenEssence", "blueEssence", "biomass", "vitality"];

registerLayer("wetlands", {
    categoryId: "main",
    group: "world",
    name: "Wetlands",
    color: "#6f9e63",
    order: 6,
    startUnlocked: false,

    resources: WETLANDS_RESOURCES,

    initialState: {
        marshZones: [],
        marshWater: 0,
    },

    onTick(dt, layer) {
        const s = getLayerState(layer.stateKey);
        tickMarsh(dt, s);
        const output = marshProduction(s);
        for (const resourceId in output) addResource(resourceId, output[resourceId].mul(dt));
    },

    subLayers: {
        marsh: { ...MARSH_VIEW, order: 0, hidden: () => !biomeOpen("marsh") },
    },
});
