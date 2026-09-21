// environmentLayer.js
//
// Pays out and reports on world terrain; holds Grass, Precipitation, Terrain and Ecosystem


import { registerLayer } from "../../../core/registry.js";
import { layerUnlocked } from "../../../core/state.js";
import { addResource } from "../../../core/resources.js";
import { boostResource } from "../../../core/boosts.js";
import { D } from "../../../utils/decimal.js";
import { terrainProduction, worldState, contributeMapRadius } from "../systems/worldMap.js";
import { ECOSYSTEM_VIEW } from "../sublayers/ecosystemSublayer.js";
import { TERRAIN_VIEW } from "../sublayers/terrainSublayer.js";
import { GRASS_VIEW, GRASS_RESOURCES } from "../sublayers/grassSublayer.js";
import { PRECIPITATION_VIEW, PRECIPITATION_RESOURCES } from "../sublayers/precipitationSublayer.js";


// The world opens out by a ring once the environment is here
contributeMapRadius("environment", () => layerUnlocked("environment") ? 1 : 0);

registerLayer("environment", {
    categoryId: "main",
    group: "world",
    name: "Environment",
    color: "#35d0d0",
    order: 0,
    startUnlocked: false,

    resources: ["greenEssence", "blueEssence", "biomass", "vitality", "adaptationPoints"],

    onTick(dt, layer) {
        // Whatever the ground produces: essences, biomass, etc.
        const output = terrainProduction(worldState());
        for (const resourceId in output) {
            const amount = D(output[resourceId]);
            if (!amount.gt(0)) continue;
            addResource(resourceId, amount.mul(boostResource(resourceId)).mul(dt));
        }
    },

    subLayers: {
        ecosystem: { ...ECOSYSTEM_VIEW, order: 0 },
        terrain: { ...TERRAIN_VIEW, order: 1 },
        grass: { ...GRASS_VIEW, order: 2, stateKey: "grass", resources: GRASS_RESOURCES },
        precipitation: { ...PRECIPITATION_VIEW, order: 3, stateKey: "precipitation", resources: PRECIPITATION_RESOURCES },
    },
});

