// aquaticLayer.js
//
// STILL NEEDS TO BE IMPLEMENTED, THIS IS JUST A SKELETON
// Pond is absorbed by this once it's unlocked. 
// This layer holds pond and ocean.


import { registerLayer } from "../../core/registry.js";
import { POND_VIEW, POND_RESOURCES, BIOMASS_RESOURCE } from "./pondSublayer.js";
import { OCEAN_VIEW } from "./oceanSublayer.js";

const AQUATIC_RESOURCES = {
    greenEssence: { name: "Green Essence", color: "#3aa876", from: "cores" },
    blueEssence: { name: "Blue Essence", color: "#4a90d9", from: "cores" },
    biomass: { ...BIOMASS_RESOURCE, from: "pond" },
};

registerLayer("aquatic", {
    categoryId: "main",
    group: "world",
    name: "Aquatic",
    color: "#3f9ad4",
    order: 5,
    startUnlocked: false,

    resources: AQUATIC_RESOURCES,

    subLayers: {
        pond: { ...POND_VIEW, order: 0, stateKey: "pond", resources: POND_RESOURCES },
        ocean: { ...OCEAN_VIEW, order: 1 },
    },
});
