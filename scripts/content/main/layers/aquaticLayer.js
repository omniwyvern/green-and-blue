// aquaticLayer.js
//
// Holds the pond and ocean, and owns and ticks the ocean's save data

import { registerLayer } from "../../../core/registry.js";
import { POND_VIEW, POND_RESOURCES } from "../sublayers/pondSublayer.js";
import { OCEAN_VIEW, OCEAN_INITIAL_STATE, tickOcean, oceanTickProgress } from "../sublayers/oceanSublayer.js";

// Fish skills are paid for out of the adaptation layer's pool
const AQUATIC_RESOURCES = ["greenEssence", "blueEssence", "biomass", "adaptationPoints"];

registerLayer("aquatic", {
    categoryId: "main",
    group: "world",
    name: "Aquatic",
    color: "#3f9ad4",
    order: 4,
    startUnlocked: false,

    resources: AQUATIC_RESOURCES,
    initialState: OCEAN_INITIAL_STATE,

    // The clock keeps running whether or not the page is open
    onTick(dt, layer) {
        tickOcean(dt, layer);
    },

    tabMeter: (s) => oceanTickProgress(s),

    subLayers: {
        pond: { ...POND_VIEW, order: 0, stateKey: "pond", resources: POND_RESOURCES },
        ocean: { ...OCEAN_VIEW, order: 1 },
    },
});
