// cards.js
//
// Evolution cards. Their information, worth, and which ones are equipped.
// Files ask this for information, so nothing is imported here.
// State lives on the evolution layer:
//  evolution.cards[id] = { level, copies }   The collection
//  evolution.equipped  = [id|null, ...]      Which are equipped
//  evolution.draw      = [id, id, id]|null   Draw choice waiting to be chosen
// "mods" are what one copy at level 1 is worth, level N is worth N times that.
// Combos are on top of everything if you have the required cards equipped.

import { getLayerState } from "../../core/state.js";
import { CARD_ART, BANNER_ART } from "./cardArt.js";

export const SLOTS = 3;             // How many cards can be switched on at once
export const COPIES_TO_COMBINE = 3; // Three of a level make one of the next

// Different rarities and how often they'll be pulled.
export const RARITIES = {
    common: { name: "Common", weight: 65, color: "#96a0aa" },
    uncommon: { name: "Uncommon", weight: 25, color: "#5aa8e8" },
    rare: { name: "Rare", weight: 10, color: "#e0b23c" },
};

// Each card is under a banner. Each banner corresponds to a different layer/sublayer, so
// you can draw for cards specifically for one layer. Each one scales its prices separately.
// Cards have to have a banner, if they don't have one they can't be drawn.
export const BANNERS = {
    cores: {
        name: "The Cores",
        color: "#08c3aa",
        baseCost: 3,
        text: "The two cores themselves, and how quickly they come round.",
    },
    pond: {
        name: "The Pond",
        color: "#2f8fb5",
        baseCost: 5,
        text: "Algae, fish, and everything the water makes of them.",
    },
    rain: {
        name: "The Weather",
        color: "#58a8e8",
        baseCost: 8,
        text: "Rain: how long it falls, and what it does to what it falls on.",
    },
    grass: {
        name: "Green Fields",
        color: "#5aa84f",
        baseCost: 12,
        text: "Grass: how fast it grows, and what a tile is worth once it has.",
    },
};

export const BANNER_IDS = Object.keys(BANNERS);

export const CARDS = {
    quickGrowth: {
        name: "Quick Growth",
        rarity: "common",
        banner: "cores",
        color: "#22b47c",
        mods: { coreGrowth: 0.05 },
        text: "The Green Core's growth meter fills faster.",
    },
    verdantPulse: {
        name: "Verdant Pulse",
        rarity: "common",
        banner: "cores",
        color: "#22b47c",
        mods: { greenProduction: 0.05 },
        text: "Every stage of the Green Core pays more.",
    },
    quickening: {
        name: "Quickening",
        rarity: "common",
        banner: "cores",
        color: "#2f92ee",
        mods: { chargeRate: 0.05 },
        text: "The Blue Core's charge meter fills faster.",
    },
    spark: {
        name: "Spark",
        rarity: "common",
        banner: "cores",
        color: "#2f92ee",
        mods: { blueClick: 0.05 },
        text: "Every click on the Blue Core is worth more, full meter or not.",
    },
    surge: {
        name: "Surge",
        rarity: "common",
        banner: "cores",
        color: "#2f92ee",
        mods: { fullChargeBonus: 0.05 },
        text: "Only clicks on a completely full meter are worth more.",
    },
    photosynthesis: {
        name: "Photosynthesis",
        rarity: "common",
        banner: "cores",
        color: "#08c3aa",
        mods: { conversionRate: 0.05 },
        text: "Green turned into Blue comes out further, multiplied with the conversion itself.",
    },
    thickRoots: {
        name: "Thick Roots",
        rarity: "common",
        banner: "cores",
        color: "#22b47c",
        mods: { growthNeeded: 0.05 },
        text: "Each growth stage needs less growth than it did.",
    },
    something: {
        name: "replace this idk a name",
        rarity: "common",
        banner: "pond",
        color: "#4bbd85",
        mods: { algaeGrowth: 0.05 },
        text: "Algae fills the pond faster.",
    },
    healthyFish: {
        name: "Healthy Fish",
        rarity: "common",
        banner: "pond",
        color: "#2f8fb5",
        mods: { fishGrowth: 0.05 },
        text: "Fish breed faster in water rough enough for them.",
    },
    productiveFish: {
        name: "Productive Fish",
        rarity: "common",
        banner: "pond",
        color: "#2f8fb5",
        mods: { fishBlue: 0.05 },
        text: "Each fish adds more to the pond's Blue Essence.",
    },
    productiveAlgae: {
        name: "Productive Algae",
        rarity: "common",
        banner: "pond",
        color: "#4bbd85",
        mods: { algaeGreen: 0.05 },
        text: "Each unit of algae is worth more Green Essence.",
    },
    turbulentWaters: {
        name: "Turbulent Waters",
        rarity: "common",
        banner: "pond",
        color: "#35d0d0",
        mods: { stirPower: 0.05 },
        text: "Each click on the water stirs up more turbulence.",
    },
    stillness: {
        name: "Stillness",
        rarity: "common",
        banner: "pond",
        color: "#35d0d0",
        mods: { settleResist: 0.05 },
        text: "Rough water takes longer to settle back to calm.",
    },
    restlessWaters: {
        name: "Restless Waters",
        rarity: "common",
        banner: "pond",
        color: "#35d0d0",
        mods: { turbulenceMax: 0.05 },
        text: "The water can be stirred past what used to be its roughest.",
    },
    shallowFeeding: {
        name: "Shallow Feeding",
        rarity: "common",
        banner: "pond",
        color: "#2f8fb5",
        mods: { calmFish: 0.05 },
        text: "Fish breed faster while the water is calm, below a third of maximum turbulence.",
    },
    rapidSprouting: {
        name: "Rapid Sprouting",
        rarity: "common",
        banner: "grass",
        color: "#5aa84f",
        mods: { grassGrowth: 0.05 },
        text: "Grass moves through its stages faster.",
    },
    lushGrowth: {
        name: "Lush Growth",
        rarity: "common",
        banner: "grass",
        color: "#7fe08f",
        mods: { grassOutput: 0.05 },
        text: "Every grassy tile is worth more Green Essence.",
    },
    spreadingRoots: {
        name: "Spreading Roots",
        rarity: "common",
        banner: "grass",
        color: "#3aa876",
        mods: { growthSpill: 0.05 },
        effect: "5% chance a growth tick also feeds an adjacent grassy tile",
        text: "What one tile grows, its neighbours sometimes grow too.",
    },
    establishedRoots: {
        name: "Established Roots",
        rarity: "common",
        banner: "grass",
        color: "#3aa876",
        mods: { spreadRetain: 0.05 },
        effect: "Grass keeps 5% of its growth after seeding a neighbour",
        text: "Seeding a tile no longer starts the parent from nothing.",
    },
    interwovenRoots: {
        name: "Interwoven Roots",
        rarity: "common",
        banner: "grass",
        color: "#3aa876",
        mods: { adjacencyBonus: 0.05 },
        text: "Each adjacent grassy tile is worth more to a tile's growth.",
    },
    earlyBloom: {
        name: "Early Bloom",
        rarity: "common",
        banner: "grass",
        color: "#5aa84f",
        mods: { matureWait: 0.05 },
        text: "Mature grass waits less before it seeds a neighbour.",
    },
    gatheringClouds: {
        name: "Gathering Clouds",
        rarity: "common",
        banner: "rain",
        color: "#58a8e8",
        mods: { moistureRate: 0.05 },
        text: "Rain wets the ground it falls on faster.",
    },
    prolongedShower: {
        name: "Prolonged Shower",
        rarity: "common",
        banner: "rain",
        color: "#58a8e8",
        mods: { rainDuration: 0.05 },
        text: "Rain lasts longer once it starts.",
    },
    gentleRain: {
        name: "Gentle Rain",
        rarity: "common",
        banner: "rain",
        color: "#58a8e8",
        mods: { rainBoost: 0.05 },
        text: "Rain speeds up the grass under it by more.",
    },
    condensation: {
        name: "Condensation",
        rarity: "common",
        banner: "rain",
        color: "#58a8e8",
        mods: { rainCharge: 0.05 },
        text: "Each click on the cloud gathers more rain.",
    },
    lightDrizzle: {
        name: "Light Drizzle",
        rarity: "common",
        banner: "rain",
        color: "#58a8e8",
        mods: { rainCost: 0.05 },
        text: "Each click on the cloud costs less Blue Essence.",
    },
    soakingRain: {
        name: "Soaking Rain",
        rarity: "common",
        banner: "rain",
        color: "#7fc8ff",
        mods: { rainSoak: 0.05 },
        text: "Rain wets tiles with nothing growing on them faster still.",
    },
    rapidGrowth: {
        name: "Rapid Growth",
        rarity: "uncommon",
        banner: "cores",
        color: "#22b47c",
        mods: { coreGrowth: 0.12 },
        text: "The Green Core's growth meter fills faster.",
    },
    verdantAbundance: {
        name: "Verdant Abundance",
        rarity: "uncommon",
        banner: "cores",
        color: "#22b47c",
        mods: { greenProduction: 0.12 },
        text: "Every stage of the Green Core pays more.",
    },
    acceleratedCharge: {
        name: "Accelerated Charge",
        rarity: "uncommon",
        banner: "cores",
        color: "#2f92ee",
        mods: { chargeRate: 0.12 },
        text: "The Blue Core's charge meter fills faster.",
    },
    powerSurge: {
        name: "Power Surge",
        rarity: "uncommon",
        banner: "cores",
        color: "#2f92ee",
        mods: { fullChargeBonus: 0.12 },
        text: "Only clicks on a completely full meter are worth more.",
    },
    deepReservoir: {
        name: "Deep Reservoir",
        rarity: "uncommon",
        banner: "cores",
        color: "#2f92ee",
        mods: { chargeCapacity: 0.12 },
        text: "The charge meter holds past 100%, and a click spends all of it.",
    },
    efficientPhotosynthesis: {
        name: "Efficient Photosynthesis",
        rarity: "uncommon",
        banner: "cores",
        color: "#08c3aa",
        mods: { conversionRate: 0.12 },
        text: "Green turned into Blue comes out further, multiplied with the conversion itself.",
    },
    maturation: {
        name: "Maturation",
        rarity: "uncommon",
        banner: "cores",
        color: "#22b47c",
        mods: { stageCap: 0.12 },
        text: "The Green Core can reach later stages before it caps out. Always at least one more.",
    },
    strongRoots: {
        name: "Strong Roots",
        rarity: "uncommon",
        banner: "cores",
        color: "#22b47c",
        mods: { growthNeeded: 0.12 },
        text: "Each growth stage needs less growth than it did.",
    },
    deepWaters: {
        name: "Deep Waters",
        rarity: "uncommon",
        banner: "pond",
        color: "#35d0d0",
        mods: { pondCapacity: 0.12 },
        text: "The pond holds more life, algae or fish.",
    },
    violentCurrent: {
        name: "Violent Current",
        rarity: "uncommon",
        banner: "pond",
        color: "#35d0d0",
        mods: { stirPower: 0.12 },
        text: "Each click on the water stirs up more turbulence.",
    },
    abundantLife: {
        name: "Abundant Life",
        rarity: "uncommon",
        banner: "pond",
        color: "#4bbd85",
        mods: { biomassOutput: 0.12 },
        text: "The pond turns what lives in it into more Biomass.",
    },
    lingeringCurrent: {
        name: "Lingering Current",
        rarity: "uncommon",
        banner: "pond",
        color: "#35d0d0",
        mods: { settleResist: 0.12 },
        text: "Rough water takes longer to settle back to calm.",
    },
    strongCurrent: {
        name: "Strong Current",
        rarity: "uncommon",
        banner: "pond",
        color: "#2f8fb5",
        mods: { roughFish: 0.12 },
        text: "Fish breed faster while the water is rough, above two thirds of maximum turbulence.",
    },
    nutrientRich: {
        name: "Nutrient-Rich Waters",
        rarity: "uncommon",
        banner: "pond",
        color: "#4bbd85",
        mods: { calmAlgae: 0.12 },
        text: "Algae grows faster while the water is calm, below a third of maximum turbulence.",
    },
    rapidGermination: {
        name: "Rapid Germination",
        rarity: "uncommon",
        banner: "grass",
        color: "#5aa84f",
        mods: { grassGrowth: 0.12 },
        text: "Grass moves through its stages faster.",
    },
    verdantFields: {
        name: "Verdant Fields",
        rarity: "uncommon",
        banner: "grass",
        color: "#7fe08f",
        mods: { grassOutput: 0.12 },
        text: "Every grassy tile is worth more Green Essence.",
    },
    rootNetwork: {
        name: "Root Network",
        rarity: "uncommon",
        banner: "grass",
        color: "#3aa876",
        mods: { adjacencyBonus: 0.12 },
        text: "Each adjacent grassy tile is worth more to a tile's growth.",
    },
    fullCanopy: {
        name: "Full Canopy",
        rarity: "uncommon",
        banner: "grass",
        color: "#7fe08f",
        mods: { canopyOutput: 0.1 },
        modsFlat: { canopyOutput: 0.15 },
        text: "Pays only while every tile that can hold grass has grass on it.",
    },
    unrestrictedGrowth: {
        name: "Unrestricted Growth",
        rarity: "uncommon",
        banner: "grass",
        color: "#3aa876",
        mods: { growthSpillAny: 0.08 },
        effect: "8% chance a growth tick also feeds any adjacent growing tile",
        text: "Growth spills over whatever is next to it, grass or not.",
    },
    quickMaturation: {
        name: "Quick Maturation",
        rarity: "uncommon",
        banner: "grass",
        color: "#5aa84f",
        mods: { matureWait: 0.12 },
        text: "Mature grass waits less before it seeds a neighbour.",
    },
    heavyClouds: {
        name: "Heavy Clouds",
        rarity: "uncommon",
        banner: "rain",
        color: "#58a8e8",
        mods: { moistureRate: 0.12 },
        text: "Rain wets the ground it falls on faster.",
    },
    prolongedStorm: {
        name: "Prolonged Storm",
        rarity: "uncommon",
        banner: "rain",
        color: "#58a8e8",
        mods: { rainDuration: 0.12 },
        text: "Rain lasts longer once it starts.",
    },
    fertilizingRain: {
        name: "Fertilizing Rain",
        rarity: "uncommon",
        banner: "rain",
        color: "#58a8e8",
        mods: { rainBoost: 0.12 },
        text: "Rain speeds up the grass under it by more.",
    },
    rapidCondensation: {
        name: "Rapid Condensation",
        rarity: "uncommon",
        banner: "rain",
        color: "#58a8e8",
        mods: { rainCharge: 0.12 },
        text: "Each click on the cloud gathers more rain.",
    },
    drivingRain: {
        name: "Driving Rain",
        rarity: "uncommon",
        banner: "rain",
        color: "#7fc8ff",
        mods: { rainSoak: 0.12 },
        text: "Rain wets tiles with nothing growing on them faster.",
    },
    overgrowth: {
        name: "Overgrowth",
        rarity: "rare",
        banner: "cores",
        color: "#22b47c",
        mods: { overgrowth: 0.005 },
        effect: "+.5%/s Green production while left alone, up to +200%",
        text: "What is left alone gets on with it.",
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
        text: "Nothing held under pressure stays where it is.",
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
    floodwater: {
        name: "Floodwater",
        rarity: "rare",
        banner: "pond",
                  // When capacity decreases, the populations are decreased equally.
        color: "#35d0d0",
        mods: { floodwater: 0.35 },
        effect: "The pond's capacity swells and shrinks by 35%",
        text: "The water remembers where it used to reach.",
    },
    deeperDepths: {
        name: "Deeper Depths",
        rarity: "rare",
        banner: "pond",
        color: "#2f8fb5",
        mods: { fishReserve: 0.2 },
        effect: "20% of the pond is out of the algae's reach",
        text: "There is water down there the weed never finds.",
    },
    tidalCycle: {
        name: "Tidal Cycle",
        rarity: "rare",
        banner: "pond",
        color: "#35d0d0",
        mods: { tidalCycle: 1 },
        effect: "Turbulence rises and falls on its own - and can't be stirred",
        text: "The water keeps its own time now.",
    },
    rainwater: {
        name: "Rainwater",
        rarity: "rare",
        banner: "pond",
        color: "#35d0d0",
        mods: { rainwater: 0.25 },
        effect: "+25% pond capacity and a floor under turbulence while it rains",
        text: "Every drop that falls up there ends up down here.",
    },
    cloudBreak: {
        name: "Break in the Clouds",
        rarity: "rare",
        banner: "rain",
        color: "#7fc8ff",
        mods: { cloudBreak: 1 },
        effect: "Rain can be called off early",
        text: "The rain stops when you say it does.",
    },
    monsoon: {
        name: "Monsoon",
        rarity: "rare",
        banner: "rain",
        color: "#7fc8ff",
        mods: { monsoon: 1 },
        effect: "Rain moves itself to the neighbour that needs it most",
        text: "The rain follows the land.",
    },
    rainDance: {
        name: "Rain Dance",
        rarity: "rare",
        banner: "rain",
        color: "#7fc8ff",
        mods: { rainDance: 0.2 },
        effect: "20% chance a tile reaching maturity calls rain down nearby",
        text: "The ecosystem calls for rain.",
    },
    floodPlain: {
        name: "Floodplain",
        rarity: "rare",
        banner: "rain",
        color: "#7fc8ff",
        mods: { floodPlain: 1 },
        effect: "Rain floods tiles straight to Pond instead of Water",
        text: "Rain changes the shape of the land.",
    },
    verdance: { // replace this one. not a huge fan
        name: "Verdance",
        rarity: "rare",
        banner: "grass",
        color: "#7fe08f",
        mods: { grassGrowth: 0.3, grassOutput: 0.3 },
        text: "The whole world greens over at once.",
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
        text: "Some things grow slowly for a reason.",
    },
    seedstorm: {
        name: "Seedstorm",
        rarity: "rare",
        banner: "grass",
        color: "#7fe08f",
        mods: { seedstorm: 0.35 },
        effect: "35% chance starting rain plants a seed under it",
        text: "The wind carries life everywhere.",
    },
    algaeBloom: {
        name: "Algae Bloom",
        rarity: "uncommon",
        banner: "pond",
        locked: true,
        color: "#6fd18a",
        mods: { algaeFullGreen: 0.5 },
        text: "Weed wall to wall, and every inch of it working.",
    },
};

export const cardArt = (id) => CARD_ART[id] || "";
export const bannerArt = (id) => BANNER_ART[id] || "";

// Handling of cards that got removed or changed. If a save has some stuff that
// isn't defined, this deals with it. 
export const knownCard = (id) => !!CARDS[id];

const UNKNOWN_RARITY = { name: "Unknown", weight: 0, color: "#96a0aa" };
export const rarityOf = (id) => knownCard(id) ? RARITIES[CARDS[id].rarity] : UNKNOWN_RARITY;

// Equipping certain cards together gives combo bonuses
// TWO TYPES OF COMBOS PROBABLY:
//    ones that increase synergy of clearly synergizing cards
//    ones that do things based on cards that do not work together
export const COMBOS = [
    { // Deeper depths effect makes minimum fish to 35% instead of 20%
        id: "abyssalDepths",
        name: "Abyssal Depths", 
        cards: ["deepWaters", "deeperDepths"],
        mods: { fishReserve: 0.15 },
        effect: "Deeper Depths holds 35% of the Pond back instead of 20%",
        text: "The fish begin to dive deeper and deeper, into the inky abyss.",
    },
    { // The adjacency bonus from interwoven roots is also applied as a modifier to grass' full-map production bonus
        id: "verdantEmbrace",
        name: "Verdant Embrace", 
        cards: ["interwovenRoots", "fullCanopy"],
        mods: { canopyAdjacency: 1 },
        effect: "Full Canopy is multiplied by the adjacency bonus",
        text: "The world closes in, every root and leaf joining the same living network.",
    },
    { // Moisture buildup has a change to generate a bit of rain charge
        id: "gatheringStorm",
        name: "Gathering Storm", 
        cards: ["gatheringClouds", "condensation"],
        mods: { moistureCharge: 0.5 },
        effect: "Ground soaking up rain gathers rain back",
        text: "The air grows heavy with water, and the clouds begin to feed themselves.",
    },
    { // Rain duration also increases the amount of moisture accumulated by a tile
        id: "endlessDownpour",
        name: "Endless Downpour", 
        cards: ["prolongedStorm", "soakingRain"],
        mods: { soakDuration: 1 },
        effect: "Rain duration also deepens how far the water soaks",
        text: "The rain refuses to stop. The world drinks deeply.",
    },
    { // When a grass tile spreads, the new tile starts with some more growth progress
        id: "burstingGrowth",
        name: "Bursting Growth", 
        cards: ["rapidSprouting", "spreadingRoots"],
        mods: { seedProgress: 0.25 },
        effect: "A newly seeded tile starts 25% grown",
        text: "Roots race outwards as new growth erupts from every direction.",
    },
    { // Clicks past a certain turbulence threshold generate a big boost to blue
        id: "maelstrom",
        name: "Maelstrom", 
        cards: ["turbulentWaters", "violentCurrent"],
        mods: { maelstrom: 3 },
        effect: "Stirring rough water pays 3s of Blue Essence at once",
        text: "The water twists upon itself, churning into a violent spiral.",
    },
    { // Instead of converting charge production over 100% to green boost, it just checks it
        id: "controlledOverflow",
        name: "Controlled Overflow", 
        cards: ["overflow", "pressureValve"],
        mods: { controlledOverflow: 1 },
        effect: "Pressure Valve reads the charge held instead of spending it",
        text: "Nothing is wasted. Even excess energy finds somewhere to go.",
    },
    { // Crossing between turbulence boundaries provides temporary boosts to resources produced in the pond layer
        id: "feedingFrenzy",
        name: "Feeding Frenzy", 
        cards: ["strongCurrent", "nutrientRich"],
        mods: { bandBoost: 0.5 },
        effect: "+50% Pond output for 8s when the water changes state",
        text: "The waters surge with life, and the fish rush to feast.",
    },
    { // Grass grows quicker by a moderate amount
        id: "instantGrove",
        name: "Instant Grove", 
        cards: ["rapidSprouting", "quickMaturation"],
        mods: { grassGrowth: 0.15 },
        effect: "+15% grass growth",
        text: "Growth comes so quickly that the first leaves barely have time to unfurl.",
    },
    { // Rain falling on the pond boosts algae growth
        id: "greenRain",
        name: "Green Rain", 
        cards: ["gatheringClouds", "algaeBloom"],
        mods: { rainAlgae: 0.3 },
        effect: "+30% algae growth while it rains on the world",
        text: "The clouds gather overhead, and the water below erupts into life.",
    },
    { // Rain on a pond temporarily increases pond capacity
        id: "dancingWaters",
        name: "Dancing Waters", 
        cards: ["turbulentWaters", "gentleRain"],
        mods: { rainCapacity: 0.15 },
        effect: "+15% Pond capacity while it rains",
        text: "Rain falls softly upon the restless water, keeping its rhythm alive.",
    },
    { // Mature grass adjacent to a pond increases algae growth slightly, and algae increases the production of those grass tiles
        id: "fertileWaters",
        name: "Fertile Waters", 
        cards: ["lushGrowth", "productiveAlgae"],
        mods: { shoreExchange: 0.25 },
        effect: "Grass on the shore and the algae below it each pay the other 25%",
        text: "The land feeds the water, and the water feeds the land.",
    },
    { // When grass spreads adjacent to a pond, fish growth gets a temporary boost
        id: "livingShore",
        name: "Living Shore", 
        cards: ["spreadingRoots", "healthyFish"],
        mods: { shoreSpawn: 0.5 },
        effect: "Grass spreading onto a shore tile gives +50% fish growth for 10s",
        text: "Life gathers at the water's edge, each strengthening the other.",
    },
	
	// THREE CARD COMBOS
    { // Feeding frenzy combo but also with tides. as such, boosts the bonuses from crossing the boundaries
        id: "tidalFrenzy",
        name: "Tidal Frenzy", 
        cards: ["strongCurrent", "nutrientRich", "tidalCycle"],
        mods: { bandBoost: 1 },
        effect: "+100% Pond output for 8s when the water changes state",
        text: "The waters rise and fall in rhythm, and every turn of the tide brings another brings life into being.",
    },
    { // Connected grass regions get bonus off of total size instead of just adjacency
        id: "greenDominion",
        name: "Green Dominion", 
        cards: ["rapidSprouting", "spreadingRoots", "lushGrowth"],
        mods: { seedProgress: 0.25, regionBonus: 0.04 },
        effect: "Grass grows +4% faster per tile in its connected patch, instead of per neighbour",
        text: "The grass no longer spreads. It conquers.",
    },
    { // Ignores maturity waiting time entirely
        id: "wildfireGrowth",
        name: "Wildfire Growth", 
        cards: ["rapidSprouting", "quickMaturation", "spreadingRoots"],
        mods: { grassGrowth: 0.15, seedProgress: 0.25, noMatureWait: 1 },
        effect: "+15% grass growth, a newly seeded tile starts 25% grown, and mature grass spreads at once",
        text: "One plant becomes two. Two become four. Soon there is nowhere left to grow.",
    },
    { // Fish no longer starve at high fish numbers
        id: "rushingSchool",
        name: "Rushing School", 
        cards: ["turbulentWaters", "strongCurrent", "healthyFish"],
        mods: { noStarvation: 1 },
        effect: "Fish never starve, however many of them there are",
        text: "The fish move as one, carried effortlessly through the restless water.",
    },
];

export const CARD_IDS = Object.keys(CARDS);

const evolutionState = () => getLayerState("evolution");


// Locked cards
// They need some condition to be unlocked, not always drawable.
export const isCardUnlocked = (id, s = evolutionState()) =>
    knownCard(id) && (!CARDS[id].locked || (s.unlockedCards || []).includes(id));

export function unlockCard(id, s = evolutionState()) {
    if (!s.unlockedCards) s.unlockedCards = [];
    if (!s.unlockedCards.includes(id)) s.unlockedCards.push(id);
}

// Everything a draw could currently turn up.
export const drawableCardIds = (s = evolutionState()) => CARD_IDS.filter(id => isCardUnlocked(id, s));

// Drops anything that isn't in the pool anymore. Deals with removed or changed cards.
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

// Runs once per save slot. "cardBonus()" goes through here a few times per tick, so
// the answer only changes on loading a save. Better than recalculating multiple times each tick.
const pruned = new WeakSet();

export function collection(s = evolutionState()) {
    if (!pruned.has(s)) {
        pruned.add(s);
        pruneCards(s);
    }
    return s.cards || {};
}

export const cardEntry = (id, s = evolutionState()) => collection(s)[id] || null;
export const equippedIds = (s = evolutionState()) => (s.equipped || []).filter(id => id && knownCard(id));

// Roman numerals until 10, but past there it would just get cumbersome
const NUMERALS = ["", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
export function cardName(id, level) {
    if (!knownCard(id)) return "Unknown card";
    const suffix = level > 1 ? ` ${NUMERALS[level - 1] || level}` : "";
    return `${CARDS[id].name}${suffix}`;
}

// All the combos on equipped cards.
export const activeCombos = (s = evolutionState()) => {
    const equipped = equippedIds(s);
    return COMBOS.filter(combo =>
        combo.cards.every(id => knownCard(id) && equipped.includes(id)));
};

// Deals with two-card combos being part of a larger combo. Makes it not stack bonuses.
const containedBy = (combo, other) =>
    combo !== other && combo.cards.length < other.cards.length
    && combo.cards.every(id => other.cards.includes(id));

export function effectiveCombos(s = evolutionState()) {
    const active = activeCombos(s);
    return active.filter(combo => !active.some(other => containedBy(combo, other)));
}

// Deals with which combos are being paid vs. folded into another one
export function comboStatus(s = evolutionState()) {
    const active = activeCombos(s);
    return active.map(combo => {
        const inside = active.find(other => containedBy(combo, other));
        return { combo, foldedInto: inside || null };
    });
}

// This is the one thing that other files ask for. Sums up bonus to type for all equipped cards + combos
// mods is what one level is worth, multiplies up with the card at +30% per level
export function cardBonus(key) {
    const s = evolutionState();
    let total = 0;

    for (const id of equippedIds(s)) {
        const card = CARDS[id];
        const entry = cardEntry(id, s);
        if (!card || !entry) continue;
        total += (card.mods?.[key] || 0) * (entry.level-1 + ((entry.level-1) / 3));
        total += card.modsFlat?.[key] || 0;
    }
    for (const combo of effectiveCombos(s)) total += combo.mods?.[key] || 0;

    return total;
}

export const cardActive = (key) => cardBonus(key) > 0;


// What can currently be drawn on a specific banner.
export const bannerCards = (bannerId, s = evolutionState()) =>
    drawableCardIds(s).filter(id => CARDS[id].banner === bannerId);

// Draws 3 cards from the banner's pool. Saves it so if you don't pick, you won't just waste the evo points.
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

// Collecting the chosen card draw. Getting 3 dupes adds 1 to the level of the card you have. 
export function collectCard(id, s = evolutionState()) {
    if (!s.cards) s.cards = {};

    const entry = s.cards[id];
    if (!entry) return (s.cards[id] = { level: 1, copies: 0 });

    entry.copies += 1;
    while (entry.copies >= COPIES_TO_COMBINE) {
        entry.copies -= COPIES_TO_COMBINE;
        entry.level += 1;
    }
    return entry;
}

export function equipCard(id, slot, s = evolutionState()) {
    if (!s.equipped) s.equipped = new Array(SLOTS).fill(null);
    const existing = s.equipped.indexOf(id);
    if (existing !== -1) s.equipped[existing] = null;
    s.equipped[slot] = id;
}

export function unequipSlot(slot, s = evolutionState()) {
    if (s.equipped) s.equipped[slot] = null;
}

export const firstFreeSlot = (s = evolutionState()) =>
    (s.equipped || []).findIndex(id => !id);
