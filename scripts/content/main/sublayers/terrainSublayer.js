// terrainSublayer.js
//
// The Terrain page: every transformation, its inputs, and what the result is worth

import { formatPercent } from "../../../utils/format.js";
import { rateText } from "../../../render/richText.js";
import { D } from "../../../utils/decimal.js";
import {
    TERRAIN, TERRAIN_OUTPUT, worldState, tileCounts,
    knownTransforms, transformAvailable, fodderSpends, fodderSummary, hasSeenKind,
} from "../systems/worldMap.js";
import { kindChip } from "../art/terrainArt.js";
import { PER_POND_TILE, perPondBlue } from "./pondSublayer.js";
import { PER_OCEAN_TILE } from "./oceanSublayer.js";


//    !!! THE PAGE !!!

export const TERRAIN_VIEW = {
    name: "Terrain",
    color: "#35d0d0",
    canvasType: "static",

    scene: {
        build(el) {
            el.className = "static-scene environment-scene";
            el.innerHTML = `
                <div class="environment-page flyout-inset">
                    <div class="environment-summary"></div>
                    <div class="cards-heading">Transformations</div>
                    <div class="recipe-list"></div>
                </div>
            `;
            el.__recipes = null;
        },

        update(el) {
            const world = worldState();
            const counts = tileCounts(world);

            // Known/unlocked transforms are only updated on purchases, so this isn't rebuilt every tick
            const known = knownTransforms(world).filter(r => transformAvailable(r, world));
            const recipeSignature = known
                .map(r => `${r.id}:${hasSeenKind(world, r.output)}`)
                .join(",");
            if (el.__recipes !== recipeSignature) {
                el.__recipes = recipeSignature;
                el.querySelector(".recipe-list").innerHTML = known.length
                    ? known.map(r => recipeMarkup(r, world)).join("")
                    : `<div class="cards-empty">Nothing is known yet.</div>`;
            }
        },
    },
};


//    !!! RECIPES !!!

// Recipes you haven't made yet only show the initial tile, and not the result or other components
function recipeMarkup(recipe, world) {
    const found = hasSeenKind(world, recipe.output);

    const inputs = recipe.inputs
        .map((kind, i) => (found || i === 0 ? kindChip(kind) : unseenChip()))
        .join(`<span class="transform-plus">+</span>`);

    const result = found
        ? kindChip(recipe.output, "transform-result")
        : unseenChip(TERRAIN[recipe.output].name, "transform-result");

    const text = `${recipe.text}
           <span class="${fodderSpends(recipe) ? "recipe-cost" : "recipe-free"}">
               ${fodderSummary(recipe)}
           </span>`;

    return `
        <div class="recipe-row">
            <div class="recipe-line">
                <div class="transform-inputs">${inputs}</div>
                <div class="recipe-arrow">→</div>
                <div class="transform-outputs">${result}</div>
            </div>
            <div class="recipe-text">${text}</div>
            ${found ? givesMarkup(recipe.output) : ""}
        </div>
    `;
}

// What the result in a recipe does (benefit or production or whatever)
function givesMarkup(kind) {
    const output = TERRAIN_OUTPUT[kind];
    const lines = [];
    if (output) {
        lines.push(Object.keys(output)
            .map(id => rateText(id, D(output[id]), "brief")).join(", "));
    }
    const effect = TERRAIN_EFFECT[kind];
    if (effect) lines.push(typeof effect === "function" ? effect() : effect);
    if (lines.length === 0) return "";

    return `<div class="recipe-gives">`
        + lines.map(line => `<div>${line}</div>`).join("")
        + `</div>`;
}

const unseenChip = (name = "???", extra = "") => `
    <div class="transform-chip transform-unknown ${extra}">
        <div class="transform-chip-art"><span class="transform-question">?</span></div>
        <div class="transform-chip-name">${name}</div>
    </div>`;


//    !!! WHAT TILES ARE WORTH !!!

// What a tile is worth beyond what it makes on the map itself
const TERRAIN_EFFECT = {
    grass: "Multiplies Green Essence, and Blue Essence while there's weather on it",
    pond: () => `+${PER_POND_TILE} capacity in the Pond, and +${formatPercent(perPondBlue())} to all Blue Essence`
        + `, though less for each pond next to it`,
    ocean: `Opens ocean regions: five for the first tile, then one more for every two tiles`
        + `, and +${formatPercent(PER_OCEAN_TILE)} to every school. Your biggest group of ocean`
        + ` tiles speeds up ocean ticks, but land next to it weakens the bonus.`,
    "deep-ocean": `Counts as ocean, and makes Blue Essence and Biomass for each fish species.`
        + ` Ocean next to it raises that, and land next to it cuts it`,
    forest: `Makes Green Essence based on old growth, plus more for each forest next to it.`
        + ` Ponds and grass next to it make its trees grow faster`,
    "dense-forest": `Worth several forests' Green Essence, on the same old growth (THIS WILL CHANGE)`,
    "ancient-forest": `Worth many forests' Green Essence, on the same old growth (THIS WILL CHANGE)`,
    marsh: `Grows the Marsh: new zones open at 1, 2, 4 and 7 tiles, and the marsh is worth the square of its`
        + ` tiles (a quarter as much with only one zone). Keeps grass next to it from drying out`,
    "mushroom-grove": `Makes Green Essence, more for each mushroom up in the grove. The first few`
        + ` groves each add a bed`,
};

