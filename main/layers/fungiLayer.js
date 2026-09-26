// fungiLayer.js
//
// Holds the mushroom grove and its save data

import { registerLayer } from "../../../core/registry.js";
import { getLayerState } from "../../../core/state.js";
import { MUSHROOM_GROVE_VIEW } from "../sublayers/mushroomGroveSublayer.js";
import { biomeOpen } from "../sublayers/ecosystemSublayer.js";
import { tickGrove, groveNeedsAttention } from "../systems/mushroomGrove.js";

const FUNGI_RESOURCES = ["greenEssence", "blueEssence", "biomass", "spores"];

registerLayer("fungi", {
    categoryId: "main",
    group: "world",
    name: "Fungi",
    color: "#a06bc0",
    order: 9,
    startUnlocked: false,

    resources: FUNGI_RESOURCES,

    initialState: {
        groveBeds: [],
        groveBoosts: {},
        groveFruited: 0,
    },

    onTick(dt, layer) {
        tickGrove(dt, getLayerState(layer.stateKey));
    },

    tabMark: () => (groveNeedsAttention() ? "!" : null),
    subLayers: {
        mushroomGrove: {
            ...MUSHROOM_GROVE_VIEW,
            order: 0,
            hidden: () => !biomeOpen("mushroomGrove"),
        },

        fungalForest: {
            hidden: () => !biomeOpen("fungalForest"),
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
