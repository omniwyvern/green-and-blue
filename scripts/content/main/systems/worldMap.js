// worldMap.js
//
// World map data (grass is still a modifier on a tile rather than its own tile, as a relic)

import { state, getLayerState } from "../../../core/state.js";
import { levelsIn, productionRate } from "../../../core/resources.js";
import { coreNodeBought, nodeBought } from "../../../core/nodes.js";
import { D } from "../../../utils/decimal.js";
import { hexesWithin, neighborsOf } from "../../../utils/hex.js";
import { cardBonus, cardActive } from "./cards.js";
import { traitBonus, traitHas, pastCapGain } from "./evolutionTraits.js";
import {
    grassSpeedMultiplier, grassOutputMultiplier, earnSpreadGrowth, earnStageGrowth, grassSeedStart,
} from "../sublayers/grassSublayer.js";
import { addCharge, driftingEvent, soakHold } from "../sublayers/precipitationSublayer.js";
import { challengeMod, challengeBlocks, challengeDone, activeChallenge } from "./challenges.js";


//    !!! THE MAP ITSELF !!!

export const BASE_MAP_RADIUS = 1;   // Radius 1 is a center tile and one on each of its six faces
export const TILE_SIZE = 60;    // Center to corner, in canvas units

// Layers increase map size themselves, so worldMap doesn't need to know what changes radius
const radiusSources = new Map();
export const contributeMapRadius = (id, amount) => radiusSources.set(id, amount);
export const mapRadius = () => BASE_MAP_RADIUS
    + [...radiusSources.values()].reduce((total, amount) => total + amount(), 0);

// The map is rebuilt whenever the radius changes
let builtRadius = null;
let MAP = [];
let IN_MAP = new Set();

// Transformations work in tile ids (that's what a selection is)
let TILE_BY_ID = new Map();

export function mapTiles() {
    const radius = mapRadius();
    if (radius !== builtRadius) {
        builtRadius = radius;
        MAP = hexesWithin(radius);
        IN_MAP = new Set(MAP.map(t => t.id));
        TILE_BY_ID = new Map(MAP.map(t => [t.id, t]));
    }
    return MAP;
}

export const tileById = (id) => (mapTiles(), TILE_BY_ID.get(id) || null);
export const ORIGIN_TILE = "0,0"; // The middle tile, where anything without a place of its own starts


//    !!! HOW GRASS GROWS UP !!!

export const SEED = 0, GROWING = 1, MATURE = 2;
export const STAGE_NAMES = ["Seed", "Growing", "Mature"];
const STAGE_SECONDS = [30, 20, 10];
export const STAGE_BONUS = [0, 0.25, 1];

export const OUTPUT_PER_LEVEL = 0.2;   // Bonus per level of greener blades
export const ADJACENT_SHARE = 0.1;
export const GROWTH_PER_LEVEL = 0.1;


//    !!! WHAT GROUND COSTS !!!

export const LAND_COST = () => ({ greenEssence: D(2e6), blueEssence: D(2e6) });

// Each ring is priced for when it opens: first tile cost, then scaling per tile
const RING_PRICES = [
    { first: D(1.5e6), scale: D(2.5) },
    { first: D(1e10), scale: D(1.8) },
    { first: D(2e24), scale: D(4.2) },
];

// Ring r holds 6r tiles, with 1 + 3r(r - 1) inside it
const ringStart = (ring) => 1 + 3 * ring * (ring - 1);

function nthTilePrice(count) {
    let ring = 1;
    while (count >= ringStart(ring + 1)) ring++;
    const last = RING_PRICES.length - 1;
    if (ring - 1 > last) {
        const { first, scale } = RING_PRICES[last];
        return first.mul(scale.pow(count - ringStart(last + 1)));
    }
    const { first, scale } = RING_PRICES[ring - 1];
    return first.mul(scale.pow(Math.max(0, count - ringStart(ring))));
}

export const tileCost = (s) => ({ greenEssence: nthTilePrice(claimedTiles(s).length) });

// Clouds and razing stay on one smooth curve by tile count, so a new ring doesn't jump their price
const TILE_BASE_COST = D(2e5);
const TILE_COST_SCALE = D(2.5);
const smoothTilePrice = (count) => TILE_BASE_COST.mul(TILE_COST_SCALE.pow(count));

// What the tile before the most recent one cost on that curve, for the cost of razing
export const previousTilePrice = (s) => smoothTilePrice(Math.max(0, claimedTiles(s).length - 3));

export const RAZE_SECONDS = 120;


//    !!! RAIN AND SNOW !!!

export const PRECIPITATION = {
    rain: {
        name: "Rain",
        store: "moisture",
        becomes: "water",    // What it turns into after 100% moisture
        floods: "pond",      // What it leaves instead with the saturation card
        makes: "water",      // What the precipitation is made of, some tiles shed a type
        growsGrass: true,    // Grass growth speeds up if it's being rained on
    },
    snow: {
        name: "Snow",
        store: "snowpack",
        becomes: "snow",
        floods: "ice-field",
        makes: "ice",
        growsGrass: false,
    },
};

export const PRECIPITATION_KINDS = Object.keys(PRECIPITATION);

// Which kind of precipitation is loaded. Falls back to rain so a save before snow doesn't cause problems
export const precipitationKind = (s) =>
    challengeBlocks("snowOnly") ? "snow" : (kindChoosable(s.weatherKind) ? s.weatherKind : "rain");

// Snow waits for the ice field, outside of the challenge that forces it
export const kindChoosable = (kind) => !!PRECIPITATION[kind] && (kind !== "snow" || nodeBought("environment", "iceField"));

export const PRECIPITATION_SECONDS = 25;

export const PRODUCTION_BOOST = 0.25;

// During a challenge, clouds are priced off Blue Essence income instead
const CHALLENGE_CLOUD_SECONDS = 150;
const tilePricedCharge = (s) => smoothTilePrice(claimedTiles(s).length);
const chargePrice = (s) => activeChallenge()
    ? tilePricedCharge(s).min(productionRate("blueEssence").mul(CHALLENGE_CLOUD_SECONDS).max(TILE_BASE_COST))
    : tilePricedCharge(s);

export const chargeCost = (s) =>
    // Divided rather than subtracted, so clouds don't end up free post-upgrades
    chargePrice(s).div(1 + cardBonus("rainCost"));


//    !!! SOAKING AND DRYING OUT !!!

// Bare ground, water and snow need one; everything else needs 3/4/5 by tier unless the tile overrides it
export const ACTIVATIONS_BY_TIER = [1, 3, 4, 5];

export const tierOf = (kind) => TERRAIN[kind].tier || 0;
export const activationsForKind = (kind) => TERRAIN[kind].activations || ACTIVATIONS_BY_TIER[tierOf(kind)];

export const shedsPrecipitation = (s, id, kind) =>
    TERRAIN[tileKind(s, id)].madeOf === PRECIPITATION[kind].makes;


export const BUILDUP_LOST_PER_SECOND = 0.002;
const DRY_RAMP = 2.5;     // How much faster an empty tile dries than a full one
export const dryingRate = (buildup) =>
    BUILDUP_LOST_PER_SECOND * (1 + DRY_RAMP * (1 - buildup)) * challengeMod("drying") * soakHold() * (coreNodeBought("envGroundwater") && buildup > 0.5 ? 0.75 : 1) * (1 - Math.min(0.9, cardBonus("slowDrying")));
export const DRYING_SECONDS = Math.log(1 + DRY_RAMP) / (BUILDUP_LOST_PER_SECOND * DRY_RAMP);


// Makes sure that buildup accounts for natural loss, but doesn't fully give a discount
const buildupAim = (activations) => Math.max(
    1 / (1 + (activations - 1) * 20 * BUILDUP_LOST_PER_SECOND),
    (activations - 1) / (activations * 95),
);

// What a whole tile's worth of buildup really costs, drain between clouds included
export const soakScaleForKind = (kind) => {
    const activations = activationsForKind(kind);
    return activations * buildupAim(activations);
};
export const soakScale = (s, id) => soakScaleForKind(tileKind(s, id));

// How much a cloud is worth to ground that is already wet, only matters for the production boost
const SATURATION = 0.09;        // How full the ground has to be for a cloud to be worth half
const SATURATION_POWER = 1.5;   // How sharply it falls away past that
export const wetnessFactor = (s, id, kind) =>
    1 / (1 + Math.pow(buildupOn(s, id, kind) / SATURATION, SATURATION_POWER));


//    !!! THE KINDS OF GROUND !!!

export const TERRAIN = {
    // Precursor terrain to proper tiles
    bare:   { name: "Bare ground", stored: false, tier: 0 },
    grass:  { name: "Grass",       stored: false, tier: 1, activations: 2 },
    water:  { name: "Water",       stored: true,  tier: 0, madeOf: "water" },
    snow:   { name: "Snow",        stored: true,  tier: 0, madeOf: "ice" },

    // Aquatic, ignores rain
    pond:         { name: "Pond",       stored: true, tier: 1, madeOf: "water", family: "aquatic" },
    ocean:        { name: "Ocean",      stored: true, tier: 2, madeOf: "water", family: "aquatic" },
    "deep-ocean": { name: "Deep Ocean", stored: true, tier: 3, madeOf: "water", family: "aquatic" },

    // Reefs, ignores water
    reef:         { name: "Reef",       stored: true, tier: 1, madeOf: "water", family: "reef" },
    "coral-reef": { name: "Coral Reef", stored: true, tier: 2, madeOf: "water", family: "reef" },
    "great-reef": { name: "Great Reef", stored: true, tier: 3, madeOf: "water", family: "reef" },

    // Woodland, doesn't ignore either precipitation
    forest:           { name: "Forest",         stored: true, tier: 1, family: "woodland" },
    "dense-forest":   { name: "Dense Forest",   stored: true, tier: 2, family: "woodland" },
    "ancient-forest": { name: "Ancient Forest", stored: true, tier: 3, family: "woodland" },

    // Ice, ignores.. ice
    "ice-field": { name: "Ice Field", stored: true, tier: 1, madeOf: "ice", family: "ice" },
    glacier:     { name: "Glacier",   stored: true, tier: 2, madeOf: "ice", family: "ice" },
    "ice-cap":   { name: "Ice Cap",   stored: true, tier: 3, madeOf: "ice", family: "ice" },

    // Wetlands, ignores water
    marsh:    { name: "Marsh",     stored: true, tier: 1, madeOf: "water", family: "wetlands" },
    swamp:    { name: "Swamp",     stored: true, tier: 2, madeOf: "water", family: "wetlands" },
    mangrove: { name: "Mangrove",  stored: true, tier: 3, madeOf: "water", family: "wetlands" },

    // Fungi, doesn't ignore either precipitation.
    "mushroom-grove":   { name: "Mushroom Grove",   stored: true, tier: 1, family: "fungus" },
    "fungal-forest":    { name: "Fungal Forest",    stored: true, tier: 2, family: "fungus" },
    "mycelial-network": { name: "Mycelial Network", stored: true, tier: 3, family: "fungus" },
};

// The tile families, as { kind: tier }
const familyOf = (name) => Object.fromEntries(Object.entries(TERRAIN)
    .filter(([, def]) => def.family === name)
    .map(([kind, def]) => [kind, def.tier]));

export const AQUATIC_KINDS = familyOf("aquatic");
export const REEF_KINDS = familyOf("reef");
export const WOODLAND_KINDS = familyOf("woodland");
export const ICE_KINDS = familyOf("ice");
export const WETLANDS_KINDS = familyOf("wetlands");
export const FUNGUS_KINDS = familyOf("fungus");

// What the tiles produce
export const TERRAIN_OUTPUT = {};
const outputSources = new Map();
const neighborSources = new Map();


// kind's payout per second as { resourceId: amount }
export const contributeTileOutput = (kind, amount) => outputSources.set(kind, amount);

// Multiplier a tile contributes to its neighbors
export const contributeNeighborBoost = (id, amount) => neighborSources.set(id, amount);

export function neighborBoost(s, id) {
    let total = 1;
    for (const amount of neighborSources.values()) total *= amount(s, id) || 1;
    return total;
}

// Everything one tile makes per second before weather and the grass around it
export function tileOutput(s, id) {
    const kind = tileKind(s, id);
    const source = outputSources.get(kind);
    return { ...(TERRAIN_OUTPUT[kind] || {}), ...(source ? source(s, id) : {}) };
}


//    !!! TRANSFORMATIONS !!!

const needsCore = (node, name) => ({
    prereq: () => coreNodeBought(node),
    hint: () => "Something has to be unlocked first...",
});

const needsChallenge = (challenge, name) => ({
    prereq: () => challengeDone(SUBLAYER_CHALLENGES[challenge]),
    hint: () => "Something has to be unlocked first...",
});

export const SUBLAYER_CHALLENGES = {
    marsh: "waterlogged",
    swamp: "iceAge",
    mangrove: "iceAge",
    reef: "clearwater",
    coralReef: "iceAge",
    greatReef: "iceAge",
    iceField: "longWinter",
    glacier: "iceAge",
    iceCap: "iceAge",
    mushroomGrove: "deadfall",

};


// consumes: true spends fodder to bare ground, false converts it, leaves sends it to that tile
export const TRANSFORMS = [
    {   // tier 1 aquatic
        id: "pond",
        ...needsCore("pond", "Pond"),
        inputs: ["water", "water"],
        output: "pond",
        consumes: true,
        text: "Two pools run together, and the low ground holds what they leave.",
    },
    {   // tier 2 aquatic
        id: "ocean",
        ...needsCore("ocean", "Ocean"),
        inputs: ["pond", "pond", "pond"],
        output: "ocean",
        consumes: false,
        text: "Three ponds meet, and the water between them opens out.",
    },

    {   // special aquatic
        id: "deep-ocean", // THE COST SEEMS HIGH BUT PONDS TURN INTO 3 OCEANS. so it's just 2 transform's worth of oceans
        ...needsChallenge("deepOcean", "Deep Ocean"),
        inputs: ["ocean", "ocean", "ocean", "ocean", "ocean", "ocean"],
        output: "deep-ocean",
        leaves: "ocean",
        text: "Ocean so deep that no light reaches the bottom.",
    },


    {   // tier 1 reef
        id: "reef",
        ...needsChallenge("reef", "Reef"),
        inputs: ["pond", "pond"],
        output: "reef",
        leaves: "water",
        text: "The water grows deeper, and fish find shelter there."
    },
    {   // tier 2 reef
        id: "coral-reef",
        ...needsChallenge("coralReef", "Reef"),
        inputs: ["reef", "reef"],
        output: "coral-reef",
        leaves: "water",
        text: "The reef is home to life never seen before."
    },
    {   // special reef
        id: "great-reef",
        ...needsChallenge("reef", "Reef"),
        inputs: ["coral-reef", "coral-reef", "coral-reef"],
        output: "great-reef",
        consumes: false,
        text: "As many species as a whole continent.",
    },


    {   // tier 1 woodland
        id: "forest",
        ...needsCore("forest", "Forest"),
        inputs: ["grass", "grass", "grass"],
        output: "forest",
        consumes: true,
        text: "Grass gives up its ground and comes back as woodland.",
    },
    {   // tier 2 woodland
        id: "dense-forest",
        // TODO: needs a denseForest node on the cores tree
        ...needsCore("denseForest", "Dense Forest"),
        inputs: ["forest", "forest", "forest"],
        output: "dense-forest",
        consumes: true,
        text: "The forest grows thicker with age."
    },
    {   // special woodland
        id: "ancient-forest",
        // TODO: needs an ancientForest node on the cores tree
        ...needsCore("ancientForest", "Ancient Forest"),
        inputs: ["dense-forest", "dense-forest", "forest", "forest"],
        output: "ancient-forest",
        leaves: "forest",
        text: "One of the oldest things in the world."
    },


    {   // tier 1 ice
        id: "ice-field",
        ...needsChallenge("iceField", "Ice Field"),
        inputs: ["snow", "snow"],
        output: "ice-field",
        consumes: true,
        text: "Snow packs down into thick ice.",
    },
    {   // tier 2 ice
        id: "glacier",
        ...needsChallenge("glacier", "Glacier"),
        inputs: ["ice-field", "ice-field"],
        output: "glacier",
        consumes: true,
        text: "The ice packs tighter and slowly slides across the land.",
    },
    {   // special ice
        id: "ice-cap",
        ...needsChallenge("iceCap", "Ice Cap"),
        inputs: ["glacier", "glacier", "ice-field", "ice-field"],
        output: "ice-cap",
        leaves: "ice-field",
        text: "Huge stretches of land frozen solid.",
    },


    {   // tier 1 wetlands
        id: "marsh",
        ...needsChallenge("marsh", "Marsh"),
        inputs: ["water", "grass"],
        output: "marsh",
        consumes: true,
        text: "Wet ground, home to life on land and in water."
    },
    {   // tier 2 wetlands
        id: "swamp",
        ...needsChallenge("swamp", "Swamp"),
        inputs: ["marsh", "marsh", "pond"],
        output: "swamp",
        consumes: true,
        text: "Deeper marsh, home to stranger things."
    },
    {   // special wetlands
        id: "mangrove",
        ...needsChallenge("mangrove", "Mangrove"),
        inputs: ["swamp", "swamp", "marsh", "forest"],
        output: "mangrove",
        leaves: "marsh",
        text: "Trees that have spread across the whole swamp."
    },


    {   // tier 1 fungus
        id: "mushroom-grove",
        ...needsChallenge("mushroomGrove", "Mushroom Grove"),
        inputs: ["grass", "grass", "water"],
        output: "mushroom-grove",
        consumes: true,
        text: "Life that spreads instead of growing."
    },
    {   // tier 2 fungus
        id: "fungal-forest",
        ...needsChallenge("fungalForest", "Fungal Forest"),
        inputs: ["mushroom-grove", "mushroom-grove", "forest"],
        output: "fungal-forest",
        consumes: true,
        text: "Towering mushrooms, unlike anything else."
    },
    {   // special fungus
        id: "mycelial-network",
        ...needsChallenge("mycelialNetwork", "Mycelial Network"),
        inputs: ["fungal-forest", "fungal-forest", "mushroom-grove", "mushroom-grove"],
        output: "mycelial-network",
        consumes: true,
        text: "Thousands of mushrooms joined by one huge network."
    },

];


//    !!! READING THE MAP !!!

export const worldState = () => getLayerState("world");
export const grassState = () => getLayerState("grass");
const level = levelsIn("grass");


export function neighboringTiles(tile) {
    mapTiles();
    return neighborsOf(tile).filter(n => IN_MAP.has(n.id));
}

export const isClaimed = (s, id) => !!(s.tiles || {})[id];
export const grassOn = (s, id) => (s.grass || {})[id] || null;
export const grassTiles = (s) => Object.keys(s.grass || {});
export const matureTiles = (s) => grassTiles(s).filter(id => s.grass[id].stage === MATURE);


export const claimedTiles = (s) => Object.keys(s.tiles || {}).filter(id => s.tiles[id]);

// What the ground has been turned into
export const terrainOn = (s, id) => (s.terrain || {})[id] || null;
export const terrainTiles = (s) => Object.keys(s.terrain || {});

// How close a tile is toward becoming snow/water based on precipitation
export const buildupOn = (s, id, kind) => ((s[PRECIPITATION[kind].store]) || {})[id] || 0;
export const moistureOn = (s, id) => buildupOn(s, id, "rain");
export const snowOn = (s, id) => buildupOn(s, id, "snow");

// Everything sitting on the tile at once, for the things that only care that it's wet
export const buildupTotalOn = (s, id) =>
    Math.min(1, PRECIPITATION_KINDS.reduce((total, kind) => total + buildupOn(s, id, kind), 0));

export const tileKind = (s, id) => terrainOn(s, id) || (grassOn(s, id) ? "grass" : "bare");

// Claimed tiles of a kind, a list of kinds, or a family like AQUATIC_KINDS
export const tilesOf = (kind, s = worldState()) => {
    const wanted = typeof kind === "string" ? [kind] : (Array.isArray(kind) ? kind : Object.keys(kind));
    return claimedTiles(s).filter(id => wanted.includes(tileKind(s, id)));
};

export const countOf = (kind, s = worldState()) => tilesOf(kind, s).length;

// The same tiles counted by tier, where a higher tier stands for more than one
export const weightOf = (kind, s = worldState()) =>
    tilesOf(kind, s).reduce((total, id) => total + tierOf(tileKind(s, id)), 0);

export const canHoldGrass = (s, id) => isClaimed(s, id) && !terrainOn(s, id);
export const growableTiles = (s) => claimedTiles(s).filter(id => canHoldGrass(s, id));

const adjacentGrass = (s, tile) => neighboringTiles(tile).filter(n => grassOn(s, n.id)).length;


// How good the diversity of tiles is. Bare ground, water, and snow are ignored
const DIVERSITY_IGNORES = new Set(["bare", "water", "snow"]);

export function tileKindCounts(s = worldState()) {
    const counts = tileCounts(s);
    const kept = {};
    for (const kind in counts) {
        if (counts[kind] > 0 && !DIVERSITY_IGNORES.has(kind)) kept[kind] = counts[kind];
    }
    return kept;
}

// Shannon diversity: how many kinds an even split would need to look this varied
export function tileDiversity(s = worldState()) {
    const counts = tileKindCounts(s);
    const total = Object.values(counts).reduce((n, c) => n + c, 0);
    if (total <= 0) return 0;

    let entropy = 0;
    for (const kind in counts) {
        const share = counts[kind] / total;
        entropy -= share * Math.log(share);
    }
    return Math.exp(entropy);
}


// Which tiles count as which for adjacency checks, e.g. reefs next to ocean
export const kindIsWater = (kind) => (TERRAIN[kind] || {}).madeOf === "water";
export const kindIsOcean = (kind) => !!AQUATIC_KINDS[kind];

// How many of a tile's neighbors match
export function neighborTally(s, id, match) {
    const tile = tileById(id);
    if (!tile) return 0;
    let found = 0;
    for (const n of neighboringTiles(tile)) {
        if (isClaimed(s, n.id) && match(tileKind(s, n.id), n.id)) found++;
    }
    return found;
}

export const adjacentOcean = (s, id) => neighborTally(s, id, kindIsOcean);
export const adjacentLand = (s, id) => neighborTally(s, id, kind => !kindIsWater(kind));
export const adjacentOfKind = (s, id, ...kinds) => neighborTally(s, id, kind => kinds.includes(kind));

// Biggest connected ocean and the land against it, each land tile counted once
export function largestOceanStretch(s = worldState()) {
    const seen = new Set();
    let biggest = [];

    for (const id of claimedTiles(s)) {
        if (seen.has(id) || !kindIsOcean(tileKind(s, id))) continue;

        const stretch = [];
        const queue = [id];
        seen.add(id);
        while (queue.length > 0) {
            const at = queue.pop();
            stretch.push(at);
            for (const n of neighboringTiles(tileById(at))) {
                if (seen.has(n.id) || !isClaimed(s, n.id) || !kindIsOcean(tileKind(s, n.id))) continue;
                seen.add(n.id);
                queue.push(n.id);
            }
        }
        if (stretch.length > biggest.length) biggest = stretch;
    }

    const shore = new Set();
    for (const id of biggest) {
        for (const n of neighboringTiles(tileById(id))) {
            if (isClaimed(s, n.id) && !kindIsWater(tileKind(s, n.id))) shore.add(n.id);
        }
    }
    return { size: biggest.length, shore: shore.size, tiles: biggest };
}

// Everything on the map that bends toward a softcap rather than running away uses this
export const soften = (value, ceiling) => (value * ceiling) / (value + ceiling);

export const onShore = (s, id) => {
    const tile = tileById(id);
    return !!tile && neighboringTiles(tile).some(n => kindIsWater(tileKind(s, n.id)));
};

export function shoreGrassTiles(s = worldState()) {
    if (Object.keys(s.terrain || {}).length === 0) return 0;
    return grassTiles(s).filter(id => onShore(s, id)).length;
}

// How big a connected patch of grass is
function regionSize(s, tile) {
    const seen = new Set([tile.id]);
    const queue = [tile];
    while (queue.length > 0) {
        for (const n of neighboringTiles(queue.pop())) {
            if (seen.has(n.id) || !grassOn(s, n.id)) continue;
            seen.add(n.id);
            queue.push(n);
        }
    }
    return seen.size;
}

// Open ground beside a tile, which is where its grass can spread next
const freeNeighbors = (s, tile) =>
    neighboringTiles(tile).filter(n => canHoldGrass(s, n.id) && !grassOn(s, n.id));


//    !!! WEATHER ON A TILE !!!

export const isPrecipitating = (s) => (s.weatherSeconds || 0) > 0;
export const precipitatingOn = (s, id) => isPrecipitating(s) && s.weatherTile === id;

// Stopping precip. early removes the charge of the cloud and duration
export function stopPrecipitation(s) {
    s.weatherSeconds = 0;
    s.weatherTotal = 0;
    s.weatherTile = null;
    s.weatherPower = 0;
    s.weatherSoak = 0;
    s.weatherCeiling = 1;
}

export const fallingKind = (s) => (isPrecipitating(s) ? precipitationKind(s) : null);

export function setPrecipitationKind(s, kind) {
    if (challengeBlocks("snowOnly")) return false;
    if (!PRECIPITATION[kind] || isPrecipitating(s)) return false;
    s.weatherKind = kind;
    return true;
}

// A cloud bursting on a tile: how hard it falls, for how long, and what it leaves behind
export function startPrecipitation(s, id, event) {
    s.weatherTile = id;
    s.weatherTotal = event.seconds;
    s.weatherSeconds = event.seconds;
    s.weatherPower = event.strength;
    s.weatherSoak = event.soak;
    s.weatherCeiling = event.ceiling || 1;
    s.weatherDrifted = false;

    // For the seedstorm card
    if (PRECIPITATION[precipitationKind(s)].growsGrass
        && cardBonus("seedstorm") > 0 && Math.random() < cardBonus("seedstorm")
        && canHoldGrass(s, id) && !grassOn(s, id) && grassTiles(s).length > 0) {
        plantGrass(s, id);
    }
}

export function tickPrecipitation(s, dt) {
    if (!isPrecipitating(s)) return;
    const kind = precipitationKind(s);
    const slice = Math.min(dt, s.weatherSeconds);

    // Precipitation doesn't build up until environment is bought
    if (coreNodeBought("environment") && s.weatherTotal > 0) {
        const room = Math.max(0, (s.weatherCeiling || 1) - buildupOn(s, s.weatherTile, kind));
        const fallen = Math.min(room, (s.weatherSoak || 0) * (slice / s.weatherTotal));
        if (fallen > 0) soak(s, s.weatherTile, fallen, kind);
        // For the gathering storm card
        if (cardBonus("moistureCharge") > 0) addCharge(fallen * cardBonus("moistureCharge"));
    }

    s.weatherSeconds = Math.max(0, s.weatherSeconds - dt);
    if (s.weatherSeconds === 0 && !(cardActive("monsoon") && driftOn(s, kind))) s.weatherTile = null;
}

// What the cloud above is worth to the tile beneath it
export const weatherBoostOn = (s, id) => Math.max(
    precipitatingOn(s, id) ? PRODUCTION_BOOST * (s.weatherPower || 0) : 0,
    PRODUCTION_BOOST * buildupTotalOn(s, id));

// Monsoon: finished weather falls once more on the driest neighbor, for half as long
const MONSOON_SHARE = 0.5;
function driftOn(s, kind) {
    if (s.weatherDrifted) return false;
    const near = neighboringTiles(tileById(s.weatherTile))
        .filter(n => isClaimed(s, n.id) && !shedsPrecipitation(s, n.id, kind));
    if (near.length === 0) return false;
    const target = near.reduce((best, n) => buildupOn(s, n.id, kind) < buildupOn(s, best.id, kind) ? n : best, near[0]);

    s.weatherTile = target.id;
    s.weatherDrifted = true;
    s.weatherTotal *= MONSOON_SHARE;
    s.weatherSeconds = s.weatherTotal;
    s.weatherSoak = (s.weatherSoak || 0) * MONSOON_SHARE;
    return true;
}


// Soaking a tile with water or snow (named from when it was only rain)
export function soak(s, id, amount, kind = "rain") {
    if (!id || !isClaimed(s, id)) return false;
    if (shedsPrecipitation(s, id, kind)) return false;
    const store = PRECIPITATION[kind].store;
    if (!s[store]) s[store] = {};

    const level = buildupOn(s, id, kind) + amount;
    if (level < 1 - 1e-6) {
        s[store][id] = level;
        return false;
    }


    // For the saturation card, changes tile to either pond or ice fields
    const deep = cardActive("saturation");
    setTerrain(s, id, deep ? PRECIPITATION[kind].floods : PRECIPITATION[kind].becomes);
    return true;
}


// Grass beside a marsh stays damp off of it
export const keptWetByMarsh = (s, id) =>
    tileKind(s, id) === "grass" && adjacentOfKind(s, id, "marsh") > 0;

// Nothing drains off the tile being rained on. Drying starts once the cloud has moved on
export function tickBuildup(s, dt) {
    const under = isPrecipitating(s) ? s.weatherTile : null;

    for (const kind of PRECIPITATION_KINDS) {
        const store = s[PRECIPITATION[kind].store];
        if (!store) continue;

        for (const id in store) {
            if (id === under) continue;
            if (kind === "rain" && keptWetByMarsh(s, id)) continue;
            const left = store[id] - dryingRate(store[id]) * dt;
            if (left > 0) store[id] = left;
            else delete store[id];
        }
    }
}


//    !!! FIRES !!!

// Long Summer fires start on woodland and spread until rain puts them out
const FIRE_CHECK_SECONDS = 40;      // How often a tile of fire spawns
const FIRE_GROWTH_SECONDS = 90;     // Left alone, how long a tile takes to burn out
const FIRE_DOUSE_SECONDS = 12;      // Under weather, how long it takes to put out
const FIRE_SPREAD_SECONDS = 60;     // How long a fire burns before it reaches the tile beside it
const OLD_GROWTH_SECONDS = 20;      // How long a forest burns before it burns away one old growth tree

export const firesBurn = () => challengeBlocks("wildfires");

// Saved as { burn, age } per tile, so a fire remembers how long it has been burning
const fireRecord = (s, id) => {
    const held = (s.fires || {})[id];
    if (held == null) return null;
    return typeof held === "number" ? { burn: held, age: 0 } : held;
};
export const fireOn = (s, id) => (fireRecord(s, id) || {}).burn || 0;
export const burningTiles = (s) => Object.keys(s.fires || {});

// Fires start in woodland and spread to grass beside it, or catch grass directly once no woodland is left
const willBurn = (kind) => !!WOODLAND_KINDS[kind] || kind === "grass";
const canCatch = (s, id) =>
    isClaimed(s, id) && willBurn(tileKind(s, id)) && !fireOn(s, id) && buildupTotalOn(s, id) <= 0;

const beingDoused = (s, id) => precipitatingOn(s, id) || buildupTotalOn(s, id) > 0;

const light = (s, id) => {
    if (!s.fires) s.fires = {};
    s.fires[id] = { burn: 0.01, age: 0 };
};

function startFire(s) {
    const catchable = claimedTiles(s).filter(id => canCatch(s, id));
    const woods = catchable.filter(id => WOODLAND_KINDS[tileKind(s, id)]);
    const open = woods.length > 0 ? woods : catchable;
    if (open.length > 0) light(s, open[Math.floor(Math.random() * open.length)]);
}

function spreadFire(s, id) {
    const near = neighboringTiles(tileById(id)).filter(n => canCatch(s, n.id));
    if (near.length > 0) light(s, near[Math.floor(Math.random() * near.length)].id);
}

// Old growth goes one tree at a time, oldest first
function burnOldGrowth(s, dt, burning) {
    s.fireBurn = (Number(s.fireBurn) || 0) + (burning * dt) / OLD_GROWTH_SECONDS;
    const forest = getLayerState("woodland");
    while (s.fireBurn >= 1) {
        s.fireBurn -= 1;
        if (!Array.isArray(forest.oldGrowth) || forest.oldGrowth.length === 0) { s.fireBurn = 0; break; }
        forest.oldGrowth.shift();
    }
}

export function tickFires(s, dt) {
    if (!firesBurn()) {
        if (s.fires) s.fires = {};
        s.fireSeed = 0;
        s.fireBurn = 0;
        return;
    }

    s.fireSeed = (Number(s.fireSeed) || 0) + dt;
    while (s.fireSeed >= FIRE_CHECK_SECONDS) {
        s.fireSeed -= FIRE_CHECK_SECONDS;
        startFire(s);
    }

    let burning = 0;
    for (const id of burningTiles(s)) {
        const fire = fireRecord(s, id);
        if (!willBurn(tileKind(s, id))) { delete s.fires[id]; continue; }

        if (beingDoused(s, id)) {
            fire.burn -= dt / FIRE_DOUSE_SECONDS;
            if (fire.burn > 0) s.fires[id] = fire;
            else { delete s.fires[id]; s.firesOut = (Number(s.firesOut) || 0) + 1; }
            continue;
        }

        burning += 1;
        fire.age += dt;
        while (fire.age >= FIRE_SPREAD_SECONDS) {
            fire.age -= FIRE_SPREAD_SECONDS;
            spreadFire(s, id);
        }

        fire.burn += dt / FIRE_GROWTH_SECONDS;
        if (fire.burn >= 1) { delete s.fires[id]; setTerrain(s, id, "bare"); }
        else s.fires[id] = fire;
    }
    if (burning > 0) burnOldGrowth(s, dt, burning);
}


//    !!! CHANGING WHAT A TILE IS !!!

export function setTerrain(s, id, kind) {
    if (!s.terrain) s.terrain = {};
    if (kind === "bare") delete s.terrain[id];
    else { s.terrain[id] = kind; seeTerrain(s, kind); }

    if (s.grass) delete s.grass[id];
    if (s.fires) delete s.fires[id];
    for (const weather of PRECIPITATION_KINDS) {
        const store = s[PRECIPITATION[weather].store];
        if (store) delete store[id];
    }
}

// What tiles the player has had before, so you don't see full recipes until made
export function seeTerrain(s, kind) {
    if (!TERRAIN[kind] || !TERRAIN[kind].stored) return;
    if (!s.seenTerrain) s.seenTerrain = {};
    s.seenTerrain[kind] = true;
}

// Anything standing on the map counts too and is written down as it's found
export function hasSeenKind(s, kind) {
    if (!TERRAIN[kind] || !TERRAIN[kind].stored) return true;
    if ((s.seenTerrain || {})[kind]) return true;
    if (!terrainTiles(s).some(id => s.terrain[id] === kind)) return false;
    seeTerrain(s, kind);
    return true;
}


//    !!! WHAT THE MAP MAKES !!!

// Which grass multiplier each resource takes its neighbor share from; unnamed ones are left alone
const GRASS_SHARE = { greenEssence: "green", blueEssence: "blue" };

// One tile per second, before the global boosts applied in environmentLayer's onTick
export function tileYield(s, id, bonuses = grassBonuses(s)) {
    const boost = 1 + weatherBoostOn(s, id);
    const output = tileOutput(s, id);
    const yielded = {};
    for (const resourceId in output) {
        const amount = D(output[resourceId]);
        if (!amount.gt(0)) continue;
        const share = GRASS_SHARE[resourceId]
            ? neighborGrassMultiplier(s, id, bonuses[GRASS_SHARE[resourceId]]) : 1;
        yielded[resourceId] = amount.mul(boost).mul(share).mul(neighborBoost(s, id));
    }
    return yielded;
}

// Topsoil pays for a varied map rather than doubling whatever is already there
const TOPSOIL_PER_KIND = 0.05;
const TOPSOIL_CEILING = 0.4;
const topsoilBonus = (s) => coreNodeBought("envTopsoil")
    ? Math.min(TOPSOIL_CEILING, TOPSOIL_PER_KIND * Object.keys(tileKindCounts(s)).length) : 0;

// All the production on the map, added up per second
export function terrainProduction(s) {
    const total = {};
    const bonuses = grassBonuses(s);
    for (const id of terrainTiles(s)) {
        const output = tileYield(s, id, bonuses);
        for (const resourceId in output) {
            total[resourceId] = D(total[resourceId] || 0).add(output[resourceId]);
        }
    }
    const loam = challengeMod("terrainOutput") * (1 + topsoilBonus(s));
    for (const resourceId in total) total[resourceId] = total[resourceId].mul(loam);
    return total;
}

// How much a grass tile's multiplier gets for neighboring grass tiles
function neighborGrassMultiplier(s, id, bonusOf) {
    const tile = tileById(id);
    if (!tile) return 1;
    let total = 1;
    for (const n of neighboringTiles(tile)) {
        if (grassOn(s, n.id)) total *= 1 + ADJACENT_SHARE * bonusOf(n.id);
    }
    return total;
}

// Every kind is listed even at zero, so a caller can read a count without checking first
export function tileCounts(s = worldState()) {
    const counts = {};
    for (const kind in TERRAIN) counts[kind] = 0;
    for (const id of claimedTiles(s)) {
        const kind = tileKind(s, id);
        counts[kind] = (counts[kind] || 0) + 1;
    }
    return counts;
}


//    !!! SELECTING AND TRANSFORMING !!!

// Selection is saved so a half-set-up transformation survives a reload
export const transformFodder = (s) => (s.transformFodder || []).filter(id => isClaimed(s, id));

// Razing turns a tile to bare ground over RAZE_SECONDS
export const isRazing = (s, id) => (s.razing || {})[id] !== undefined;
export const razeElapsed = (s, id) => (s.razing || {})[id] || 0;
export const razeProgress = (s, id) => Math.min(1, razeElapsed(s, id) / RAZE_SECONDS);
export const razeLeft = (s, id) => Math.max(0, RAZE_SECONDS - razeElapsed(s, id));

// Bare ground has nothing left to take, and one already going doesn't start again.
export const canRaze = (s, id) =>
    isClaimed(s, id) && !isRazing(s, id) && tileKind(s, id) !== "bare";

export function startRaze(s, id) {
    if (!canRaze(s, id)) return false;
    if (!s.razing) s.razing = {};
    s.razing[id] = 0;
    return true;
}

export function tickRaze(s, dt) {
    if (!s.razing) return;
    for (const id of Object.keys(s.razing)) {
        // A tile that stopped being claimed isn't the world's to strip any more.
        if (!isClaimed(s, id)) {
            delete s.razing[id];
            continue;
        }
        s.razing[id] += dt;
        if (s.razing[id] < RAZE_SECONDS) continue;
        delete s.razing[id];
        strip(s, id);
    }
}

// What's left after razing; standing weather is removed so a finishing downpour can't change it straight away
function strip(s, id) {
    if (s.terrain) delete s.terrain[id];
    if (s.grass) delete s.grass[id];
    if (s.weatherTile === id) stopPrecipitation(s);
}

// Only mature grass can be transformed, and not while it's being razed
export function canTransformTile(s, id) {
    if (!isClaimed(s, id) || isRazing(s, id)) return false;
    const grass = grassOn(s, id);
    return !grass || grass.stage === MATURE;
}

// Everything in the selection still has to be transformable by the time the button is hit
export const transformReady = (s) =>
    !!s.selectedTile && [s.selectedTile, ...transformFodder(s)].every(id => canTransformTile(s, id));


export function isTransformCandidate(s, id) {
    if (!s.selectedTile || id === s.selectedTile || !isClaimed(s, id)) return false;
    if (!canTransformTile(s, s.selectedTile) || !canTransformTile(s, id)) return false;
    const from = tileById(s.selectedTile);
    return !!from && neighboringTiles(from).some(n => n.id === id);
}

export const isTransformFodder = (s, id) => (s.transformFodder || []).includes(id);

export function transformInputs(s) {
    if (!s.selectedTile || !isClaimed(s, s.selectedTile)) return [];
    return [s.selectedTile, ...transformFodder(s)].map(id => tileKind(s, id));
}

export function knownTransforms(s = worldState()) {
    return TRANSFORMS.filter(recipe =>
        Array.isArray(recipe.inputs) && recipe.inputs.length > 0 && recipe.output
        && !(recipe.hidden && recipe.hidden(s)));
}

export const transformAvailable = (recipe, s = worldState()) =>
    !!recipe && (!recipe.prereq || recipe.prereq(s));

// What a locked transformation is waiting for
export const transformHint = (recipe, s = worldState()) =>
    (recipe && recipe.hint && recipe.hint(s)) || "Something is missing...";

// Which transform would happen based on what is currently selected
export function matchedTransform(s) {
    const kinds = transformInputs(s);
    if (kinds.length === 0) return null;
    return knownTransforms(s).find(recipe => sameMultiset(recipe.inputs, kinds)) || null;
}

function sameMultiset(a, b) {
    if (a.length !== b.length) return false;
    const left = [...a].sort();
    const right = [...b].sort();
    return left.every((kind, i) => kind === right[i]);
}


export const fodderResult = (recipe) =>
    recipe.leaves || (recipe.consumes ? "bare" : recipe.output);

const fodderUntouched = (recipe) => recipe.inputs.every(kind => kind === fodderResult(recipe));

// Whether running it costs the tiles fed in
export const fodderSpends = (recipe) =>
    fodderResult(recipe) !== recipe.output && !fodderUntouched(recipe);

// Same thing written out, long for the preview window and short for the reference page
export function fodderNote(recipe) {
    const left = fodderResult(recipe);
    if (left === recipe.output) return "Nothing is spent, as they come up with it.";
    if (fodderUntouched(recipe)) return "Nothing is spent, as the rest are left as they are.";
    if (left === "bare") return "The tiles fed in are spent, and left as bare ground.";
    return `The tiles fed in drop back to ${TERRAIN[left].name.toLowerCase()}.`;
}

export function fodderSummary(recipe) {
    const left = fodderResult(recipe);
    if (left === recipe.output) return "Spends nothing, as the tiles fed in are carried up too.";
    if (fodderUntouched(recipe)) return "Spends nothing, as the tiles fed in are left as they are.";
    if (left === "bare") return "Spends the tiles fed in.";
    return `Spends the tiles fed in back down to ${TERRAIN[left].name.toLowerCase()}.`;
}

// Re-checked as it runs, since a selection outlives the tick it was made on
export function applyTransform(s) {
    const recipe = matchedTransform(s);
    if (!recipe || !transformAvailable(recipe, s) || !transformReady(s)) return false;

    const fodder = transformFodder(s);
    const touched = [s.selectedTile, ...fodder];
    const left = fodderResult(recipe);

    setTerrain(s, s.selectedTile, recipe.output);
    for (const id of fodder) setTerrain(s, id, left);

    // Precipitation is stopped if the tile transforms, so it doesn't just immediately mess up what you did
    if (touched.includes(s.weatherTile)) stopPrecipitation(s);

    clearTransform(s);
    return true;
}

export function clickTransformTile(s, id) {
    if (!isClaimed(s, id)) return;

    if (id === s.selectedTile) {
        clearTransform(s);
    } else if (isTransformCandidate(s, id)) {
        s.transformFodder = isTransformFodder(s, id)
            ? s.transformFodder.filter(f => f !== id)
            : [...(s.transformFodder || []), id];
    } else {
        selectTile(s, id);
    }
}

export function selectTile(s, id) {
    s.selectedTile = id;
    s.transformFodder = [];
}

export const clearTransform = (s) => selectTile(s, null);


//    !!! GRASS !!!

// Standing moisture is worth something to grass on its own (to a point), separate from anything falling on it
const DAMP_BANDS = [
    { upTo: 0.10, rate: 1 },
    { upTo: 0.30, rate: 1.2 },
    { upTo: 0.50, rate: 1.1 },
    { upTo: 0.70, rate: 1 },
    { upTo: Infinity, rate: 0.9 },
];

const DAMP_PEAK = Math.max(...DAMP_BANDS.map(band => band.rate));
const DAMP_DRY = DAMP_BANDS[0].upTo;

// The deep drinkers card takes the best band for any moisture in it, so being soaked stops costing anything
export const dampGrowth = (s, id) => {
    const wet = moistureOn(s, id);
    if (cardActive("dampMastery") && wet >= DAMP_DRY) return DAMP_PEAK;
    return DAMP_BANDS.find(band => wet < band.upTo).rate;
};

export function growthRate(s, tile, stage = SEED) {
    const region = cardBonus("regionBonus"); // Green dominion checks region instead of adjacent
    const fromNeighbors = region > 0
        ? 1 + region * regionSize(s, tile)
        : 1 + 0.08 * (1 + cardBonus("adjacencyBonus") + traitBonus("grassNeighbor")) * adjacentGrass(s, tile);

    const fromUpgrades = 1 + GROWTH_PER_LEVEL * level("richerSoil");
    const falling = fallingKind(s);
    const helping = falling && PRECIPITATION[falling].growsGrass && s.weatherTile === tile.id;
    const fromRain = helping ? 1 + 0.75 * Math.sqrt(s.weatherPower || 0) : 1;
    const fromDamp = dampGrowth(s, tile.id);
    const fromCards = (1 + cardBonus("grassGrowth")) * (1 + traitBonus("growth") + traitBonus("grassGrowth"))
        * (coreNodeBought("grassCreepingStems") && adjacentGrass(s, tile) > 0 ? 1.2 : 1);

    // Dev tool to make grass grow really fast
    const devFastGrass = !!state.settings.enableFastGrass == true ? [28, 18, 8] : [0, 0, 0]

    const seconds = (STAGE_SECONDS[stage] / (stage === MATURE ? 1 + cardBonus("matureWait") : 1)) - devFastGrass[stage];
    const fromGrass = grassSpeedMultiplier();
    // Spring Awakening
    const awakened = stage === SEED && traitHas("springAwakening")
        && neighboringTiles(tile).some(n => s.grass[n.id] && s.grass[n.id].stage === MATURE) ? 1.5 : 1;
    return (awakened * fromNeighbors * fromUpgrades * fromRain * fromDamp * fromCards * fromGrass
        * challengeMod("grassGrowth")) / seconds;
}

const DEEP_ROOTS_SECONDS = 120;
function ageBonus(s, id) {
    const bonus = cardBonus("deepRoots");
    if (bonus <= 0) return 0;
    const age = (s.grass[id] || {}).matureFor || 0;
    return bonus * (age / (age + DEEP_ROOTS_SECONDS));
}

const CARPET_PER_TILE = 0.01;
const CARPET_CEILING = 0.5;

// The bits every tile shares are worked out once, then it hands back what one tile is worth
export function grassOutputs(s) {
    const perLevel = (1 + 0.2 * Math.min(10, level("greenerBlades")) + cardBonus("grassOutput"))
        * (coreNodeBought("grassSodLayer") ? 1.2 : 1);
    const pastCap = pastCapGain("greenerBlades", level("greenerBlades"));
    // For the fertile waters card
    const fromAlgae = cardBonus("shoreExchange") > 0
        ? cardBonus("shoreExchange") * (getLayerState("pond").algae || 0) : 0;
    // Which grass is being grown, and the milestones that make all of them worth more
    const fromGrass = grassOutputMultiplier();
    // Carpet of Green
    const carpet = traitHas("carpetOfGreen") ? Math.min(CARPET_CEILING, CARPET_PER_TILE * Math.max(0, matureTiles(s).length - 1)) : 0;
    const matureWorth = 1 + traitBonus("matureGrass");
    return (id) => {
        const shore = fromAlgae > 0 && onShore(s, id) ? fromAlgae : 0;
        return STAGE_BONUS[s.grass[id].stage] * (perLevel + ageBonus(s, id) + shore)
            * (1 + weatherBoostOn(s, id)) * fromGrass * pastCap * (s.grass[id].stage === MATURE ? (1 + carpet) * matureWorth : 1);
    };
}

// Wet ground's blue boost from green production; high since it gets little adjacency and costs blue
export const SOAKED_BLUE = 32;

// How wet a tile counts as for blue payout, whether the cloud over or its standing weather is more
export const wetnessOn = (s, id) => Math.min(1, Math.max(
    buildupTotalOn(s, id),
    precipitatingOn(s, id) ? (s.weatherPower || 0) : 0));

export function grassBonuses(s) {
    const green = grassOutputs(s);
    return { green, blue: (id) => green(id) * SOAKED_BLUE * wetnessOn(s, id) };
}

// What one grass tile adds to each multiplier, as a fraction summed by the map
export const grassGreenOutput = (s, id) => grassOn(s, id) ? grassBonuses(s).green(id) : 0;
export const oneSoakedBlue = (s, id) => grassOn(s, id) ? grassBonuses(s).blue(id) : 0;

// All the grass in the world together, as the fraction it adds to the multiplier
export function greenBonus(s) {
    const { green } = grassBonuses(s);
    let total = 0;
    for (const id of grassTiles(s)) total += green(id);
    return total;
}

export function blueBonus(s) {
    const { blue } = grassBonuses(s);
    let total = 0;
    for (const id of grassTiles(s)) total += blue(id);
    return total;
}

export const grassGreenMultiplier = (s = worldState()) => 1 + greenBonus(s) * challengeMod("grassOutput");
export const grassBlueMultiplier = (s = worldState()) => 1 + blueBonus(s) * challengeMod("grassOutput");


// With grass unlocked but none in the world, the first seed is planted by hand on bare ground
export const canPlant = (s, id) => grassTiles(s).length === 0 && canHoldGrass(s, id) && !grassOn(s, id) && coreNodeBought("grass");

export function plantGrass(s, id) {
    if (!s.grass) s.grass = {};
    s.grass[id] = { stage: SEED, progress: 0 };
}

// Dev tool, jumps grass straight to mature
export function growFully(s, id) {
    const grass = grassOn(s, id);
    if (!grass || grass.stage === MATURE) return false;
    grass.stage = MATURE;
    grass.progress = 0;
    return true;
}

// One tick of everything growing. Mature grass seeds a free neighbor tile and returns to seed stage
export function tickGrass(dt) {
    const s = worldState();
    if (!s.grass) return;

    // Grows before it spreads, makes grass not compete for the same spot
    const ready = [];
    let stagesGrown = 0;
    const justMatured = [];
    const spill = [];
    for (const tile of mapTiles()) {
        const grass = s.grass[tile.id];
        if (!grass) continue;

        const gained = growthRate(s, tile, grass.stage) * dt;
        grass.progress += gained;

        // For the creeping growth card
        collectSpill(s, tile, gained, spill);

        while (grass.progress >= 1 && grass.stage < MATURE) {
            grass.progress -= 1;
            grass.stage++;
            stagesGrown++;
            if (grass.stage === MATURE) justMatured.push(tile);
        }

        // Mature grass lingers so it doesn't flicker between stages
        if (grass.stage === MATURE) {
            grass.matureFor = (grass.matureFor || 0) + dt;   // For the deep roots card
            if (cardActive("noMatureWait")) { // For the wildfire growth card
                grass.progress = 1;
                grass.blockedWait = 0;
            } else if (freeNeighbors(s, tile).length === 0) {
                grass.blockedWait = 10 - (!!state.settings.enableFastGrass == true ? 8 : 0);    // Nowhere to go, so arm the wait for when a tile opens
            } else if (grass.blockedWait > 0) {
                grass.blockedWait = Math.max(0, grass.blockedWait - dt);
            }
            grass.progress = Math.min(1, grass.progress);
            if (grass.progress >= 1 && !(grass.blockedWait > 0)) ready.push(tile);
        }
    }

    for (const [id, amount] of spill) {
        const grass = s.grass[id];
        if (grass && grass.stage < MATURE) grass.progress += amount;
    }

    // For the rain dance card
    for (const tile of justMatured) callRainNear(s, tile);

    // Randomly selects which mature grass spreads, so that it isn't just position-based
    shuffle(ready);

    // Tiles are claimed as grass spreads, so that only one of them returns to seed stage
    const taken = new Set();

    for (const tile of ready) {
        const free = freeNeighbors(s, tile).filter(n => !taken.has(n.id));
        if (free.length === 0) continue;
        const target = free[Math.floor(Math.random() * free.length)];

        taken.add(target.id);
        s.grass[tile.id] = { stage: SEED, progress: Math.min(0.99, cardBonus("spreadRetain")) };
    }

    for (const id of taken) {
        if (!s.grass[id]) s.grass[id] = { stage: SEED, progress: seedProgress() };
        if (cardBonus("shoreSpawn") > 0 && onShore(s, id)) s.shoreBoostLeft = SHORE_BOOST_SECONDS;
    }

    // For the chain reaction card
    if (cardBonus("chainReaction") > 0) {
        for (const id of [...taken]) { // Makes sure that it can't have one seed grow the entire world
            if (Math.random() >= cardBonus("chainReaction")) continue;
            const tile = tileById(id);
            const free = freeNeighbors(s, tile).filter(n => !taken.has(n.id));
            if (free.length === 0) continue;
            const target = free[Math.floor(Math.random() * free.length)];
            taken.add(target.id);
            s.grass[target.id] = { stage: SEED, progress: seedProgress() };
        }
    }

    // Paid at the end rather than per spread, so a chain reaction's extra tiles are counted
    if (taken.size > 0) earnSpreadGrowth(taken.size);
    earnStageGrowth(stagesGrown);
}

const seedProgress = () => Math.min(0.99, cardBonus("seedProgress") + grassSeedStart());
const SHORE_BOOST_SECONDS = 10;

// For the creeping growth card. Collects ticks spread from other grass
function collectSpill(s, tile, gained, out) {
    const chance = cardBonus("growthSpill");
    if (chance <= 0 || Math.random() >= chance) return;

    const neighbors = neighboringTiles(tile).filter(n => grassOn(s, n.id));
    if (neighbors.length === 0) return;

    const target = neighbors[Math.floor(Math.random() * neighbors.length)];
    out.push([target.id, gained]);
}

// For the rain dance card
function callRainNear(s, tile) {
    const chance = cardBonus("rainDance");
    if (chance <= 0 || isPrecipitating(s)) return;
    if (Math.random() >= chance) return;

    const near = neighboringTiles(tile).filter(n => isClaimed(s, n.id) && !terrainOn(s, n.id));
    if (near.length === 0) return;

    const id = near[Math.floor(Math.random() * near.length)].id;
    startPrecipitation(s, id, driftingEvent(s, id));
}

function shuffle(items) {
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
    }
}
