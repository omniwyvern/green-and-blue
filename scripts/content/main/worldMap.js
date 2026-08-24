// worldMap.js
//
// The data of the world map and things in it. The world layer is the view of things and
// the land layer shows data on stuff, they don't need to import each other.
//
// Grass should probably just be a tile at this point. But as a relic from earlier development
// it's just a modifier on a tile. Originally multiple things could be on a tile but that
// made balancing really weird and all that. But reworking it would be a pain

// !!!! MAYBE CHANGE LATER !!!!
// might be a thing for tiles that shows what all they have in them
// Also might just change some of this. I don't think too many things will coexist. Maybe.


import { state, getLayerState } from "../../core/state.js";
import { D } from "../../utils/decimal.js";
import { hexesWithin, neighboursOf } from "../../utils/hex.js";
import { cardBonus, cardActive } from "./cards.js";
import {
    grassSpeedMultiplier, grassOutputMultiplier, earnSpreadGrowth, grassSeedStart,
} from "./grassSublayer.js";
import { addCharge, driftingEvent } from "./precipitationSublayer.js";

export const BASE_MAP_RADIUS = 1;   // Radius 1 is a center tile and one on each of its six faces
export const TILE_SIZE = 60;    // Tile size (center to corner) in canvas units

// Layers increase map size themselves, so worldMap doesn't need to know about them
const radiusSources = new Map();
export const contributeMapRadius = (id, amount) => radiusSources.set(id, amount);
export const mapRadius = () => BASE_MAP_RADIUS
    + [...radiusSources.values()].reduce((total, amount) => total + amount(), 0);

// The map is rebuilt whenever the radius moves instead of built once or every frame
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

export const ORIGIN_TILE = "0,0"; // Starting tile unlocked

export const SEED = 0, GROWING = 1, MATURE = 2; // Grass grows through 3 stages then spreads to an adjacent free tile
export const STAGE_NAMES = ["Seed", "Growing", "Mature"];

const STAGE_SECONDS = [30, 20, 10]; // Time per stage, last one is waiting time for mature grass to spread
const BLOCKED_WAIT_SECONDS = 10; // Mature grass waits on appearance of an unlocked tile so it doesn't spread instantly
const NEIGHBOUR_BONUS = 0.07;   // 7% faster per adjacent grassy tile (5% felt too little, 10% felt too much)
export const GROWTH_PER_LEVEL = 0.10;   // Per level of richer soil

export const LAND_COST = () => ({ greenEssence: D(2e6), blueEssence: D(2e6) });

// !!! MAYBE ADJUST THESE !!!
// Grass gives a multiplier to green essence scaling with maturity rather than producing green itself
export const STAGE_BONUS = [0, 0.25, 1];
export const OUTPUT_PER_LEVEL = 0.2;   // Bonus per level of greener blades
export const ADJACENT_SHARE = 0.1; // Bonus to adjacent green-related tiles


// How much the next tile cost. It's stored here because rain is priced off of it.
const TILE_BASE_COST = D(2e5);
const TILE_COST_SCALE = D(3);   // Cost scaling based on number of owned tiles.
export const tileCost = (s) => ({
    greenEssence: TILE_BASE_COST.mul(TILE_COST_SCALE.pow(claimedTiles(s).length - 1)),
});


export const PRECIPITATION = {
    rain: {
        name: "Rain",
        store: "moisture",   // Which map on the world's slot holds rain buildup
        becomes: "water",    // What the precipitation type leaves normally
        floods: "pond",      // What it leaves instead once the saturation card is in
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
export const precipitationKind = (s) => (PRECIPITATION[s.weatherKind] ? s.weatherKind : "rain");

export const PRECIPITATION_SECONDS = 25;

const GROWTH_BOOST = 3;
export const PRODUCTION_BOOST = 0.25;

// A cloud is priced off what the next tile costs, so it keeps step with the world growing.
// Against a power of it rather than straight off it: the tile price is a green curve that
// triples every tile, and blue climbs a bit slower than that, so a straight peg runs away.
// Sized against a post-pond save - blue sitting around 1e6/s, peaking near 1e7/s while the
// pond is being worked, and a bank in the tens of millions. That puts a cloud at the eighth
// tile near 2e7: a few seconds of a good burst, and worth going back to the pond for.
const CHARGE_COST_POWER = 0.85;
const CHARGE_COST_SCALE = 0.9;  // ~29k at the first tile, ~2e7 by the eighth
export const chargeCost = (s) =>
    // Divided rather than subtracted, so clouds don't end up free post-upgrades
    tileCost(s).greenEssence.pow(CHARGE_COST_POWER).mul(CHARGE_COST_SCALE).div(1 + cardBonus("rainCost"));


// Bare ground, water, and snow only need one. Everything else is 3/4/5 based on tier
// Tiles can override, grass does this
export const ACTIVATIONS_BY_TIER = [1, 3, 4, 5];

export const tierOf = (kind) => TERRAIN[kind].tier || 0;
export const activationsForKind = (kind) => TERRAIN[kind].activations || ACTIVATIONS_BY_TIER[tierOf(kind)];
export const activationsFor = (s, id) => activationsForKind(tileKind(s, id));

export const shedsPrecipitation = (s, id, kind) =>
    TERRAIN[tileKind(s, id)].madeOf === PRECIPITATION[kind].makes;


export const BUILDUP_LOST_PER_SECOND = 0.002;
const DRY_RAMP = 2.5;     // How much faster an empty tile dries than a full one
export const dryingRate = (buildup) => BUILDUP_LOST_PER_SECOND * (1 + DRY_RAMP * (1 - buildup));
export const DRYING_SECONDS = Math.log(1 + DRY_RAMP) / (BUILDUP_LOST_PER_SECOND * DRY_RAMP);

// Tiles naturally drain/melt so this is a little bit of wiggle room for precipitation to account for it
const GAP_SECONDS_COVERED = 20;

// This makes it actually wiggle room and not just a discount.
const MOST_OF_A_RUN = 0.95;

const buildupAim = (activations) => Math.max(
    1 / (1 + (activations - 1) * GAP_SECONDS_COVERED * BUILDUP_LOST_PER_SECOND),
    (activations - 1) / (activations * MOST_OF_A_RUN),
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

export const TERRAIN = {
    // Precursor terrain, it's not really terrain.
    bare:   { name: "Bare ground", stored: false, tier: 0 },
    grass:  { name: "Grass",       stored: false, tier: 1, activations: 2 },
    water:  { name: "Water",       stored: true,  tier: 0, madeOf: "water" },
    snow:   { name: "Snow",        stored: true,  tier: 0, madeOf: "ice" },

    // Aquatic, ignores rain
    pond:         { name: "Pond",       stored: true, tier: 1, madeOf: "water" },
    ocean:        { name: "Ocean",      stored: true, tier: 2, madeOf: "water" },
    "deep-ocean": { name: "Deep Ocean", stored: true, tier: 3, madeOf: "water" },

    // Reefs, ignores water
    reef:         { name: "Reef",       stored: true, tier: 1, madeOf: "water" },
    "coral-reef": { name: "Coral Reef", stored: true, tier: 2, madeOf: "water" },
    "great-reef": { name: "Great Reef", stored: true, tier: 3, madeOf: "water" },

    // Forests, doesn't ignore either precipitation
    forest:           { name: "Forest",         stored: true, tier: 1 },
    "dense-forest":   { name: "Dense Forest",   stored: true, tier: 2 },
    "ancient-forest": { name: "Ancient Forest", stored: true, tier: 3 },

    // Ice, ignores ice
    "ice-field": { name: "Ice Field", stored: true, tier: 1, madeOf: "ice" },
    glacier:     { name: "Glacier",   stored: true, tier: 2, madeOf: "ice" },
    "ice-cap":   { name: "Ice Cap",   stored: true, tier: 3, madeOf: "ice" },

    // Wetlands, ignores water
    marsh:    { name: "Marsh",     stored: true, tier: 1, madeOf: "water" },
    swamp:    { name: "Swamp",     stored: true, tier: 2, madeOf: "water" },
    mangrove: { name: "Mangrove",  stored: true, tier: 3, madeOf: "water" },

    // Fungi, doesn't ignore either precipitation.
    "mushroom-grove":   { name: "Mushroom Grove",   stored: true, tier: 1 },
    "fungal-forest":    { name: "Fungal Forest",    stored: true, tier: 2 },
    "mycelial-network": { name: "Mycelial Network", stored: true, tier: 3 },
};

// !!!! THIS WILL CHANGE !!!!
// !!!! these are temporary until I nail down the mechanics for them and give proper bonuses !!!!
// What a tile of each kind is worth per second.
export const TERRAIN_OUTPUT = {
    water:  { blueEssence: 20 },
    pond:   { blueEssence: 60 },
    ocean:  { blueEssence: 150 },
    forest: { greenEssence: 250 },
};

// Transformations are gated in three stages: hidden, prereq, and neither
// hidden() is when it isn't listed in environments, world map behaves as if it doesn't exist
// prereq() is when it's there and named, but you don't own it
// neither, where it's always available
//
// What the fodder is left as becomes `output`, there are three ways of saying it:
//
//   consumes: true      spent, and handed back as bare ground
//   consumes: false     carried up - they become the output as well, so nothing is spent
//   leaves: "water"     spent, but only back DOWN to the named kind rather than all the way
//
// `leaves` is the general case and wins wherever it's set. See fodderResult().

export const TRANSFORMS = [
    {   // tier 1 aquatic
        id: "pond",
        inputs: ["water", "water"],
        output: "pond",
        consumes: true,
        text: "Two pools run together, and the low ground holds what they leave.",
    },
    {   // tier 2 aquatic
        id: "ocean",
        inputs: ["pond", "pond", "pond"],
        output: "ocean",
        consumes: false,
        text: "Three ponds meet, and the water between them opens out.",
    },

    {   // special aquatic
        id: "deep-ocean", // THE COST SEEMS HIGH BUT PONDS TURN INTO 3 OCEANS. so it's just 2 transform's worth of oceans
        inputs: ["ocean", "ocean", "ocean", "ocean", "ocean", "ocean"],
        output: "deep-ocean",
        leaves: "ocean",
        text: "The ocean stretches down into the abyss, where not even light can reach.",
    },


    {   // tier 1 reef
        id: "reef",
        inputs: ["pond", "pond"],
        output: "reef",
        leaves: "water",
        text: "The water grows deeper, and fish find shelter there."
    },
    {   // tier 2 reef
        id: "coral-reef",
        inputs: ["reef", "reef"],
        output: "coral-reef",
        leaves: "water",
        text: "The reef grows a variety of life that has never seen before."
    },
    {   // special reef
        id: "great-reef",
        inputs: ["coral-reef", "coral-reef", "coral-reef"],
        output: "great-reef",
        consumes: false,
        text: "The sheer number of species rivals that of an entire continent.",
    },


    {   // tier 1 forest
        id: "forest",
        inputs: ["grass", "grass", "grass"],
        output: "forest",
        consumes: true,
        text: "Grass gives up its ground and comes back as woodland.",
    },
    {   // tier 2 forest
        id: "dense-forest",
        inputs: ["forest", "forest", "forest"],
        output: "dense-forest",
        consumes: true,
        text: "As they get older, every layer of the forest grows denser and denser."
    },
    {   // special forest
        id: "ancient-forest",
        inputs: ["dense-forest", "dense-forest", "forest", "forest"],
        output: "ancient-forest",
        leaves: "forest",
        text: "Growing since ancient times, this forest may be one of the oldest things in the world."
    },


    {   // tier 1 ice
        id: "ice-field",
        inputs: ["snow", "snow"],
        output: "ice-field",
        consumes: true,
        text: "The surface grows colder, aggregating more and more snow into thick ice.",
    },
    {   // tier 2 ice
        id: "glacier",
        inputs: ["ice-field", "ice-field"],
        output: "glacier",
        consumes: true,
        text: "The ice compacts further and further, and begins to slowly slide across the land.",
    },
    {   // special ice
        id: "ice-cap",
        inputs: ["glacier", "glacier", "ice-field", "ice-field"],
        output: "ice-cap",
        leaves: "ice-field",
        text: "No longer a simple block of ice, massive stretches of land freeze harder and colder.",
    },


    {   // tier 1 wetlands
        id: "marsh",
        inputs: ["water", "grass"],
        output: "marsh",
        consumes: true,
        text: "The ground grows wetter, supporting life that can't choose between water and land."
    },
    {   // tier 2 wetlands
        id: "swamp",
        inputs: ["marsh", "marsh", "pond"],
        output: "swamp",
        consumes: true,
        text: "The marshes stretch deeper and deeper, providing a habitat to even stranger things."
    },
    {   // special wetlands
        id: "mangrove",
        inputs: ["swamp", "swamp", "marsh", "forest"],
        output: "mangrove",
        leaves: "marsh",
        text: "A unique form of tree has found a way to spread across the whole swamp."
    },


    {   // tier 1 fungus
        id: "mushroom-grove",
        inputs: ["grass", "grass", "water"],
        output: "mushroom-grove",
        consumes: true,
        text: "The first form of life that instead of growing, spreads."
    },
    {   // tier 2 fungus
        id: "fungal-forest",
        inputs: ["mushroom-grove", "mushroom-grove", "forest"],
        output: "fungal-forest",
        consumes: true,
        text: "The mushrooms grow taller and taller, creating a landscape unlike any other."
    },
    {   // special fungus
        id: "mycelial-network",
        inputs: ["fungal-forest", "fungal-forest", "mushroom-grove", "mushroom-grove"],
        output: "mycelial-network",
        consumes: true,
        text: "Thousands of mushrooms, all connected by a singular expansive network of mycelia."
    },

];

export const worldState = () => getLayerState("world");
export const grassState = () => getLayerState("grass");
const level = (id) => Number(grassState().purchasedUpgrades[id]) || 0;

export const coreNodeBought = (id) => !!getLayerState("cores").purchasedUpgrades[id];
export const upgradeLevel = (layerId, id) => Number(getLayerState(layerId).purchasedUpgrades[id]) || 0;

const environmentBought = () => coreNodeBought("environment");

export function neighbouringTiles(tile) {
    mapTiles();
    return neighboursOf(tile).filter(n => IN_MAP.has(n.id));
}

export const isClaimed = (s, id) => !!(s.tiles || {})[id];
export const grassOn = (s, id) => (s.grass || {})[id] || null;
export const grassTiles = (s) => Object.keys(s.grass || {});
export const matureTiles = (s) => grassTiles(s).filter(id => s.grass[id].stage === MATURE);
export const claimedTiles = (s) => Object.keys(s.tiles || {}).filter(id => s.tiles[id]);

// What the ground has been turned into
export const terrainOn = (s, id) => (s.terrain || {})[id] || null;
export const terrainTiles = (s) => Object.keys(s.terrain || {});

// How close a tile is towards becoming snow/water based on precipitation
export const buildupOn = (s, id, kind) => ((s[PRECIPITATION[kind].store]) || {})[id] || 0;
export const moistureOn = (s, id) => buildupOn(s, id, "rain");
export const snowOn = (s, id) => buildupOn(s, id, "snow");

// Everything sitting on the tile at once, for the things that only care that it's wet
export const buildupTotalOn = (s, id) =>
    Math.min(1, PRECIPITATION_KINDS.reduce((total, kind) => total + buildupOn(s, id, kind), 0));

export const tileKind = (s, id) => terrainOn(s, id) || (grassOn(s, id) ? "grass" : "bare");
export const canHoldGrass = (s, id) => isClaimed(s, id) && !terrainOn(s, id);
export const growableTiles = (s) => claimedTiles(s).filter(id => canHoldGrass(s, id));

// What the ground itself makes per second, before weather and the grass around it
export const tileGreenProd = (s, id) => (TERRAIN_OUTPUT[tileKind(s, id)] || {}).greenEssence || 0;
export const tileBlueProd = (s, id) => (TERRAIN_OUTPUT[tileKind(s, id)] || {}).blueEssence || 0;

const adjacentGrass = (s, tile) => neighbouringTiles(tile).filter(n => grassOn(s, n.id)).length;

// For tracking where land meets water, a few things deal with it
export const isWater = (s, id) => terrainOn(s, id) === "water" || terrainOn(s, id) === "pond";

export const onShore = (s, id) => {
    const tile = tileById(id);
    return !!tile && neighbouringTiles(tile).some(n => isWater(s, n.id));
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
        for (const n of neighbouringTiles(queue.pop())) {
            if (seen.has(n.id) || !grassOn(s, n.id)) continue;
            seen.add(n.id);
            queue.push(n);
        }
    }
    return seen.size;
}

// Checks neighbouring tiles to check if grass can spread there
const freeNeighbours = (s, tile) =>
    neighbouringTiles(tile).filter(n => canHoldGrass(s, n.id) && !grassOn(s, n.id));



export const isPrecipitating = (s) => (s.weatherSeconds || 0) > 0;
export const precipitatingOn = (s, id) => isPrecipitating(s) && s.weatherTile === id;

// Stopping precip. early removes the charge of the cloud and duration
export function stopPrecipitation(s) {
    s.weatherSeconds = 0;
    s.weatherTotal = 0;
    s.weatherTile = null;
    s.weatherPower = 0;
    s.weatherSoak = 0;
}

// Checks what kind of precipitation is actively falling
export const fallingKind = (s) => (isPrecipitating(s) ? precipitationKind(s) : null);

export function setPrecipitationKind(s, kind) {
    if (!PRECIPITATION[kind] || isPrecipitating(s)) return false;
    s.weatherKind = kind;
    return true;
}

// Releasing a cloud, what it gives, all that
export function startPrecipitation(s, id, event) {
    s.weatherTile = id;
    s.weatherTotal = event.seconds;
    s.weatherSeconds = event.seconds;
    s.weatherPower = event.strength;
    s.weatherSoak = event.soak;

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

    // Precipitation doesn't build up until the environment unlock is bought
    // !!!! MIGHT MAKE PRECIP. BUILD UP BUT NOT TRANSFORM? !!!!
    if (environmentBought() && s.weatherTotal > 0) {
        const fallen = (s.weatherSoak || 0) * (slice / s.weatherTotal);
        soak(s, s.weatherTile, fallen, kind);
        // For the gathering storm card
        if (cardBonus("moistureCharge") > 0) addCharge(fallen * cardBonus("moistureCharge"));
    }

    s.weatherSeconds = Math.max(0, s.weatherSeconds - dt);
    if (s.weatherSeconds === 0) s.weatherTile = null;
    else if (cardActive("monsoon")) followTheLand(s);
}

// What the cloud above is worth to the tile beneath it
export const weatherBoostOn = (s, id) => Math.max(
    precipitatingOn(s, id) ? PRODUCTION_BOOST * (s.weatherPower || 0) : 0,
    PRODUCTION_BOOST * buildupTotalOn(s, id));

// For the monsoon card
function followTheLand(s) {
    const here = grassOn(s, s.weatherTile);
    if (here && here.stage < MATURE) return; 

    const near = neighbouringTiles(tileById(s.weatherTile))
        .filter(n => isClaimed(s, n.id) && !terrainOn(s, n.id));
    if (near.length === 0) return;

    const growthOf = (id) => {
        const grass = grassOn(s, id);
        return grass ? grass.stage + Math.min(1, grass.progress) : -1; 
    };
    const target = near.reduce((best, n) => growthOf(n.id) < growthOf(best.id) ? n : best, near[0]);
    if (growthOf(target.id) >= growthOf(s.weatherTile)) return;

    s.weatherTile = target.id;
}



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


// Nothing drains off the tile being rained on. Drying starts once the cloud has moved on
export function tickBuildup(s, dt) {
    const under = isPrecipitating(s) ? s.weatherTile : null;

    for (const kind of PRECIPITATION_KINDS) {
        const store = s[PRECIPITATION[kind].store];
        if (!store) continue;

        for (const id in store) {
            if (id === under) continue;
            const left = store[id] - dryingRate(store[id]) * dt;
            if (left > 0) store[id] = left;
            else delete store[id];
        }
    }
}


export function setTerrain(s, id, kind) {
    if (!s.terrain) s.terrain = {};
    if (kind === "bare") delete s.terrain[id];
    else { s.terrain[id] = kind; seeTerrain(s, kind); }

    if (s.grass) delete s.grass[id];
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

export function terrainProduction(s) {
    const total = { greenEssence: 0, blueEssence: 0 };
    const bonuses = grassBonuses(s);
    for (const id of terrainTiles(s)) {
        const boost = 1 + weatherBoostOn(s, id);
        const green = tileGreenProd(s, id);
        const blue = tileBlueProd(s, id);
        if (green > 0) total.greenEssence += green * boost * neighbourGrassMultiplier(s, id, bonuses.green);
        if (blue > 0) total.blueEssence += blue * boost * neighbourGrassMultiplier(s, id, bonuses.blue);
    }
    return total;
}

// The share of the grass around a tile that the tile keeps for itself. One multiplier per
// neighbour, stacked, so a tile with grass on every side is worth far more than one with a single one
function neighbourGrassMultiplier(s, id, bonusOf) {
    const tile = tileById(id);
    if (!tile) return 1;
    let total = 1;
    for (const n of neighbouringTiles(tile)) {
        if (grassOn(s, n.id)) total *= 1 + ADJACENT_SHARE * bonusOf(n.id);
    }
    return total;
}

// Counts how many tiles of each kind there are
export function tileCounts(s) {
    const counts = {};
    for (const kind in TERRAIN) counts[kind] = 0;
    for (const id of claimedTiles(s)) counts[tileKind(s, id)]++;
    return counts;
}

// The kinds of terrain that are unlocked right now
export function knownKinds(s = worldState()) {
    const reached = new Set();
    for (const kind in TERRAIN) if (!TERRAIN[kind].stored) reached.add(kind);
    for (const recipe of knownTransforms(s)) {
        for (const kind of recipe.inputs) reached.add(kind);
        reached.add(recipe.output);
    }
    for (const id of claimedTiles(s)) reached.add(tileKind(s, id));
    return Object.keys(TERRAIN).filter(kind => reached.has(kind));
}



// A selection is one tile being changed (s.selectedTile) plus the claimed tiles around it
// picked as fodder (s.transformFodder). Both live on the world's slot, so a transformation
// half set up survives closing the game
export const transformFodder = (s) => (s.transformFodder || []).filter(id => isClaimed(s, id));

// Only mature grass can be transformed.
export function canTransformTile(s, id) {
    if (!isClaimed(s, id)) return false;
    const grass = grassOn(s, id);
    return !grass || grass.stage === MATURE;
}

// Checks if the selected transform is one that can work
export const transformReady = (s) =>
    !!s.selectedTile && [s.selectedTile, ...transformFodder(s)].every(id => canTransformTile(s, id));


export function isTransformCandidate(s, id) {
    if (!s.selectedTile || id === s.selectedTile || !isClaimed(s, id)) return false;
    if (!canTransformTile(s, s.selectedTile) || !canTransformTile(s, id)) return false;
    const from = tileById(s.selectedTile);
    return !!from && neighbouringTiles(from).some(n => n.id === id);
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
    if (left === recipe.output) return "Nothing is spent - they come up with it.";
    if (fodderUntouched(recipe)) return "Nothing is spent - the rest are left as they are.";
    if (left === "bare") return "The tiles fed in are spent, and left as bare ground.";
    return `The tiles fed in drop back to ${TERRAIN[left].name.toLowerCase()}.`;
}

export function fodderSummary(recipe) {
    const left = fodderResult(recipe);
    if (left === recipe.output) return "Spends nothing - the tiles fed in are carried up too.";
    if (fodderUntouched(recipe)) return "Spends nothing - the tiles fed in are left as they are.";
    if (left === "bare") return "Spends the tiles fed in.";
    return `Spends the tiles fed in back down to ${TERRAIN[left].name.toLowerCase()}.`;
}

// Only transforms a real and unlocked transformation
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

// The deep drinkers card takes the best band for any moisture in it, so being soaked stops costing anything.
export const dampGrowth = (s, id) => {
    const wet = moistureOn(s, id);
    if (cardActive("dampMastery") && wet >= DAMP_DRY) return DAMP_PEAK;
    return DAMP_BANDS.find(band => wet < band.upTo).rate;
};

export function growthRate(s, tile, stage = SEED) {
    const region = cardBonus("regionBonus"); // Green dominion checks region instead of adjacent
    const fromNeighbours = region > 0
        ? 1 + region * regionSize(s, tile)
        : 1 + NEIGHBOUR_BONUS * (1 + cardBonus("adjacencyBonus")) * adjacentGrass(s, tile);

    const fromUpgrades = 1 + GROWTH_PER_LEVEL * level("richerSoil");
    const falling = fallingKind(s);
    const helping = falling && PRECIPITATION[falling].growsGrass && s.weatherTile === tile.id;
    const fromRain = helping ? 1 + (GROWTH_BOOST - 1) * (s.weatherPower || 0) : 1;
    const fromDamp = dampGrowth(s, tile.id);
    const fromCards = 1 + cardBonus("grassGrowth");
    const devFastGrass = !!state.settings.enableFastGrass == true ? [28, 18, 8] : [0, 0, 0] // Dev tool to make grass grow really fast

    const seconds = (STAGE_SECONDS[stage] / (stage === MATURE ? 1 + cardBonus("matureWait") : 1)) - devFastGrass[stage];
    const fromGrass = grassSpeedMultiplier();
    return (fromNeighbours * fromUpgrades * fromRain * fromDamp * fromCards * fromGrass)
        / seconds;
}

const DEEP_ROOTS_SECONDS = 120;  
function ageBonus(s, id) {
    const bonus = cardBonus("deepRoots");
    if (bonus <= 0) return 0;
    const age = (s.grass[id] || {}).matureFor || 0;
    return bonus * (age / (age + DEEP_ROOTS_SECONDS));
}

// The bits every tile shares are worked out once, then it hands back what one tile is worth
export function grassOutputs(s) {
    const perLevel = 1 + OUTPUT_PER_LEVEL * level("greenerBlades") + cardBonus("grassOutput");
    // For the fertile waters card
    const fromAlgae = cardBonus("shoreExchange") > 0
        ? cardBonus("shoreExchange") * (getLayerState("pond").algae || 0) : 0;
    // Which grass is being grown, and the milestones that make all of them worth more
    const fromGrass = grassOutputMultiplier();
    return (id) => {
        const shore = fromAlgae > 0 && onShore(s, id) ? fromAlgae : 0;
        return STAGE_BONUS[s.grass[id].stage] * (perLevel + ageBonus(s, id) + shore)
            * (1 + weatherBoostOn(s, id)) * fromGrass;
    };
}

// Wet ground boosts blue based on green production modified by this
// Has to be pretty high since it doesn't get much from the adjacent grass bonus
// Also because it costs blue to get it, so it kinda needs this
export const SOAKED_BLUE = 32;

export function grassBonuses(s) {
    const green = grassOutputs(s);
    return { green, blue: (id) => green(id) * SOAKED_BLUE * buildupTotalOn(s, id) };
}

// What one tile of grass adds to each multiplier, as the fraction on top of it. The same thing
// the map sums, not a multiplier itself
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

export const grassGreenMultiplier = (s = worldState()) => 1 + greenBonus(s);
export const grassBlueMultiplier = (s = worldState()) => 1 + blueBonus(s);


// If there's no grass in the world and grass is unlocked, you must plant the first seed.
// Can't do it on anything but bare ground
export const canPlant = (s, id) => grassTiles(s).length === 0 && canHoldGrass(s, id) && !grassOn(s, id) && !!getLayerState("cores").purchasedUpgrades.grass;

export function plantGrass(s, id) {
    if (!s.grass) s.grass = {};
    s.grass[id] = { stage: SEED, progress: 0 };
}

// Dev tool function, fully matures grass
export function growFully(s, id) {
    const grass = grassOn(s, id);
    if (!grass || grass.stage === MATURE) return false;
    grass.stage = MATURE;
    grass.progress = 0;
    return true;
}

// One tick of everything growing. Mature grass seeds a free neighbour tile and returns to seed stage
export function tickGrass(dt) {
    const s = worldState();
    if (!s.grass) return;

    // Grows before it spreads, makes grass not compete for the same spot
    const ready = [];
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
            if (grass.stage === MATURE) justMatured.push(tile);
        }

        // Mature grass stays mature for a little bit so it doesn't immediately flicker between growing and seed stages
        if (grass.stage === MATURE) {
            grass.matureFor = (grass.matureFor || 0) + dt;   // For the deep roots card
            if (cardActive("noMatureWait")) { // For the wildfire growth card
                grass.progress = 1;
                grass.blockedWait = 0;
            } else if (freeNeighbours(s, tile).length === 0) {
                grass.blockedWait = BLOCKED_WAIT_SECONDS - (!!state.settings.enableFastGrass == true ? 8 : 0);    // Nowhere to go, so arm the wait for when a tile opens
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
        const free = freeNeighbours(s, tile).filter(n => !taken.has(n.id));
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
            const free = freeNeighbours(s, tile).filter(n => !taken.has(n.id));
            if (free.length === 0) continue;
            const target = free[Math.floor(Math.random() * free.length)];
            taken.add(target.id);
            s.grass[target.id] = { stage: SEED, progress: seedProgress() };
        }
    }

    // Paid at the end rather than per spread, so a chain reaction's extra tiles are counted
    if (taken.size > 0) earnSpreadGrowth(taken.size);
}

const seedProgress = () => Math.min(0.99, cardBonus("seedProgress") + grassSeedStart());
const SHORE_BOOST_SECONDS = 10;

// For the creeping growth card. Collects ticks spread from other grass
function collectSpill(s, tile, gained, out) {
    const chance = cardBonus("growthSpill");
    if (chance <= 0 || Math.random() >= chance) return;

    const neighbours = neighbouringTiles(tile).filter(n => grassOn(s, n.id));
    if (neighbours.length === 0) return;

    const target = neighbours[Math.floor(Math.random() * neighbours.length)];
    out.push([target.id, gained]);
}

// For the rain dance card
function callRainNear(s, tile) {
    const chance = cardBonus("rainDance");
    if (chance <= 0 || isPrecipitating(s)) return;
    if (Math.random() >= chance) return;

    const near = neighbouringTiles(tile).filter(n => isClaimed(s, n.id) && !terrainOn(s, n.id));
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
