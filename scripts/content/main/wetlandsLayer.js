// wetlandsLayer.js
//
// THIS NEEDS TO BE IMPLEMENTED LATER, THIS IS A SKELETON

import { registerLayer } from "../../core/registry.js";

const WETLANDS_RESOURCES = ["greenEssence", "blueEssence"];

registerLayer("wetlands", {
    categoryId: "main",
    group: "world",
    name: "Wetlands",
    color: "#6f9e63",
    order: 6,
    startUnlocked: false,

    resources: WETLANDS_RESOURCES,

    subLayers: {
        marsh: {
            name: "Marsh",
            color: "#7cae6a",
            canvasType: "static",
            order: 0,
            note: () => "The ground here is only starting to give...",
            upgrades: {},
        },
        swamp: {
            name: "Swamp",
            color: "#4f7a5c",
            canvasType: "static",
            order: 1,
            note: () => "Nothing has sunk in yet...",
            upgrades: {},
        },
    },
});
