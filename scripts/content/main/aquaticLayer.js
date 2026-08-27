// aquaticLayer.js
//
// Pond is absorbed by this once it's unlocked.
// This layer holds pond and ocean, and owns the ocean's save data - the ocean is a view
// on this layer rather than a layer of its own, so its tick is run from here.

import { registerLayer } from "../../core/registry.js";
import { getLayerState } from "../../core/state.js";
import { POND_VIEW, POND_RESOURCES } from "./pondSublayer.js";
import { OCEAN_VIEW, OCEAN_INITIAL_STATE, tickOcean } from "./oceanSublayer.js";

// Fish skills are paid for out of the evolution layer's pool
const AQUATIC_RESOURCES = ["greenEssence", "blueEssence", "biomass", "evolutionPoints"];

registerLayer("aquatic", {
    categoryId: "main",
    group: "world",
    name: "Aquatic",
    color: "#3f9ad4",
    order: 5,
    startUnlocked: false,

    resources: AQUATIC_RESOURCES,
    initialState: OCEAN_INITIAL_STATE,

    // The clock keeps running whether or not the page is open.
    onTick(dt, layer) {
        tickOcean(dt, layer);
    },

    subLayers: {
        pond: { ...POND_VIEW, order: 0, stateKey: "pond", resources: POND_RESOURCES },
        ocean: { ...OCEAN_VIEW, order: 1 },
    },
});
