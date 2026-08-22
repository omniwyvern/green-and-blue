// worldMap.js
//
// The data of the world map and things in it. The world layer is the view of things and
// the land layer shows data on stuff, they don't need to import each other.
//
// The world's save slot stores stuff like:
// world.tiles[id] = true                A claimed tile.
// world.grass[id] = { stage, progress } If grass is on the tile, plus its growth stage.
// world.terrain[id] = "water"           What the ground itself has become, if anything.
// world.moisture[id] = 0..1             How wet bare ground has got, on its way to water.
//
// Tiles can have multiple things in them (permanently or temporaryly) so they get
// their own map as well as grass. Makes things a little bit easier I think maybe

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
// The cloud itself lives on the Precipitation layer - the map only runs what it hands over.
import { addCharge, driftingEvent } from "./precipitationSublayer.js";

export const MAP_RADIUS = 1;    // Radius 1 is a center tile and one on each of its six faces.
export const TILE_SIZE = 60;    // Tile size (center to corner) in canvas units.

export const MAP = hexesWithin(MAP_RADIUS);
const IN_MAP = new Set(MAP.map(t => t.id));

// Transformations work in tile ids (that's what a selection is)
// Hex tiles, works off of axial coordinates (q along row, r down and to the right)
const TILE_BY_ID = new Map(MAP.map(t => [t.id, t]));
export const tileById = (id) => TILE_BY_ID.get(id) || null;

// The first tile unlocked when you buy land, and when it's reset
export const ORIGIN_TILE = "0,0";

// Grass grows in three stages, then seeds a free neighbouring tile
export const SEED = 0, GROWING = 1, MATURE = 2;
export const STAGE_NAMES = ["Seed", "Growing", "Mature"];


// How many seconds the grass growth stages take. Last one is the wait time before mature grass spreads.
const STAGE_SECONDS = [30, 20, 10];
// Mature grass that's been boxed in waits this long once a tile finally opens up, so unlocking or
// transforming a tile next to long-since-mature grass doesn't spread into it the same instant.
const BLOCKED_WAIT_SECONDS = 10;
const NEIGHBOUR_BONUS = 0.05;   // Faster per adjacent grassy tile.
const GROWTH_PER_LEVEL = 0.10; 

export const LAND_COST = () => ({ greenEssence: D(2e6), blueEssence: D(2e6) });

// !!!! MAYBE CHANGE THIS !!!!
// Green Essence per second, per tile, by stage
export const STAGE_OUTPUT = [0, 20, 50];
const OUTPUT_PER_LEVEL = 0.5;   // per level of greener blades.


// How much the next tile cost. It's stored here because rain is priced off of it.
const TILE_BASE_COST = D(2e5);
const TILE_COST_SCALE = D(3);   // Cost scaling based on number of owned tiles.
export const tileCost = (s) => ({
    greenEssence: TILE_BASE_COST.mul(TILE_COST_SCALE.pow(claimedTiles(s).length - 1)),
});


export const PRECIPITATION = {
    rain: {
        name: "Rain",
        store: "moisture",   // Which map on the world's slot holds rain buildup.
        becomes: "water",
        makes: "water",      // What the precipitation is made of, some tiles shed a type.
        growsGrass: true,    // Grass growth speeds up if it's being rained on.
    },
    snow: {
        name: "Snow",
        store: "snowpack",
        becomes: "snow",
        makes: "ice",
        growsGrass: false,
    },
};

export const PRECIPITATION_KINDS = Object.keys(PRECIPITATION);

// Which kind of precipitation is loaded. Falls back to rain so a save before snow doesn't cause problems.
export const precipitationKind = (s) => (PRECIPITATION[s.weatherKind] ? s.weatherKind : "rain");

export const PRECIPITATION_SECONDS = 25;

const GROWTH_BOOST = 3;
export const PRODUCTION_BOOST = 0.25;

const CHARGE_COST_OF_TILE = 0.6;
export const chargeCost = (s) =>
    // Divided rather than subtracted, so no stack of Light Drizzles can make a cloud free.
    tileCost(s).greenEssence.mul(CHARGE_COST_OF_TILE).div(1 + cardBonus("rainCost"));


// Tracks how many uses of precipitation are needed to transform the tile, by tier.
// So bare ground, water, or snow only need 1, but everything else needs 3/4/5 depending on tier.

// Kinds can also override with their own number, which is just grass that does that for now.
export const ACTIVATIONS_BY_TIER = [1, 3, 4, 5];

export const tierOf = (kind) => TERRAIN[kind].tier || 0;
export const activationsForKind = (kind) => TERRAIN[kind].activations || ACTIVATIONS_BY_TIER[tierOf(kind)];
export const activationsFor = (s, id) => activationsForKind(tileKind(s, id));



export const shedsPrecipitation = (s, id, kind) =>
    TERRAIN[tileKind(s, id)].madeOf === PRECIPITATION[kind].makes;

// Slower buildup loss than precipitation gives.
export const BUILDUP_LOST_PER_SECOND = 0.0025;

// Tiles naturally drain/melt so this is a little bit of wiggle room for precipitation to account for it.
const GAP_SECONDS_COVERED = 20;

// This makes it actually wiggle room and not just a discount.
const MOST_OF_A_RUN = 0.95;

const buildupAim = (activations) => Math.max(
    1 / (1 + (activations - 1) * GAP_SECONDS_COVERED * BUILDUP_LOST_PER_SECOND),
    (activations - 1) / (activations * MOST_OF_A_RUN),
);

// What a whole tile's worth of buildup really costs, drain between clouds included.
export const soakScale = (s, id) => {
    const activations = activationsFor(s, id);
    return activations * buildupAim(activations);
};

// How much a cloud is worth to ground that is already wet. This thins the production boost
// only - the water a release leaves behind is unaffected. Tuned off the middle intensity onto a
// forest: the first is worth a quarter again on what the tile makes, the one straight after it
// about seven percent.
const SATURATION = 0.09;        // How full the ground has to be for a cloud to be worth half
const SATURATION_POWER = 1.5;   // How sharply it falls away past that
export const wetnessFactor = (s, id, kind) =>
    1 / (1 + Math.pow(buildupOn(s, id, kind) / SATURATION, SATURATION_POWER));

export const TERRAIN = {
    // Precursors terrain, it's not really terrain.
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
// What a tile of each kind is worth per second. Grass is dealt with elsewhere.
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
// WHAT THE FODDER IS LEFT AS. The tile being changed becomes `output`; the tiles fed in are
// whatever the recipe says, and there are three ways of saying it:
//
//   consumes: true      spent, and handed back as bare ground
//   consumes: false     carried up - they become the output as well, so nothing is spent
//   leaves: "water"     spent, but only back DOWN to the named kind rather than all the way
//
// `leaves` is the general case and wins wherever it's set - the other two are the two answers
// common enough to be worth a shorthand. It's what a ladder uses to cost a step in its own
// terms instead of in bare ground: a reef is built out of two ponds and gives the water back,
// so climbing the reef line costs ponds rather than costing the map. See fodderResult().

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
        text: "The reef grows a variety of life, never seen anywhere else."
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
        text: "No longer a simple block of ice, massive stretches of land freeze harder and harder.",
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

// Gets the neighbouring tiles to a specific one. Ignores where directions where the map border is.
export function neighbouringTiles(tile) {
    return neighboursOf(tile).filter(n => IN_MAP.has(n.id));
}

export const isClaimed = (s, id) => !!(s.tiles || {})[id];
export const grassOn = (s, id) => (s.grass || {})[id] || null;
export const grassTiles = (s) => Object.keys(s.grass || {});
export const matureTiles = (s) => grassTiles(s).filter(id => s.grass[id].stage === MATURE);
export const claimedTiles = (s) => Object.keys(s.tiles || {}).filter(id => s.tiles[id]);

// What the ground has been turned into.
export const terrainOn = (s, id) => (s.terrain || {})[id] || null;
export const terrainTiles = (s) => Object.keys(s.terrain || {});

// How close a tile is towards becoming snow/water based on precipitation.
export const buildupOn = (s, id, kind) => ((s[PRECIPITATION[kind].store]) || {})[id] || 0;
export const moistureOn = (s, id) => buildupOn(s, id, "rain");
export const snowOn = (s, id) => buildupOn(s, id, "snow");

export const tileKind = (s, id) => terrainOn(s, id) || (grassOn(s, id) ? "grass" : "bare");
export const canHoldGrass = (s, id) => isClaimed(s, id) && !terrainOn(s, id);
export const growableTiles = (s) => claimedTiles(s).filter(id => canHoldGrass(s, id));

const adjacentGrass = (s, tile) => neighbouringTiles(tile).filter(n => grassOn(s, n.id)).length;

// For tracking where land meets water, a few things deal with it.
export const isWater = (s, id) => terrainOn(s, id) === "water" || terrainOn(s, id) === "pond";

export const onShore = (s, id) => {
    const tile = tileById(id);
    return !!tile && neighbouringTiles(tile).some(n => isWater(s, n.id));
};

export function shoreGrassTiles(s = worldState()) {
    if (Object.keys(s.terrain || {}).length === 0) return 0;
    return grassTiles(s).filter(id => onShore(s, id)).length;
}

// How big a connected patch of grass is, for the Green Dominion card (and maybe more later idk)
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

// Whatever the event hadn't handed over yet is given up with it, so calling a cloud off early
// is a real choice rather than a free way to stop a tile short of flooding.
export function stopPrecipitation(s) {
    s.weatherSeconds = 0;
    s.weatherTotal = 0;
    s.weatherTile = null;
    s.weatherPower = 0;
    s.weatherSoak = 0;
}

// Checks what kind of precipitation is actively falling.
export const fallingKind = (s) => (isPrecipitating(s) ? precipitationKind(s) : null);

export function setPrecipitationKind(s, kind) {
    if (!PRECIPITATION[kind] || isPrecipitating(s)) return false;
    s.weatherKind = kind;
    return true;
}

// Letting a cloud go. The cloud is what decides what a release is worth - this takes the event
// it hands over and runs it: how long it falls for, how hard, and how much water it owes the
// ground while it does.
export function startPrecipitation(s, id, event) {
    s.weatherTile = id;
    s.weatherTotal = event.seconds;
    s.weatherSeconds = event.seconds;
    s.weatherPower = event.strength;
    s.weatherSoak = event.soak;

    // For the seedstorm card.
    if (PRECIPITATION[precipitationKind(s)].growsGrass
        && cardBonus("seedstorm") > 0 && Math.random() < cardBonus("seedstorm")
        && canHoldGrass(s, id) && !grassOn(s, id) && grassTiles(s).length > 0) {
        plantGrass(s, id);
    }
}

export function tickPrecipitation(s, dt) {
    if (!isPrecipitating(s)) return;
    const kind = precipitationKind(s);
    // The water owed goes with the time served rather than with the frame, so the part tick an
    // event ends on hands over its share and not a whole one.
    const slice = Math.min(dt, s.weatherSeconds);

    // Precipitation doesn't build up until the environment unlock is bought.
    if (environmentBought() && s.weatherTotal > 0) {
        const fallen = (s.weatherSoak || 0) * (slice / s.weatherTotal);
        soak(s, s.weatherTile, fallen, kind);
        // For the gathering storm card.
        if (cardBonus("moistureCharge") > 0) addCharge(fallen * cardBonus("moistureCharge"));
    }

    s.weatherSeconds = Math.max(0, s.weatherSeconds - dt);
    if (s.weatherSeconds === 0) s.weatherTile = null;
    else if (cardActive("monsoon")) followTheLand(s);
}

// What the cloud overhead is worth to the tile under it, as a fraction on top of what it makes.
export const weatherBoostOn = (s, id) =>
    precipitatingOn(s, id) ? PRODUCTION_BOOST * (s.weatherPower || 0) : 0;

// For the monsoon card.
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
    

    // For the floodplain card.
    // !!!! THIS WILL CHANGE !!!!
    // this was before I added snow so uhhhhh
    const deep = kind === "rain" && cardActive("floodPlain");
    setTerrain(s, id, deep ? "pond" : PRECIPITATION[kind].becomes);
    return true;
}


export function tickBuildup(s, dt) {
    const falling = fallingKind(s);

    for (const kind of PRECIPITATION_KINDS) {
        const store = s[PRECIPITATION[kind].store];
        if (!store) continue;

        for (const id in store) {
            if (kind === falling && id === s.weatherTile) continue;
            const left = store[id] - BUILDUP_LOST_PER_SECOND * dt;
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

// WHAT THE PLAYER HAS EVER HAD. Recorded by setTerrain, which is the one way ground ever
// changes, so it doesn't matter how the tile came about - a transformation, a cloud flooding
// it, the dev tool - if it has ever existed on the map, it's in here. Kept as its own record
// rather than read off the map, because the map only says what's there NOW and a kind you
// made and then transformed away is still one you've seen.
export function seeTerrain(s, kind) {
    if (!TERRAIN[kind] || !TERRAIN[kind].stored) return;
    if (!s.seenTerrain) s.seenTerrain = {};
    s.seenTerrain[kind] = true;
}

// Bare ground and grass aren't stored terrain and can't be missed, so they never count as
// undiscovered. Anything standing on the map counts too and is written down as it's found:
// that's what carries a save made before this was being recorded, and it means nothing the
// player is currently looking at can ever be called unknown.
export function hasSeenKind(s, kind) {
    if (!TERRAIN[kind] || !TERRAIN[kind].stored) return true;
    if ((s.seenTerrain || {})[kind]) return true;
    if (!terrainTiles(s).some(id => s.terrain[id] === kind)) return false;
    seeTerrain(s, kind);
    return true;
}

export function terrainProduction(s) {
    const total = { greenEssence: 0, blueEssence: 0 };
    for (const id of terrainTiles(s)) {
        const output = TERRAIN_OUTPUT[s.terrain[id]];
        const boost = 1 + weatherBoostOn(s, id);
        for (const resourceId in output) total[resourceId] += output[resourceId] * boost;
    }
    return total;
}

// Counts how many tiles of each kind there are.
export function tileCounts(s) {
    const counts = {};
    for (const kind in TERRAIN) counts[kind] = 0;
    for (const id of claimedTiles(s)) counts[tileKind(s, id)]++;
    return counts;
}

// The kinds of terrain that are unlocked right now.
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



// TRANSFORMATIONS
//
// A selection is one tile being changed (s.selectedTile) plus the claimed tiles around it
// picked as fodder (s.transformFodder). Both live on the world's slot, so a transformation
// half set up survives closing the game.

export const transformFodder = (s) => (s.transformFodder || []).filter(id => isClaimed(s, id));

// Only mature grass can be transformed.
export function canTransformTile(s, id) {
    if (!isClaimed(s, id)) return false;
    const grass = grassOn(s, id);
    return !grass || grass.stage === MATURE;
}

// Checks if the selected transform is one that can work.
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

// What a locked transformation is waiting for.
export const transformHint = (recipe, s = worldState()) =>
    (recipe && recipe.hint && recipe.hint(s)) || "Something is missing...";

// Which transform would happen based on what is currently selected.
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

// What the FODDER tiles are left as - the part of a recipe that decides what a transformation
// actually costs. One answer, worked out here, so the map and the two places that describe a
// recipe can't come to different conclusions about it:
//
//   consumes: true      spent. Handed back as bare ground, to be grown or rained on again.
//   consumes: false     carried up. They become the output too, so nothing is spent.
//   leaves: "water"     spent DOWN TO something rather than all the way. Overrides consumes -
//                       a recipe that names what it leaves has already said whether it spends.
export const fodderResult = (recipe) =>
    recipe.leaves || (recipe.consumes ? "bare" : recipe.output);

// A recipe whose inputs are ALL the kind it leaves behind doesn't cost anything either -
// whichever of them ends up as fodder is already that kind and comes back out of it untouched.
// Deep ocean is the one that works this way: six oceans, one of which deepens.
const fodderUntouched = (recipe) => recipe.inputs.every(kind => kind === fodderResult(recipe));

// Whether running it costs the player the tiles fed in. Anything that doesn't hand them back
// unchanged is spending them, however far back down it puts them.
export const fodderSpends = (recipe) =>
    fodderResult(recipe) !== recipe.output && !fodderUntouched(recipe);

// The same fact in words, in the two lengths the game needs it: long for the preview window
// while you're picking tiles, short for the row on the reference page. Both live here beside
// the rule they describe, since the difference between spending four tiles and keeping them
// is the thing a player most needs the two to agree on.
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

// Only transforms a real and unlocked transformation.
export function applyTransform(s) {
    const recipe = matchedTransform(s);
    if (!recipe || !transformAvailable(recipe, s) || !transformReady(s)) return false;

    const fodder = transformFodder(s);
    const touched = [s.selectedTile, ...fodder];
    const left = fodderResult(recipe);

    setTerrain(s, s.selectedTile, recipe.output);
    for (const id of fodder) setTerrain(s, id, left);

    // Precipitation is stopped if the tile transforms, so it doesn't just immediately mess up what you did.
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

// Standing moisture is worth something to grass on its own, separate from anything falling on
// it. Damp is best, sodden is worse than dry.
const DAMP_BANDS = [
    { upTo: 0.10, rate: 1 },
    { upTo: 0.30, rate: 1.2 },
    { upTo: 0.50, rate: 1.1 },
    { upTo: 0.70, rate: 1 },
    { upTo: Infinity, rate: 0.9 },
];

export const dampGrowth = (s, id) => {
    const wet = moistureOn(s, id);
    return DAMP_BANDS.find(band => wet < band.upTo).rate;
};

// How quickly grass matures through each stage.
export function growthRate(s, tile, stage = SEED) {
    // Green Dominion card swaps the neighbour count for the size of all connected ones.
    const region = cardBonus("regionBonus");
    const fromNeighbours = region > 0
        ? 1 + region * regionSize(s, tile)
        : 1 + NEIGHBOUR_BONUS * (1 + cardBonus("adjacencyBonus")) * adjacentGrass(s, tile);

    const fromUpgrades = 1 + GROWTH_PER_LEVEL * level("richerSoil");
    const falling = fallingKind(s);
    // How hard it's coming down, not just whether it is - a drizzle is worth a fraction of what
    // a downpour is, and either one onto ground that's already wet is worth less again.
    const helping = falling && PRECIPITATION[falling].growsGrass && s.weatherTile === tile.id;
    const fromRain = helping ? 1 + (GROWTH_BOOST - 1) * (s.weatherPower || 0) : 1;
    const fromDamp = dampGrowth(s, tile.id);
    const fromCards = 1 + cardBonus("grassGrowth");
    const devFastGrass = !!state.settings.enableFastGrass == true ? 28 : 0 // Dev tool to make grass grow really fast.

    const seconds = STAGE_SECONDS[stage] / (stage === MATURE ? 1 + cardBonus("matureWait") : 1);
    // Which grass is being grown, and the milestones that hurry all of them along.
    const fromGrass = grassSpeedMultiplier();
    return (fromNeighbours * fromUpgrades * fromRain * fromDamp * fromCards * fromGrass)
        / (seconds - devFastGrass);
}

// For the full canopy card.
function canopyBonus(s) {
    const bonus = cardBonus("canopyOutput");
    if (bonus <= 0) return 0;
    const growable = growableTiles(s);
    if (growable.length === 0 || !growable.every(id => grassOn(s, id))) return 0;
    // For the verdant embrace card.
    return cardActive("canopyAdjacency") ? bonus * (1 + cardBonus("adjacencyBonus")) : bonus;
}

// For the deep roots card.
const DEEP_ROOTS_SECONDS = 120;  
function ageBonus(s, id) {
    const bonus = cardBonus("deepRoots");
    if (bonus <= 0) return 0;
    const age = (s.grass[id] || {}).matureFor || 0;
    return bonus * (age / (age + DEEP_ROOTS_SECONDS));
}

export function production(s) {
    const perLevel = 1 + OUTPUT_PER_LEVEL * level("greenerBlades") + cardBonus("grassOutput") + canopyBonus(s);
    // For the fertile waters card.
    const fromAlgae = cardBonus("shoreExchange") > 0
        ? cardBonus("shoreExchange") * (getLayerState("pond").algae || 0) : 0;

    let total = 0;
    for (const id of grassTiles(s)) {
        const shore = fromAlgae > 0 && onShore(s, id) ? fromAlgae : 0;
        total += STAGE_OUTPUT[s.grass[id].stage] * (perLevel + ageBonus(s, id) + shore)
            * (1 + weatherBoostOn(s, id));
    }
    // Which grass is being grown, and the milestones that make all of them worth more.
    return total * grassOutputMultiplier();
}



// If there's no grass in the world and grass is unlocked, you must plant the first seed.
// Can't do it on anything but bare ground.
export const canPlant = (s, id) => grassTiles(s).length === 0 && canHoldGrass(s, id) && !grassOn(s, id) && !!getLayerState("cores").purchasedUpgrades.grass;

export function plantGrass(s, id) {
    if (!s.grass) s.grass = {};
    s.grass[id] = { stage: SEED, progress: 0 };
}

// Dev tool function, fully matures grass.
export function growFully(s, id) {
    const grass = grassOn(s, id);
    if (!grass || grass.stage === MATURE) return false;
    grass.stage = MATURE;
    grass.progress = 0;
    return true;
}

// One tick of everything growing. Mature grass seeds a free neighbour tile and returns to seed stage.
export function tickGrass(dt) {
    const s = worldState();
    if (!s.grass) return;

    // Grows before it spreads, makes grass not compete for the same spot.
    const ready = [];
    const justMatured = [];
    const spill = [];  
    for (const tile of MAP) {
        const grass = s.grass[tile.id];
        if (!grass) continue;

        const gained = growthRate(s, tile, grass.stage) * dt;
        grass.progress += gained;

        // For spreading roots and unrestricted growth cards.
        collectSpill(s, tile, gained, spill);

        while (grass.progress >= 1 && grass.stage < MATURE) {
            grass.progress -= 1;
            grass.stage++;
            if (grass.stage === MATURE) justMatured.push(tile);
        }

        // Mature grass stays mature for a little bit so it doesn't immediately flicker between growing and seed stages.
        if (grass.stage === MATURE) {
            grass.matureFor = (grass.matureFor || 0) + dt;   // For the deep roots card.
            // For the wildfire growth card.
            if (cardActive("noMatureWait")) {
                grass.progress = 1;
                grass.blockedWait = 0;
            } else if (freeNeighbours(s, tile).length === 0) {
                grass.blockedWait = BLOCKED_WAIT_SECONDS;    // Nowhere to go, so arm the wait for when a tile opens.
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

    // For the rain dance card.
    for (const tile of justMatured) callRainNear(s, tile);

    // Randomly selects which mature grass spreads, so that it isn't just position-based.
    shuffle(ready);

    // Tiles are claimed as grass spreads, so that only one of them returns to seed stage.
    const taken = new Set();

    for (const tile of ready) {
        const free = freeNeighbours(s, tile).filter(n => !taken.has(n.id));
        if (free.length === 0) continue;
        const target = free[Math.floor(Math.random() * free.length)];

        taken.add(target.id);
        // For the established roots card.
        s.grass[tile.id] = { stage: SEED, progress: Math.min(0.99, cardBonus("spreadRetain")) };
    }

    for (const id of taken) {
        if (!s.grass[id]) s.grass[id] = { stage: SEED, progress: seedProgress() };
        // For the living shore card.
        if (cardBonus("shoreSpawn") > 0 && onShore(s, id)) s.shoreBoostLeft = SHORE_BOOST_SECONDS;
    }

    // For the chain reaction card.
    if (cardBonus("chainReaction") > 0) {
        // Makes sure that it can't have one seed grow the entire world.
        for (const id of [...taken]) {
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
    // too - every tile in `taken` is one the grass didn't have when the tick started.
    if (taken.size > 0) earnSpreadGrowth(taken.size);
}

// For the bursting growth card and combos. Maybe just one, me no rember.
// How grown a tile is the moment the grass reaches it - the Seed Bank upgrade on top of
// whatever the cards give. Capped short of 1 so a new tile still has a stage to go.
const seedProgress = () => Math.min(0.99, cardBonus("seedProgress") + grassSeedStart());
const SHORE_BOOST_SECONDS = 10;

// For a few cards. Collects ticks spread from other grass.
function collectSpill(s, tile, gained, out) {
    const anyChance = cardBonus("growthSpillAny");
    const grassChance = cardBonus("growthSpill");
    if (anyChance <= 0 && grassChance <= 0) return;

    const neighbours = neighbouringTiles(tile).filter(n => grassOn(s, n.id));
    if (neighbours.length === 0) return;

    for (const chance of [grassChance, anyChance]) {
        if (chance <= 0 || Math.random() >= chance) continue;
        const target = neighbours[Math.floor(Math.random() * neighbours.length)];
        out.push([target.id, gained]);
    }
}

// For the rain dance card.
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
