// resourceDefs.js
//
// Every resource, once, across every category. A layer's own `resources` only lists which of
// these its header shows. `holder` is the layer whose save keeps the pool - everyone else reads
// and spends that one. Imported by main.js ahead of the categories, since layers check against it.

import { registerResources } from "../core/registry.js";
import { biomassNote } from "./main/biomass.js";

registerResources({
    greenEssence:    { name: "Green Essence",    short: "GE",  color: "#3aa876", holder: "cores" },
    blueEssence:     { name: "Blue Essence",     short: "BE",  color: "#4a90d9", holder: "cores" },
    biomass:         { name: "Biomass",          color: "#005f5a", holder: "pond", note: biomassNote },
    growth:          { name: "Growth",           color: "#8ccf5e", holder: "grass" },
    evolutionPoints: { name: "Evolution Points", short: "Evo", color: "#b06ad0", holder: "evolution" },
});
