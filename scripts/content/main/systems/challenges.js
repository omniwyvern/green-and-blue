// challenges.js
//
// One at a time; entering resets things, finishing unlocks something permanent

import { getLayerState, unlockLayer } from "../../../core/state.js";
import { registerBoost } from "../../../core/boosts.js";
import { getResource } from "../../../core/resources.js";
import { D } from "../../../utils/decimal.js";
import { formatNumber } from "../../../utils/format.js";
import { openBiome } from "../sublayers/ecosystemSublayer.js";
import { countOf, tilesOf, setTerrain, worldState, ICE_KINDS, WOODLAND_KINDS, keepProtectedGrass } from "./worldMap.js";
import { clamp01 } from "../../../utils/math.js";
// cards.js imports this too, but it's only read inside met(), so load order doesn't matter
import { equippedIds } from "./cards.js";
import { traitsIn, traitOwned } from "./evolutionTraits.js";

export const challengeState = () => getLayerState("challenges");


//    !!! WHAT A CHALLENGE CAN CHANGE !!!

// What a challenge can modify. If more things are needed, easy to add here
export const MODS = {
    greenEssence: { name: "Green Essence", resource: true },
    blueEssence:  { name: "Blue Essence",  resource: true },
    biomass:      { name: "Biomass",       resource: true },
    vitality:     { name: "Vitality",      resource: true },
    grassOutput:  { name: "Grassy tile production",
                    none: "Grassy tiles are worth nothing at all." },
    grassGrowth:  { name: "Grass growth" },
    treeGrowth:   { name: "Tree growth" },
    algaeGrowth:  { name: "Algae growth" },
    algaeOutput:  { name: "Algae production",
                    none: "Algae produces nothing at all." },
    pondOutput:   { name: "Everything the pond produces",
                    none: "The pond produces nothing at all." },
    oceanTick:    { name: "How fast the ocean ticks" },
    oceanOutput:  { name: "Ocean production",
                    none: "The ocean produces nothing at all." },
    cardWorth:    { name: "What every card is worth",
                    none: "Equipped cards are worth nothing." },
    drying:       { name: "How fast the ground dries" },
    snowfall:     { name: "Snow from each cloud" },
    forestOutput: { name: "Forest production" },
    terrainOutput: { name: "What tiles on the map produce",
                    none: "Tiles on the map produce nothing at all." },
    marshOutput:  { name: "Marsh production",
                    none: "The marsh produces nothing at all." },
    iceOutput:    { name: "Ice field production",
                    none: "The ice field produces nothing at all." },
};

// What a challenge can switch off entirely
export const BLOCKS = {
    precipitation: "No weather. The cloud can't be charged or released.",
    snowOnly: "Only snow falls.",
    stir: "The water can't be stirred, and any turbulence left settles out.",
    cards: "Equipped cards do nothing.",
    narrowLoadout: "Only the first card slot counts.",
    noOldGrowth: "Trees never become old growth, so nothing the forest does is kept.",
    wildfires: "Forests catch fire. Rain or snow on a burning tile puts it out. Fires spread if"
        + " left too long, burning grass and trees, and old growth burns while its forest is on fire.",
};

// Named so a challenge can list exactly what it resets before it takes it
const RESETS = {
    essence: {
        name: "Green and Blue Essence",
        run() {
            const cores = getLayerState("cores");
            cores.resources.greenEssence = D(0);
            cores.resources.blueEssence = D(0);
        },
    },
    grassUpgrades: {
        name: "Grass upgrades",
        run() { getLayerState("grass").purchasedUpgrades = {}; },
    },
    currentVitality: {
        name: "Current Vitality",
        run () { getLayerState("grass").resources.vitality = 0; },
    },
    weatherUpgrades: {
        name: "Precipitation upgrades, and whatever the cloud is holding",
        run() {
            const cloud = getLayerState("precipitation");
            cloud.purchasedUpgrades = {};
            cloud.charge = 0;
            cloud.paidCharge = 0;
            cloud.stability = 1;
        },
    },
    pondUpgrades: {
        name: "Pond upgrades",
        run() { getLayerState("pond").purchasedUpgrades = {}; },
    },
    biomass: {
        name: "Biomass",
        run() { getLayerState("pond").resources.biomass = D(0); },
    },
    coreGrowth: {
        name: "Green Core growth",
        run() { getLayerState("cores").growthStage = 0;
                getLayerState("cores").growth = D(0);
         },
    },

    oceanUpgrades: {
        name: "Ocean region upgrades",
        run() {
            const sea = getLayerState("aquatic");
            for (const region of Object.values(sea.oceanRegions || {})) region.upgrades = {};
        },
    },
    pondLife: {
        name: "The algae and fish in the pond",
        run() {
            const pond = getLayerState("pond");
            pond.algae = 0;
            pond.fish = 0;
            pond.turbulence = 0;
            pond.algaeSurge = 0;
            pond.algaeSurgeReady = 0;
            pond.fishSurge = 0;
            pond.fishSurgeReady = 0;
        },
    },
    growing: {
        name: "Everything still growing: grass on the map, algae and fish, and every tree that isn't old growth",
        run() {
            const world = getLayerState("world");
            world.grass = keepProtectedGrass(world);
            RESETS.pondLife.run();

            const forest = getLayerState("woodland");
            forest.trees = [];
            forest.forestSelection = null;
        },
    },
    oldGrowth: {
        name: "Every old growth tree behind the forest",
        run() { getLayerState("woodland").oldGrowth = []; },
    },
    marshZones: {
        name: "Everything growing in the marsh, and the water in its zones",
        run() {
            const wetlands = getLayerState("wetlands");
            wetlands.marshZones = [];
            wetlands.marshWater = 0;
        },
    },
    marshUpgrades: {
        name: "Marsh upgrades",
        run() { getLayerState("wetlands").purchasedUpgrades = {}; },
    },
    iceUpgrades: {
        name: "Ice field upgrades",
        run() { getLayerState("ice").purchasedUpgrades = {}; },
    },
    icePack: {
        name: "The ice field's pack, and the snow lying on it",
        run() {
            const ice = getLayerState("ice");
            ice.snowLoose = 0;
            ice.icePack = [0, 0, 0, 0, 0];
            ice.icePressure = 0;
            ice.iceSettling = 0;
        },
    },
    lying: {
        name: "Water and snow lying on the map",
        run() {
            const world = getLayerState("world");
            world.moisture = {};
            world.snowpack = {};
            world.weatherSeconds = 0;
            world.weatherTotal = 0;
            world.weatherTile = null;
            world.weatherPower = 0;
            world.weatherSoak = 0;
        },
    },
};


//    !!! THE GATES THAT OPEN THEM !!!

// Every gate that asks whether something has been worked counts the same thing
const levelsBought = (bought) => Object.values(bought || {})
    .reduce((total, level) => total + (Number(level) || 0), 0);

const oldGrowthCount = () => (getLayerState("woodland").oldGrowth || []).length;

const traitsTaken = (treeId) => traitsIn(treeId).filter(id => traitOwned(id)).length;

const GATES = {
    frigidTraits: {
        hint: "Evolve further in the cold first.",
        met: () => traitsTaken("frigid") >= 9,
    },
    tidalTraits: {
        hint: "Evolve further in the water first.",
        met: () => traitsTaken("tidal") >= 9,
    },
    decayTraits: {
        hint: "Evolve further in decay first.",
        met: () => traitsTaken("decay") >= 9,
    },
    stagnantTraits: {
        hint: "Evolve further in still water first.",
        met: () => traitsTaken("stagnant") >= 12,
    },
    salineTraits: {
        hint: "Evolve further in salt water first.",
        met: () => traitsTaken("saline") >= 13,
    },
    canopyTraits: {
        hint: "Evolve further toward the light first.",
        met: () => traitsTaken("canopy") >= 18,
    },
    sward: {
        hint: "Grow more life in the world first.",
        met: () => D(getLayerState("grass").vitalityPeak || 0).gte(25000),
    },
    regionsWorked: {
        hint: "Develop the ocean more first.",
        met: () => Object.values(getLayerState("aquatic").oceanRegions || {})
            .reduce((total, region) => total + levelsBought(region.upgrades), 0) >= 10,
    },
    weatherWorked: {
        hint: "Learn more about the weather first.",
        met: () => levelsBought(getLayerState("precipitation").purchasedUpgrades) >= 12,
    },
    standingWood: {
        hint: "Grow a real forest first.",
        met: () => oldGrowthCount() >= 5,
    },
    deepWoods: {
        hint: "Grow more old growth first.",
        met: () => oldGrowthCount() >= 10,
    },
    fullLoadout: {
        hint: "Get more out of your card slots first.",
        met: () => {
            const s = getLayerState("adaptation");
            return !!s.loadoutLocked && equippedIds(s).length >= 3;
        },
    },
    burnable: {
        hint: "Have more woodland on the map first.",
        met: () => countOf(WOODLAND_KINDS) >= 5,
    },
    coldGround: {
        hint: "Build up some cold terrain first.",
        met: () => countOf(ICE_KINDS) >= 5,
    },
    pondWorked: {
        hint: "Develop the pond more first.",
        met: () => levelsBought(getLayerState("pond").purchasedUpgrades) >= 6,
    },
    algaeWorked: {
        hint: "Buy more pond upgrades first.",
        met: () => levelsBought(getLayerState("pond").purchasedUpgrades) >= 20,
    },
};


//    !!! EVERY CHALLENGE !!!

// What all the challenges are (what they say, reset, block, modify, etc.)
export const CHALLENGES = {
    drought: {
        name: "Drought",
        color: "#c6d85f",
        text: "No more rain or snow, and the pond shrinks to a puddle. Make do with the ground you have.",
        resets: ["essence", "grassUpgrades", "pondUpgrades", "growing", "lying", "biomass"],
        blocks: ["precipitation"],
        mods: { greenEssence: 1 / 3e11, blueEssence: 1 / 3e11 },
        goal: { blueEssence: D("3e5") },
        boost: { blueEssence: 3 },
        reward: {
            title: "Standing Water",
            text: "A precipitation upgrade that keeps ground wet for much longer.",
        },
    },

    stillWater: {
        name: "Still Water",
        color: "#4a90d9",
        needs: ["drought"],
        gate: "pondWorked",
        text: "The pond can't be stirred, so the fish don't grow and algae takes over. Map tiles"
            + " make almost nothing, so the algae has to carry you.",
        resets: ["essence", "pondUpgrades", "growing", "biomass"],
        blocks: ["stir"],
        mods: {
            grassOutput: 0.02, oceanOutput: 0.25, forestOutput: 0.25, terrainOutput: 1e-6, algaeOutput: 2e4,
            greenEssence: 1e-11, blueEssence: 1e-11, biomass: 1 / 300,
        },
        goal: { greenEssence: D("1e6") },
        boost: { greenEssence: 3 },
        reward: {
            title: "Settled Water",
            text: "A pond upgrade that deepens the water, and pond tiles on the map give 3x as"
                + " much Blue Essence.",
        },
    },

    waterlogged: {
        name: "Waterlogged",
        color: "#639e64",
        needs: ["stillWater"],
        gate: "weatherWorked",
        text: "The ground barely dries. Grass struggles, but the pond thrives.",
        resets: ["essence", "grassUpgrades", "weatherUpgrades", "growing"],
        blocks: [],
        mods: { drying: 0.05, grassGrowth: 0.25, pondOutput: 6, greenEssence: 5e-12, blueEssence: 1.2e-13 },
        goal: { blueEssence: D("2e12") },
        boost: { blueEssence: 3 },
        reward: {
            title: "Marsh",
            text: "The wetlands open on the world map.",
        },
    },

    fallow: {
        name: "Fallow",
        color: "#a5b35e",
        needs: ["waterlogged"],
        gate: "sward",
        text: "Grass is worth nothing. The marsh and the Green Core start over, so you'll need"
            + " to get Vitality somewhere else.",
        resets: ["essence", "grassUpgrades", "growing", "currentVitality", "coreGrowth", "marshZones"],
        blocks: [],
        mods: { grassOutput: 0, greenEssence: 1e-11 },
        goal: { vitality: D("3e5") },
        boost: { vitality: 3 },
        reward: {
            title: "Rotation",
            text: "Grass can be switched to any type at any time, and the Green Core grows twice as fast.",
        },
    },

    openWater: {
        name: "Open Water",
        color: "#2f7f8f",
        needs: ["fallow"],
        gate: "regionsWorked",
        text: "The pond makes nothing, so the ocean has to carry the water. The ocean ticks twice as fast.",
        resets: ["essence", "biomass", "pondUpgrades", "oceanUpgrades", "growing"],
        blocks: [],
        mods: { pondOutput: 0, oceanTick: 2, biomass: 3 },
        goal: { biomass: D("5e12") },
        boost: { biomass: 3 },
        reward: {
            title: "Herring",
            text: "A second fish species joins the ocean.",
        },
    },

    longWinter: {
        name: "Long Winter",
        color: "#7fc4e2",
        needs: ["openWater"],
        text: "Everything grows very slowly and only snow falls. The marsh freezes and starts over.",
        resets: ["essence", "grassUpgrades", "weatherUpgrades", "growing", "lying", "marshZones", "marshUpgrades"],
        blocks: ["snowOnly"],
        mods: {
            grassGrowth: 0.15, treeGrowth: 0.15, algaeGrowth: 0.2, drying: 0.1,
            greenEssence: 1e-2, blueEssence: 3e-3,
        },
        goal: { blueEssence: D("2e20") },
        boost: { blueEssence: 3, greenEssence: 2 },
        reward: {
            title: "Ice Fields",
            text: "Colder terrain than snow can appear, and the map grows by one ring.",
        },
    },

    wildwood: {
        name: "Wildwood",
        color: "#5f8f4a",
        needs: ["longWinter"],
        gate: "deepWoods",
        text: "Old growth is gone and trees never become old growth, so the forest is only worth"
            + " what's standing. The marsh starts over.",
        resets: ["essence", "oldGrowth", "growing", "marshZones", "marshUpgrades"],
        blocks: ["noOldGrowth"],
        mods: { treeGrowth: 3, forestOutput: 3, greenEssence: 1e-8, blueEssence: 1e-9 },
        goal: { greenEssence: D("2e25") },
        boost: { greenEssence: 3 },
        reward: {
            title: "Silviculture",
            text: "Two more growth options at every stage, and Ironwood is added. Mature trees can"
                + " stay standing until you turn them into old growth, and are worth double while"
                + " standing. You can switch back to automatic at any time.",
        },
    },

    clearwater: {
        name: "Clear Water",
        color: "#37b3c6",
        needs: ["wildwood"],
        gate: "algaeWorked",
        text: "The ocean makes nothing, so everything comes from the pond. The pond's life is"
            + " cleared and weather upgrades reset.",
        resets: ["essence", "biomass", "oceanUpgrades", "pondUpgrades", "weatherUpgrades", "pondLife"],
        blocks: [],
        mods: { oceanOutput: 0, pondOutput: 5, algaeGrowth: 4, blueEssence: 1e-20, biomass: 2e-7 },
        goal: { biomass: D("8e7") },
        boost: { biomass: 3, blueEssence: 2 },
        reward: {
            title: "Reefs",
            text: "Reefs open on the world map, giving more kinds of fish a home.",
        },
    },

    longSummer: {
        name: "Long Summer",
        color: "#e0813f",
        needs: ["clearwater"],
        gate: "burnable",
        text: "Ground dries almost instantly, the ice field makes much less, and forests catch"
            + " fire. Marsh upgrades reset. Use the cloud to put out enough fires to end the summer.",
        resets: ["essence", "weatherUpgrades", "lying", "marshUpgrades"],
        blocks: ["wildfires"],
        mods: { drying: 5, grassGrowth: 0.4, treeGrowth: 0.5, iceOutput: 0.1, greenEssence: 3e-6, blueEssence: 3e-6 },
        goal: {},
        tally: { firesOut: 30 },
        boost: { greenEssence: 2, blueEssence: 2 },
        reward: {
            title: "Fire Scars",
            text: "Every old growth tree is worth 50% more.",
        },
    },

    deadfall: {
        name: "Deadfall",
        color: "#a06bc0",
        needs: ["longSummer"],
        gate: "standingWood",
        text: "Grass and trees barely grow, so the forest you already have has to carry you.",
        resets: ["essence", "grassUpgrades", "growing", "weatherUpgrades", "marshUpgrades"],
        blocks: [],
        mods: { grassGrowth: 0.03, treeGrowth: 0.1, forestOutput: 5, greenEssence: 1e-8, blueEssence: 1e-8 },
        goal: { greenEssence: D("3e27") },
        boost: { greenEssence: 3, biomass: 2 },
        reward: {
            title: "Mushroom Grove",
            text: "Fungi can appear in the world.",
        },
    },

    bottleneck: {
        name: "Bottleneck",
        color: "#c96f8a",
        needs: ["deadfall"],
        gate: "fullLoadout",
        text: "The ice field starts over, and every tile, pond, ocean, tree and marsh makes a"
            + " quarter as much. Only one card slot counts.",
        resets: ["essence", "growing", "iceUpgrades", "icePack"],
        blocks: ["narrowLoadout"],
        mods: {
            cardWorth: 3, grassOutput: 0.25, pondOutput: 0.25, oceanOutput: 0.25, forestOutput: 0.25,
            marshOutput: 0.25, greenEssence: 2, blueEssence: 2,
        },
        goal: { blueEssence: D("3e37") },
        boost: { greenEssence: 2, blueEssence: 2 },
        reward: {
            title: "A Fourth Slot",
            text: "Lock in four cards instead of three.",
        },
    },

    iceAge: {
        name: "Ice Age",
        color: "#9fd8ea",
        needs: ["bottleneck"],
        gate: "coldGround",
        text: "Almost nothing grows, ice upgrades reset, and only a thin snow falls. Cover the map"
            + " in ice, one tile at a time.",
        resets: ["essence", "grassUpgrades", "weatherUpgrades", "growing", "iceUpgrades"],
        blocks: ["snowOnly"],
        mods: {
            grassGrowth: 0.1, treeGrowth: 0.1, algaeGrowth: 0.1, snowfall: 0.2,
            greenEssence: 2e-3, blueEssence: 2e-3,
        },
        goal: {},
        tally: { iceCover: 16 },
        onClaim: "Completing it melts every ice tile on the map back to bare ground.",
        boost: { blueEssence: 3, biomass: 3 },
        reward: {
            title: "Meltwater",
            text: "Icy tiles on the map add 25% to all Blue Essence, and tiles next to them stay wet.",
        },
    },

    deepFreeze: {
        name: "Deep Freeze",
        color: "#8fb3d9",
        needs: ["iceAge"],
        gate: "frigidTraits",
        keepsAdaptation: true,
        text: "Water, marsh and grass make almost nothing. Ice upgrades reset, and the ice field has to carry you.",
        resets: ["essence", "iceUpgrades"],
        blocks: [],
        mods: { iceOutput: 3, pondOutput: 0.05, oceanOutput: 0.05, marshOutput: 0.05, grassOutput: 0.05, blueEssence: 1e-9 },
        goal: { blueEssence: D("3e35") },
        boost: { blueEssence: 3 },
        reward: {
            title: "Cold Currents",
            text: "Deepen and Nutrient Bed each go 5 more levels past their cap.",
        },
    },

    redTide: {
        name: "Red Tide",
        color: "#c0504d",
        needs: ["deepFreeze"],
        gate: "tidalTraits",
        keepsAdaptation: true,
        text: "Algae takes over. The ocean and ice field make almost nothing, so the pond has to"
            + " make all your Blue Essence.",
        resets: ["essence", "pondUpgrades", "pondLife"],
        blocks: [],
        mods: { algaeGrowth: 4, algaeOutput: 8, oceanOutput: 0.05, iceOutput: 1e-6, marshOutput: 0.1, blueEssence: 1e-15 },
        goal: { blueEssence: D("3e27") },
        boost: { blueEssence: 3 },
        reward: {
            title: "Bloom Tolerance",
            text: "Deepen, Nutrient Bed and Richer Waters each go 5 more levels past their cap.",
        },
    },

    blight: {
        name: "Blight",
        color: "#7d5a8f",
        needs: ["redTide"],
        gate: "decayTraits",
        keepsAdaptation: true,
        text: "Grass and the ice field make almost nothing, so the forest has to make your Green Essence.",
        resets: ["essence", "grassUpgrades"],
        blocks: [],
        mods: { grassOutput: 0.02, forestOutput: 3, iceOutput: 1e-6, greenEssence: 1e-12 },
        goal: { greenEssence: D("3e29") },
        boost: { greenEssence: 3, biomass: 2 },
        reward: {
            title: "Rich Rot",
            text: "Greener Blades goes 3 more levels past its cap.",
        },
    },

    stagnation: {
        name: "Stagnation",
        color: "#6b7d3a",
        needs: ["blight"],
        gate: "stagnantTraits",
        keepsAdaptation: true,
        text: "The marsh starts over, and the ocean, pond and ice field make almost nothing. The"
            + " marsh has to carry you.",
        resets: ["essence", "marshZones"],
        blocks: [],
        mods: { marshOutput: 5, pondOutput: 0.05, oceanOutput: 0.05, iceOutput: 1e-6, blueEssence: 1e-15 },
        goal: { blueEssence: D("1e29") },
        boost: { biomass: 3, greenEssence: 2 },
        reward: {
            title: "Deep Mud",
            text: "Varied Life goes 5 more levels past its cap.",
        },
    },

    saltFlats: {
        name: "Salt Flats",
        color: "#d8c48f",
        needs: ["stagnation"],
        gate: "salineTraits",
        keepsAdaptation: true,
        text: "The pond, marsh and ice field make almost nothing, and ocean upgrades reset. The"
            + " ocean has to carry you.",
        resets: ["essence", "oceanUpgrades"],
        blocks: [],
        mods: { oceanOutput: 3, pondOutput: 0.05, marshOutput: 0.05, iceOutput: 1e-6, blueEssence: 1 },
        goal: { blueEssence: D("8e45") },
        boost: { blueEssence: 3 },
        reward: {
            title: "Brine Pools",
            text: "Richer Waters goes 5 more levels past its cap, and Varied Life 3.",
        },
    },

    overgrowth: {
        name: "Choked Out",
        color: "#3f8f3a",
        needs: ["saltFlats"],
        gate: "canopyTraits",
        keepsAdaptation: true,
        text: "Grass grows wild and starts over, while the forest and ice field make almost nothing.",
        resets: ["essence", "grassUpgrades", "growing", "currentVitality"],
        blocks: [],
        mods: { grassGrowth: 4, grassOutput: 3, forestOutput: 0.05, iceOutput: 1e-6, greenEssence: 1 },
        goal: { vitality: D("1e10") },
        boost: { greenEssence: 3, vitality: 10 },
        reward: {
            title: "Wild Meadows",
            text: "Greener Blades goes 5 more levels past its cap.",
        },
    },
};


//    !!! READING A CHALLENGE !!!

export const CHALLENGE_IDS = Object.keys(CHALLENGES);

// The resources a challenge can scale, read off MODS rather than listed again alongside it
export const MOD_RESOURCES = Object.keys(MODS).filter(key => MODS[key].resource);

export const activeChallenge = () => {
    const id = challengeState().active;
    return CHALLENGES[id] ? id : null;
};

export const challengeDone = (id) => !!(challengeState().completed || {})[id];
export const completedCount = () => CHALLENGE_IDS.filter(challengeDone).length;

const gateOf = (id) => GATES[CHALLENGES[id].gate] || null;
const needsOf = (id) => CHALLENGES[id].needs || [];

export const challengeOpen = (id) => needsOf(id).every(challengeDone)
    && (!gateOf(id) || gateOf(id).met());

// What a locked challenge is still waiting on
export function lockNotes(id) {
    const notes = needsOf(id).filter(other => !challengeDone(other))
        .map(other => `Finish ${CHALLENGES[other].name}`);
    const gate = gateOf(id);
    if (gate && !gate.met()) notes.push(gate.hint);
    return notes;
}

export const resetNames = (id) => CHALLENGES[id].resets.map(key => RESETS[key].name);

const activeDef = () => CHALLENGES[activeChallenge()] || null;


//    !!! WHAT THE RUNNING ONE DOES !!!

// Everything a restriction is asked for goes through these two
export function challengeMod(key) {
    const def = activeDef();
    return def && def.mods[key] !== undefined ? def.mods[key] : 1;
}

export function challengeBlocks(key) {
    const def = activeDef();
    return !!def && def.blocks.includes(key);
}


//    !!! WHAT FINISHING ONE IS WORTH !!!

// What finishing a challenge is worth from then on, kept forever and stacking across challenges
export const boostParts = (id) => Object.entries(CHALLENGES[id].boost || {});

export function completionBoost(resourceId) {
    let total = 1;
    for (const id of CHALLENGE_IDS) {
        if (!challengeDone(id)) continue;
        const boost = CHALLENGES[id].boost;
        if (boost && boost[resourceId]) total *= boost[resourceId];
    }
    return total;
}

// Ice Age's reward reads off the map instead of a resource, so it's handled on its own
const MELTWATER_PER_TILE = 0.25;

registerBoost("Meltwater", (resourceId) => {
    if (resourceId !== "blueEssence" || !challengeDone("iceAge")) return 1;
    return 1 + MELTWATER_PER_TILE * countOf(ICE_KINDS);
});

registerBoost("Challenge", (resourceId) =>
    MODS[resourceId] && MODS[resourceId].resource
        ? challengeMod(resourceId) * completionBoost(resourceId)
        : 1);


//    !!! GOALS !!!

// Goals that count something standing on the map rather than a resource held
const TALLIES = {
    iceCover: {
        name: "Ice on the map",
        short: (need) => `${need} tiles of ice on the map`,
        have: () => countOf(ICE_KINDS),
    },
    oldGrowth: {
        name: "Old growth behind the forest",
        short: (need) => `${need} old growth trees behind the forest`,
        have: oldGrowthCount,
    },
    firesOut: {
        name: "Fires put out",
        short: (need) => `${need} fires put out`,
        have: () => Number(getLayerState("world").firesOut) || 0,
    },
};


// Puts all the different things in a challenge's goal together
export function goalParts(id) {
    const def = CHALLENGES[id];
    const parts = [];

    for (const resourceId in def.goal || {}) {
        const have = getResource(resourceId);
        const need = def.goal[resourceId];
        parts.push({
            key: resourceId,
            name: MODS[resourceId].name,
            short: `${formatNumber(need)} ${MODS[resourceId].name}`,
            text: `${formatNumber(have)} / ${formatNumber(need)}`,
            fraction: clamp01(have.div(need).toNumber()),
            met: have.gte(need),
        });
    }

    for (const key in def.tally || {}) {
        const need = def.tally[key];
        const have = TALLIES[key].have();
        parts.push({
            key,
            name: TALLIES[key].name,
            short: TALLIES[key].short(need),
            text: `${have} / ${need}`,
            fraction: clamp01(have / need),
            met: have >= need,
        });
    }

    return parts;
}

export const goalMet = (id) => goalParts(id).every(part => part.met);


//    !!! ENTERING, LEAVING AND CLAIMING !!!

function runResets(id) {
    for (const key of CHALLENGES[id].resets) RESETS[key].run();
}

// Rewards that do something instead of unhiding something (openOne and REWARD_ACTIONS)

const openOne = (layerKey, biomeNode, subLayerNode) => () => {
    unlockLayer(layerKey);
    openBiome(biomeNode, subLayerNode);
};

export const REWARD_ACTIONS = {
    waterlogged: openOne("wetlands", "biomeWetlands", "marsh"),
    clearwater: openOne("reef", "biomeReef", "reef"),
    deadfall: openOne("fungi", "biomeFungi", "mushroomGrove"),
    longWinter: openOne("ice", "biomeIce", "iceField"),

    iceAge() {
        const world = worldState();
        for (const id of tilesOf(ICE_KINDS, world)) setTerrain(world, id, "bare");
    },

    openWater() {
        const sea = getLayerState("aquatic");
        if (!sea.oceanSchools) sea.oceanSchools = {};
        if (!sea.oceanSchools.herring) {
            sea.oceanSchools.herring = { at: "kelp", upgrades: {}, buffs: {} };
        }
    },
};

export function enterChallenge(id) {
    const s = challengeState();
    if (!CHALLENGES[id] || s.active || challengeDone(id) || !challengeOpen(id)) return false;
    runResets(id);
    getLayerState("world").firesOut = 0;
    s.active = id;
    s.confirming = null;
    return true;
}

// Leaving a challenge early resets your stuff
export function leaveChallenge() {
    const s = challengeState();
    const id = activeChallenge();
    if (!id) return false;
    runResets(id);
    s.active = null;
    return true;
}
// Reaching the goal ends nothing on its own, so it waits to be claimed
export const challengeReady = () => {
    const id = activeChallenge();
    return !!id && goalMet(id);
};

// Claiming a challenge doesn't reset your stuff
export function claimChallenge() {
    const id = activeChallenge();
    if (!challengeReady()) return false;
    const s = challengeState();
    s.completed[id] = true;
    s.active = null;
    if (REWARD_ACTIONS[id]) REWARD_ACTIONS[id]();
    return true;
}
