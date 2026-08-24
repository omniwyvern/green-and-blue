// cards.js
//
// Evolution cards. Their information, worth, and which ones are equipped.
// Files ask this for information, so nothing is imported here.
// State lives on the evolution layer:
//  evolution.cards[id] = { level, copies }   The collection
//  evolution.equipped  = [id|null, ...]      Which are equipped
//  evolution.draw      = [id, id, id]|null   Draw choice waiting to be chosen
//  evolution.loadoutLocked = bool            Whether the equipped cards have been locked in
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
// "layer" is the layer the banner draws for: until that layer is open, neither is the banner.
export const BANNERS = {
    cores: {
        name: "The Cores",
        layer: "cores",
        color: "#08c3aa",
        baseCost: 3,
        text: "The two cores themselves, and how quickly they come round.",
    },
    pond: {
        name: "The Pond",
        layer: "pond",
        color: "#2f8fb5",
        baseCost: 5,
        text: "Algae, fish, and everything the water makes of them.",
    },
    rain: {
        name: "The Weather",
        layer: "precipitation",
        color: "#58a8e8",
        baseCost: 8,
        text: "Rain: how long it falls, and what it does to what it falls on.",
    },
    grass: {
        name: "Green Fields",
        layer: "grass",
        color: "#5aa84f",
        baseCost: 12,
        text: "Grass: how fast it grows, and what a tile is worth once it has.",
    },
};

export const BANNER_IDS = Object.keys(BANNERS);

export const CARDS = {
    // ---------- The Cores ----------
    quickGrowth: {
        name: "Quick Growth",
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
        text: "Every click on the Blue Core is worth more, however charged it is.",
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
        text: "The Green Core can reach later stages before it caps out. Always at least one more.",
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

    // ---------- The Pond ----------
    thrivingAlgae: {
        name: "Thriving Algae",
        rarity: "common",
        banner: "pond",
        color: "#4bbd85",
        mods: { algaeGrowth: 0.06 },
        text: "Algae fills the pond faster.",
    },
    healthyFish: {
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
        name: "Deep Waters",
        rarity: "uncommon",
        banner: "pond",
        color: "#35d0d0",
        mods: { pondCapacity: 0.12 },
        text: "The pond holds more life; algae or fish.",
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
        mods: { turbulenceMax: 0.1 },
        text: "The water can be stirred past what used to be its roughest, and everything living in it makes use of the room.",
    },
    strongCurrent: {
        name: "Strong Current",
        rarity: "uncommon",
        banner: "pond",
        color: "#2f8fb5",
        mods: { roughFish: 0.15 },
        text: "Fish breed faster while the water is rough, above two thirds of maximum turbulence.",
    },
    nutrientRich: {
        name: "Nutrient-Rich Waters",
        rarity: "uncommon",
        banner: "pond",
        color: "#4bbd85",
        mods: { calmAlgae: 0.15 },
        text: "Algae grows faster while the water is calm, below a third of maximum turbulence.",
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
        text: "Weed wall to wall, and every inch of it working.",
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
        needs: "precipitation",
        color: "#35d0d0",
        mods: { rainwater: 0.25 },
        effect: "+25% pond capacity and a floor under turbulence while it rains",
        text: "Every drop that falls up there ends up down here.",
    },

    // ---------- The Weather ----------
    condensation: {
        name: "Condensation",
        rarity: "common",
        banner: "rain",
        color: "#58a8e8",
        mods: { rainCharge: 0.06 },
        text: "The cloud draws water in faster while it is gathering.",
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
        color: "#58a8e8",
        mods: { moistureRate: 0.06 },
        text: "Weather leaves more behind in the ground it falls on.",
    },
    prolongedStorm: {
        name: "Prolonged Storm",
        rarity: "uncommon",
        banner: "rain",
        color: "#58a8e8",
        mods: { rainDuration: 0.12 },
        text: "Weather lasts longer once it has been let go.",
    },
    gentleRain: {
        name: "Gentle Rain",
        rarity: "uncommon",
        banner: "rain",
        color: "#58a8e8",
        mods: { rainBoost: 0.15 },
        text: "A cloud is worth more to the tile beneath it, both to what grows there and to what it makes.",
    },
    soakingRain: {
        name: "Soaking Rain",
        rarity: "uncommon",
        banner: "rain",
        color: "#7fc8ff",
        mods: { rainSoak: 0.15 },
        text: "Ground with nothing growing on it takes up water faster still.",
    },
    cloudBreak: {
        name: "Break in the Clouds",
        rarity: "rare",
        banner: "rain",
        color: "#7fc8ff",
        mods: { cloudBreak: 1 },
        effect: "Weather can be called off early",
        text: "The rain stops when you say it does.",
    },
    monsoon: {
        name: "Monsoon",
        rarity: "rare",
        banner: "rain",
        color: "#7fc8ff",
        mods: { monsoon: 1 },
        effect: "Weather moves itself to the neighbour that needs it most",
        text: "The rain follows the land.",
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
        color: "#7fc8ff",
        mods: { saturation: 1 },
        effect: "Flooding a tile leaves Pond instead of Water, and an Ice Field instead of Snow",
        text: "What falls doesn't sit on the land. It becomes it.",
    },

    // ---------- Green Fields ----------
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
        effect: "Grass keeps 6% of its growth after seeding a neighbour",
        text: "Seeding a tile no longer starts the parent from nothing.",
    },
    rootNetwork: {
        name: "Root Network",
        rarity: "common",
        banner: "grass",
        color: "#3aa876",
        mods: { adjacencyBonus: 0.08 },
        text: "Each adjacent grassy tile is worth more to a tile's growth.",
    },
    verdantFields: {
        name: "Verdant Fields",
        rarity: "uncommon",
        banner: "grass",
        color: "#7fe08f",
        mods: { grassOutput: 0.12 },
        text: "Every grassy tile is worth more Green Essence.",
    },
    quickMaturation: {
        name: "Quick Maturation",
        rarity: "uncommon",
        banner: "grass",
        color: "#5aa84f",
        mods: { matureWait: 0.12 },
        text: "Mature grass waits less before it seeds a neighbour.",
    },
    creepingGrowth: {
        name: "Creeping Growth",
        rarity: "uncommon",
        banner: "grass",
        color: "#3aa876",
        mods: { growthSpill: 0.1 },
        effect: "10% chance a growth tick also feeds an adjacent patch of grass",
        text: "What one tile grows, the tile beside it grows too.",
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
    deepDrinkers: {
        name: "Deep Drinkers",
        rarity: "rare",
        banner: "grass",
        color: "#3aa876",
        mods: { dampMastery: 1 },
        effect: "Wet ground never slows grass down, however sodden it gets",
        text: "Roots that reach far enough down don't mind how much came out of the sky.",
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
    { // Moisture buildup has a chance to generate a bit of rain charge
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
        effect: "Weather's duration also deepens how far the water soaks",
        text: "The rain refuses to stop. The world drinks deeply.",
    },
    { // When a grass tile spreads, the new tile starts with some more growth progress
        id: "burstingGrowth",
        name: "Bursting Growth",
        cards: ["rapidSprouting", "establishedRoots"],
        mods: { seedProgress: 0.25 },
        effect: "A newly seeded tile starts 25% grown",
        text: "Roots race outwards as new growth erupts from every direction.",
    },
    { // Clicks past a certain turbulence threshold generate a big boost to blue
        id: "maelstrom",
        name: "Maelstrom",
        cards: ["turbulentWaters", "restlessWaters"],
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
        cards: ["verdantFields", "productiveAlgae"],
        mods: { shoreExchange: 0.25 },
        effect: "Grass on the shore and the algae below it each pay the other 25%",
        text: "The land feeds the water, and the water feeds the land.",
    },
    { // When grass spreads adjacent to a pond, fish growth gets a temporary boost
        id: "livingShore",
        name: "Living Shore",
        cards: ["establishedRoots", "healthyFish"],
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
        cards: ["rapidSprouting", "rootNetwork", "verdantFields"],
        mods: { regionBonus: 0.04 },
        effect: "Grass grows +4% faster per tile in its connected patch, instead of per neighbour",
        text: "The grass no longer spreads. It conquers.",
    },
    { // Ignores maturity waiting time entirely
        id: "wildfireGrowth",
        name: "Wildfire Growth",
        cards: ["rapidSprouting", "quickMaturation", "establishedRoots"],
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
// They need some condition to be unlocked, not always drawable. "needs" is a second layer the
// card reaches into, for one that reads something outside its own banner.
export const isCardUnlocked = (id, s = evolutionState()) => {
    const card = CARDS[id];
    if (!card) return false;
    if (card.locked && !(s.unlockedCards || []).includes(id)) return false;
    return !card.needs || !!getLayerState(card.needs).unlocked;
};

export const unlockedBannerIds = () => BANNER_IDS.filter(bannerUnlocked);

export function unlockCard(id, s = evolutionState()) {
    if (!s.unlockedCards) s.unlockedCards = [];
    if (!s.unlockedCards.includes(id)) s.unlockedCards.push(id);
}

// Locked banners
// A banner is closed until the layer it draws for is open, so cards for a layer that
// doesn't exist yet can't be drawn even if the banner were somehow reached.
export const bannerUnlocked = (id) => {
    const banner = BANNERS[id];
    if (!banner) return false;
    return !banner.layer || !!getLayerState(banner.layer).unlocked;
};

// Everything a draw could currently turn up.
export const drawableCardIds = (s = evolutionState()) =>
    CARD_IDS.filter(id => isCardUnlocked(id, s) && bannerUnlocked(CARDS[id].banner));

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
    if (!loadoutLocked(s)) return 0;
    let total = 0;

    for (const id of equippedIds(s)) {
        const card = CARDS[id];
        const entry = cardEntry(id, s);
        if (!card || !entry) continue;
        total += (card.mods?.[key] || 0) * (entry.level + ((entry.level-1) / 3));
        total += card.modsFlat?.[key] || 0;
    }
    for (const combo of effectiveCombos(s)) total += combo.mods?.[key] || 0;

    return total;
}

export const cardActive = (key) => cardBonus(key) > 0;


// What can currently be drawn on a specific banner.
export const bannerCards = (bannerId, s = evolutionState()) =>
    !bannerUnlocked(bannerId) ? []
        : drawableCardIds(s).filter(id => CARDS[id].banner === bannerId);

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
    if (loadoutLocked(s)) return false;
    if (!s.equipped) s.equipped = new Array(SLOTS).fill(null);
    const existing = s.equipped.indexOf(id);
    if (existing !== -1) s.equipped[existing] = null;
    s.equipped[slot] = id;
}

export function unequipSlot(slot, s = evolutionState()) {
    if (loadoutLocked(s)) return false;
    if (s.equipped) s.equipped[slot] = null;
}

export const firstFreeSlot = (s = evolutionState()) =>
    (s.equipped || []).findIndex(id => !id);


// Cards can be swapped as much as you like, but they are worth nothing until they are locked in
export const loadoutLocked = (s = evolutionState()) => !!s.loadoutLocked;

// Refuses an empty loadout, since that would spend the run's one lock-in on nothing
export function lockLoadout(s = evolutionState()) {
    if (loadoutLocked(s) || equippedIds(s).length === 0) return false;
    s.loadoutLocked = true;
    return true;
}

// Evolving lets you re-lock in cards
export function releaseLoadout(s = evolutionState()) {
    s.loadoutLocked = false;
}
