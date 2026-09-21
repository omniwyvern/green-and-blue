// cards.js
//
// Adaptation cards and combos; a level N card is worth N copies

import { getLayerState, layerUnlocked } from "../../../core/state.js";
import { CARD_ART, BANNER_ART } from "../art/cardArt.js";
import { challengeBlocks, challengeDone, challengeMod } from "./challenges.js";
import { nodeBought } from "../../../core/nodes.js";


//    !!! SLOTS AND RARITY !!!

export const SLOTS = 3;             // How many cards can be equipped at once
export const MOST_SLOTS = 4;        // After bottleneck challenge is completed (PROBABLY CHANGE)

export const slotCount = () =>
    challengeBlocks("narrowLoadout") ? 1 : (challengeDone("bottleneck") ? MOST_SLOTS : SLOTS);
export const COPIES_TO_COMBINE = 3; // Three of a level make one of the next

// Different rarities and how often they'll be pulled
export const RARITIES = {
    common: { name: "Common", weight: 65, color: "#96a0aa" },
    uncommon: { name: "Uncommon", weight: 25, color: "#5aa8e8" },
    rare: { name: "Rare", weight: 10, color: "#e0b23c" },
};


//    !!! THE BANNERS AND EVERY CARD !!!

// Each card is under a specific layer's banner, each of which scales price separately
export const BANNERS = {
    cores: {
        name: "The Cores",
        layer: "cores",
        color: "#08c3aa",
        baseCost: 3,
        text: "The Green and Blue Cores.",
    },
    pond: {
        name: "The Pond",
        layer: "pond",
        color: "#2f8fb5",
        baseCost: 5,
        text: "Algae, fish, and what the pond makes.",
    },
    rain: {
        name: "The Weather",
        layer: "precipitation",
        color: "#58a8e8",
        baseCost: 8,
        text: "Rain: how long it lasts and what it does.",
    },
    grass: {
        name: "Green Fields",
        layer: "grass",
        color: "#5aa84f",
        baseCost: 12,
        text: "Grass: how fast it grows and what it's worth.",
    },

    forest: {
        name: "The Forest",
        layer: "woodland",
        color: "#3d9455",
        baseCost: 120,
        text: "Trees, how they grow, and the old growth they leave.",
    },

    ocean: {
        name: "Open Waters",
        layer: "aquatic",
        color: "#3f9ad4",
        baseCost: 150,
        text: "Currents, schools, and drifting boosts.",
    },

    marsh: {
        name: "The Marsh",
        layer: "wetlands",
        color: "#6f9e63",
        baseCost: 200,
        text: "Flooding, silt, and the plants that grow in the marsh.",
    },

    iceField: {
        name: "The Ice Field",
        layer: "ice",
        color: "#8fd0e8",
        baseCost: 250,
        text: "Snow, pressure, and turning it into ice.",
    },
};

export const BANNER_IDS = Object.keys(BANNERS);

export const CARDS = {

    // !!! CORES !!!

    quickGrowth: {
        name: "Rising Core",
        rarity: "common",
        banner: "cores",
        color: "#22b47c",
        mods: { coreGrowth: 0.06 },
        text: "The Green Core's growth meter fills faster.",
    },
    quickening: {
        name: "Quickening",
        rarity: "common",
        banner: "cores",
        color: "#2f92ee",
        mods: { chargeRate: 0.06 },
        text: "The Blue Core's charge meter fills faster.",
    },
    staticCharge: {
        name: "Static Charge",
        rarity: "common",
        banner: "cores",
        color: "#2f92ee",
        mods: { blueClick: 0.06 },
        text: "Every Blue Core click is worth more.",
    },
    verdantAbundance: {
        name: "Verdant Abundance",
        rarity: "uncommon",
        banner: "cores",
        color: "#22b47c",
        mods: { greenProduction: 0.12 },
        text: "Every stage of the Green Core pays more.",
    },
    powerSurge: {
        name: "Power Surge",
        rarity: "uncommon",
        banner: "cores",
        color: "#2f92ee",
        mods: { fullChargeBonus: 0.15 },
        text: "Clicks on a completely full meter are worth more.",
    },
    maturation: {
        name: "Maturation",
        rarity: "uncommon",
        banner: "cores",
        color: "#22b47c",
        mods: { stageCap: 0.12 },
        text: "The Green Core can reach at least one more stage.",
    },
    overgrowth: {
        name: "Overgrowth",
        rarity: "rare",
        banner: "cores",
        color: "#22b47c",
        mods: { overgrowth: 0.005 },
        effect: "+.5%/s Green production while left alone, up to +200%",
        text: "Leave it be.",
    },
    overflow: {
        name: "Overflow",
        rarity: "rare",
        banner: "cores",
        color: "#2f92ee",
        mods: { chargeOverflow: 0.5 },
        effect: "Charge past 100%, at half speed",
        text: "The meter was never the limit.",
    },
    pressureValve: {
        name: "Pressure Valve",
        rarity: "rare",
        banner: "cores",
        color: "#2f92ee",
        mods: { pressureValve: 0.15 },
        effect: "+15% Green production per 100% of charge held at full",
        text: "Pressure has to go somewhere.",
    },
    feedbackLoop: {
        name: "Feedback Loop",
        rarity: "rare",
        banner: "cores",
        color: "#08c3aa",
        mods: { feedbackLoop: 0.04 },
        effect: "+4% Green production per consecutive full-charge click",
        text: "One core learns what the other is doing.",
        locked: true,
    },

    // !!! THE POND !!!

    thrivingAlgae: { // REMOVE THIS ONE
        name: "Thriving Algae",
        rarity: "common",
        banner: "pond",
        color: "#4bbd85",
        mods: { algaeGrowth: 0.06 },
        text: "Algae fills the pond faster.",
    },
    healthyFish: { // REMOVE THIS ONE
        name: "Healthy Fish",
        rarity: "common",
        banner: "pond",
        color: "#2f8fb5",
        mods: { fishGrowth: 0.06 },
        text: "Fish breed faster in water rough enough for them.",
    },
    productiveAlgae: {
        name: "Productive Algae",
        rarity: "common",
        banner: "pond",
        color: "#4bbd85",
        mods: { algaeGreen: 0.06 },
        text: "Each unit of algae is worth more Green Essence.",
    },
    productiveFish: {
        name: "Productive Fish",
        rarity: "common",
        banner: "pond",
        color: "#2f8fb5",
        mods: { fishBlue: 0.06 },
        text: "Each fish adds more to the pond's Blue Essence.",
    },
    turbulentWaters: {
        name: "Turbulent Waters",
        rarity: "common",
        banner: "pond",
        color: "#35d0d0",
        mods: { stirPower: 0.06 },
        text: "Each click on the water stirs up more turbulence.",
    },
    deepWaters: {
        name: "Room to Swim",
        rarity: "uncommon",
        banner: "pond",
        color: "#35d0d0",
        mods: { pondCapacity: 0.12 },
        text: "The pond holds more algae and fish.",
    },
    stillness: {
        name: "Stillness",
        rarity: "uncommon",
        banner: "pond",
        color: "#35d0d0",
        mods: { settleResist: 0.12 },
        text: "Rough water takes longer to settle back to calm.",
    },
    restlessWaters: {
        name: "Restless Waters",
        rarity: "uncommon",
        banner: "pond",
        color: "#35d0d0",
        mods: { turbulenceMax: 0.12 },
        text: "The water can get rougher than before, and pond life benefits.",
    },
    strongCurrent: {
        name: "Strong Current",
        rarity: "uncommon",
        banner: "pond",
        color: "#2f8fb5",
        mods: { roughBlue: 0.3 },
        text: "More Blue Essence the rougher the water, with the full bonus at max turbulence.",
    },
    nutrientRich: {
        name: "Nutrient-Rich Waters",
        rarity: "uncommon",
        banner: "pond",
        color: "#4bbd85",
        mods: { calmGreen: 0.3 },
        text: "More Green Essence the calmer the water, with the full bonus when it's still.",
    },
    abundantLife: {
        name: "Abundant Life",
        rarity: "uncommon",
        banner: "pond",
        color: "#4bbd85",
        mods: { biomassOutput: 0.12 },
        text: "The pond turns what lives in it into more Biomass.",
    },
    algaeBloom: {
        name: "Algae Bloom",
        rarity: "uncommon",
        banner: "pond",
        locked: true,
        color: "#6fd18a",
        mods: { algaeFullGreen: 0.5 },
        text: "Algae everywhere.",
    },
    deeperDepths: {
        name: "Deeper Depths",
        rarity: "rare",
        banner: "pond",
        color: "#2f8fb5",
        mods: { fishReserve: 0.2 },
        effect: "20% of the pond is out of the algae's reach",
        text: "Some water is too deep for algae.",
    },
    tidalCycle: {
        name: "Tidal Cycle",
        rarity: "rare",
        banner: "pond",
        color: "#35d0d0",
        mods: { tidalCycle: 1 },
        unique: true,
        effect: "Turbulence rises and falls on its own, and can't be stirred",
        text: "The water has a mind of its own.",
    },
    rainwater: {
        name: "Rainwater",
        rarity: "rare",
        banner: "pond",
        needs: "precipitation",
        color: "#35d0d0",
        mods: { rainwater: 0.25 },
        effect: "+25% pond capacity and a floor under turbulence while it rains",
        text: "Rain ends up in the pond.",
    },

    // !!! PRECIPITATION !!! still called rain since it predates snow
    condensation: {
        name: "Condensation",
        rarity: "common",
        banner: "rain",
        color: "#58a8e8",
        mods: { rainCharge: 0.06 },
        text: "The cloud fills faster.",
    },
    lightDrizzle: {
        name: "Light Drizzle",
        rarity: "common",
        banner: "rain",
        color: "#58a8e8",
        mods: { rainCost: 0.06 },
        text: "Filling the cloud costs less Blue Essence.",
    },
    gatheringClouds: {
        name: "Gathering Clouds",
        rarity: "common",
        banner: "rain",
        needs: "environment",
        color: "#58a8e8",
        mods: { moistureRate: 0.06 },
        text: "Weather leaves the ground wetter.",
    },
    prolongedStorm: {
        name: "Prolonged Storm",
        rarity: "uncommon",
        banner: "rain",
        color: "#58a8e8",
        mods: { rainDuration: 0.12 },
        text: "Weather lasts longer.",
    },
    gentleRain: {
        name: "Gentle Rain",
        rarity: "uncommon",
        banner: "rain",
        color: "#58a8e8",
        mods: { rainBoost: 0.15 },
        text: "Weather does more for the tile it falls on.",
    },
    soakingRain: {
        name: "Thirsty Ground",
        rarity: "uncommon",
        banner: "rain",
        needs: "environment",
        color: "#7fc8ff",
        mods: { rainSoak: 0.15 },
        text: "Bare ground soaks up water faster.",
    },
    cloudBreak: {
        name: "Break in the Clouds",
        rarity: "rare",
        banner: "rain",
        color: "#7fc8ff",
        mods: { cloudBreak: 1 },
        unique: true,
        effect: "Weather can be called off early",
        text: "You decide when it stops.",
    },
    monsoon: {
        name: "Monsoon",
        rarity: "rare",
        banner: "rain",
        color: "#7fc8ff",
        mods: { monsoon: 1 },
        unique: true,
        effect: "When weather ends, it drifts to the driest neighboring tile and falls there again for half as long",
        text: "The rain moves on.",
    },
    rainDance: {
        name: "Rain Dance",
        rarity: "rare",
        banner: "rain",
        color: "#7fc8ff",
        mods: { rainDance: 0.2 },
        effect: "20% chance a tile reaching maturity calls weather down nearby",
        text: "The ecosystem calls for rain.",
    },
    saturation: {
        name: "Saturation",
        rarity: "rare",
        banner: "rain",
        needs: "environment",
        color: "#7fc8ff",
        mods: { saturation: 1 },
        unique: true,
        effect: () => "Flooding a tile leaves Pond instead of Water"
            + (nodeBought("environment", "iceField") ? ", and an Ice Field instead of Snow" : ""),
        text: "Water becomes the land.",
    },

    // !!! GRASS !!!

    rapidSprouting: {
        name: "Rapid Sprouting",
        rarity: "common",
        banner: "grass",
        color: "#5aa84f",
        mods: { grassGrowth: 0.06 },
        text: "Grass moves through its stages faster.",
    },
    establishedRoots: {
        name: "Established Roots",
        rarity: "common",
        banner: "grass",
        color: "#3aa876",
        mods: { spreadRetain: 0.06 },
        effect: "Grass keeps 6% of its growth after seeding a neighbor",
        text: "Spreading doesn't fully reset the parent tile.",
    },
    rootNetwork: {
        name: "Root Network",
        rarity: "common",
        banner: "grass",
        color: "#3aa876",
        mods: { adjacencyBonus: 0.08 },
        text: "Neighboring grass boosts growth more.",
    },
    verdantFields: {
        name: "Verdant Fields",
        rarity: "uncommon",
        banner: "grass",
        color: "#7fe08f",
        mods: { grassOutput: 0.12 },
        text: "Grass tiles give more Green Essence.",
    },
    quickMaturation: {
        name: "Quick Maturation",
        rarity: "uncommon",
        banner: "grass",
        color: "#5aa84f",
        mods: { matureWait: 0.12 },
        text: "Mature grass spreads sooner.",
    },
    creepingGrowth: {
        name: "Creeping Growth",
        rarity: "uncommon",
        banner: "grass",
        color: "#3aa876",
        mods: { growthSpill: 0.1 },
        effect: "10% chance a growth tick also feeds an adjacent patch of grass",
        text: "Growth spills over.",
    },
    chainReaction: {
        name: "Chain Reaction",
        rarity: "rare",
        banner: "grass",
        color: "#7fe08f",
        mods: { chainReaction: 0.25 },
        effect: "25% chance a tile that was just seeded seeds another at once",
        text: "Growth causes growth.",
    },
    deepRoots: {
        name: "Deep Roots",
        rarity: "rare",
        banner: "grass",
        color: "#3aa876",
        mods: { deepRoots: 0.5 },
        effect: "Mature tiles pay up to +50% more the longer they stay mature",
        text: "Worth the wait.",
    },
    deepDrinkers: {
        name: "Deep Drinkers",
        rarity: "rare",
        banner: "grass",
        color: "#3aa876",
        mods: { dampMastery: 1 },
        unique: true,
        effect: "Wet ground never slows grass down",
        text: "Deep roots don't mind the rain.",
    },
    seedstorm: {
        name: "Seedstorm",
        rarity: "rare",
        banner: "grass",
        color: "#7fe08f",
        mods: { seedstorm: 0.35 },
        effect: "35% chance starting rain plants a seed under it",
        text: "The wind carries seeds.",
    },

    // !!! OCEAN !!!

    richWaters: {
        name: "Rich Waters",
        rarity: "common",
        banner: "ocean",
        color: "#2c78c8",
        mods: { oceanOutput: 0.06 },
        text: "Schools earn more.",
    },
    swiftTide: {
        name: "Swift Tide",
        rarity: "common",
        banner: "ocean",
        color: "#45c4d8",
        mods: { oceanTickSpeed: 0.06 },
        text: "Ocean ticks happen more often.",
    },
    bountifulDrift: {
        name: "Bountiful Drift",
        rarity: "common",
        banner: "ocean",
        color: "#45c4d8",
        mods: { boostSpawn: 0.06 },
        text: "More boosts drift in on the currents.",
    },
    deepHarvest: {
        name: "Deep Harvest",
        rarity: "uncommon",
        banner: "ocean",
        color: "#3f9ad4",
        mods: { oceanOutput: 0.15 },
        text: "Schools earn a lot more.",
    },
    turnOfTheTide: {
        name: "Turn of the Tide",
        rarity: "uncommon",
        banner: "ocean",
        color: "#45c4d8",
        mods: { oceanTickSpeed: 0.12 },
        text: "Ocean ticks happen even more often.",
    },
    learnedShoals: {
        name: "Learned Shoals",
        rarity: "uncommon",
        banner: "ocean",
        color: "#2c78c8",
        mods: { learnedShoals: 0.12 },
        text: "Fish upgrades get cheaper.",
    },
    bloodInTheWater: {
        name: "Blood in the Water",
        rarity: "rare",
        banner: "ocean",
        color: "#3f9ad4",
        mods: { pickupPayout: 0.5 },
        effect: "Schools grabbing a drifting boost instantly pay half of their usual catch",
        text: "One fish finds food, and everyone eats.",
    },
    undertow: {
        name: "The Undertow",
        rarity: "rare",
        banner: "ocean",
        color: "#2c78c8",
        mods: { undertow: 1 },
        unique: true,
        effect: "Every school rides across one more current each tick.",
        text: "Deeper currents, faster travel.",
    },
    slackWater: {
        name: "Slack Water",
        rarity: "rare",
        banner: "ocean",
        color: "#45c4d8",
        mods: { slackWater: 1 },
        unique: true,
        effect: "Ocean ticks take twice as long, but every region catches a drifting boost each time",
        text: "Slow tide, rich shores.",
    },

    // !!! FOREST !!!

    deepLoam: {
        name: "Deep Loam",
        rarity: "common",
        banner: "forest",
        color: "#8a6236",
        mods: { treeGrowth: 0.03 },
        text: "Trees grow faster.",
    },
    broadleaf: {
        name: "Broadleaf",
        rarity: "common",
        banner: "forest",
        color: "#4fa85c",
        mods: { forestOutput: 0.06 },
        text: "The forest earns more.",
    },
    shortRest: {
        name: "Short Rest",
        rarity: "common",
        banner: "forest",
        color: "#7fb36a",
        mods: { shortStand: 0.1 },
        text: "Finished trees become old growth sooner.",
    },
    sunwardReach: {
        name: "Sunward Reach",
        rarity: "uncommon",
        banner: "forest",
        color: "#d8b453",
        mods: { treeGrowth: 0.05 },
        text: "Trees grow a lot faster.",
    },
    ringsOfYears: {
        name: "Rings of Years",
        rarity: "uncommon",
        banner: "forest",
        color: "#a2743f",
        mods: { oldGrowthWorth: 0.12 },
        text: "Old growth is worth more.",
    },
    fertileGround: {
        name: "Fertile Ground",
        rarity: "uncommon",
        banner: "forest",
        color: "#5c9e4a",
        mods: { livingWorth: 0.3 },
        text: "Growing trees pay out more.",
    },
    instinctiveGrowth: {
        name: "Instinctive Growth",
        rarity: "rare",
        banner: "forest",
        color: "#3d9455",
        mods: { instinct: 1 },
        unique: true,
        effect: "A tree left waiting two minutes picks one of its two ways on its own",
        text: "Trees can grow without you.",
    },
    nothingWasted: {
        name: "Nothing Wasted",
        rarity: "rare",
        banner: "forest",
        color: "#2f7a45",
        mods: { wholeTree: 1 },
        unique: true,
        effect: "Every finished tree also pays +6% Green per Height, "
            + "+6% Blue per Roots, +6% Vitality per Branches",
        text: "Every part of a tree counts.",
    },
    thirdPath: {
        name: "The Third Path",
        rarity: "rare",
        banner: "forest",
        color: "#c9b45e",
        mods: { thirdOption: 1 },
        unique: true,
        effect: "Every growth choice offers three ways instead of two",
        text: "There's always another way up.",
    },

    // !!! MARSH !!!

    richMud: {
        name: "Rich Mud",
        rarity: "common",
        banner: "marsh",
        color: "#8f8158",
        mods: { marshOutput: 0.06 },
        text: "Every zone pays more.",
    },
    siltLaden: {
        name: "Silt Laden",
        rarity: "common",
        banner: "marsh",
        color: "#b09a62",
        mods: { marshSilt: 0.06 },
        text: "Floods leave more silt.",
    },
    ebbAndFlow: {
        name: "Ebb and Flow",
        rarity: "common",
        banner: "marsh",
        color: "#3f8fc4",
        mods: { marshTempo: 0.06 },
        text: "Zones cycle faster.",
    },
    springFed: {
        name: "Spring Fed",
        rarity: "uncommon",
        banner: "marsh",
        color: "#58a8e8",
        mods: { marshRefill: 0.12 },
        text: "Stored water refills faster.",
    },
    succession: {
        name: "Succession",
        rarity: "uncommon",
        banner: "marsh",
        color: "#79ad5c",
        mods: { marshSuccession: 0.12 },
        text: "Plant communities mature faster.",
    },
    firmBanks: {
        name: "Firm Banks",
        rarity: "uncommon",
        banner: "marsh",
        color: "#c0a55f",
        mods: { marshSeep: 0.12 },
        text: "Zones drift into sync more slowly.",
    },
    settledGround: {
        name: "Settled Ground",
        rarity: "rare",
        banner: "marsh",
        color: "#8f8158",
        mods: { settledGround: 1 },
        unique: true,
        effect: "Draining water never washes silt away",
        text: "The marsh keeps its silt.",
    },
    floodPulse: {
        name: "Flood Pulse",
        rarity: "rare",
        banner: "marsh",
        color: "#3f8fc4",
        mods: { floodPulse: 1 },
        unique: true,
        effect: "Releasing water spreads the zones across all four stages instead of raising them all",
        text: "One surge, spread out.",
    },
    floatingMats: {
        name: "Floating Mats",
        rarity: "rare",
        banner: "marsh",
        color: "#5f9e63",
        mods: { floatingMats: 1 },
        unique: true,
        effect: "Communities never die back, however wet or dry their zone gets",
        text: "Floating roots ride out any water level.",
    },

    // !!! ICE FIELD !!!

    heavySnowfall: {
        name: "Heavy Snowfall",
        rarity: "common",
        banner: "iceField",
        color: "#d3e8f8",
        mods: { snowfall: 0.06 },
        text: "More snow settles on the field.",
    },
    hardPack: {
        name: "Hard Pack",
        rarity: "common",
        banner: "iceField",
        color: "#9ccbec",
        mods: { iceOutput: 0.06 },
        text: "Every layer of the pack pays more.",
    },
    deepCold: {
        name: "Deep Cold",
        rarity: "common",
        banner: "iceField",
        color: "#6cadda",
        mods: { deepCold: 0.06 },
        text: "Pressure drains more slowly.",
    },
    deepDrift: {
        name: "Deep Drift",
        rarity: "uncommon",
        banner: "iceField",
        color: "#d3e8f8",
        mods: { snowDrift: 0.15 },
        text: "The field holds more loose snow.",
    },
    sintering: {
        name: "Fusing Snow",
        rarity: "uncommon",
        banner: "iceField",
        color: "#6cadda",
        mods: { compaction: 0.12 },
        text: "Each press compacts more snow.",
    },
    weightOfYears: {
        name: "Weight of Years",
        rarity: "uncommon",
        banner: "iceField",
        color: "#3f8ec6",
        mods: { loadWorth: 0.12 },
        text: "Snow on top of a layer boosts it more.",
    },
    permafrost: {
        name: "Permafrost",
        rarity: "rare",
        banner: "iceField",
        color: "#3f8ec6",
        mods: { permafrost: 1 },
        unique: true,
        effect: "Pressing never throws off any snow, and neither does a collapse",
        text: "Nothing shifts.",
    },
    whiteout: {
        name: "Whiteout",
        rarity: "rare",
        banner: "iceField",
        color: "#f4f9ff",
        mods: { whiteout: 0.5 },
        effect: "Snow gathers at half strength even when it isn't snowing",
        text: "Wind blows snow in.",
    },
    holdFast: {
        name: "Hold Fast",
        rarity: "rare",
        banner: "iceField",
        color: "#9ccbec",
        mods: { holdFast: 1 },
        unique: true,
        effect: "Pressure never bleeds off below the bottom of the window it's in",
        text: "Pressure holds.",
    },
};

export const cardArt = (id) => CARD_ART[id] || "";
export const bannerArt = (id) => BANNER_ART[id] || "";

// A card id out of an older save may not exist any more
export const knownCard = (id) => !!CARDS[id];

const UNKNOWN_RARITY = { name: "Unknown", weight: 0, color: "#96a0aa" };
export const rarityOf = (id) => knownCard(id) ? RARITIES[CARDS[id].rarity] : UNKNOWN_RARITY;


//    !!! COMBOS !!!

// Equipping certain cards together gives combo bonuses
export const COMBOS = [
    { // Deeper depths effect makes minimum fish to 35% instead of 20%
        id: "abyssalDepths",
        name: "Abyssal Depths",
        cards: ["deepWaters", "deeperDepths"],
        mods: { fishReserve: 0.15 },
        effect: "Deeper Depths holds 35% of the Pond back instead of 20%",
        text: "The fish dive deeper.",
    },
    { // Moisture buildup has a chance to generate a bit of rain charge
        id: "gatheringStorm",
        name: "Gathering Storm",
        cards: ["gatheringClouds", "condensation"],
        mods: { moistureCharge: 0.5 },
        effect: "Ground soaking up rain gathers rain back",
        text: "Wet ground feeds the clouds.",
    },
    { // Soaked ground holds its weather bonus longer
        id: "endlessDownpour",
        name: "Endless Downpour",
        cards: ["prolongedStorm", "soakingRain"],
        mods: { slowDrying: 0.5 },
        effect: "Soaked ground dries half as fast",
        text: "The ground stays wet.",
    },
    { // When a grass tile spreads, the new tile starts with some more growth progress
        id: "burstingGrowth",
        name: "Bursting Growth",
        cards: ["rapidSprouting", "establishedRoots"],
        mods: { seedProgress: 0.25 },
        effect: "A newly seeded tile starts 25% grown",
        text: "New grass gets a head start.",
    },
    { // Clicks past a certain turbulence threshold generate a big boost to blue
        id: "maelstrom",
        name: "Maelstrom",
        cards: ["turbulentWaters", "restlessWaters"],
        mods: { maelstrom: 3 },
        effect: "Stirring rough water pays 3s of Blue Essence at once",
        text: "Stir it up.",
    },
    { // Instead of converting charge production over 100% to green boost, it just checks it
        id: "controlledOverflow",
        name: "Controlled Overflow",
        cards: ["overflow", "pressureValve"],
        mods: { controlledOverflow: 1 },
        effect: "Pressure Valve reads the charge held instead of spending it",
        text: "Nothing is wasted.",
    },
    { // Crossing between turbulence boundaries provides temporary boosts to resources produced in the pond layer
        id: "feedingFrenzy",
        name: "Broken Water",
        cards: ["strongCurrent", "nutrientRich"],
        mods: { bandBoost: 0.5 },
        effect: "+50% Pond output for 8s when the water changes state",
        text: "Change brings life.",
    },
    { // Grass grows quicker by a moderate amount
        id: "instantGrove",
        name: "Instant Grove",
        cards: ["rapidSprouting", "quickMaturation"],
        mods: { grassGrowth: 0.15 },
        effect: "+15% grass growth",
        text: "Growth comes fast.",
    },
    { // Rain falling on the pond boosts algae growth
        id: "greenRain",
        name: "Green Rain",
        cards: ["gatheringClouds", "algaeBloom"],
        mods: { rainAlgae: 0.3 },
        effect: "+30% algae growth while it rains on the world",
        text: "Rain feeds the algae.",
    },
    { // Rain on a pond temporarily increases pond capacity
        id: "dancingWaters",
        name: "Dancing Waters",
        cards: ["turbulentWaters", "gentleRain"],
        mods: { rainCapacity: 0.15 },
        effect: "+15% Pond capacity while it rains",
        text: "Rain makes room in the pond.",
    },
    { // Mature grass adjacent to a pond increases algae growth slightly, and algae increases the production of those grass tiles
        id: "fertileWaters",
        name: "Fertile Waters",
        cards: ["verdantFields", "productiveAlgae"],
        mods: { shoreExchange: 0.25 },
        effect: "Grass on the shore and the algae below it each pay the other 25%",
        text: "Land and water feed each other.",
    },
    { // When grass spreads adjacent to a pond, fish growth gets a temporary boost
        id: "livingShore",
        name: "Living Shore",
        cards: ["establishedRoots", "healthyFish"],
        mods: { shoreSpawn: 0.5 },
        effect: "Grass spreading onto a shore tile gives +50% fish growth for 10s",
        text: "Life gathers at the shore.",
    },

    { // Trees less than 50% grow faster
        id: "raceForLight",
        name: "Race for Light",
        cards: ["deepLoam", "sunwardReach"],
        mods: { earlyRush: 0.08 },
        effect: "+8% growth for a tree that is not yet half grown",
        text: "Young trees grow fast.",
    },
    { // Trees taken sooner means more of them finished, and the forest remembers further back
        id: "longMemory",
        name: "Long Memory",
        cards: ["shortRest", "ringsOfYears"],
        mods: { amplifyCeiling: 1 },
        effect: "Keystone amplification climbs toward 3x instead of 2x",
        text: "Faster, and nothing is lost.",
    },
    { // A standing tree is read off its rings as it lays them down, so it is worth more late
        id: "everyRingCounts",
        name: "Every Ring Counts",
        cards: ["ringsOfYears", "fertileGround"],
        mods: { livingRipeness: 1 },
        effect: "A standing tree is worth up to +100% more as it nears full height",
        text: "Taller trees are worth more.",
    },
    { // A tree with three ways in front of it doesn't sit on the choice as long
        id: "oldInstinct",
        name: "Old Instinct",
        cards: ["instinctiveGrowth", "thirdPath"],
        mods: { instinctSpeed: 1 },
        effect: "A waiting tree picks for itself after one minute instead of two",
        text: "More options, faster choices.",
    },

    // !!! THREE-CARD COMBOS !!!

    { // Feeding frenzy combo but also with tides. As such, boosts the bonuses from crossing the boundaries
        id: "tidalFrenzy",
        name: "Tidal Frenzy",
        cards: ["strongCurrent", "nutrientRich", "tidalCycle"],
        mods: { bandBoost: 1 },
        effect: "+100% Pond output for 8s when the water changes state",
        text: "Every change brings more life.",
    },
    { // Connected grass regions get bonus off of total size instead of just adjacency
        id: "greenDominion",
        name: "Green Dominion",
        cards: ["rapidSprouting", "rootNetwork", "verdantFields"],
        mods: { regionBonus: 0.04 },
        effect: "Grass grows +4% faster per tile in its connected patch, instead of per neighbor",
        text: "The grass takes over.",
    },
    { // Ignores maturity waiting time entirely
        id: "wildfireGrowth",
        name: "Wildfire Growth",
        cards: ["rapidSprouting", "quickMaturation", "establishedRoots"],
        mods: { grassGrowth: 0.15, seedProgress: 0.25, noMatureWait: 1 },
        effect: "+15% grass growth, a newly seeded tile starts 25% grown, and mature grass spreads at once",
        text: "Grass everywhere.",
    },
    { // Rough water carries the pond's balance for it
        id: "rushingSchool",
        name: "Rushing School",
        cards: ["turbulentWaters", "strongCurrent", "stillness"],
        mods: { roughBalance: 1 },
        effect: "While the water is rough, the pond counts as perfectly balanced",
        text: "The fish move as one.",
    },

    // !!! CROSS-LAYER COMBOS !!!

    { // The forest reads the field it is standing in, so spreading grass is worth growing for
        id: "commonGround",
        name: "Common Ground",
        cards: ["establishedRoots", "deepLoam"],
        mods: { grassRooted: 0.004 },
        effect: "+0.4% tree growth per mature grass tile, up to +10%",
        text: "Grass paves the way for trees.",
    },
    { // Rain soaking into a forest of wide leaves
        id: "rainforest",
        name: "Rainforest",
        cards: ["soakingRain", "broadleaf"],
        mods: { rainGrowth: 0.08 },
        effect: "+8% tree growth while it is raining on the world",
        text: "Rain helps trees grow.",
    },

    { // Two tide cards together push the tick along further than either alone
        id: "runningTides",
        name: "Running Tides",
        cards: ["swiftTide", "turnOfTheTide"],
        mods: { oceanTickSpeed: 0.08 },
        effect: "Tide ticks happen even faster",
        text: "Two tides, twice as fast.",
    },
    { // A fat drift meets rich waters, and the whole season pays out
        id: "seasonalRuns",
        name: "Seasonal Runs",
        cards: ["bountifulDrift", "deepHarvest"],
        mods: { oceanOutput: 0.1 },
        effect: "Every school hauls up even more than either card alone",
        text: "Plenty for everyone.",
    },
    { // Turbulent pond currents pour out to meet a turning tide
        id: "brackishReach",
        name: "Brackish Reach",
        cards: ["turbulentWaters", "turnOfTheTide"],
        mods: { oceanTickSpeed: 0.12 },
        effect: "Ocean ticks happen even faster",
        text: "The pond speeds up the sea.",
    },

    { // Silt that never washes out, with more of it arriving
        id: "peatBuilding",
        name: "Peat Building",
        cards: ["siltLaden", "settledGround"],
        mods: { marshSilt: 0.2 },
        effect: "+20% sediment settling out of flood water",
        text: "The ground builds up.",
    },
    { // Firmer banks on a quicker cycle, so each zone keeps its own time
        id: "ownSeasons",
        name: "Their Own Seasons",
        cards: ["ebbAndFlow", "firmBanks"],
        mods: { marshSeep: 0.2 },
        effect: "Zones seep into each other even less",
        text: "Each zone keeps its own time.",
    },
    { // More snow, and room to keep it
        id: "snowbound",
        name: "Snowbound",
        cards: ["heavySnowfall", "deepDrift"],
        mods: { snowfall: 0.1, snowDrift: 0.1 },
        effect: "+10% snowfall and +10% loose snow the field can hold",
        text: "Deep drifts.",
    },
    { // A pack that loses nothing, and pays more for all of it
        id: "glacier",
        name: "Glacier",
        cards: ["hardPack", "permafrost"],
        mods: { iceOutput: 0.2 },
        effect: "+20% snowpack output",
        text: "Nothing gets out.",
    },
    { // Fused grains under a heavy load
        id: "crushingWeight",
        name: "Crushing Weight",
        cards: ["sintering", "weightOfYears"],
        mods: { compaction: 0.1 },
        effect: "+10% snow moved down by each press",
        text: "More weight, more ice.",
    },
    { // Snow up the hill comes down as marsh water
        id: "meltwater",
        name: "Runoff",
        cards: ["heavySnowfall", "springFed"],
        mods: { marshRefill: 0.2 },
        effect: "+20% marsh water refill",
        text: "Snow melts into water eventually.",
    },
];


//    !!! READING THE COLLECTION !!!

export const CARD_IDS = Object.keys(CARDS);

const adaptationState = () => getLayerState("adaptation");


export const isCardUnlocked = (id, s = adaptationState()) => {
    const card = CARDS[id];
    if (!card) return false;
    if (card.locked && !(s.unlockedCards || []).includes(id)) return false;
    return !card.needs || layerUnlocked(card.needs);
};

export const unlockedBannerIds = () => BANNER_IDS.filter(bannerUnlocked);

// Banners opened since the cards page was last seen; ones open before the first check count as seen
export function newBannerIds(s = adaptationState()) {
    const open = unlockedBannerIds();
    if (!Array.isArray(s.seenBanners)) s.seenBanners = [...open];
    return open.filter(id => !s.seenBanners.includes(id));
}

export function markBannersSeen(s = adaptationState()) {
    for (const id of newBannerIds(s)) s.seenBanners.push(id);
}

export function unlockCard(id, s = adaptationState()) {
    if (!s.unlockedCards) s.unlockedCards = [];
    if (!s.unlockedCards.includes(id)) s.unlockedCards.push(id);
}

// Banners are locked until you get the layer they're related to
export const bannerUnlocked = (id) => {
    const banner = BANNERS[id];
    if (!banner) return false;
    return !banner.layer || layerUnlocked(banner.layer);
};

// Everything a draw could turn up; unique cards drop out once owned
export const drawableCardIds = (s = adaptationState()) =>
    CARD_IDS.filter(id =>
        isCardUnlocked(id, s) &&
        bannerUnlocked(CARDS[id].banner) &&
        !(CARDS[id].unique && s.cards?.[id]));

// Drops anything the content no longer declares, for cards that were removed or renamed
function pruneCards(s) {
    if (s.cards) {
        for (const id in s.cards) if (!knownCard(id)) delete s.cards[id];
    }
    if (s.equipped) {
        for (let i = 0; i < s.equipped.length; i++) {
            if (s.equipped[i] && !knownCard(s.equipped[i])) s.equipped[i] = null;
        }
    }
    if (s.draw) {
        const live = s.draw.filter(knownCard);
        s.draw = live.length > 0 ? live : null;
    }
    if (s.unlockedCards) s.unlockedCards = s.unlockedCards.filter(knownCard);
}

// Cached per save slot, since cardBonus() runs this several times a tick and it only changes on load
const pruned = new WeakSet();

export function collection(s = adaptationState()) {
    if (!pruned.has(s)) {
        pruned.add(s);
        pruneCards(s);
    }
    return s.cards || {};
}

export const cardEntry = (id, s = adaptationState()) => collection(s)[id] || null;

// Only slots that exist now, since a save can hold a fourth from before a challenge was lost
const equippedSlots = (s) => (s.equipped || []).slice(0, slotCount());

export const equippedIds = (s = adaptationState()) =>
    equippedSlots(s).filter(id => id && knownCard(id));

// Roman numerals until 10, but past there it would just get cumbersome
const NUMERALS = ["", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
export function cardName(id, level) {
    if (!knownCard(id)) return "Unknown card";
    const suffix = level > 1 ? ` ${NUMERALS[level - 1] || level}` : "";
    return `${CARDS[id].name}${suffix}`;
}


//    !!! COMBOS ON A LOADOUT !!!

// All the combos on equipped cards
export const activeCombos = (s = adaptationState()) => {
    const equipped = equippedIds(s);
    return COMBOS.filter(combo =>
        combo.cards.every(id => knownCard(id) && equipped.includes(id)));
};

// A smaller combo sitting inside a larger one is not paid twice
const containedBy = (combo, other) =>
    combo !== other && combo.cards.length < other.cards.length
    && combo.cards.every(id => other.cards.includes(id));

// Which combos are being paid and which are folded into a larger one
export function comboStatus(s = adaptationState()) {
    const active = activeCombos(s);
    return active.map(combo => ({
        combo,
        foldedInto: active.find(other => containedBy(combo, other)) || null,
    }));
}

// The ones actually paid out
export function effectiveCombos(s = adaptationState()) {
    return comboStatus(s).filter(entry => !entry.foldedInto).map(entry => entry.combo);
}


//    !!! WHAT THE LOADOUT IS WORTH !!!

// Sums up bonuses for all equipped cards, also multiplies card benefit by +30% effect per level
export function cardBonus(key) {
    const s = adaptationState();
    if (challengeBlocks("cards") || !loadoutLocked(s)) return 0;
    let total = 0;

    for (const id of equippedIds(s)) {
        const card = CARDS[id];
        const entry = cardEntry(id, s);
        if (!card || !entry) continue;
        total += (card.mods?.[key] || 0) * (entry.level + ((entry.level-1) / 3));
        total += card.modsFlat?.[key] || 0;
    }
    for (const combo of effectiveCombos(s)) total += combo.mods?.[key] || 0;

    return total * challengeMod("cardWorth");
}

export const cardActive = (key) => cardBonus(key) > 0;


//    !!! DRAWING !!!

// What can currently be drawn on a specific banner
export const bannerCards = (bannerId, s = adaptationState()) =>
    !bannerUnlocked(bannerId) ? []
        : drawableCardIds(s).filter(id => CARDS[id].banner === bannerId);

// Saved as it is drawn, so a reload can't reroll it
export function rollDraw(bannerId = null, count = SLOTS) {
    const pool = bannerId ? bannerCards(bannerId) : drawableCardIds();
    const picked = [];

    while (picked.length < count && pool.length > 0) {
        const total = pool.reduce((sum, id) => sum + rarityOf(id).weight, 0);
        let roll = Math.random() * total;

        let index = 0;
        while (index < pool.length - 1) {
            roll -= rarityOf(pool[index]).weight;
            if (roll <= 0) break;
            index++;
        }
        picked.push(...pool.splice(index, 1));
    }
    return picked;
}

// Three copies of a level fold into one of the next
export function collectCard(id, s = adaptationState()) {
    if (!s.cards) s.cards = {};

    const entry = s.cards[id];
    if (!entry) return (s.cards[id] = { level: 1, copies: 0 });

    // Unique cards never stack past the one copy
    if (CARDS[id]?.unique) return entry;

    entry.copies += 1;
    while (entry.copies >= COPIES_TO_COMBINE) {
        entry.copies -= COPIES_TO_COMBINE;
        entry.level += 1;
    }
    return entry;
}

export function equipCard(id, slot, s = adaptationState()) {
    if (loadoutLocked(s)) return false;
    if (slot === -1) return false;
    if (!s.equipped) s.equipped = new Array(MOST_SLOTS).fill(null);
    const existing = s.equipped.indexOf(id);
    if (existing !== -1) s.equipped[existing] = null;
    s.equipped[slot] = id;
}

export function unequipSlot(slot, s = adaptationState()) {
    if (loadoutLocked(s)) return false;
    if (s.equipped) s.equipped[slot] = null;
}

export const firstFreeSlot = (s = adaptationState()) => equippedSlots(s).findIndex(id => !id);


//    !!! LOCKING IN !!!

// Cards can be swapped as much as you like, but are worth nothing until they are locked in
export const loadoutLocked = (s = adaptationState()) => !!s.loadoutLocked;

// Refuses an empty loadout, since that would spend the run's one lock-in on nothing
export function lockLoadout(s = adaptationState()) {
    if (loadoutLocked(s) || equippedIds(s).length === 0) return false;
    s.loadoutLocked = true;
    return true;
}

// Adapting lets you re-lock in cards
export function releaseLoadout(s = adaptationState()) {
    s.loadoutLocked = false;
}
