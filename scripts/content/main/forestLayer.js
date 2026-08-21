// forestLayer.js
//
// NEEDS TO BE IMPLEMENTED, THIS IS A SKELETON


import { registerLayer } from "../../core/registry.js";

const FOREST_RESOURCES = {
    greenEssence: { name: "Green Essence", color: "#3aa876", from: "cores" },
    blueEssence: { name: "Blue Essence", color: "#4a90d9", from: "cores" },
};

registerLayer("forest", {
    categoryId: "main",
    group: "world",
    name: "Forest",
    color: "#3d9455",
    canvasType: "static",
    order: 4,
    startUnlocked: false,

    resources: FOREST_RESOURCES,

    note: () => "Nothing grows here yet...",

    upgrades: {},
});
