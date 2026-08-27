// iceLayer.js
//
// THIS NEEDS TO BE IMPLEMENTED, THIS IS A SKELETON

import { registerLayer } from "../../core/registry.js";

const ICE_RESOURCES = ["greenEssence", "blueEssence"];

registerLayer("ice", {
    categoryId: "main",
    group: "world",
    name: "Ice",
    color: "#7fc4e2",
    order: 7,
    startUnlocked: false,

    resources: ICE_RESOURCES,

    subLayers: {
        iceField: {
            name: "Ice Field",
            color: "#8fd0e8",
            canvasType: "static",
            order: 0,
            note: () => "Nothing has settled here yet...",
            upgrades: {},
        },

        glacier: {
            name: "Glacier",
            color: "#6aa8cc",
            canvasType: "drag",
            order: 1,
            overlay: () => "Nothing has been carved yet...",
            subWindows: {},
            nodes: {},
        },
    },
});
