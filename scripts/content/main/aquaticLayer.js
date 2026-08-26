// aquaticLayer.js
//
// Pond is absorbed by this once it's unlocked.
// This layer holds pond and ocean, and owns the ocean's save data - the ocean is a view
// on this layer rather than a layer of its own, so its tick is run from here.

import { registerLayer } from "../../core/registry.js";
import { getLayerState } from "../../core/state.js";
import { POND_VIEW, POND_RESOURCES, BIOMASS_RESOURCE } from "./pondSublayer.js";
import { OCEAN_VIEW, OCEAN_INITIAL_STATE, tickOcean } from "./oceanSublayer.js";

const AQUATIC_RESOURCES = {
    greenEssence: { name: "Green Essence", color: "#3aa876", from: "cores" },
    blueEssence: { name: "Blue Essence", color: "#4a90d9", from: "cores" },
    biomass: { ...BIOMASS_RESOURCE, from: "pond" },
    // Fish skills are paid for out of the evolution layer's pool
    evolutionPoints: { name: "Evolution Points", color: "#b06ad0", from: "evolution" },
};

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
