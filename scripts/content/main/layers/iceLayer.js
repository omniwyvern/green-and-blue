// iceLayer.js
//
// Holds the ice field and its save data

import { registerLayer } from "../../../core/registry.js";
import { getLayerState } from "../../../core/state.js";
import { addResource } from "../../../core/resources.js";
import { ICE_FIELD_VIEW } from "../sublayers/iceFieldSublayer.js";
import { biomeOpen } from "../sublayers/ecosystemSublayer.js";
import {
    blankPack, tickIceField, fieldProduction, fieldIsBare, looseFull, overloaded,
} from "../systems/iceField.js";

registerLayer("ice", {
    categoryId: "main",
    group: "world",
    name: "Ice",
    color: "#7fc4e2",
    order: 7,
    startUnlocked: false,

    resources: ["greenEssence", "blueEssence"],

    initialState: {
        snowLoose: 0,
        icePack: blankPack(),
        icePressure: 0,
        iceSettling: 0,
        iceCollapses: 0,
        iceWasted: 0,
    },

    onTick(dt, layer) {
        const s = getLayerState(layer.stateKey);
        tickIceField(dt, s);
        const output = fieldProduction(s);
        for (const resourceId in output) addResource(resourceId, output[resourceId].mul(dt));
    },

    tabMark: () => !fieldIsBare() && (overloaded() || looseFull()) ? "!" : null,

    subLayers: {
        iceField: {
            ...ICE_FIELD_VIEW,
            order: 0,
            hidden: () => !biomeOpen("iceField"),
        },

        glacier: {
            hidden: () => !biomeOpen("glacier"),
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
