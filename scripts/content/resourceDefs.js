// resourceDefs.js
//
// Every resource once; "holder" is the layer whose save keeps the pool

import { registerResources } from "../core/registry.js";
import { biomassNote } from "./main/systems/biomass.js";

registerResources({
    greenEssence:     { name: "Green Essence",     short: "GE",    brief: "Green", color: "#3aa876", holder: "cores" },
    blueEssence:      { name: "Blue Essence",      short: "BE",    brief: "Blue",  color: "#4a90d9", holder: "cores" },
    biomass:          { name: "Biomass",           short: "BMass", color: "#005f5a", holder: "pond", note: biomassNote },
    vitality:         { name: "Vitality",          short: "VIT",   color: "#8ccf5e", holder: "grass" },
    adaptationPoints: { name: "Adaptation Points", short: "AP",    color: "#b06ad0", holder: "adaptation" },
    coral:            { name: "Coral",             short: "CRL",   color: "#e0736f", holder: "reef" },
    spores:           { name: "Spores",            short: "SPR",   color: "#c9a8e0", holder: "fungi" },
});
