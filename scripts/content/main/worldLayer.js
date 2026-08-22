// worldLayer.js
//
// The view of the world map. Only shows some text until the land unlock is bought, then it
// shows hex tiles, their costs, and what's drawn on them.
//
// Map shape/size and rules for what can be on tiles is in worldMap.js, this is just the view


import { registerLayer } from "../../core/registry.js";
import { state, getLayerState } from "../../core/state.js";
import { spend } from "../../core/resources.js";
import { switchToLayer } from "../../render/canvasRouter.js";
import {
    mapTiles, TILE_SIZE, STAGE_NAMES, MATURE, LAND_COST, TERRAIN, grassOn, tileCost, canPlant, plantGrass,
    growFully, tickGrass, tickPrecipitation, tickBuildup,
    PRECIPITATION, precipitationKind,
    isPrecipitating, precipitatingOn, fallingKind, snowOn, shedsPrecipitation,
    terrainOn, moistureOn, tileKind, soak, setTerrain, selectTile, clearTransform, dampGrowth,
    clickTransformTile, isTransformCandidate, isTransformFodder, transformInputs,
    matchedTransform, applyTransform, transformAvailable, transformHint, transformReady, fodderNote,
} from "./worldMap.js";
import { TERRAIN_ART, kindChip } from "./terrainArt.js";
import { activeType } from "./grassSublayer.js";
// The cloud is charged and let go on its own page. All the map keeps is the thing drifting over
// it, which says how the cloud is doing and is the way back to that page.
import { fillOf, readyIndex, canRelease } from "./precipitationSublayer.js";

const landBought = () => !!getLayerState("cores").purchasedUpgrades.land;
const grassBought = () => !!getLayerState("cores").purchasedUpgrades.grass;
const rainBought = () => !!getLayerState("cores").purchasedUpgrades.rain;
const environmentBought = () => !!getLayerState("cores").purchasedUpgrades.environment;

// One drawing per growth stage, scaling with whatever tile size is set to.
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

// Rain falling on a tile. Doesn't matter what's in the tile, this is drawn on top of it.
const RAIN_ART = `
    <svg class="tile-rain" viewBox="0 0 40 40" aria-hidden="true">
        <path class="tile-raindrop" d="M11 6 L9 13"/>
        <path class="tile-raindrop" d="M20 4 L18 12"/>
        <path class="tile-raindrop" d="M29 7 L27 14"/>
        <path class="tile-raindrop" d="M15 16 L13 23"/>
        <path class="tile-raindrop" d="M25 18 L23 25"/>
    </svg>`;

// Snow falling on a tile. Same as above, it draws on top of it.
const SNOW_ART = `
    <svg class="tile-snow" viewBox="0 0 40 40" aria-hidden="true">
        <circle class="tile-snowflake" cx="10" cy="7" r="1.5"/>
        <circle class="tile-snowflake" cx="20" cy="5" r="1.2"/>
        <circle class="tile-snowflake" cx="29" cy="8" r="1.4"/>
        <circle class="tile-snowflake" cx="15" cy="17" r="1.2"/>
        <circle class="tile-snowflake" cx="25" cy="19" r="1.5"/>
        <circle class="tile-snowflake" cx="33" cy="15" r="1.1"/>
    </svg>`;

// The cloud for the precipitation icon.
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

// Manual interactions the player can do on the map.
const INTERACTIONS = [
    // Merge/transform tiles into other ones. Interaction is in the transform window thing.
    { id: "transform", name: "Transform", available: () => environmentBought(), icon: `
        <svg class="interaction-icon" viewBox="0 0 32 32" aria-hidden="true">
            <path class="transform-hex" d="M11 4 L18 7.5 L18 15.5 L11 19 L4 15.5 L4 7.5 Z"/>
            <path class="transform-hex transform-hex-to" d="M21 13 L28 16.5 L28 24.5 L21 28 L14 24.5 L14 16.5 Z"/>
            <path class="transform-swap" d="M20 8.5 C25 8.5 26.5 10 26.5 13"/>
            <path class="transform-swap" d="M24 11.5 L26.5 13.5 L28.5 11"/>
        </svg>` },

    // Dev cheat, just uses the tiles' own grass classes.
    { id: "grow", name: "Grow grass (dev)", available: () => devInteractions(), icon: `
        <svg class="interaction-icon" viewBox="0 0 32 32" aria-hidden="true">
            <ellipse class="grass-soil" cx="13" cy="26" rx="9" ry="2.6"/>
            <path class="grass-blade" d="M13 26 C11.6 21 12.4 17 11 13"/>
            <path class="grass-blade" d="M13 26 C14.6 22 15.8 19 17.8 15.5"/>
            <path class="grass-blade" d="M13 26 C10.4 23.5 8.4 21 7 18"/>
            <path class="grow-arrow" d="M26 24 L26 12"/>
            <path class="grow-arrow" d="M23 15 L26 12 L29 15"/>
        </svg>` },

    // Dev cheat, soaks a tile instantly.
    { id: "soak", name: "Soak tile (dev)", available: () => devInteractions(), icon: `
        <svg class="interaction-icon" viewBox="0 0 32 32" aria-hidden="true">
            <ellipse class="terrain-pool" cx="16" cy="22" rx="11" ry="6"/>
            <path class="raindrop" d="M16 4 L16 13"/>
            <path class="raindrop" d="M13 10 L16 13.5 L19 10"/>
        </svg>` },

    // Dev cheat, cycles a tile through the list of tiles.
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
    // Grass isn't in the list of tiles cause it's weird, so this just does it first.
    const at = Math.max(0, GROUND_RING.indexOf(tileKind(s, s.selectedTile)));
    setTerrain(s, s.selectedTile, GROUND_RING[(at + 1) % GROUND_RING.length]);
}

const devInteractions = () => !!state.settings.showDevInteractions;
const availableInteractions = () => INTERACTIONS.filter(i => i.available());

// Which kind of precipitation the cloud is loaded with.
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


    resources: {
        greenEssence: { name: "Green Essence", color: "#3aa876", from: "cores" },
        blueEssence: { name: "Blue Essence", color: "#4a90d9", from: "cores" },
    },

    initialState: {
        tiles: { "0,0": true }, // Map starts with only the center tile unlocked.
        grass: {}, // Is the tile grassy.
        terrain: {}, // What type is the tile (forest, ocean, etc.)
        moisture: {}, // How close is the tile to turning into a water tile.
        snowpack: {}, // Same but for snow.
        seenTerrain: {}, // Every kind of ground that has ever been on the map, made or not still there.
        selectedTile: null,

        // Which interaction is picked out of the drawer, and some stuff based on what that they do.
        selectedInteraction: "transform", // Reset to whatever is actually unlocked on the first render
        weatherKind: "rain", // Rain or snow, precipitation layer is where you switch them.

        // What's currently falling, all of it decided by the release that started it.
        weatherSeconds: 0,
        weatherTotal: 0,
        weatherTile: null,
        weatherPower: 0,  // What the event is worth to the tile, one being an ordinary full cloud.
        weatherSoak: 0,   // Water it still owes the ground, handed over across the whole event.

        // The tiles picked around the selected one, waiting to be transformed with it.
        transformFodder: [],
    },

    // Clock for the world. Here instead of land layer because drawing tiles here is what mostly (kinda) needs it.
    onTick(dt, layer) {
        const s = getLayerState(layer.id);
        tickBuildup(s, dt);
        tickPrecipitation(s, dt);
        if (grassBought()) tickGrass(dt);
    },

    overlay: (s) => (landBought() ? null : "The world is growing..."),

    attention: () => (landBought() ? ["land"] : []),

    tiles: {
        size: TILE_SIZE,
        list: () => mapTiles(),
        hidden: () => !landBought(),

        // Tiles cost more based on how many you own. Price is in worldMap.js since rain price is based on it.
        cost: tileCost,

        // Terrain replaces whatever was growing there, so it's one or the other rather than
        // both stacked up. Weather goes on top of either.
        content(s, tile) {
            const terrain = terrainOn(s, tile.id);
            const grass = grassOn(s, tile.id);
            const ground = terrain ? TERRAIN_ART[terrain] : grass ? GRASS_ART[grass.stage] : "";
            const falling = precipitatingOn(s, tile.id) ? fallingKind(s) : null;
            return ground + (falling === "snow" ? SNOW_ART : falling ? RAIN_ART : "");
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
            ].filter(Boolean).join(" ") || null;
        },

        tileVars(s, tile) {
            return {
                "--ground": `var(--ground-${terrainOn(s, tile.id) || "bare"})`,
                // Whichever grass is being grown, so picking one is visible on the map itself.
                "--blade": activeType().color,
                "--moisture": moistureOn(s, tile.id).toFixed(2),
                "--snowpack": snowOn(s, tile.id).toFixed(2),
                "--pulse": transformActive(s) ? pulse() : "0",
            };
        },

        tooltip(s, tile) {
            // If no grass is in the world, you need to sow it manually.
            // !!!! THIS MIGHT CHANGE IDK !!!!
            if (canPlant(s, tile.id)) return { cost: LAND_COST(), action: "Plant grass here" };

            const grass = grassOn(s, tile.id);
            const kind = tileKind(s, tile.id);
            const parts = [kind === "grass" ? `${STAGE_NAMES[grass.stage]} grass` : TERRAIN[kind].name];
            const wet = moistureOn(s, tile.id);
            const buried = snowOn(s, tile.id);
            const damp = grass ? dampGrowth(s, tile.id) : 1;
            if (wet > 0) {
                parts.push(`${Math.round(wet * 100)}% soaked`
                    + (damp === 1 ? "" : ` (${damp > 1 ? "+" : ""}${Math.round((damp - 1) * 100)}% growth)`));
            }
            if (buried > 0) parts.push(`${Math.round(buried * 100)}% buried`);
            if (precipitatingOn(s, tile.id)) parts.push(fallingKind(s) === "snow" ? "snowing" : "raining");
            return parts.join(" - ");
        },

        // Clicking a tile you own selects it.
        onClick(s, tile, layer) {
            if (canPlant(s, tile.id)) {
                if (spend(layer, LAND_COST())) plantGrass(s, tile.id);
                return;
            }
            if (transformActive(s)) {
                clickTransformTile(s, tile.id);
                return;
            }
            if (s.selectedTile === tile.id) clearTransform(s);
            else selectTile(s, tile.id);
        },

        // Buying a tile and selecting a tile are different, so unlocking one deselects whatever was selected before.
        onUnlock(s) {
            clearTransform(s);
        },
    },

    // Clicking on a non-tile part of the map deselects as well.
    onCanvasClick(s) {
        clearTransform(s);
    },

    // Drawer in the top right to select interactions with the world, selected option beside it.
    hud: {
        build(el, s, layer) {
            el.innerHTML = `
                <button class="weather-jump" type="button">
                    <span class="weather-face"></span>
                    <span class="weather-meter"><span class="weather-meter-fill"></span></span>
                </button>
                <div class="world-hud-row">
                    <div class="hud-tool"></div>
                    <div class="hud-drawer" title="Interactions">
                        <div class="hud-drawer-slide">
                            <div class="hud-drawer-panel"></div>
                            <button class="hud-drawer-handle" aria-label="Interactions">
                                <span class="hud-chevron">^</span>
                            </button>
                        </div>
                    </div>
                </div>
            `;

            el.querySelector(".weather-jump")
                .addEventListener("click", () => switchToLayer("precipitation"));

            const drawer = el.querySelector(".hud-drawer");
            el.querySelector(".hud-drawer-handle")
                .addEventListener("click", () => drawer.classList.toggle("open"));

            const panel = el.querySelector(".hud-drawer-panel");
            for (const interaction of INTERACTIONS) {
                // Drawer is one icon wide, so it's just icons with the name in the hover tooltip.
                const btn = document.createElement("button");
                btn.className = "hud-choice";
                btn.dataset.interaction = interaction.id; // update() shows/hides the dev ones by this
                setChoiceFace(btn, interaction);
                // Picking one closes the drawer.
                btn.addEventListener("click", () => {
                    getLayerState(layer.stateKey).selectedInteraction = interaction.id;
                    drawer.classList.remove("open");
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
            `;
            // Dev cheat, instantly grows a tile
            tool.querySelector(".grow-button").addEventListener("click", () => {
                const s = getLayerState(layer.stateKey);
                if (s.selectedTile) growFully(s, s.selectedTile);
            });

            // Dev cheat, fills the ground up instantly - with whichever kind is loaded, so it
            // cheats past the same wait the player would otherwise be sitting through.
            tool.querySelector(".soak-button").addEventListener("click", () => {
                const s = getLayerState(layer.stateKey);
                if (s.selectedTile) soak(s, s.selectedTile, 1, precipitationKind(s));
            });

            // Dev cheat, cycles the terrain
            tool.querySelector(".ground-button").addEventListener("click", () => {
                cycleGround(getLayerState(layer.stateKey));
            });
            
            // Transforms selected tiles
            el.querySelector(".transform-button").addEventListener("click", () => {
                applyTransform(getLayerState(layer.stateKey));
            });
        },

        update(el, s, layer) {
            const drawer = el.querySelector(".hud-drawer");
            const choices = availableInteractions();

            for (const btn of el.querySelectorAll(".hud-choice")) {
                setDisplay(btn, choices.some(i => i.id === btn.dataset.interaction));
                setChoiceFace(btn, byId(btn.dataset.interaction));
            }
            drawer.style.setProperty("--choice-count", Math.max(1, choices.length));

            // Drawer is hidden until there's something in it.
            setDisplay(drawer, choices.length > 0);

            if (!choices.some(i => i.id === s.selectedInteraction)) {
                s.selectedInteraction = choices.length ? choices[0].id : null;
            }

            updateWeatherJump(el, s);

            const showGrow = s.selectedInteraction === "grow";
            const showSoak = s.selectedInteraction === "soak";
            const showGround = s.selectedInteraction === "ground";
            const showTransform = s.selectedInteraction === "transform";
            setDisplay(el.querySelector(".hud-tool"), showGrow || showSoak || showGround || showTransform);
            setDisplay(el.querySelector(".tool-grow"), showGrow);
            setDisplay(el.querySelector(".tool-soak"), showSoak);
            setDisplay(el.querySelector(".tool-ground"), showGround);
            setDisplay(el.querySelector(".tool-transform"), showTransform);
            if (showTransform) updateTransformWindow(el, s);
            else if ((s.transformFodder || []).length) s.transformFodder = [];

            if (showSoak) {
                const soakButton = el.querySelector(".soak-button");
                // Enough precipitation will transform any terrain, but some doesn't (e.g. snow falling on ice fields won't do anything)
                const ready = !!s.selectedTile && !shedsPrecipitation(s, s.selectedTile, loadedKind());
                soakButton.classList.toggle("inactive", !ready);
                soakButton.title = !s.selectedTile ? "Select a tile to soak"
                    : ready ? `Fill this tile with ${PRECIPITATION[loadedKind()].name.toLowerCase()} - it changes on the spot`
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

// Not an interaction, so it stays put whichever one is picked.
function updateWeatherJump(el, s) {
    const jump = el.querySelector(".weather-jump");
    setDisplay(jump, rainBought());
    if (!rainBought()) return;

    const kind = loadedKind();
    const falling = isPrecipitating(s);

    const face = jump.querySelector(".weather-face");
    if (face.__kind !== kind) { face.__kind = kind; face.innerHTML = PRECIPITATION_ICON[kind]; }

    setWidth(jump.querySelector(".weather-meter-fill"),
        falling ? s.weatherSeconds / (s.weatherTotal || 1) : fillOf());
    jump.dataset.state = falling ? "falling" : canRelease(undefined, s) ? "ready" : "filling";

    const weather = PRECIPITATION[kind].name;
    jump.title = falling
        ? `${PRECIPITATION[fallingKind(s)].name} on ${s.weatherTile}, ${Math.ceil(s.weatherSeconds)}s left`
        : canRelease(undefined, s) ? `Full. Open ${weather} to let it go on ${s.selectedTile}`
        : readyIndex() < 0 ? `Open ${weather} to start filling the cloud`
        : !s.selectedTile ? "Pick a tile for it to fall on"
        : `Open ${weather} - not charged enough for the intensity it is set to`;
}

function setChoiceFace(btn, interaction) {
    if (!interaction || btn.__face) return;
    btn.__face = true;

    btn.title = interaction.name;
    btn.setAttribute("aria-label", interaction.name);
    btn.innerHTML = interaction.icon;
}

// Transformation things
const transformActive = (s) => s.selectedInteraction === "transform" && environmentBought();
const PULSE_SECONDS = 1.6;
const pulse = () =>
    (0.5 - 0.5 * Math.cos((performance.now() / (PULSE_SECONDS * 1000)) * Math.PI * 2)).toFixed(2);

// The window on the right while transform is selected
function updateTransformWindow(el, s) {
    const kinds = transformInputs(s);
    const recipe = matchedTransform(s);
    // A matched recipe you haven't unlocked yet reads differently from one you have.
    const locked = !!recipe && !transformAvailable(recipe, s);
    // Not the same thing as locked, and shown differently.
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

function noteFor(kinds, recipe, locked, ready, s) {
    if (kinds.length === 0) return "Select a tile to change.";
    if (!ready) return "Grass has to be fully grown before it can be transformed.";
    if (!recipe) return kinds.length === 1
        ? "Pick from the flashing tiles around it."
        : "Nothing comes of this combination.";
    if (locked) return `These do make something. ${transformHint(recipe, s)}`;
    // What happens to the fodder is the part worth spelling out - it's the difference between
    // spending the tiles and keeping them, and between spending them and only spending them
    // part of the way back down. The wording comes from the rules rather than from here, so
    // this and the reference page can't tell the player two different things.
    return `${recipe.text} ${fodderNote(recipe)}`;
}

function setDisplay(el, shown) {
    const display = shown ? "" : "none";
    if (el.style.display !== display) el.style.display = display;
}

function setText(el, text) {
    if (el.textContent !== text) el.textContent = text;
}

function setWidth(el, fraction) {
    const width = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
    if (el.style.width !== width) el.style.width = width;
}
