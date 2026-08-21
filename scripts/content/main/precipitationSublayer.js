// precipitationSublayer.js
//
// The weather, which is aimed and set off on the world map.
//
// Rain and snow are the two options, this layer will get proper implementation later but
// for now it's just a toggle for which one.

import { registerLayer } from "../../core/registry.js";
import { getLayerState } from "../../core/state.js";
import { formatNumber } from "../../utils/format.js";
import {
    PRECIPITATION, PRECIPITATION_KINDS, PRECIPITATION_SECONDS, ACTIVATIONS_BY_TIER,
    BUILDUP_LOST_PER_SECOND, TERRAIN,
    worldState, isPrecipitating, precipitationKind, setPrecipitationKind, fallingKind,
    buildupOn, claimedTiles, precipitationCost, shedsPrecipitation,
} from "./worldMap.js";

const environmentBought = () => !!getLayerState("cores").purchasedUpgrades.environment;

// Tile that's furthest along towards changing to water or snow depending on which precipitation
function furthestAlong(s, kind) {
    let best = null;
    for (const id of claimedTiles(s)) {
        // Tiles that shed this kind of precipitation don't care about it.
        if (shedsPrecipitation(s, id, kind)) continue;
        if (!best || buildupOn(s, id, kind) > buildupOn(s, best, kind)) best = id;
    }
    return best && buildupOn(s, best, kind) > 0 ? best : null;
}

export const PRECIPITATION_RESOURCES = {
    greenEssence: { name: "Green Essence", color: "#3aa876", from: "cores" },
    blueEssence: { name: "Blue Essence", color: "#4a90d9", from: "cores" },
};

function summary(world, kind) {
    const cost = precipitationCost(world).blueEssence;
    const name = PRECIPITATION[kind].name.toLowerCase();

    const falling = isPrecipitating(world)
        ? `${PRECIPITATION[fallingKind(world)].name} is falling on ${world.weatherTile}`
            + ` for another ${Math.ceil(world.weatherSeconds)}s.`
        : `Gathering ${name} costs ${formatNumber(cost)} Blue Essence a click,`
            + ` and a full cloud falls for ${Math.round(PRECIPITATION_SECONDS)}s.`;

    // Before unlocking Environment, nothing is reported because there's nothing to report.
    if (!environmentBought()) return `${falling} Aim it at a grassy tile to speed its growth.`;

    const becomes = TERRAIN[PRECIPITATION[kind].becomes].name.toLowerCase();
    const sheds = PRECIPITATION[kind].makes;
    const rule = ` One full cloud turns bare ground to ${becomes}; anything already grown or`
        + ` changed takes ${ACTIVATIONS_BY_TIER.slice(1).join(", ")} by tier,`
        + ` and gives up ${(BUILDUP_LOST_PER_SECOND * 100).toFixed(2)}% a second in between.`
        + ` Ground that is already ${sheds} sheds it entirely.`;

    const at = furthestAlong(world, kind);
    const progress = at
        ? ` The ground furthest along is ${world.weatherTile === at ? "the tile under the cloud" : at}`
            + ` at ${Math.round(buildupOn(world, at, kind) * 100)}%.`
        : " No ground is holding any yet.";

    return falling + rule + progress;
}

export const PRECIPITATION_VIEW = {
    name: "Precipitation",
    color: "#4a90d9",
    canvasType: "static",

    scene: {
        build(el, s, layer) {
            el.className = "static-scene weather-scene";
            el.innerHTML = `
                <div class="weather-page flyout-inset">
                    <div class="cards-heading">What falls</div>
                    <div class="weather-switch"></div>
                    <div class="weather-summary"></div>
                </div>
            `;

            const switcher = el.querySelector(".weather-switch");
            for (const kind of PRECIPITATION_KINDS) {
                const btn = document.createElement("button");
                btn.className = "weather-choice";
                btn.dataset.kind = kind;
                btn.textContent = PRECIPITATION[kind].name;
                btn.addEventListener("click", () => setPrecipitationKind(worldState(), kind));
                switcher.appendChild(btn);
            }
            el.__switch = null;
        },

        update(el) {
            const world = worldState();
            const kind = precipitationKind(world);
            // Doesn't let you change mid-precipitation cause that May Or May Not Cause Problems Teehee
            const falling = isPrecipitating(world);

            const signature = `${kind}:${falling}`;
            if (el.__switch !== signature) {
                el.__switch = signature;
                for (const btn of el.querySelectorAll(".weather-choice")) {
                    const picked = btn.dataset.kind === kind;
                    btn.classList.toggle("active", picked);
                    btn.classList.toggle("inactive", falling && !picked);
                    btn.title = picked ? "Loaded"
                        : falling ? "Wait for the cloud to clear"
                        : `Load the cloud with ${PRECIPITATION[btn.dataset.kind].name.toLowerCase()}`;
                }
            }

            setText(el.querySelector(".weather-summary"), summary(world, kind));
        },
    },

    upgrades: {},
};

function setText(el, text) {
    if (el.textContent !== text) el.textContent = text;
}

registerLayer("precipitation", {
    categoryId: "main",
    group: "world",
    order: 3,
    startUnlocked: false,
    absorbedBy: "environment",

    resources: PRECIPITATION_RESOURCES,

    // Ticked by the world, not here.
    ...PRECIPITATION_VIEW,
});
