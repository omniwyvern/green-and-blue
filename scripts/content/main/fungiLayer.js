// fungiLayer.js
//
// NEEDS TO BE IMPLEMENTED, THIS IS A SKELETON


import { registerLayer } from "../../core/registry.js";

const FUNGI_RESOURCES = ["greenEssence", "blueEssence"];

registerLayer("fungi", {
    categoryId: "main",
    group: "world",
    name: "Fungi",
    color: "#a06bc0",
    order: 9,
    startUnlocked: false,

    resources: FUNGI_RESOURCES,

    subLayers: {
        mushroomGrove: {
            name: "Mushroom Grove",
            color: "#c4544c",
            canvasType: "static",
            order: 0,
            note: () => "Nothing has fruited yet...",
            upgrades: {},
        },
        fungalForest: {
            name: "Fungal Forest",
            color: "#a06bc0",
            canvasType: "drag",
            order: 1,
            overlay: () => "Nothing has spread this far yet...",
            subWindows: {},
            nodes: {},
        },
    },
});
