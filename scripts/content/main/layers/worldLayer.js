// worldLayer.js
//
// The world map view; the rules for the map live in worldMap.js


import { registerLayer } from "../../../core/registry.js";
import { state, getLayerState } from "../../../core/state.js";
import { spend, canAfford } from "../../../core/resources.js";
import { boostResource } from "../../../core/boosts.js";
import { formatNumber, formatPercent, deltaPercent } from "../../../utils/format.js";
import { D } from "../../../utils/decimal.js";
import { setText, setDisplay, setWidth } from "../../../utils/dom.js";
import { namedResourceSpan, setRichText } from "../../../render/richText.js";
import { switchToLayer } from "../../../render/canvasRouter.js";
import {
    mapTiles, TILE_SIZE, STAGE_NAMES, MATURE, LAND_COST, TERRAIN, grassOn, tileCost, canPlant, plantGrass,
    growFully, tickGrass, tickPrecipitation, tickBuildup,
    PRECIPITATION, precipitationKind,
    isPrecipitating, precipitatingOn, fallingKind, snowOn, shedsPrecipitation,
    terrainOn, moistureOn, buildupOn, tileKind, soak, setTerrain, selectTile, clearTransform, dampGrowth,
    clickTransformTile, isTransformCandidate, isTransformFodder, transformInputs,
    matchedTransform, applyTransform, transformAvailable, transformHint, transformReady, fodderNote,
    oneSoakedBlue, grassGreenOutput, ADJACENT_SHARE, tileYield, largestOceanStretch,
    previousTilePrice, chargeCost, RAZE_SECONDS, isRazing, razeProgress, razeLeft, canRaze,
    startRaze, tickRaze, tickFires, fireOn, keptWetByMarsh
} from "../systems/worldMap.js";
import { TERRAIN_ART, kindChip } from "../art/terrainArt.js";
import { activeType } from "../sublayers/grassSublayer.js";
import {
    stabilityOf, readyIndex, canRelease, capacity, releaseCloud, pickedIntensity, intensityName,
} from "../sublayers/precipitationSublayer.js";
import { challengeBlocks } from "../systems/challenges.js";
import { PER_POND_TILE, pondBlueShare } from "../sublayers/pondSublayer.js";
import { oceanSpreadSpeed, deepOceanShare, fishSpecies } from "../sublayers/oceanSublayer.js";
import { coreNodeBought } from "../../../core/nodes.js";

const CLOUDS_PER_RAZE = 3;
const DEV_SOAK = 0.99;
const razeCost = (s) => ({
    greenEssence: previousTilePrice(s),
    blueEssence: chargeCost(s).mul(capacity()).mul(CLOUDS_PER_RAZE),
});

// What the tile adds on top, and the share of that one neighbor keeps
const bonusNote = (name, bonus) => `+${formatPercent(bonus)} ${name}`
    + ` (+${formatPercent(bonus * ADJACENT_SHARE)} nearby)`;

const TILE_RESOURCE_NAMES = { greenEssence: "Green", blueEssence: "Blue", biomass: "Biomass" };

// The finished per-second number, not the bare tile, same as what onTick pays out
function outputNote(s, id) {
    const output = tileYield(s, id);
    const rates = [];
    for (const resourceId in output) {
        const amount = D(output[resourceId]).mul(boostResource(resourceId));
        if (amount.gt(0)) rates.push(`${formatNumber(amount)} ${TILE_RESOURCE_NAMES[resourceId] || resourceId}/s`);
    }
    return rates.join(", ");
}

// The half of a tile's worth that happens somewhere other than the map
function elsewhereNote(s, id, kind) {
    if (kind === "pond") {
        return `+${formatPercent(pondBlueShare(s, id))} to all Blue Essence, +${PER_POND_TILE} Pond capacity`;
    }
    if (kind === "ocean" || kind === "deep-ocean") {
        const { size, shore } = largestOceanStretch(s);
        const parts = [`biggest ocean stretch is ${size} tile${size === 1 ? "" : "s"}`
            + `${shore > 0 ? ` against ${shore} of land` : ""}`
            + `, ocean ticks ${formatNumber(oceanSpreadSpeed(s))}x faster`];
        if (kind === "deep-ocean") {
            parts.push(fishSpecies() > 0
                ? `${formatNumber(deepOceanShare(s, id))}x for the water around it`
                : "nothing until there are fish in the water");
        }
        return parts.join("\n");
    }
    return "";
}


// One drawing per growth stage, scaling with whatever tile size is set to
const GRASS_ART = [
    // Seed
    `<svg class="tile-grass" viewBox="0 0 40 40" aria-hidden="true">
        <ellipse class="grass-soil" cx="20" cy="29" rx="9" ry="3.4"/>
        <path class="grass-blade" d="M20 29 C19.4 26 20.6 24 20 22"/>
        <path class="grass-seedleaf" d="M20 23.5 C17.6 22.4 16.8 20.6 17.4 19.4 C19 19.4 20 21 20 23.5 Z"/>
    </svg>`,
    // Growing
    `<svg class="tile-grass" viewBox="0 0 40 40" aria-hidden="true">
        <ellipse class="grass-soil" cx="20" cy="30" rx="11" ry="3.4"/>
        <path class="grass-blade" d="M20 30 C18.6 25 19.6 21 18.4 17.5"/>
        <path class="grass-blade" d="M20 30 C21.6 26 22.8 23 24.6 20.5"/>
        <path class="grass-blade" d="M20 30 C17.2 27 15.4 25 13.8 23"/>
    </svg>`,

    // Mature
    `<svg class="tile-grass" viewBox="0 0 40 40" aria-hidden="true">
        <ellipse class="grass-soil" cx="20" cy="31" rx="12" ry="3.4"/>
        <path class="grass-blade" d="M20 31 C18.2 24 19.4 18 17.6 12"/>
        <path class="grass-blade" d="M20 31 C22 25 23.4 20 25.8 15"/>
        <path class="grass-blade" d="M20 31 C16.4 27 13.6 23 11.6 18.5"/>
        <path class="grass-blade" d="M20 31 C24 28 26.8 25 28.6 21"/>
    </svg>`,
];

// Rain falling on a tile. Doesn't matter what's in the tile, this is drawn on top of it
const RAIN_ART = `
    <svg class="tile-rain" viewBox="0 0 40 40" aria-hidden="true">
        <path class="tile-raindrop" d="M11 6 L9 13"/>
        <path class="tile-raindrop" d="M20 4 L18 12"/>
        <path class="tile-raindrop" d="M29 7 L27 14"/>
        <path class="tile-raindrop" d="M15 16 L13 23"/>
        <path class="tile-raindrop" d="M25 18 L23 25"/>
    </svg>`;

// Snow falling on a tile. Same as above, it draws on top of it
const SNOW_ART = `
    <svg class="tile-snow" viewBox="0 0 40 40" aria-hidden="true">
        <circle class="tile-snowflake" cx="10" cy="7" r="1.5"/>
        <circle class="tile-snowflake" cx="20" cy="5" r="1.2"/>
        <circle class="tile-snowflake" cx="29" cy="8" r="1.4"/>
        <circle class="tile-snowflake" cx="15" cy="17" r="1.2"/>
        <circle class="tile-snowflake" cx="25" cy="19" r="1.5"/>
        <circle class="tile-snowflake" cx="33" cy="15" r="1.1"/>
    </svg>`;

// A tile alight during Long Summer, drawn over whatever woodland is burning
const FIRE_ART = `
    <svg class="tile-fire" viewBox="0 0 40 40" aria-hidden="true">
        <path class="tile-flame" d="M20 34 C12 28 14 21 18 16 C18 21 21 21 21 18 C25 22 28 27 20 34 Z"/>
        <path class="tile-flame tile-flame-inner" d="M20 33 C16 29 17 25 19.5 22 C20 25 22 25 22 23 C24.5 26 25 30 20 33 Z"/>
    </svg>`;

// The cloud for the precipitation icon
const CLOUD = `
    <g class="cloud">
        <circle cx="12" cy="14" r="5"/>
        <circle cx="19" cy="12.5" r="6.2"/>
        <circle cx="24.5" cy="15.5" r="4.2"/>
        <rect x="7" y="14" width="18" height="5.5" rx="2.75"/>
    </g>`;

const PRECIPITATION_ICON = {
    rain: `
        <svg class="interaction-icon" viewBox="0 0 32 32" aria-hidden="true">
            ${CLOUD}
            <path class="raindrop" d="M12 22 L10.5 27"/>
            <path class="raindrop" d="M18 22.5 L16.5 28.5"/>
            <path class="raindrop" d="M24 22 L22.5 27"/>
        </svg>`,
    snow: `
        <svg class="interaction-icon" viewBox="0 0 32 32" aria-hidden="true">
            ${CLOUD}
            <circle class="snowdrop" cx="11.5" cy="24" r="1.7"/>
            <circle class="snowdrop" cx="18" cy="26.5" r="1.5"/>
            <circle class="snowdrop" cx="24.5" cy="23.5" r="1.6"/>
        </svg>`,
};

// Covers the cloud while the weather is shut off, so the map says why
const WEATHER_LOCK = `
    <svg class="weather-lock-icon" viewBox="0 0 32 32" aria-hidden="true">
        <path class="lock-shackle" d="M11 15 L11 11 A5 5 0 0 1 21 11 L21 15"/>
        <rect class="lock-body" x="8" y="15" width="16" height="12" rx="2.5"/>
    </svg>`;

// Manual interactions the player can do on the map
const INTERACTIONS = [
    // This is just for clicking without having an interaction selected
    { id: "select", name: "Select", available: () => true, icon: `
        <svg class="interaction-icon" viewBox="0 0 32 32" aria-hidden="true">
            <path class="cursor-arrow" d="M10 5 L10 24 L14.8 19.6 L18.2 27 L21.6 25.4 L18.2 18.2 L24.6 17.6 Z"/>
        </svg>` },

    // Merge/transform tiles into other ones. Interaction is in the transform window thing
    { id: "transform", name: "Transform", available: () => coreNodeBought("environment"), icon: `
        <svg class="interaction-icon" viewBox="0 0 32 32" aria-hidden="true">
            <path class="transform-hex" d="M11 4 L18 7.5 L18 15.5 L11 19 L4 15.5 L4 7.5 Z"/>
            <path class="transform-hex transform-hex-to" d="M21 13 L28 16.5 L28 24.5 L21 28 L14 24.5 L14 16.5 Z"/>
            <path class="transform-swap" d="M20 8.5 C25 8.5 26.5 10 26.5 13"/>
            <path class="transform-swap" d="M24 11.5 L26.5 13.5 L28.5 11"/>
        </svg>` },

    // Strips a tile back to bare ground, over two minutes and for a price
    { id: "raze", name: "Raze", available: () => coreNodeBought("environment"), icon: `
        <svg class="interaction-icon" viewBox="0 0 32 32" aria-hidden="true">
            <path class="transform-hex" d="M16 3 L23 6.5 L23 14.5 L16 18 L9 14.5 L9 6.5 Z"/>
            <path class="grow-arrow" d="M16 20 L16 26"/>
            <path class="grow-arrow" d="M12.5 22.5 L16 26 L19.5 22.5"/>
            <path class="grow-arrow" d="M6 29 L26 29"/>
        </svg>` },

    // Dev cheat, just uses the tiles' own grass classes
    { id: "grow", name: "Grow grass (dev)", available: () => devInteractions(), icon: `
        <svg class="interaction-icon" viewBox="0 0 32 32" aria-hidden="true">
            <ellipse class="grass-soil" cx="13" cy="26" rx="9" ry="2.6"/>
            <path class="grass-blade" d="M13 26 C11.6 21 12.4 17 11 13"/>
            <path class="grass-blade" d="M13 26 C14.6 22 15.8 19 17.8 15.5"/>
            <path class="grass-blade" d="M13 26 C10.4 23.5 8.4 21 7 18"/>
            <path class="grow-arrow" d="M26 24 L26 12"/>
            <path class="grow-arrow" d="M23 15 L26 12 L29 15"/>
        </svg>` },

    // Dev cheat, soaks a tile instantly
    { id: "soak", name: "Soak tile to 99% (dev)", available: () => devInteractions(), icon: `
        <svg class="interaction-icon" viewBox="0 0 32 32" aria-hidden="true">
            <ellipse class="terrain-pool" cx="16" cy="22" rx="11" ry="6"/>
            <path class="raindrop" d="M16 4 L16 13"/>
            <path class="raindrop" d="M13 10 L16 13.5 L19 10"/>
        </svg>` },

    // Dev cheat, cycles a tile through the list of tiles
    { id: "ground", name: "Set ground (dev)", available: () => devInteractions(), icon: `
        <svg class="interaction-icon" viewBox="0 0 32 32" aria-hidden="true">
            <path class="transform-hex" d="M16 5 L23 8.5 L23 16.5 L16 20 L9 16.5 L9 8.5 Z"/>
            <path class="grow-arrow" d="M7 26 L25 26"/>
            <path class="grow-arrow" d="M21 22.5 L25 26 L21 29.5"/>
        </svg>` },
];


const GROUND_RING = ["bare", ...Object.keys(TERRAIN).filter(kind => TERRAIN[kind].stored)];

function cycleGround(s) {
    if (!s.selectedTile) return;
    // Grass isn't in the list of tiles cause it's weird, so this just does it first
    const at = Math.max(0, GROUND_RING.indexOf(tileKind(s, s.selectedTile)));
    setTerrain(s, s.selectedTile, GROUND_RING[(at + 1) % GROUND_RING.length]);
}

const devInteractions = () => !!state.settings.showDevInteractions;
const availableInteractions = () => INTERACTIONS.filter(i => i.available());

// Which kind of precipitation the cloud is loaded with
const loadedKind = () => precipitationKind(getLayerState("world"));


registerLayer("world", {
    categoryId: "main",
    group: "origin",
    name: "World",
    color: "#35d0d0",
    canvasType: "drag",
    viewportClass: "world-map",
    order: 1,
    startUnlocked: false,


    resources: ["greenEssence", "blueEssence"],

    initialState: {
        tiles: { "0,0": true },
        grass: {},
        terrain: {},
        moisture: {},
        snowpack: {},
        seenTerrain: {},
        selectedTile: null,

        selectedInteraction: "select",
        weatherKind: "rain",

        // What's currently falling, all of it decided by the release that started it
        weatherSeconds: 0,
        weatherTotal: 0,
        weatherTile: null,
        weatherPower: 0,
        weatherSoak: 0,
        weatherCeiling: 1,

        // The tiles picked around the selected one, waiting to be transformed with it
        transformFodder: [],

        // Tiles actively being razed
        razing: {},

        // Wildfires during the long summer challenge
        fires: {},
        fireSeed: 0,
        fireBurn: 0,
    },

    // Clock for the world
    onTick(dt, layer) {
        const s = getLayerState(layer.id);
        tickBuildup(s, dt);
        tickPrecipitation(s, dt);
        tickRaze(s, dt);
        tickFires(s, dt);
        if (coreNodeBought("grass")) tickGrass(dt);
    },

    overlay: (s) => (coreNodeBought("land") ? null : "The world is growing..."),

    attention: () => (coreNodeBought("land") ? ["land"] : []),

    tiles: {
        size: TILE_SIZE,
        list: () => mapTiles(),
        hidden: () => !coreNodeBought("land"),

        // Tiles cost more the more you own (price is in worldMap.js). Might change rain pricing
        cost: tileCost,

        // Counts the raze down on the tile itself, under the lock
        label(s, tile) {
            return isRazing(s, tile.id) ? `${Math.ceil(razeLeft(s, tile.id))}s` : "";
        },

        // Terrain replaces whatever was growing there
        content(s, tile) {
            const terrain = terrainOn(s, tile.id);
            const grass = grassOn(s, tile.id);
            const ground = terrain ? TERRAIN_ART[terrain] : grass ? GRASS_ART[grass.stage] : "";
            const falling = precipitatingOn(s, tile.id) ? fallingKind(s) : null;
            const weather = falling === "snow" ? SNOW_ART : falling ? RAIN_ART : "";
            return ground + (fireOn(s, tile.id) ? FIRE_ART : "") + weather;
        },

        tileClass(s, tile) {
            const grass = grassOn(s, tile.id);
            const terrain = terrainOn(s, tile.id);
            const transforming = transformActive(s);
            const fodder = transforming && isTransformFodder(s, tile.id);

            return [terrain ? `has-terrain terrain-${terrain}` : "",
                grass ? `has-grass grass-stage-${grass.stage}` : "",
                canPlant(s, tile.id) ? "can-plant" : "",
                precipitatingOn(s, tile.id) ? `has-weather has-${fallingKind(s)}` : "",
                s.selectedTile === tile.id ? "hex-selected" : "",
                fodder ? "transform-fodder" : "",
                transforming && !fodder && isTransformCandidate(s, tile.id) ? "transform-candidate" : "",
                isRazing(s, tile.id) ? "is-razing" : "",
                fireOn(s, tile.id) ? "is-burning" : "",
            ].filter(Boolean).join(" ") || null;
        },

        // Effects on tiles, like when it's being razed or selected for transformation
        tileVars(s, tile) {
            return {
                "--ground": `var(--ground-${terrainOn(s, tile.id) || "bare"})`,
                "--blade": activeType().color,
                "--moisture": moistureOn(s, tile.id).toFixed(2),
                "--snowpack": snowOn(s, tile.id).toFixed(2),
                "--pulse": transformActive(s) ? pulse() : "0",
                "--raze": razeProgress(s, tile.id).toFixed(3),
                "--burn": fireOn(s, tile.id).toFixed(3),
            };
        },

        tooltip(s, tile) {
            // With no grass on the map you have to sow it by hand (might change, it's annoying for other terrain)

            if (canPlant(s, tile.id)) return { cost: LAND_COST(), action: "Plant grass here" };

            const grass = grassOn(s, tile.id);
            const kind = tileKind(s, tile.id);
            const parts = [kind === "grass" ? `${STAGE_NAMES[grass.stage]} grass` : TERRAIN[kind].name];
            const wet = moistureOn(s, tile.id);
            const buried = snowOn(s, tile.id);
            const damp = grass ? dampGrowth(s, tile.id) : 1;
            const green = grassGreenOutput(s, tile.id);
            const soaked = oneSoakedBlue(s, tile.id);
            if (green > 0) parts.push(bonusNote("Green", green));
            if (soaked > 0) parts.push(bonusNote("Blue", soaked));
            const output = outputNote(s, tile.id);
            if (output) parts.push(output);

            // The other half of what water is worth happens over on its own page
            const elsewhere = elsewhereNote(s, tile.id, kind);
            if (elsewhere) parts.push(elsewhere);
            const state = [];
            if (wet > 0) state.push(`${Math.round(wet * 100)}% soaked${keptWetByMarsh(s, tile.id) ? ", kept wet by the marsh" : ""}`);
            if (buried > 0) state.push(`${Math.round(buried * 100)}% buried`);
            if (damp !== 1) state.push(`${deltaPercent(damp)} growth`);
            if (precipitatingOn(s, tile.id)) state.push(fallingKind(s) === "snow" ? "snowing" : "raining");
            if (isRazing(s, tile.id)) state.push(`being razed, ${Math.ceil(razeLeft(s, tile.id))}s left`);
            if (fireOn(s, tile.id)) state.push(`on fire, ${Math.round(fireOn(s, tile.id) * 100)}% burned`);
            if (state.length > 0) parts.push(state.join(", "));

            return parts.join("\n");
        },

        // Clicking a tile you own selects it
        onClick(s, tile, layer) {
            if (canPlant(s, tile.id)) {
                if (spend(LAND_COST())) plantGrass(s, tile.id);
                return;
            }
            if (transformActive(s)) {
                clickTransformTile(s, tile.id);
                return;
            }
            if (s.selectedTile === tile.id) clearTransform(s);
            else selectTile(s, tile.id);
        },

        // Buying a tile and selecting a tile are different, so unlocking one deselects whatever was selected before
        onUnlock(s) {
            clearTransform(s);
        },
    },

    // Clicking on a non-tile part of the map deselects as well
    onCanvasClick(s) {
        clearTransform(s);
    },

    // Drawer in the top right to select interactions with the world, selected option beside it
    hud: {
        build(el, s, layer) {
            el.innerHTML = `
                <div class="weather-dock">
                    <button class="weather-release" type="button"></button>
                    <button class="weather-jump" type="button">
                        <span class="weather-face"></span>
                        <span class="weather-lock">${WEATHER_LOCK}</span>
                        <span class="weather-meter"><span class="weather-meter-fill"></span></span>
                    </button>
                </div>
                <div class="world-hud-row">
                    <div class="hud-tool"></div>
                    <div class="hud-drawer open" title="Interactions">
                        <div class="hud-drawer-slide">
                            <div class="hud-drawer-panel"></div>
                            <button class="hud-drawer-handle" aria-label="Interactions">
                                <span class="hud-chevron">^</span>
                            </button>
                        </div>
                    </div>
                </div>
            `;

            el.querySelector(".weather-jump").addEventListener("click", () => {
                if (challengeBlocks("precipitation")) return; // Locked if the challenge that blocks precipitation
                switchToLayer("precipitation");
            });

            el.querySelector(".weather-release").addEventListener("click", () => releaseCloud());

            const drawer = el.querySelector(".hud-drawer");
            el.querySelector(".hud-drawer-handle")
                .addEventListener("click", () => drawer.classList.toggle("open"));

            const panel = el.querySelector(".hud-drawer-panel");
            for (const interaction of INTERACTIONS) {
                // Drawer is one icon wide, so it's just icons with the name in the hover tooltip
                const btn = document.createElement("button");
                btn.className = "hud-choice";
                btn.dataset.interaction = interaction.id; // update() shows/hides the dev ones by this
                setChoiceFace(btn, interaction);
                
                btn.addEventListener("click", () => {
                    getLayerState(layer.stateKey).selectedInteraction = interaction.id;
                });
                panel.appendChild(btn);
            }

            // One block per interaction, all built once and then shown or hidden
            const tool = el.querySelector(".hud-tool");
            tool.innerHTML = `
                <div class="tool-grow">
                    <button class="grow-button">${byId("grow").icon}</button>
                </div>
                <div class="tool-soak">
                    <button class="soak-button">${byId("soak").icon}</button>
                </div>
                <div class="tool-ground">
                    <button class="ground-button">${byId("ground").icon}</button>
                    <div class="ground-name"></div>
                </div>
                <div class="tool-transform transform-window">
                    <div class="transform-heading">Transform</div>
                    <div class="transform-preview"></div>
                    <div class="transform-note"></div>
                    <button class="transform-button">Transform</button>
                </div>
                <div class="tool-raze transform-window">
                    <div class="transform-heading">Raze</div>
                    <div class="raze-cost"></div>
                    <div class="transform-note raze-note"></div>
                    <button class="transform-button raze-button">Raze</button>
                </div>
            `;
            // Dev cheat, instantly grows a tile
            tool.querySelector(".grow-button").addEventListener("click", () => {
                const s = getLayerState(layer.stateKey);
                if (s.selectedTile) growFully(s, s.selectedTile);
            });

            // Dev cheat, fills the ground with moisture/snow, just barely not converting it
            tool.querySelector(".soak-button").addEventListener("click", () => {
                const s = getLayerState(layer.stateKey);
                if (!s.selectedTile) return;
                const kind = precipitationKind(s);
                soak(s, s.selectedTile, DEV_SOAK - buildupOn(s, s.selectedTile, kind), kind);
            });

            // Dev cheat, cycles the terrain
            tool.querySelector(".ground-button").addEventListener("click", () => {
                cycleGround(getLayerState(layer.stateKey));
            });
            
            // Transforms selected tiles
            el.querySelector(".transform-button").addEventListener("click", () => {
                applyTransform(getLayerState(layer.stateKey));
            });

            // Starts a tile on its way back to bare ground, paid for up front
            el.querySelector(".raze-button").addEventListener("click", () => {
                const s = getLayerState(layer.stateKey);
                if (!s.selectedTile || !canRaze(s, s.selectedTile)) return;
                if (spend(razeCost(s))) startRaze(s, s.selectedTile);
            });
        },

        update(el, s, layer) {
            const drawer = el.querySelector(".hud-drawer");
            const choices = availableInteractions();

            for (const btn of el.querySelectorAll(".hud-choice")) {
                setDisplay(btn, choices.some(i => i.id === btn.dataset.interaction));
                setChoiceFace(btn, byId(btn.dataset.interaction));
                btn.classList.toggle("active", btn.dataset.interaction === s.selectedInteraction);
            }
            drawer.style.setProperty("--choice-count", Math.max(1, choices.length));

            // Drawer is hidden until there's something in it
            setDisplay(drawer, choices.length > 0);

            if (!choices.some(i => i.id === s.selectedInteraction)) {
                s.selectedInteraction = choices.length ? choices[0].id : null;
            }

            updateWeatherJump(el, s);

            const showGrow = s.selectedInteraction === "grow";
            const showSoak = s.selectedInteraction === "soak";
            const showGround = s.selectedInteraction === "ground";
            const showTransform = s.selectedInteraction === "transform";
            const showRaze = s.selectedInteraction === "raze";
            setDisplay(el.querySelector(".hud-tool"),
                showGrow || showSoak || showGround || showTransform || showRaze);
            setDisplay(el.querySelector(".tool-grow"), showGrow);
            setDisplay(el.querySelector(".tool-soak"), showSoak);
            setDisplay(el.querySelector(".tool-ground"), showGround);
            setDisplay(el.querySelector(".tool-transform"), showTransform);
            setDisplay(el.querySelector(".tool-raze"), showRaze);
            if (showTransform) updateTransformWindow(el, s);
            else if ((s.transformFodder || []).length) s.transformFodder = [];
            if (showRaze) updateRazeWindow(el, s, layer);

            if (showSoak) {
                const soakButton = el.querySelector(".soak-button");

                // Enough precipitation transforms most terrain (snow on ice fields does nothing)
                const ready = !!s.selectedTile && !shedsPrecipitation(s, s.selectedTile, loadedKind());
                soakButton.classList.toggle("inactive", !ready);
                soakButton.title = !s.selectedTile ? "Select a tile to soak"
                    : ready ? `Fill this tile with ${PRECIPITATION[loadedKind()].name.toLowerCase()}, changing it on the spot`
                    : `That ground already sheds ${PRECIPITATION[loadedKind()].name.toLowerCase()}`;
            }

            if (showGround) {
                const kind = s.selectedTile ? tileKind(s, s.selectedTile) : null;
                const groundButton = el.querySelector(".ground-button");
                groundButton.classList.toggle("inactive", !s.selectedTile);
                groundButton.title = s.selectedTile
                    ? "Step this tile to the next kind of ground"
                    : "Select a tile to change";
                setText(el.querySelector(".ground-name"), kind ? TERRAIN[kind].name : "");
            }

            if (showGrow) {
                const grass = s.selectedTile ? grassOn(s, s.selectedTile) : null;
                const ready = !!grass && grass.stage !== MATURE;
                const growButton = el.querySelector(".grow-button");
                growButton.classList.toggle("inactive", !ready);
                growButton.title = !s.selectedTile ? "Select a tile to grow"
                    : !grass ? "Nothing is growing on that tile"
                    : ready ? "Grow this tile's grass to mature"
                    : "Already fully grown";
            }
        },
    },
});

const byId = (id) => INTERACTIONS.find(i => i.id === id);

// Not an interaction, so it stays put whichever one is picked
function updateWeatherJump(el, s) {
    const dock = el.querySelector(".weather-dock");
    setDisplay(dock, coreNodeBought("rain"));
    if (!coreNodeBought("rain")) return;

    const jump = el.querySelector(".weather-jump");
    const kind = loadedKind();
    const falling = isPrecipitating(s);
    const locked = challengeBlocks("precipitation");

    const release = el.querySelector(".weather-release");
    const releasable = canRelease(undefined, s);
    setText(release, PRECIPITATION[kind].name.toUpperCase());
    setDisplay(release, !locked);
    release.classList.toggle("inactive", !releasable);
    release.title = releasable
        ? `Release ${intensityName(pickedIntensity(), kind).toLowerCase()} on ${s.selectedTile}`
        : falling ? "Wait for the cloud to clear"
        : !s.selectedTile ? "Pick a tile for it to fall on"
        : "Not charged enough for the intensity it is set to";

    const face = jump.querySelector(".weather-face");
    if (face.__kind !== kind) { face.__kind = kind; face.innerHTML = PRECIPITATION_ICON[kind]; }

    setDisplay(jump.querySelector(".weather-lock"), locked);

    setWidth(jump.querySelector(".weather-meter-fill"),
        falling ? s.weatherSeconds / (s.weatherTotal || 1) : stabilityOf());
    jump.dataset.state = locked ? "locked"
        : falling ? "falling" : canRelease(undefined, s) ? "ready" : "filling";

    const weather = PRECIPITATION[kind].name;
    jump.title = locked
        ? "The drought has the weather shut, and nothing falls until it is over"
        : falling
        ? `${PRECIPITATION[fallingKind(s)].name} on ${s.weatherTile}, ${Math.ceil(s.weatherSeconds)}s left`
        : canRelease(undefined, s) ? `Full. Open ${weather} to let it go on ${s.selectedTile}`
        : readyIndex() < 0 ? `Open ${weather} to start filling the cloud`
        : !s.selectedTile ? "Pick a tile for it to fall on"
        : `Open ${weather}. It is not charged enough for the intensity it is set to`;
}

function setChoiceFace(btn, interaction) {
    if (!interaction || btn.__face) return;
    btn.__face = true;

    btn.title = interaction.name;
    btn.setAttribute("aria-label", interaction.name);
    btn.innerHTML = interaction.icon;
}


// !!! TRANSFORMATION THINGS !!!

const transformActive = (s) => s.selectedInteraction === "transform" && coreNodeBought("environment");
const PULSE_SECONDS = 1.6;
const pulse = () =>
    (0.5 - 0.5 * Math.cos((performance.now() / (PULSE_SECONDS * 1000)) * Math.PI * 2)).toFixed(2);

// The window on the right while transform is selected
function updateTransformWindow(el, s) {
    const kinds = transformInputs(s);
    const recipe = matchedTransform(s);
    // A matched recipe you haven't unlocked yet reads differently from one you have
    const locked = !!recipe && !transformAvailable(recipe, s);
    // Not the same thing as locked, and shown differently
    const ready = transformReady(s);
    const signature = `${kinds.join("|")}::${recipe ? recipe.id : ""}::${locked}::${ready}`;

    const preview = el.querySelector(".transform-preview");
    if (preview.__signature !== signature) {
        preview.__signature = signature;
        preview.innerHTML = previewMarkup(kinds, recipe, locked);
        setText(el.querySelector(".transform-note"), noteFor(kinds, recipe, locked, ready, s));
    }

    el.querySelector(".transform-button").classList.toggle("inactive", !recipe || locked || !ready);
}

function previewMarkup(kinds, recipe, locked) {
    if (kinds.length === 0) return `<div class="transform-empty">Nothing selected</div>`;

    const inputs = kinds.map(kind => kindChip(kind)).join(`<span class="transform-plus">+</span>`);
    const result = !recipe ? unknownChip()
        : locked ? lockedChip()
        : kindChip(recipe.output, "transform-result");

    return `
        <div class="transform-inputs">${inputs}</div>
        <div class="transform-arrow">↓</div>
        <div class="transform-outputs">${result}</div>
    `;
}

const unknownChip = () => `
    <div class="transform-chip transform-unknown">
        <div class="transform-chip-art"><span class="transform-question">?</span></div>
        <div class="transform-chip-name">Nothing</div>
    </div>`;

const lockedChip = () => `
    <div class="transform-chip transform-locked">
        <div class="transform-chip-art">${LOCK_GLYPH}</div>
        <div class="transform-chip-name">Locked</div>
    </div>`;

const LOCK_GLYPH = `
    <svg class="transform-lock" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M5 7.4V5a3 3 0 0 1 6 0v2.4"/>
        <rect x="3.4" y="7.4" width="9.2" height="6.4" rx="1.3"/>
    </svg>`;

// The window on the right while raze is selected
function updateRazeWindow(el, s, layer) {
    const cost = razeCost(s);
    setRichText(el.querySelector(".raze-cost"),
        `${namedResourceSpan("greenEssence", `${formatNumber(cost.greenEssence)} Green`)}`
        + ` + ${namedResourceSpan("blueEssence", `${formatNumber(cost.blueEssence)} Blue`)}`);

    const id = s.selectedTile;
    const affordable = canAfford(cost);
    const ready = !!id && canRaze(s, id) && affordable;

    const button = el.querySelector(".raze-button");
    button.classList.toggle("inactive", !ready);
    button.title = ready ? "Take this tile back to bare ground" : "";

    setText(el.querySelector(".raze-note"), razeNote(s, id, affordable));
}

function razeNote(s, id, affordable) {
    if (!id) return "Select a tile to raze.";
    if (isRazing(s, id)) return `Being razed, ${Math.ceil(razeLeft(s, id))}s of ${RAZE_SECONDS}s left.`;
    if (tileKind(s, id) === "bare") return "That tile is already bare ground.";
    if (!affordable) return "Not enough to pay for it yet.";
    return `${TERRAIN[tileKind(s, id)].name} goes back to bare ground`
        + ` over ${RAZE_SECONDS / 60} minutes.`;
}

function noteFor(kinds, recipe, locked, ready, s) {
    if (kinds.length === 0) return "Select a tile to change.";
    if (!ready) return "Grass has to be fully grown before it can be transformed.";
    if (!recipe) return kinds.length === 1
        ? "Pick from the flashing tiles around it."
        : "Nothing comes of this combination.";
    if (locked) return `These do make something. ${transformHint(recipe, s)}`;
    return `${recipe.text} ${fodderNote(recipe)}`;
}
