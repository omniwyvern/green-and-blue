// reefLayer.js
//
// Holds the reef and its save data

import { registerLayer } from "../../../core/registry.js";
import { getLayerState } from "../../../core/state.js";
import { REEF_VIEW } from "../sublayers/reefSublayer.js";
import { biomeOpen } from "../sublayers/ecosystemSublayer.js";
import { tickReef, reefNeedsAttention } from "../systems/reef.js";

registerLayer("reef", {
    categoryId: "main",
    group: "world",
    name: "Reef",
    color: "#37b3c6",
    order: 8,
    startUnlocked: false,

    resources: ["greenEssence", "blueEssence"],

    initialState: {
        reefSpots: [],
        reefSitesAdded: 0,
        reefCredit: {},
        reefUnlocks: {},
        reefEvents: [],
        reefEventClock: 45,
        reefAnswered: 0,
        reefSettledTime: {},
        reefSettledStreak: {},
    },

    onTick(dt, layer) {
        tickReef(dt, getLayerState(layer.stateKey));
    },

    tabMark: () => reefNeedsAttention() ? "!" : null,

    subLayers: {
        reef: {
            ...REEF_VIEW,
            order: 0,
            hidden: () => !biomeOpen("reef"),
        },

        coralReef: {
            hidden: () => !biomeOpen("coralReef"),
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
