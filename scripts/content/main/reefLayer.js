// reefLayer.js
//
// THIS NEEDS TO BE IMPLEMENTED LATER, THIS IS A SKELETON

import { registerLayer } from "../../core/registry.js";

const REEF_RESOURCES = ["greenEssence", "blueEssence"];

registerLayer("reef", {
    categoryId: "main",
    group: "world",
    name: "Reef",
    color: "#37b3c6",
    order: 8,
    startUnlocked: false,

    resources: REEF_RESOURCES,

    subLayers: {
        reef: {
            name: "Reef",
            color: "#3fc0d0",
            canvasType: "static",
            order: 0,
            note: () => "Bare rock, and nothing on it yet...",
            upgrades: {},
        },
        coralReef: {
            name: "Coral Reef",
            color: "#e0736f",
            canvasType: "drag",
            order: 1,
            overlay: () => "Nothing has taken to the rock yet...",
            subWindows: {},
            nodes: {},
        },
    },
});
