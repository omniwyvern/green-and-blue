// environmentLayer.js
//
// Updates the World layer to have more than just grass. This is where the terrain in the world
// is paid out and reported on. The grass and precipitation layers are absorbed as sublayers in
// here once this is unlocked. Basically this layer is a reference for what all is in the world,
// plus the Ecosystem tree, which is where what the world CAN become is bought.
//
// The Pond used to be absorbed in here too. It isn't any more - it goes to the Aquatic layer
// instead, at the point where the Ocean opens and one pool stops being the whole of the water.


import { registerLayer } from "../../core/registry.js";
import { getLayerState } from "../../core/state.js";
import { addResource } from "../../core/resources.js";
import { D } from "../../utils/decimal.js";
import { formatNumber } from "../../utils/format.js";
import {
    TERRAIN, TERRAIN_OUTPUT, ACTIVATIONS_BY_TIER, DRYING_SECONDS, activationsForKind,
    worldState, tileCounts, knownKinds, terrainProduction, claimedTiles, moistureOn,
    knownTransforms, transformAvailable, transformHint, fodderSpends, fodderSummary, hasSeenKind,
    contributeMapRadius,
} from "./worldMap.js";
import { kindChip } from "./terrainArt.js";
import { BIOMASS_RESOURCE, biomassMultiplier } from "./pondSublayer.js";
import { ECOSYSTEM_VIEW } from "./ecosystemSublayer.js";
import { GRASS_VIEW, GRASS_RESOURCES, GROWTH_RESOURCE, greenMultiplier, blueMultiplier } from "./grassSublayer.js";
import { PRECIPITATION_VIEW, PRECIPITATION_RESOURCES } from "./precipitationSublayer.js";

// How long a full cloud's worth takes to drain back off the ground when left alone.
const DRYING_MINUTES = DRYING_SECONDS / 60;

// The world opens out by a ring once the environment is here.
contributeMapRadius("environment", () => getLayerState("environment").unlocked ? 1 : 0);

// The wettest tile that hasn't flooded yet, i.e. whichever tile is being rained on (I THINK THIS WORKS RIGHT MAYBE HOPEFULLY)
function wettestTile(s) {
    let best = 0;
    for (const id of claimedTiles(s)) best = Math.max(best, moistureOn(s, id));
    return best;
}

registerLayer("environment", {
    categoryId: "main",
    group: "world",
    name: "Environment",
    color: "#35d0d0",
    order: 0,
    startUnlocked: false,

    resources: {
        greenEssence: { name: "Green Essence", color: "#3aa876", from: "cores" },
        blueEssence: { name: "Blue Essence", color: "#4a90d9", from: "cores" },
        biomass: { ...BIOMASS_RESOURCE, from: "pond" },
        growth: { ...GROWTH_RESOURCE, from: "grass" },
        evolutionPoints: { name: "Evolution Points", color: "#b06ad0", from:"evolution"},
    },

    onTick(dt, layer) {
        const output = terrainProduction(worldState());
        const fromBiomass = biomassMultiplier(); // Multiplies essences wherever they are produced (here)
        if (output.greenEssence > 0) addResource(layer, "greenEssence", D(output.greenEssence).mul(fromBiomass).mul(greenMultiplier()).mul(dt));
        if (output.blueEssence > 0) addResource(layer, "blueEssence", D(output.blueEssence).mul(fromBiomass).mul(blueMultiplier()).mul(dt));
    },

    subLayers: {
        ecosystem: { ...ECOSYSTEM_VIEW, order: 0 },

        terrain: {
            name: "Terrain",
            color: "#35d0d0",
            canvasType: "static",
            order: 1,
            scene: {
                build(el) {
                    el.className = "static-scene environment-scene";
                    el.innerHTML = `
                        <div class="environment-page flyout-inset">
                            <div class="environment-summary"></div>
                            <div class="cards-heading">Transformations</div>
                            <div class="recipe-list"></div>
                            <div class="cards-heading">The ground</div>
                            <div class="terrain-list"></div>
                        </div>
                    `;
                    el.__recipes = null;
                    el.__census = null;
                },

                update(el) {
                    const world = worldState();
                    const counts = tileCounts(world);

                    setText(el.querySelector(".environment-summary"), summary(world, counts));

                    // Known/unlocked transforms are only updated on purchases, so this isn't rebuilt every tick.
                    const known = knownTransforms(world);
                    const recipeSignature = known
                        .map(r => `${r.id}:${transformAvailable(r, world)}:${hasSeenKind(world, r.output)}`)
                        .join(",");
                    if (el.__recipes !== recipeSignature) {
                        el.__recipes = recipeSignature;
                        el.querySelector(".recipe-list").innerHTML = known.length
                            ? known.map(r => recipeMarkup(r, world)).join("")
                            : `<div class="cards-empty">Nothing is known yet.</div>`;
                    }

                    // The ground that the world can currently reach.
                    const kinds = knownKinds(world);
                    const censusSignature = kinds.map(kind => `${kind}:${counts[kind]}`).join(",");
                    if (el.__census === censusSignature) return;
                    el.__census = censusSignature;

                    el.querySelector(".terrain-list").innerHTML = kinds
                        .map(kind => terrainMarkup(kind, counts[kind]))
                        .join("");
                },
            },
        },

        grass: { ...GRASS_VIEW, order: 2, stateKey: "grass", resources: GRASS_RESOURCES },
        precipitation: { ...PRECIPITATION_VIEW, order: 3, stateKey: "precipitation", resources: PRECIPITATION_RESOURCES },
    },
});

// One line for where the world's ground is up to. Before anything has changed it says what
// to do about that instead, since it being empty explains nothing.
function summary(world, counts) {
    const changed = Object.keys(TERRAIN)
        .filter(kind => TERRAIN[kind].stored && counts[kind] > 0)
        .map(kind => `${counts[kind]} ${TERRAIN[kind].name.toLowerCase()}`);

    if (changed.length === 0) {
        const wet = wettestTile(world);
        return "No ground has changed yet."
            + (wet > 0
                ? ` The wettest tile is ${Math.round(wet * 100)}% soaked, and drying - rain it through and it floods.`
                : ` Aim the weather at a tile to work on it: one full downpour is enough to turn`
                    + ` bare ground, grass takes ${activationsForKind("grass")} of them and heavier`
                    + ` ground ${ACTIVATIONS_BY_TIER.slice(1).join(", ")} by tier. Lighter`
                    + ` intensities leave a fraction of that behind, and ground left alone gives a`
                    + ` cloud's worth back every ${DRYING_MINUTES.toFixed(0)} minutes.`);
    }

    const output = terrainProduction(world);
    return `${changed.join(", ")}`
        + ` - producing ${formatNumber(D(output.greenEssence))} Green`
        + ` and ${formatNumber(D(output.blueEssence))} Blue Essence per second.`;
}

// Each transformation recipe. Tile being changed is the first input.
// When a recipe isn't unlocked, nothing shows. When it's unlocked but not created,
// it just shows the primary tile and not the fodder.
//
// Recipes you haven't made yet only show the initial tile, and not the result or other components.
function recipeMarkup(recipe, world) {
    const locked = !transformAvailable(recipe);
    const found = hasSeenKind(world, recipe.output);

    const inputs = recipe.inputs
        .map((kind, i) => (found || i === 0 ? kindChip(kind) : unseenChip()))
        .join(`<span class="transform-plus">+</span>`);

    const result = locked
        ? `<div class="transform-chip transform-locked">
               <div class="transform-chip-art">${LOCK_GLYPH}</div>
               <div class="transform-chip-name">Locked</div>
           </div>`
        : found
            ? kindChip(recipe.output, "transform-result")
            : unseenChip(TERRAIN[recipe.output].name, "transform-result");

    const text = locked
        ? `<span class="recipe-hint">${transformHint(recipe)}</span>`
        : `${recipe.text}
           <span class="${fodderSpends(recipe) ? "recipe-cost" : "recipe-free"}">
               ${fodderSummary(recipe)}
           </span>`;

    return `
        <div class="recipe-row${locked ? " locked" : ""}">
            <div class="recipe-line">
                <div class="transform-inputs">${inputs}</div>
                <div class="recipe-arrow">→</div>
                <div class="transform-outputs">${result}</div>
            </div>
            <div class="recipe-text">${text}</div>
        </div>
    `;
}

const unseenChip = (name = "???", extra = "") => `
    <div class="transform-chip transform-unknown ${extra}">
        <div class="transform-chip-art"><span class="transform-question">?</span></div>
        <div class="transform-chip-name">${name}</div>
    </div>`;

const LOCK_GLYPH = `
    <svg class="transform-lock" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M5 7.4V5a3 3 0 0 1 6 0v2.4"/>
        <rect x="3.4" y="7.4" width="9.2" height="6.4" rx="1.3"/>
    </svg>`;

    
function terrainMarkup(kind, count) {
    const output = TERRAIN_OUTPUT[kind];
    const rate = output
        ? Object.keys(output).map(id => `${formatNumber(D(output[id]))} ${RESOURCE_NAMES[id]}/s`).join(", ")
        : "—";

    return `
        <div class="terrain-row${count > 0 ? " has-some" : ""}">
            ${kindChip(kind)}
            <div class="terrain-facts">
                <div class="terrain-count">${count} tile${count === 1 ? "" : "s"}</div>
                <div class="terrain-rate">${rate}</div>
            </div>
        </div>
    `;
}

const RESOURCE_NAMES = { greenEssence: "Green", blueEssence: "Blue" };

function setText(el, text) {
    if (el.textContent !== text) el.textContent = text;
}
