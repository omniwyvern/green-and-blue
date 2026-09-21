// forestTrees.js
//
// Tree growth, specializations, and old growth bonuses (plain numbers, no Decimals)

import { state, getLayerState, layerUnlocked } from "../../../core/state.js";
import { registerBoost } from "../../../core/boosts.js";
import { cardBonus, cardActive } from "./cards.js";
import { traitBonus, traitHas, registerScale } from "./evolutionTraits.js";
import {
    worldState, tilesOf, weightOf, tileKind, grassState, matureTiles,
    contributeTileOutput, adjacentOfKind, soften, WOODLAND_KINDS,
} from "./worldMap.js";
import { challengeMod, challengeDone, challengeBlocks } from "./challenges.js";
import { coreNodeBought } from "../../../core/nodes.js";
import { clamp01 } from "../../../utils/math.js";
import { deltaPercent } from "../../../utils/format.js";

export const forestState = () => getLayerState("woodland");

const worldRaining = () => {
    const world = getLayerState("world");
    return (world.weatherSeconds || 0) > 0 && (world.weatherKind || "rain") === "rain";
};


//    !!! WHAT WOODLAND IS WORTH !!!

// Woodland counted by tier, not by tile: an ancient forest is worth three ordinary ones
export const woodlandWeight = (s = worldState()) => weightOf(WOODLAND_KINDS, s);

export const forestTileIds = (s = worldState()) => tilesOf(WOODLAND_KINDS, s);

export const forestIsBare = () => woodlandWeight() === 0;


// What woodland tiles on the map are worth per second. Old growth multiplies the base
const FOREST_GREEN_BASE = 3e8;
const OLD_GROWTH_POWER = 1.8;

// Additional modifiers for higher tier woodland
const FOREST_TIER_WORTH = { forest: 1, "dense-forest": 4, "ancient-forest": 14 };

// Forest mod based on adjacent forests
const NEIGHBOR_FOREST_SHARE = 0.4;

// Water and open ground are sheltered by forests, so they grow a bit faster
const SHELTER_PER_NEIGHBOR = 0.05;
const SHELTER_CEILING = 0.6;

// What the old growth behind the forest multiplies a tile by
export const oldGrowthWorth = (s = forestState()) =>
    Math.pow(1 + oldGrowth(s).length, OLD_GROWTH_POWER);

// What the forest adjacent to one tile adds to that
export const forestNeighborShare = (world, id) =>
    1 + NEIGHBOR_FOREST_SHARE * (1 + traitBonus("forestShare")) * adjacentOfKind(world, id, ...Object.keys(WOODLAND_KINDS));

// One woodland tile per second, as { greenEssence }
export function forestOutput(world, id) {
    const worth = FOREST_TIER_WORTH[tileKind(world, id)] || 0;
    if (worth <= 0) return {};
    return {
        greenEssence: FOREST_GREEN_BASE * worth * oldGrowthWorth() * forestNeighborShare(world, id),
    };
}

for (const kind of Object.keys(FOREST_TIER_WORTH)) contributeTileOutput(kind, forestOutput);

export function shelteredGrowth(world = worldState()) {
    let near = 0;
    for (const id of forestTileIds(world)) near += adjacentOfKind(world, id, "pond", "grass");
    if (near === 0) return 0;
    return soften(SHELTER_PER_NEIGHBOR * (1 + traitBonus("shelter")) * near, SHELTER_CEILING);
}


//    !!! ROOM FOR TREES !!!

// Amount of room for trees to grow
const BASE_SLOTS = 2;
const WEIGHT_PER_SLOT = 3;
const MOST_SLOTS = 6;

export const treeSlots = () => {
    const woodland = woodlandWeight();
    if (woodland === 0) return 0;
    return Math.min(MOST_SLOTS, BASE_SLOTS + Math.floor(woodland / WEIGHT_PER_SLOT)) + traitBonus("treeSlots");
};


//    !!! GROWING UP !!!

// Growth stages, the growth each one asks for, and their names
export const STAGES = [
    { at: 0,    name: "Seedling" },
    { at: 600,  name: "Sapling" },
    { at: 1200, name: "Young Tree" },
    { at: 1800, name: "Half-Grown" },
    { at: 2400, name: "Tall Tree" },
    { at: 3000, name: "Towering" },
    { at: 3600, name: "Full Height" },
];

export const CHOICES = STAGES.length - 1;
export const MATURE_AT = 4200;
export const MATURE_SECONDS = 60;   // How long before a mature tree becomes old growth

// How long a tree actually stands once it is done, which cards can cut decrease
export const standSeconds = () =>
    MATURE_SECONDS / (1 + cardBonus("shortStand")) / (1 + traitBonus("standSeconds")) / (state.settings.enableFastTrees ? 30 : 1);

// How long a tree waits to choose a growth path on itself, for the instinctive growth card
const INSTINCT_SECONDS = 120;
const instinctSeconds = () => INSTINCT_SECONDS / (1 + cardBonus("instinctSpeed"));

// Seconds until a waiting tree picks for itself, or null when it never will
export const instinctLeft = (tree) => tree.offer && cardActive("instinct")
    ? Math.max(0, instinctSeconds() - (tree.waited || 0)) : null;


// 3 growth/s, so a tree matures in about 23 minutes, or about 15 with growth paths
const BASE_GROWTH = 3;

// More room to grow gives more boost, but it's softcapped
const PER_SLOT = 0.03;
const SLOT_CEILING = 0.15;

const MATURE_WORTH = 2;   // At full height a tree is worth 2x what it was paying on the way up
const STANDING_LEAD = 2;  // ...and never less than 2x the old growth it is holding back from
const LIVING_CEILING = 3; // Softcap on mult that canopy giants give to standing trees


//    !!! WHAT A TREE PAYS !!!

// What a tree gives before its old growth and decreases bonuses. Each stat feeds its own resource
const LIVE_GREEN = 0.14;
const LIVE_BLUE = 0.14;
const LIVE_GROWTH = 0.02;


export const STATS = {
    height:   { name: "Height",   color: "#7fc46a", blurb: "How far up it gets, and how much light it takes." },
    branches: { name: "Branches", color: "#c9b45e", blurb: "How wide it spreads, and how much it shades the forest." },
    roots:    { name: "Roots",    color: "#a2743f", blurb: "How deep it holds, and how much water it pulls." },
};
export const STAT_IDS = Object.keys(STATS);

export const statTotal = (tree) => STAT_IDS.reduce((total, id) => total + Math.max(0, tree[id]), 0);


//    !!! GROWTH OPTIONS !!!

export const GROWTH_OPTIONS = {
    reachForLight: {
        name: "Reach for Light",
        stats: { height: 3, roots: -1 },
        text: "All height, no roots.",
    },
    heartwood: {
        name: "Heartwood",
        stats: { height: 2, roots: 1 },
        speed: 0.9,
        text: "A hard trunk. Slower, but deeper roots.",
    },
    wideRings: {
        name: "Wide Rings",
        stats: { height: 2, branches: 1 },
        bonus: 0.85,
        text: "Fast, soft growth.",
    },
    pioneerWood: {
        name: "Pioneer Wood",
        stats: { height: 2 },
        speed: 1.1, bonus: 0.75,
        text: "Grows tall fast, but isn't worth much.",
    },
    singleLeader: {
        name: "Single Leader",
        stats: { height: 4, branches: -1, roots: -1 },
        text: "One stem, always climbing.",
    },

    broadCrown: {
        name: "Broad Crown",
        stats: { branches: 3, height: -1 },
        text: "Grows out instead of up.",
    },
    layeredCanopy: {
        name: "Layered Canopy",
        stats: { branches: 2, roots: 1 },
        speed: 0.95,
        text: "Leaves in layers.",
    },
    crownShyness: {
        name: "Crown Shyness",
        stats: { branches: 2, height: 1 },
        speed: 0.95,
        text: "Leaves room for its neighbors.",
    },
    sunLeaves: {
        name: "Sun Leaves",
        stats: { branches: 2 },
        speed: 1.1, bonus: 0.8,
        text: "Thin leaves that catch lots of light.",
    },
    epicormic: {
        name: "Dormant Buds",
        stats: { branches: 4, height: -1, roots: -1 },
        text: "Buds sprout right out of the bark.",
    },

    taproot: {
        name: "Taproot",
        stats: { roots: 3, branches: -1 },
        text: "One deep root.",
    },
    buttressRoots: {
        name: "Buttress Roots",
        stats: { roots: 2, height: 1 },
        speed: 0.95,
        text: "Big roots that hold the trunk up, but slow it down.",
    },
    mycorrhizae: {
        name: "Mycorrhizae",
        stats: { roots: 2, branches: 1 },
        bonus: 0.85,
        text: "Fungus feeds the roots and takes a cut.",
    },
    deepDrink: {
        name: "Deep Drink",
        stats: { roots: 2 },
        speed: 1.1, bonus: 0.8,
        text: "Grows fast and low, near water.",
    },
    sinkerRoots: {
        name: "Sinker Roots",
        stats: { roots: 4, height: -1, branches: -1 },
        text: "All roots for now.",
    },

    denseGrain: {
        name: "Dense Grain",
        stats: { height: 1, branches: 1, roots: 1 },
        speed: 0.8, bonus: 1.25,
        text: "Slow growth, worth the wait.",
    },
    thickBark: {
        name: "Thick Bark",
        stats: { height: 1, roots: 1 },
        speed: 0.9, bonus: 1.25,
        text: "Keeps everything it makes.",
    },
    springwood: {
        name: "Springwood",
        stats: { height: 1, branches: 1 },
        speed: 1.1, bonus: 0.85,
        text: "Grows a year's worth in weeks.",
    },
    shadeTolerant: {
        name: "Shade Tolerant",
        stats: { branches: 1, roots: 1 },
        speed: 0.95, bonus: 1.1,
        text: "Lives on the light that gets through.",
    },

    ironwood: {
        name: "Ironwood",
        challenge: "wildwood",
        stats: { height: 2, branches: 2, roots: 2 },
        speed: 0.6, bonus: 2,
        text: "Wood so dense it sinks. Slow to grow, but worth a lot.",
    },
};

const OPTION_IDS = Object.keys(GROWTH_OPTIONS);
const offerableIds = () =>
    OPTION_IDS.filter(id => !GROWTH_OPTIONS[id].challenge || challengeDone(GROWTH_OPTIONS[id].challenge));

// Makes the options read the same as the effects they actually give
export function optionEffects(id) {
    const option = GROWTH_OPTIONS[id];
    const parts = [];
    for (const stat of STAT_IDS) {
        const amount = option.stats[stat] || 0;
        if (amount !== 0) {
            parts.push({ text: `${amount > 0 ? "+" : ""}${amount} ${STATS[stat].name}`, good: amount > 0 });
        }
    }
    if (option.speed) parts.push({ text: `${deltaPercent(option.speed)} growth`, good: option.speed > 1 });
    if (option.bonus) parts.push({ text: `${deltaPercent(option.bonus)} worth`, good: option.bonus > 1 });
    return parts;
}


//    !!! WHAT A TREE COUNTS AS !!!

// Category from the balance of stats: one well ahead is pure, two is a hybrid, none is old growth
const PURE_LEAD = 0.5;      // What amount of the tree to make it count as pure
const PURE_GAP = 0.2;       // How far ahead of the second one it has to be
const PAIR_SHARE = 0.8;     // What amount the top two stats need to
const PAIR_GAP = 0.15;      // How far ahead of the third one it has to be

export const CATEGORIES = {
    emergent: {
        name: "Emergent",
        color: "#8fd46a",
        of: ["height"],
        text: "It got above everything else and stayed there.",
        bonus: (points, bonus) => ({ speed: 0.02 * points * bonus }),
    },
    spreadingCrown: {
        name: "Spreading Crown",
        color: "#d8c463",
        of: ["branches"],
        text: "A canopy wide enough to shelter everything growing under it.",
        bonus: (points, bonus) => ({ growth: 0.11 * points * bonus }),
    },
    deepRooted: {
        name: "Deep-Rooted",
        color: "#c08a4c",
        of: ["roots"],
        text: "It found water nothing else could reach.",
        bonus: (points, bonus) => ({ biomass: 0.70 * points * bonus }),
    },
    canopyGiant: {
        name: "Canopy Giant",
        color: "#a8d75e",
        of: ["height", "branches"],
        text: "Tall and wide.",
        bonus: (points, bonus) => ({ living: 0.05 * points * bonus }),
    },
    pillarWood: {
        name: "Pillar Wood",
        color: "#9fb96a",
        of: ["height", "roots"],
        text: "Tall and deeply rooted.",
        bonus: (points, bonus) => ({ green: 0.80 * points * bonus }),
    },
    understoryWeave: {
        name: "Understory Weave",
        color: "#b79a55",
        of: ["branches", "roots"],
        text: "Low and tangled.",
        bonus: (points, bonus) => ({ blue: 0.80 * points * bonus }),
    },
    keystone: {
        name: "Keystone",
        color: "#6fc27a",
        of: STAT_IDS,
        text: "Nothing special, but the forest relies on it.",
        bonus: (points, bonus) => ({ amplify: 0.012 * points * bonus }),
    },
};

// Which of the above a set of stats reads as
export function categorize(stats) {
    const ranked = STAT_IDS
        .map(id => ({ id, points: Math.max(0, stats[id]) }))
        .sort((a, b) => b.points - a.points);
    const total = ranked.reduce((sum, entry) => sum + entry.points, 0);
    if (total <= 0) return "keystone";

    const share = (entry) => entry.points / total;
    const [first, second, third] = ranked;

    if (share(first) >= PURE_LEAD && share(first) - share(second) >= PURE_GAP) {
        return { height: "emergent", branches: "spreadingCrown", roots: "deepRooted" }[first.id];
    }
    if (share(first) + share(second) >= PAIR_SHARE && share(second) - share(third) >= PAIR_GAP) {
        const pair = [first.id, second.id];
        if (pair.includes("height") && pair.includes("branches")) return "canopyGiant";
        if (pair.includes("height") && pair.includes("roots")) return "pillarWood";
        return "understoryWeave";
    }
    return "keystone";
}


//    !!! WHAT A MATURE TREE GIVES !!!

// What bonuses a mature tree gives, modified by how high the highest stat is
export function treeBonus(record) {
    const category = CATEGORIES[record.category] || CATEGORIES.keystone;
    const points = category.of.reduce((sum, id) => sum + Math.max(0, record[id] || 0), 0);
    const total = { ...emptyBonus(), ...category.bonus(points, record.bonus || 1) };

    // Gives the per-stat bonus from the nothing wasted card
    const whole = cardBonus("wholeTree");
    if (whole > 0) {
        const bonus = (record.bonus || 1) * whole;
        total.green += 0.18 * Math.max(0, record.height || 0) * bonus;
        total.blue += 0.18 * Math.max(0, record.roots || 0) * bonus;
        total.growth += 0.18 * Math.max(0, record.branches || 0) * bonus;
    }
    return total;
}

export const trees = (s = forestState()) => (Array.isArray(s.trees) ? s.trees : (s.trees = []));
export const oldGrowth = (s = forestState()) => (Array.isArray(s.oldGrowth) ? s.oldGrowth : (s.oldGrowth = []));
export const treeById = (s, id) => trees(s).find(tree => tree.id === id) || null;

const CLIMAX_START = 0.25;

function newTree(s, slot) {
    const id = Number(s.nextTreeId) || 1;
    s.nextTreeId = id + 1;
    return {
        id,
        slot,
        seed: Math.floor(Math.random() * 1000),
        growth: traitHas("everlastingForest") ? CLIMAX_START * MATURE_AT : 0,
        stage: 0,
        height: 1, branches: 1, roots: 1,
        speed: 1, bonus: 1,
        picks: [],
        offer: null,
        waited: 0,
        held: 0,
    };
}


//    !!! THE TREES IN THE SLOTS !!!

// Losing all the forest tiles just stops growth, doesn't remove trees
function fillSlots(s) {
    const want = treeSlots();
    const treeList = trees(s);
    for (let slot = treeList.length; slot < want; slot++) treeList.push(newTree(s, slot));
}

export const stageIndex = (growth) => {
    let at = 0;
    for (let i = 1; i < STAGES.length; i++) if (growth >= STAGES[i].at) at = i;
    return at;
};

export const isMature = (tree) => tree.stage >= CHOICES && tree.growth >= MATURE_AT;
export const isWaiting = (tree) => !!tree.offer;
export const waitingTrees = (s = forestState()) => trees(s).filter(isWaiting).map(tree => `tree-${tree.id}`);
export const stageName = (tree) => isMature(tree) ? "Fully Grown" : STAGES[stageIndex(tree.growth)].name;

// How far through its current growth stage a tree is
export function stageProgress(tree) {
    if (isMature(tree)) return standsUntilFelled() ? 1 : Math.min(1, tree.held / standSeconds());
    const at = stageIndex(tree.growth);
    const from = STAGES[at].at;
    const to = at + 1 < STAGES.length ? STAGES[at + 1].at : MATURE_AT;
    return clamp01((tree.growth - from) / (to - from));
}

export const nextThreshold = (tree) => {
    const at = stageIndex(tree.growth);
    return at + 1 < STAGES.length ? STAGES[at + 1].at : MATURE_AT;
};

// How grown the tree is overall, not just in the current stage
export const lifeProgress = (tree) => clamp01(tree.growth / MATURE_AT);


// Third option card gives a third option, Silviculture (from Wildwood) gives two more
function offerSize(pool) {
    let want = cardActive("thirdOption") ? 3 : 2;
    if (challengeDone("wildwood")) want += 2;
    return Math.min(want, pool.length);
}

// Rolls for growth options, makes sure closing the game doesn't reroll it
function rollOffer(tree) {
    const pool = offerableIds();
    const want = offerSize(pool);

    const offer = [];
    while (offer.length < want) {
        const pick = pool[Math.floor(Math.random() * pool.length)];
        if (!offer.includes(pick)) offer.push(pick);
    }
    tree.offer = offer;
    tree.waited = 0;
}

const MANY_WAYS_GROWTH = 0.1;

export function chooseGrowth(s, treeId, optionId) {
    const tree = treeById(s, treeId);
    if (!tree || !tree.offer || !tree.offer.includes(optionId)) return false;

    applyPick(tree, optionId, 1);
    if (traitHas("manyWaysUp")) tree.growth = Math.min(MATURE_AT, tree.growth + MANY_WAYS_GROWTH * MATURE_AT);
    tree.picks.push(optionId);
    tree.stage += 1;
    tree.offer = null;
    tree.waited = 0;
    return true;
}

export function growthRate(tree, s = forestState()) {
    if (isWaiting(tree) || isMature(tree)) return 0;
    const ground = 1 + soften(PER_SLOT * Math.max(0, treeSlots() - 1), SLOT_CEILING);
    const early = lifeProgress(tree) < 0.5 ? cardBonus("earlyRush") : 0;
    const rain = worldRaining() ? cardBonus("rainGrowth") : 0;
    const fast = state.settings.enableFastTrees ? 200 : 1;   // Dev tool
    return BASE_GROWTH * fast * ground * tree.speed * (1 + forestBonuses(s).speed)
        * (1 + cardBonus("treeGrowth") + early + rain + grassLink() + shelteredGrowth())
        * (1 + traitBonus("growth") + traitBonus("treeGrowth"))
        * (coreNodeBought("forestSeedfall") && lifeProgress(tree) < 0.5 ? 1.35 : 1)
        * challengeMod("treeGrowth");
}

// For the common ground card, boosts growth speed based on number of mature grass tiles
function grassLink() {
    const per = cardBonus("grassRooted");
    if (per <= 0) return 0;
    return Math.min(0.1, per * matureTiles(grassState()).length);
}


//    !!! OLD GROWTH !!!

// The old growth record a tree would leave behind
export function matureRecord(tree) {
    const stats = { height: tree.height, branches: tree.branches, roots: tree.roots };
    return {
        ...stats,
        category: categorize(stats),
        bonus: tree.bonus,
        growth: Math.round(tree.growth),
        picks: tree.picks.slice(),
    };
}

const liveWorth = (tree) => LIVE_GREEN * Math.max(0, tree.height)
    + LIVE_BLUE * Math.max(0, tree.roots) + LIVE_GROWTH * Math.max(0, tree.branches);

// Standing is always worth more than felling; channels that can't be compared lean on the MATURE_WORTH floor
function matureWorth(tree) {
    const raw = liveWorth(tree) * tree.bonus;
    if (raw <= 0) return MATURE_WORTH;
    const record = treeBonus(matureRecord(tree));
    const held = RESOURCES.reduce((sum, key) => sum + record[key], 0);
    return Math.max(MATURE_WORTH, STANDING_LEAD * held / raw);
}

// A tree pays from its stats as it grows, and standing keeps its lead on channels no flat payout could catch
export function liveBonus(tree) {
    const living = 1 + cardBonus("livingWorth") + cardBonus("livingRipeness") * lifeProgress(tree);
    const grown = isMature(tree);
    const bonus = tree.bonus * living * (grown ? matureWorth(tree) : 1);
    const out = {
        ...emptyBonus(),
        green: LIVE_GREEN * Math.max(0, tree.height) * bonus,
        blue: LIVE_BLUE * Math.max(0, tree.roots) * bonus,
        growth: LIVE_GROWTH * Math.max(0, tree.branches) * bonus,
    };
    if (!grown) return out;

    const record = treeBonus(matureRecord(tree));
    for (const key of SPREADING) out[key] = record[key] * STANDING_LEAD * living;
    return out;
}

export const silviculture = () => challengeDone("wildwood");

// Wildwood stops anything ever finishing, so a full grown tree just stands there for good
const nothingFinishes = () => challengeBlocks("noOldGrowth");

// Silviculture holds mature trees in place until the player takes them, unless it is switched off
export const standsUntilFelled = (s = forestState()) =>
    nothingFinishes() || (silviculture() && s.holdMature !== false);

// Holding a tree is only worth doing while there is somewhere for it to go
export const canFell = (s = forestState()) => standsUntilFelled(s) && !nothingFinishes();

export function fellTree(s, treeId) {
    const tree = treeById(s, treeId);
    if (!tree || !isMature(tree) || nothingFinishes()) return false;
    startOver(s, tree);
    return true;
}


//    !!! TAKING A TREE !!!

// Tree turning to old growth
function retire(s, tree) {
    if (nothingFinishes()) return;
    oldGrowth(s).push(matureRecord(tree));
}

// Banked and replaced by a seedling in the same slot
function startOver(s, tree) {
    retire(s, tree);
    Object.assign(tree, newTree(s, tree.slot));
}

// One growth choice applied forwards, or handed back with dir -1
function applyPick(tree, optionId, dir) {
    const option = GROWTH_OPTIONS[optionId];
    if (!option) return;
    for (const stat of STAT_IDS) tree[stat] += dir * (option.stats[stat] || 0);
    if (option.speed) tree.speed = dir > 0 ? tree.speed * option.speed : tree.speed / option.speed;
    if (option.bonus) tree.bonus = dir > 0 ? tree.bonus * option.bonus : tree.bonus / option.bonus;
}


//    !!! ADAPTING !!!

// How far back an adaptation knocks a tree that is still on its way up
const RESET_STAGES = 2;

// Adapting keeps old growth; growing trees go back two stages and choices, and finished ones are banked
export function resetGrowingTrees(s = forestState()) {
    for (const tree of trees(s)) {
        if (isMature(tree)) {
            startOver(s, tree);
            continue;
        }
        for (let i = 0; i < RESET_STAGES && tree.picks.length; i++) applyPick(tree, tree.picks.pop(), -1);
        tree.stage = tree.picks.length;
        tree.growth = STAGES[Math.min(tree.stage, STAGES.length - 1)].at;
        tree.offer = null;
        tree.waited = 0;
        tree.held = 0;
    }
}


const amplifyCeiling = () => 2 + cardBonus("amplifyCeiling");


//    !!! WHAT THE WHOLE FOREST GIVES !!!

// Old growth pays by a power of how much there is, like woodland tiles; growth speed has its own softcap
const OLD_GROWTH_DEPTH = 0.55;
export const matureCount = (s = forestState()) => trees(s).filter(isMature).length;

export const oldGrowthDepth = (s = forestState()) =>
    Math.pow(1 + oldGrowth(s).length + matureCount(s), OLD_GROWTH_DEPTH);

// Softcap for growth speed, so it doesn't get crazy
const softSpeed = (raw) => raw <= 0.25 ? raw : 0.25 + soften(raw - 0.25, 0.35);

// Vitality stops at a milestone track where the other three resources never stop, so it caps too
const GROWTH_CEILING = 29;
const softGrowth = (raw) => soften(raw, GROWTH_CEILING);

// Everything a tree can pay into. A category pays one of them and nothing else
export const CHANNELS = ["green", "blue", "growth", "biomass", "speed", "living", "amplify"];
export const emptyBonus = () => Object.fromEntries(CHANNELS.map(key => [key, 0]));

const totalBonus = (list, bonusOf) => list.reduce((total, entry) => {
    const part = bonusOf(entry);
    for (const key of CHANNELS) total[key] += part[key];
    return total;
}, emptyBonus());

const RESOURCES = ["green", "blue", "growth", "biomass"];

// The rest, which multiply what the forest already has rather than adding to it
const SPREADING = CHANNELS.filter(key => !RESOURCES.includes(key));

// Hidden Network, per tree still growing
const NETWORK_PER_TREE = 0.1;

// Growth Rings pays for depth of old growth instead of doubling everything at once
const RINGS_PER_TREE = 0.05;
const RINGS_CEILING = 0.5;
const growthRingsBonus = (s) => coreNodeBought("forestGrowthRings")
    ? Math.min(RINGS_CEILING, RINGS_PER_TREE * oldGrowth(s).length) : 0;

// Total bonus that the forest gives, amplified by old growth
export function forestBonuses(s = forestState()) {
    const finished = totalBonus(oldGrowth(s), treeBonus);
    const alive = totalBonus(trees(s), liveBonus);

    const output = (1 + cardBonus("forestOutput")) * (1 + traitBonus("forestOutput")) * challengeMod("forestOutput");

    // Keystones raise what old growth gives, canopy giants raise what is still standing
    const amplify = soften(finished.amplify + alive.amplify, amplifyCeiling());
    const network = traitHas("hiddenNetwork") ? NETWORK_PER_TREE * trees(s).filter(tree => !isMature(tree)).length : 0;
    const scale = (1 + amplify) * (1 + cardBonus("oldGrowthWorth")) * (1 + traitBonus("oldGrowthWorth")) * (1 + network)
        * (1 + growthRingsBonus(s));
    // Fire Scars, from the Long Summer challenge. What the wood is worth, not how fast it grows
    const scarred = challengeDone("longSummer") ? 1.5 : 1;
    const shelter = 1 + soften(finished.living + alive.living, LIVING_CEILING);

    const depth = oldGrowthDepth(s);

    const fromOldGrowth = { ...emptyBonus(), speed: softSpeed(finished.speed * scale) };
    const fromLiving = { ...emptyBonus(), speed: softSpeed(alive.speed * shelter) };
    for (const key of RESOURCES) {
        // Vitality tops out in the tens of thousands, so it doesn't take the depth the others do
        const reach = key === "growth" ? 1 : depth;
        fromOldGrowth[key] = finished[key] * scale * output * scarred * reach;
        // Standing wood is paid through the same forest as fallen, or holding would lose to felling
        fromLiving[key] = alive[key] * shelter * scale * output * scarred * reach;
    }

    const total = emptyBonus();
    for (const key of CHANNELS) total[key] = fromOldGrowth[key] + fromLiving[key];

    // Both halves are scaled back by the same share so the readout still adds up to the cap
    const rawGrowth = fromOldGrowth.growth + fromLiving.growth;
    total.growth = softGrowth(rawGrowth);
    const kept = rawGrowth > 0 ? total.growth / rawGrowth : 1;
    fromOldGrowth.growth *= kept;
    fromLiving.growth *= kept;

    total.amplify = amplify;
    total.living = shelter - 1;

    // The page shows the chain, not just the ends, so every step it multiplies by comes back with it
    const factors = { raw: finished, rawLiving: alive, scale, shelter, depth, output, scarred, kept,
        amplifyCeiling: amplifyCeiling(), livingCeiling: LIVING_CEILING, depthPower: OLD_GROWTH_DEPTH,
        oldGrowthCount: oldGrowth(s).length, matureCount: matureCount(s) };
    return { ...total, fromOldGrowth, fromLiving, factors };
}

// A slice of the forest after the whole forest multiplies it, so each row shows what that tree really gives
export function appliedBonus(raw, bonuses, { standing = false } = {}) {
    const f = bonuses.factors;
    const out = emptyBonus();
    const base = (standing ? f.shelter : 1) * f.scale * f.output * f.scarred;
    for (const key of RESOURCES) out[key] = raw[key] * base * (key === "growth" ? f.kept : f.depth);

    // The spreading channels are softcapped across the whole forest, so a row takes its share
    const wholeRaw = standing ? f.rawLiving : f.raw;
    const paid = standing ? bonuses.fromLiving : bonuses.fromOldGrowth;
    out.amplify = share(raw.amplify, f.raw.amplify + f.rawLiving.amplify, bonuses.amplify);
    out.living = share(raw.living, f.raw.living + f.rawLiving.living, bonuses.living);
    out.speed = share(raw.speed, wholeRaw.speed, paid.speed);
    return out;
}

const share = (part, whole, paid) => (whole > 0 ? (part / whole) * paid : 0);

registerScale("standing", () => layerUnlocked("woodland") && !forestIsBare() ? matureCount() : 0);

const BOOSTED = { greenEssence: "green", blueEssence: "blue", vitality: "growth", biomass: "biomass" };

registerBoost("Forest", (resourceId) => {
    const channel = BOOSTED[resourceId];
    if (!channel || !layerUnlocked("woodland") || forestIsBare()) return 1;
    return 1 + forestBonuses()[channel];
});


//    !!! THE TICK !!!

// Forest ticks. Growth stops while waiting on a growth choice (unless instinctive growth card)
export function tickForest(dt, s = forestState()) {
    if (forestIsBare()) return;
    fillSlots(s);

    for (const tree of trees(s)) {
        if (tree.offer) {
            if (tree.offer.length > offerSize(offerableIds())) rollOffer(tree);
            if (!cardActive("instinct")) continue;
            tree.waited = (tree.waited || 0) + dt;
            if (tree.waited < instinctSeconds()) continue;
            chooseGrowth(s, tree.id, tree.offer[Math.floor(Math.random() * tree.offer.length)]);
            continue;
        }

        if (isMature(tree)) {
            tree.held += dt;
            if (!standsUntilFelled(s) && tree.held >= standSeconds()) startOver(s, tree);
            continue;
        }

        tree.growth += growthRate(tree, s) * dt;

        if (tree.stage < CHOICES && stageIndex(tree.growth) > tree.stage) rollOffer(tree);
    }
}