// grassSublayer.js
//
// What the grass on the map is doing, and the upgrades for it. The tiles themselves are
// drawn by the World layer and the rules for how grass spreads live in worldMap.js - this is
// the readout and the shop, the same split the Pond has between its water and its drawers.
//
// This might become a real sublayer later. Probably some mechanic to it. hope and pray teehee

import { registerLayer } from "../../core/registry.js";
import { getLayerState } from "../../core/state.js";
import { addResource } from "../../core/resources.js";
import { D } from "../../utils/decimal.js";
import { formatNumber } from "../../utils/format.js";
import {
    MAP, SEED, GROWING, MATURE, STAGE_NAMES,
    worldState, grassOn, grassTiles, growableTiles, growthRate, production,
} from "./worldMap.js";

const grassBought = () => !!getLayerState("cores").purchasedUpgrades.grass;

const stageCounts = (s) => {
    const counts = [0, 0, 0];
    for (const id of grassTiles(s)) counts[s.grass[id].stage]++;
    return counts;
};

// How long the fastest-growing tile is growing. Might remove later idk
function fastestStageSeconds(s) {
    let best = 0;
    for (const tile of MAP) {
        if (!grassOn(s, tile.id)) continue;
        best = Math.max(best, growthRate(s, tile));
    }
    return best > 0 ? 1 / best : 0;
}

export const GRASS_RESOURCES = {
    greenEssence: { name: "Green Essence", color: "#3aa876", from: "cores" },
    blueEssence: { name: "Blue Essence", color: "#4a90d9", from: "cores" },
};

// Readout and its upgrades. Same deal as with the pond.
export const GRASS_VIEW = {
    name: "Grass",
    color: "#5aa84f",
    canvasType: "static",

    note: () => {
        const world = worldState();
        const planted = grassTiles(world).length;
        const open = growableTiles(world).length;
        if (planted === 0) return "Nothing planted yet.";

        const [seeds, growing, mature] = stageCounts(world);
        const seconds = fastestStageSeconds(world);
        return `Grass on ${planted} of ${open} open tiles`
            + ` - ${seeds} ${STAGE_NAMES[SEED].toLowerCase()},`
            + ` ${growing} ${STAGE_NAMES[GROWING].toLowerCase()},`
            + ` ${mature} ${STAGE_NAMES[MATURE].toLowerCase()}.`
            + ` Producing ${formatNumber(production(world))} Green Essence/s,`
            + ` a stage every ${seconds.toFixed(1)}s at best.`
            + (planted === open ? " Every tile it can reach is grassed over - claim more for it to spread into." : "");
    },

    upgrades: {
        richerSoil: {
            title: "Richer Soil",
            description: "Grass moves through its stages faster, everywhere.",
            max: 10,
            cost: (s, level) => ({ greenEssence: D(8000).mul(D(1.7).pow(level)) }),
        },
        deeperRoots: {
            title: "Deeper Roots",
            description: "Every grassy tile is worth more Green Essence.",
            max: 25,
            cost: (s, level) => ({ greenEssence: D(5000).mul(D(1.3).pow(level)) }),
        },
    },
};

registerLayer("grass", {
    categoryId: "main",
    group: "world",
    order: 2,
    startUnlocked: false, // The Grass node on the Cores tree opens it
    absorbedBy: "environment",

    resources: GRASS_RESOURCES,

    // Grass growing is on the World's tick, this one is just payout.
    onTick(dt, layer) {
        if (!grassBought()) return;
        addResource(layer, "greenEssence", D(production(worldState())).mul(dt));
    },

    ...GRASS_VIEW,
});
