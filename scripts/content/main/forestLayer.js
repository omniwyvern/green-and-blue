// forestLayer.js
//
// NEEDS TO BE IMPLEMENTED, THIS IS A SKELETON


import { registerLayer } from "../../core/registry.js";

const FOREST_RESOURCES = ["greenEssence", "blueEssence"];

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
