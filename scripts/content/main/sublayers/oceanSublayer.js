// oceanSublayer.js
//
// Regions joined by currents; each tick fish pay out, move, and grab boosts


import { getLayerState } from "../../../core/state.js";
import { addResource, canAfford, spend, stepNote } from "../../../core/resources.js";
import { resourceDef } from "../../../core/registry.js";
import { registerBoost, boostResource } from "../../../core/boosts.js";
import { D } from "../../../utils/decimal.js";
import { challengeMod } from "../systems/challenges.js";
import { coreNodeBought } from "../../../core/nodes.js";
import { formatNumber, clockText, roman } from "../../../utils/format.js";
import { setText, setDisplay, setWidth, svgEl } from "../../../utils/dom.js";
import { slotGrid, fillUpgrade } from "../../../render/upgradePanel.js";
import { colorResources, costHtml, setRichText, upgradeDescription } from "../../../render/richText.js";
import { cardBonus, cardActive } from "../systems/cards.js";
import { traitBonus, traitHas, PAST_CAP, capOf, pastCapGain, pastCapNote } from "../systems/evolutionTraits.js";
import {
    worldState, largestOceanStretch, adjacentOcean, adjacentLand, soften, contributeTileOutput,
    countOf,
} from "../systems/worldMap.js";
import { regionPath, fishArt, boostIcon, WARNING_ICON, CURRENT_DEFS } from "../art/oceanArt.js";
import { reefAspectBonus, reefOpen, unlockedSpecies } from "../systems/reef.js";
import { openReefBook } from "./reefSublayer.js";
import { clamp01 } from "../../../utils/math.js";


// !!! CONSTANTS !!! kept together up here since ocean keeps needing rebalancing

// A deep ocean still counts as an open ocean, so both feed the layer
const OCEAN_TILE_KINDS = ["ocean", "deep-ocean"];

const MAX_CATCHUP_TICKS = 20;   // A tab left in the background shouldn't run millions of ticks

const REGION_WIDTH = 195;
const REGION_HEIGHT = 165;

const CURRENT_SHIFT_REGIONS = 2;  // Every tick up to one current per this many open regions swings somewhere else
const CURRENT_FADE_MS = 180;      // Matches the transition on .ocean-current-group

const BOOST_KEEP = 0.05;        // Per level, the odds a boost survives being picked up
const MAX_BUFFS = 3;            // How many boosts one school can carry at a time

const PROD_PER_LEVEL = 0.4;     // Each level of a production aspect
const REGION_COST = D(1e11);
const REGION_SCALE = 2.2;
const REGION_EVERYWHERE = 1.075;
const FISH_COST = D(3);
const FISH_SCALE = 1.9;

export const PER_OCEAN_TILE = 0.08;    // What each of those tiles is worth to everything in the water

const OCEAN_SPEED_PER_TILE = 0.06;   // What one more tile in that stretch is worth
const OCEAN_SPEED_CEILING = 1.8;     // Most the clock can ever gain, before the shore takes its cut

const OCEAN_SHORE_COST = 0.12;

const DEEP_BLUE_PER_SPECIES = 6e6;
const DEEP_BIOMASS_PER_SPECIES = 8e3;
const DEEP_OCEAN_NEIGHBOR = 0.35;   // What one ocean against it adds
const DEEP_LAND_KEEP = 0.45;         // What is left of it per piece of land against it


//    !!! OCEAN REGIONS !!!

const REGIONS = {
    // The web you get with your first ocean
    shelf: {
        name: "The Shelf", position: { x: 60, y: -140 }, seed: 1, corners: 6, water: 1,
        flows: ["flats", "point", "stones", "sandbar", "drift"],
    },
    flats: {
        name: "Tidal Flats", position: { x: -90, y: 110 }, seed: 2, corners: 5, water: 0.95,
        flows: ["kelp", "trough", "bank", "point", "shelf"],
    },
    kelp: {
        name: "Kelp Shallows", position: { x: -400, y: -140 }, seed: 4, corners: 7, water: 1.2,
        flows: ["sandbar", "seaweed", "trough", "flats"],
    },
    sandbar: {
        name: "The Sandbar", position: { x: -150, y: -400 }, seed: 5, corners: 5, water: 0.9,
        flows: ["shelf", "kelp"],
    },
    point: {
        name: "Rocky Point", position: { x: 250, y: 120 }, seed: 3, corners: 6, water: 1.05,
        flows: ["bank", "stones", "flats", "shelf"],
    },

    // One more of these for every other ocean past the first
    stones: {
        name: "Stone Garden", position: { x: 420, y: -180 }, seed: 6, corners: 6, water: 1.15,
        flows: ["shelf", "drift", "point"],
    },
    trough: {
        name: "The Trough", position: { x: -330, y: 330 }, seed: 7, corners: 7, water: 1.3,
        flows: ["seaweed", "bank", "kelp", "flats"],
    },
    seaweed: {
        name: "Seaweed Forests", position: { x: -560, y: 100 }, seed: 8, corners: 6, water: 1.25,
        flows: ["kelp", "trough", "flats"],
    },
    bank: {
        name: "Bright Bank", position: { x: 130, y: 360 }, seed: 9, corners: 5, water: 1.1,
        flows: ["trough", "point", "flats"],
    },
    drift: {
        name: "Drift Weed", position: { x: 430, y: -450 }, seed: 10, corners: 7, water: 1.35,
        flows: ["shelf", "stones"],
    },
};

const REGION_IDS = Object.keys(REGIONS);

// There are no region tiles until you have your first ocean. After that, +1 tile per 2 oceans
const regionsFromTiles = () => {
    const tiles = countOf(OCEAN_TILE_KINDS);
    return tiles <= 0 ? 0 : 5 + Math.floor(tiles / 2) - 1;
};

const grantedRegions = (s) => Math.max(0, Number(s.oceanOpenRegions) || 0);

// Which regions are active. It's a count rather than list, so it's always in the order above
export const openRegionCount = (s) =>
    Math.min(REGION_IDS.length, regionsFromTiles() + grantedRegions(s));

// No ocean on the map means no ocean here. Everything else falls out of this
export const oceanIsDry = (s) => openRegionCount(s) === 0;

export const openRegionIds = (s) => REGION_IDS.slice(0, openRegionCount(s));
const regionOpen = (s, id) => REGION_IDS.indexOf(id) < openRegionCount(s);

// Opens the next region or several, returning the ones opened in order
export function openOceanRegions(amount = 1) {
    const s = getLayerState("aquatic");
    const before = openRegionCount(s);
    s.oceanOpenRegions = Math.min(REGION_IDS.length, grantedRegions(s) + Math.max(0, amount));
    return REGION_IDS.slice(before, openRegionCount(s));
}

for (const id of REGION_IDS) {
    for (const target of REGIONS[id].flows) {
        if (!REGIONS[target]) throw new Error(`Region "${id}" flows into unknown region "${target}".`);
        if (target === id) throw new Error(`Region "${id}" flows into itself.`);
    }
}

// Where the currents default to when you first unlock stuff
function defaultFlow(s, id) {
    return REGIONS[id].flows.find(target => regionOpen(s, target)) || id;
}


// !!!! CHANGE THESE NAMES !!!!
const REGION_UPGRADES = {
    deepen: {
        title: "Deepen",
        max: 20,
        description: (level, max) => upgradeDescription(
            `Everything a school produces here is boosted by ${Math.round(25 * Math.min(20, level))}%.`,
            stepNote(level, 20, "+25%")) + pastCapNote("deepen", level),
        effect: (level) => (1 + 0.25 * Math.min(20, level)) * pastCapGain("deepen", level),
    },
    bed: {
        title: "Nutrient Bed",
        max: 15,
        description: (level, max) => upgradeDescription(
            `Biomass produced here is boosted by a further ${Math.round(40 * Math.min(15, level))}%.`,
            stepNote(level, 15, "+40%")) + pastCapNote("bed", level),
        effect: (level) => (1 + 0.40 * Math.min(15, level)) * pastCapGain("bed", level),
    },
    longer: {
        title: "Lasting Boosts",
        max: 2,
        description: (level, max) => upgradeDescription(
            `Boosts picked up here last ${level} more ocean tick${level === 1 ? "" : "s"}.`,
            stepNote(level, max, "+1")),
        effect: (level) => level,
    },
    sticky: {
        title: "Leftover Boosts",
        max: 10,
        description: (level, max) => upgradeDescription(
            `A boost taken from here has a ${Math.round(100 * BOOST_KEEP * level)}% chance of staying behind for the next school.`,
            stepNote(level, max, `+${Math.round(100 * BOOST_KEEP)}%`)),
        effect: (level) => BOOST_KEEP * level,
    },
};

const REGION_UPGRADE_IDS = Object.keys(REGION_UPGRADES);


//    !!! BOOSTS !!!

// Boosts stay on a region until a school swims through, where they're picked up
const BOOSTS = {
    upwelling: { name: "Upwelling", ticks: 3, output: 0.3,
        text: "+30% to everything the school produces." },
    bloom: { name: "Plankton Bloom", ticks: 2, biomass: 1,
        text: "Doubles the Biomass the school produces." },
    glint: { name: "Sunlit Water", ticks: 3, essence: 0.6,
        text: "+60% to the essence the school produces." },
    riptide: { name: "Riptide", ticks: 2, extraStep: true,  // NEED TO MAKE THIS ONE BETTER ANIMATION
        text: "The school is carried one more region on each tick." },
    spawn: { name: "Spawning Urge", ticks: 2, output: 0.15, adaptation: 0.5,
        text: "+15% output, and 50% more to the school's Adaptation bonus." },
};

const BOOST_IDS = Object.keys(BOOSTS);


//    !!! SPECIES AND THEIR ASPECTS !!!

// Fish are only ever drawn in by another layer calling drawInSchool(), not anything in this sublayer
export const SPECIES = {
    cod: {
        name: "Cod",
        color: "#8fb6c8",
        home: "shelf",
        blurb: "big ol fish yay! make a description here.",
        aspects: {
            muscle: { kind: "production", resource: "blueEssence", title: "Cold Muscle",
                base: D(6e7), max: 25 },
            roe: { kind: "production", resource: "biomass", title: "Heavy Roe",
                base: D(5e4), max: 25 },
            deepRoe: { kind: "boost", resource: "adaptationPoints", title: "Adaptive Bodies",
                max: 10, step: "+0.15x per level",
                description: (level) => `Every Adaptation Point you earn is multiplied by ${(1 + 0.15 * level).toFixed(2)}.`,
                effect: (level) => 1 + 0.15 * level },
            opportunist: { kind: "trait", title: "Opportunist", max: 10, step: "+5% per level",
                spill: { from: "blueEssence", into: "greenEssence" },
                headline: (level) => `${Math.round(100 * (0.1 + 0.05 * level))}% Blue as Green per boost`,
                description: (level) => `Makes Green Essence worth ${Math.round(100 * (0.1 + 0.05 * level))}% of the school's Blue Essence, for every active boost.`,
                effect: (level, school) => activeBoosts(school).length * (0.1 + 0.05 * level) },
        },
    },

    herring: {
        name: "Herring",
        color: "#b9c9d8",
        home: "kelp",
        blurb: "small ol fish yay! make a description here",
        aspects: {
            run: { kind: "production", resource: "blueEssence", title: "Silver Flanks",
                base: D(3.4e7), max: 25 },
            shoalRoe: { kind: "production", resource: "biomass", title: "Dense Shoal",
                base: D(8.5e4), max: 25 },
            silverRun: { kind: "boost", resource: "blueEssence", title: "Silver Run", max: 10,
                step: "+12% per level",
                description: (level) => `All Blue Essence, wherever it is made, is boosted by ${Math.round(12 * level)}%.`,
                effect: (level) => 1 + 0.12 * level },
            shoaling: { kind: "trait", title: "Shoaling", max: 10, step: "+8% per level",
                headline: (level) => `+${Math.round(100 * (0.12 + 0.08 * level))}% per neighbor`,
                description: (level) => `Produces ${Math.round(100 * (0.12 + 0.08 * level))}% more for every school in the regions its own region joins on to.`,
                effect: (level, school, s) => 1 + schoolsNextDoor(s, school) * (0.12 + 0.08 * level) },
        },
    },

    mackerel: {
        name: "Mackerel",
        color: "#6f93a8",
        home: "sandbar",
        blurb: "medium ol fish yay! make a description here",
        aspects: {
            streak: { kind: "production", resource: "blueEssence", title: "Constant Motion",
                base: D(9e7), max: 25 },
            graze: { kind: "production", resource: "greenEssence", title: "Surface Feeding",
                base: D(4.5e7), max: 25 },
            baitBall: { kind: "boost", resource: "biomass", title: "Teeming Water", max: 10,
                step: "+15% per level",
                description: (level) => `All Biomass, wherever it is made, is boosted by ${Math.round(15 * level)}%.`,
                effect: (level) => 1 + 0.15 * level },
            slipstream: { kind: "trait", title: "Slipstream", max: 10, step: "+3% per level",
                headline: (level) => `+${Math.round(100 * (0.05 + 0.03 * level))}% per Deepen`,
                description: (level) => `Produces ${Math.round(100 * (0.05 + 0.03 * level))}% more per level of Deepen on the region it is in.`,
                effect: (level, school, s) => 1 + regionLevel(s, school.at, "deepen") * (0.05 + 0.03 * level) },
        },
    },
};

const SPECIES_IDS = Object.keys(SPECIES);
const aspectIds = (speciesId) => Object.keys(SPECIES[speciesId].aspects);

// Four per species so the fish window is the same shape whichever fish it's showing
const ASPECTS = 4;
for (const id of SPECIES_IDS) {
    if (aspectIds(id).length !== ASPECTS) {
        throw new Error(`Species "${id}" declares ${aspectIds(id).length} aspects, and needs exactly ${ASPECTS}.`);
    }
    for (const [aspectId, aspect] of Object.entries(SPECIES[id].aspects)) {
        // Traits are more specific than numerical, so it has to say for itself what its card reads
        if (aspect.kind === "trait" && !aspect.headline) {
            throw new Error(`Trait "${id}.${aspectId}" needs a headline for its skill card.`);
        }
    }
}


//    !!! OCEAN STATE !!!

export const OCEAN_INITIAL_STATE = {
    oceanClock: 0,
    oceanTicks: 0,
    oceanOpenRegions: 0,  // Anything handing regions over on top of the map's ocean tiles
    oceanRegions: {},     // regionId: { flowTo, boost, upgrades }
    oceanSchools: {},     // speciesId: { at, upgrades, buffs }
    oceanSelection: null, // { kind: "region" | "school", id }
};

function regionState(s, id) {
    if (!s.oceanRegions) s.oceanRegions = {};
    let region = s.oceanRegions[id];
    if (!region) region = s.oceanRegions[id] = { flowTo: null, boost: null, upgrades: {} };
    if (!region.upgrades) region.upgrades = {};
    if (region.boost && !BOOSTS[region.boost]) region.boost = null;
    return region;
}

// Where a region's water goes. Every region always has exactly one current running out of it
function flowTarget(s, id) {
    const set = regionState(s, id).flowTo;
    return set && set !== id && regionOpen(s, set) ? set : defaultFlow(s, id);
}

// The places this region is allowed to send its water, minus the ones not open yet
const currentOptions = (s, id) => {
    const open = REGIONS[id].flows.filter(other => regionOpen(s, other));
    return open.length ? open : [defaultFlow(s, id)];
};

const regionLevel = (s, id, upgradeId) => Number(regionState(s, id).upgrades[upgradeId]) || 0;

function regionLevelsBought(s) {
    let total = 0;
    for (const region of Object.values(s.oceanRegions || {})) {
        for (const upgradeId of REGION_UPGRADE_IDS) total += Number((region.upgrades || {})[upgradeId]) || 0;
    }
    return total;
}

function schoolState(s, id) {
    if (!s.oceanSchools) s.oceanSchools = {};
    let school = s.oceanSchools[id];
    if (!school) {
        school = s.oceanSchools[id] = { at: SPECIES[id].home, upgrades: {}, buffs: {} };
    }
    if (!REGIONS[school.at] || !regionOpen(s, school.at)) {
        const home = SPECIES[id].home;
        school.at = regionOpen(s, home) ? home : openRegionIds(s)[0] || home;
    }
    if (!school.upgrades) school.upgrades = {};
    if (!school.buffs) school.buffs = {};
    school.id = id;
    return school;
}

const schoolUnlocked = (s, id) => !oceanIsDry(s)
    && (id === "cod" || !!(s.oceanSchools || {})[id]);

export const unlockedSchools = (s) => oceanIsDry(s) ? []
    : SPECIES_IDS.filter(id => schoolUnlocked(s, id)).map(id => schoolState(s, id));

const schoolsAt = (s, regionId) => unlockedSchools(s).filter(school => school.at === regionId);

// Every school one region away
function schoolsNextDoor(s, school) {
    const here = school.at;
    const near = new Set(REGIONS[here].flows.filter(id => regionOpen(s, id)));
    for (const id of openRegionIds(s)) if (REGIONS[id].flows.includes(here)) near.add(id);
    near.delete(here);
    return unlockedSchools(s).filter(other => near.has(other.at)).length;
}

// Called from wherever a species is earned
export function drawInSchool(s, id) {
    if (schoolUnlocked(s, id) || !SPECIES[id]) return false;

    const taken = unlockedSchools(s).map(school => school.at);
    const free = openRegionIds(s).filter(regionId => !taken.includes(regionId));
    if (!free.length) return false;

    const home = SPECIES[id].home;
    schoolState(s, id).at = free.includes(home) ? home : free[0];
    return true;
}


//    !!! ASPECT LEVELS AND EFFECTS !!!

const aspectLevel = (school, aspectId) => Math.max(1, Number(school.upgrades[aspectId]) || 1);

// The reef can increase the level cap for aspects
const aspectCeiling = (aspect) => aspect.max + reefAspectBonus();

const activeBoosts = (school) => BOOST_IDS.filter(id => (school.buffs || {})[id] > 0);

// Boosts stack additively within a kind, the way card bonuses do
function boostBonus(school, key) {
    let total = 0;
    for (const id of activeBoosts(school)) total += BOOSTS[id][key] || 0;
    return total;
}

// The one trait a species carries, and what it is worth right now
function traitEffect(s, school) {
    const species = SPECIES[school.id];
    const id = aspectIds(school.id).find(key => species.aspects[key].kind === "trait");
    const trait = id ? species.aspects[id] : null;
    return trait ? { trait, value: trait.effect(aspectLevel(school, id), school, s) } : null;
}

// Most traits scale everything the school makes. A spilling one doesn't, so it stays out of here
const traitMultiplier = (s, school) => {
    const found = traitEffect(s, school);
    return found && !found.trait.spill ? found.value : 1;
};

// A spilling trait turns a share of one resource into another, so it reads the finished numbers
function traitSpill(s, school) {
    const found = traitEffect(s, school);
    if (!found || !found.trait.spill || !(found.value > 0)) return null;
    return { ...found.trait.spill, share: found.value };
}

// Boosts a school carries, split by what they apply to
function boostMultiplier(school, resourceId) {
    const isEssence = resourceId !== "biomass";
    return 1 + boostBonus(school, "output")
        + (isEssence ? boostBonus(school, "essence") : boostBonus(school, "biomass"));
}

function schoolBoost(resourceId) {
    const s = getLayerState("aquatic");
    if (!s.unlocked) return 1;

    let total = D(1);
    for (const school of unlockedSchools(s)) {
        for (const aspectId of aspectIds(school.id)) {
            const aspect = SPECIES[school.id].aspects[aspectId];
            if (aspect.kind !== "boost" || aspect.resource !== resourceId) continue;

            const bonus = aspect.effect(aspectLevel(school, aspectId));
            total = total.mul(1 + (bonus - 1) * (1 + boostBonus(school, "adaptation")));
        }
    }
    return total;
}

registerBoost("Schools", schoolBoost);


//    !!! THE CLOCK !!!

// How much faster the clock runs for the biggest stretch of ocean on the world map, less what its shore costs
export function oceanSpreadSpeed(world = worldState()) {
    const { size, shore } = largestOceanStretch(world);
    if (size <= 1) return 1;
    const raw = soften(OCEAN_SPEED_PER_TILE * (size - 1), OCEAN_SPEED_CEILING);
    return 1 + raw / (1 + OCEAN_SHORE_COST * (shore / size));
}

const tickSeconds = () =>
    (60 / ((1 + cardBonus("oceanTickSpeed")) * (1 + traitBonus("oceanTickSpeed")) * challengeMod("oceanTick") * oceanSpreadSpeed()
        * (coreNodeBought("oceanWarmCurrents") ? 1.08 : 1)))
    * (cardActive("slackWater") ? 2 : 1);


//    !!! COSTS !!!

// What one level of a region upgrade costs next, and the same for a fish aspect
const PAST_CAP_COST = D(1e44);
const PAST_CAP_SCALE = 10;

export const regionUpgradeMax = (upgradeId) => PAST_CAP[upgradeId] ? capOf(upgradeId) : REGION_UPGRADES[upgradeId].max;

export const regionUpgradeCost = (s, level, upgradeId) => PAST_CAP[upgradeId] && level >= PAST_CAP[upgradeId].cap
    ? { blueEssence: PAST_CAP_COST.mul(D(PAST_CAP_SCALE).pow(level - PAST_CAP[upgradeId].cap)) }
    : {
        blueEssence: REGION_COST
            .mul(D(REGION_SCALE).pow(level))
            .mul(D(REGION_EVERYWHERE).pow(regionLevelsBought(s))),
    };
const aspectUpgradeCost = (level) => ({ adaptationPoints: FISH_COST.mul(D(FISH_SCALE).pow(level - 1)).div(1 + cardBonus("learnedShoals")).ceil() });


//    !!! WHAT THE OCEAN MAKES !!!

// Every ocean tile claimed on the world map makes the whole ocean worth more
const oceanTileShare = () => 1 + PER_OCEAN_TILE * countOf(OCEAN_TILE_KINDS);


// How many kinds of fish are actually swimming. A deep ocean is worth nothing without them
export function fishSpecies(s = getLayerState("aquatic")) {
    return s.unlocked ? unlockedSchools(s).length : 0;
}

export const deepOceanShare = (world, id) =>
    (1 + DEEP_OCEAN_NEIGHBOR * adjacentOcean(world, id))
    * Math.pow(DEEP_LAND_KEEP, adjacentLand(world, id));

// One deep ocean tile per second, as { blueEssence, biomass }
export function deepOceanOutput(world, id) {
    const species = fishSpecies();
    if (species <= 0) return {};
    const share = species * deepOceanShare(world, id);
    const open = challengeMod("oceanOutput") * (1 + traitBonus("deepOcean"));
    return {
        blueEssence: D(DEEP_BLUE_PER_SPECIES).mul(share).mul(open),
        biomass: D(DEEP_BIOMASS_PER_SPECIES).mul(share).mul(open),
    };
}

contributeTileOutput("deep-ocean", deepOceanOutput);

// One school's payout on the next tick, as { resourceId: Decimal }
export function schoolProduction(s, school) {
    const species = SPECIES[school.id];
    const region = regionState(s, school.at);
    const trait = traitMultiplier(s, school);
    const cardShare = (1 + cardBonus("oceanOutput")) * (1 + traitBonus("oceanOutput")) * (coreNodeBought("oceanRichShallows") ? 1.25 : 1)
        * (1 + traitBonus("shoalKin") * schoolsNextDoor(s, school) + traitBonus("boostHeld") * activeBoosts(school).length);
    const out = {};

    for (const aspectId of aspectIds(school.id)) {
        const aspect = species.aspects[aspectId];
        if (aspect.kind !== "production") continue;

        const level = aspectLevel(school, aspectId);
        let amount = aspect.base.mul(1 + PROD_PER_LEVEL * (level - 1))
            .mul(REGIONS[school.at].water)
            .mul(REGION_UPGRADES.deepen.effect(Number(region.upgrades.deepen) || 0))
            .mul(trait)
            .mul(boostMultiplier(school, aspect.resource))
            .mul(cardShare)
            .mul(oceanTileShare())
            .mul(challengeMod("oceanOutput"))
            .mul(boostResource(aspect.resource));

        if (aspect.resource === "biomass") {
            amount = amount.mul(REGION_UPGRADES.bed.effect(Number(region.upgrades.bed) || 0));
        }
        out[aspect.resource] = D(out[aspect.resource] || 0).add(amount);
    }

    // Spilling comes last, so what it takes its share of is the finished number
    const spill = traitSpill(s, school);
    // A challenge scaling one resource and not the other shouldn't leak through the spill
    if (spill && out[spill.from] && challengeMod(spill.from) > 0) {
        const rescale = challengeMod(spill.into) / challengeMod(spill.from);
        out[spill.into] = D(out[spill.into] || 0).add(out[spill.from].mul(spill.share).mul(rescale));
    }
    return out;
}

const addInto = (total, part) => {
    for (const id in part) total[id] = D(total[id] || 0).add(part[id]);
    return total;
};

// Everything the next tick will hand over
export function tickProduction(s) {
    const total = {};
    for (const school of unlockedSchools(s)) addInto(total, schoolProduction(s, school));
    return total;
}


//    !!! THE TICK !!!

// Schools can't share a region, so moves are resolved in passes
export function planMovement(s) {
    const schools = unlockedSchools(s);
    const at = new Map(schools.map(school => [school.id, school.at]));
    const left = new Map(schools.map(school =>
        [school.id, 1 + (cardActive("undertow") ? 1 : 0) + (activeBoosts(school).some(id => BOOSTS[id].extraStep) ? 1 : 0)]));
    const paths = new Map(schools.map(school => [school.id, []]));
    const standing = new Map(schools.map(school => [school.at, school.id]));

    const targetOf = (school) => flowTarget(s, at.get(school.id));
    const schoolById = (id) => schools.find(school => school.id === id);

    const step = (school, to) => {
        at.set(school.id, to);
        paths.get(school.id).push(to);
        left.set(school.id, left.get(school.id) - 1);
    };

    // A ring of schools waiting on each other all rotate together instead of deadlocking
    const rotateRing = () => {
        for (const school of schools) {
            if (left.get(school.id) <= 0) continue;

            const chain = [];
            const place = new Map();
            for (let current = school; current && left.get(current.id) > 0; ) {
                if (place.has(current.id)) {
                    const ring = chain.slice(place.get(current.id));
                    const moves = ring.map(member => [member, targetOf(member)]);
                    for (const [member] of moves) standing.delete(at.get(member.id));
                    for (const [member, to] of moves) {
                        standing.set(to, member.id);
                        step(member, to);
                    }
                    return true;
                }
                place.set(current.id, chain.length);
                chain.push(current);

                const to = targetOf(current);
                if (!to || !standing.has(to)) break;
                current = schoolById(standing.get(to));
            }
        }
        return false;
    };

    for (let moving = true; moving; ) {
        moving = false;
        for (const school of schools) {
            if (left.get(school.id) <= 0) continue;

            const to = targetOf(school);
            if (!to) { // Stopped current, so this one isn't going anywhere
                left.set(school.id, 0);
                continue;
            }
            if (standing.has(to)) continue;

            standing.delete(at.get(school.id));
            standing.set(to, school.id);
            step(school, to);
            moving = true;
        }
        if (!moving) moving = rotateRing();
    }

    // Keyed by the region two schools both wanted; who gets there, and who is left behind
    const contested = new Map();
    for (const school of schools) {
        if (left.get(school.id) <= 0) continue;
        const wanted = targetOf(school);
        if (!wanted) continue;
        if (!contested.has(wanted)) contested.set(wanted, { arriving: standing.get(wanted) || null, blocked: [] });
        contested.get(wanted).blocked.push(school.id);
    }
    return { paths, contested };
}

const maxBuffs = () => MAX_BUFFS + traitBonus("boostSlots");

// Picking up whatever was drifting on a region, once a school has actually landed on it
function takeBoost(s, school, regionId) {
    const region = regionState(s, regionId);
    if (!region.boost) return;

    // A school with max boosts leaves the boost where it is rather than wasting it
    const held = school.buffs[region.boost] || 0;
    if (!held && activeBoosts(school).length >= maxBuffs()) return;

    school.buffs[region.boost] = Math.max(held, BOOSTS[region.boost].ticks + regionLevel(s, regionId, "longer"));
    // Sticky Boosts. The school is buffed either way, the drifting boost just might not be spent doing it
    if (Math.random() >= REGION_UPGRADES.sticky.effect(regionLevel(s, regionId, "sticky")) + traitBonus("boostKeep")) region.boost = null;

    // Blood in the Water. Part of what they caught gets paid out straight away
    const payoff = cardBonus("pickupPayout");
    if (payoff > 0) {
        const gains = schoolProduction(s, school);
        for (const resourceId in gains) addResource(resourceId, gains[resourceId].mul(payoff));
    }
}

// Fewer new boosts turn up while the map is still covered in them
function spawnBoosts(s) {
    const inPlay = openRegionIds(s);
    const open = inPlay.filter(id => !regionState(s, id).boost);
    const left = inPlay.length - open.length;
    // Slack Water forgets the rationing and hands a boost to every region left empty
    let wanted = cardActive("slackWater") ? open.length : Math.min(open.length,
        Math.ceil(inPlay.length / (3 / (1 + cardBonus("boostSpawn")))) - left);

    while (wanted-- > 0) {
        const id = open.splice(Math.floor(Math.random() * open.length), 1)[0];
        regionState(s, id).boost = BOOST_IDS[Math.floor(Math.random() * BOOST_IDS.length)];
    }
}

// Somewhere new for a current to swing to, never one flowing straight back, since the two would cancel out
const swingOptions = (s, id) => {
    const running = flowTarget(s, id);
    return currentOptions(s, id).filter(target => target !== running && flowTarget(s, target) !== id);
};

// After moving, 1 to (open regions / 2) currents swing, only ever in regions with somewhere else to go
function shiftCurrents(s) {
    const movable = openRegionIds(s);
    const most = Math.max(1, Math.floor(openRegionCount(s) / CURRENT_SHIFT_REGIONS));
    let count = 1 + Math.floor(Math.random() * most);

    while (count > 0 && movable.length) {
        const id = movable.splice(Math.floor(Math.random() * movable.length), 1)[0];
        const others = swingOptions(s, id);
        if (!others.length) continue;
        regionState(s, id).flowTo = others[Math.floor(Math.random() * others.length)];
        count--;
    }
}

const DEEP_TICK = 4;

function oceanTick(s) {
    s.oceanTicks = (s.oceanTicks || 0) + 1;

    // Tireless Swimmers. Every fourth tick pays twice and leaves the boosts alone
    const deep = traitHas("tirelessSwimmers") && s.oceanTicks % DEEP_TICK === 0;
    const gains = tickProduction(s);
    for (const resourceId in gains) addResource(resourceId, deep ? gains[resourceId].mul(2) : gains[resourceId]);

    for (const school of deep ? [] : unlockedSchools(s)) {
        for (const id of activeBoosts(school)) {
            school.buffs[id] -= 1;
            if (school.buffs[id] <= 0) delete school.buffs[id];
        }
    }

    // Step by step across every school, so one school going twice doesn't sweep up the boosts ahead of the rest
    const { paths } = planMovement(s);
    const longest = Math.max(0, ...[...paths.values()].map(path => path.length));
    for (let i = 0; i < longest; i++) {
        for (const school of unlockedSchools(s)) {
            const regionId = (paths.get(school.id) || [])[i];
            if (!regionId) continue;
            school.at = regionId;
            takeBoost(s, school, regionId);
        }
    }

    // Leviathan
    if (traitHas("leviathan")) {
        for (const school of unlockedSchools(s)) {
            if (activeBoosts(school).length) continue;
            const id = BOOST_IDS[Math.floor(Math.random() * BOOST_IDS.length)];
            school.buffs[id] = BOOSTS[id].ticks;
        }
    }

    shiftCurrents(s);
    spawnBoosts(s);
}

export function tickOcean(dt, layer) {
    const s = getLayerState(layer.id);
    s.oceanClock = (s.oceanClock || 0) + dt;

    const length = tickSeconds();
    let ticks = 0;
    while (s.oceanClock >= length && ticks++ < MAX_CATCHUP_TICKS) {
        s.oceanClock -= length;
        oceanTick(s);
    }
    if (ticks >= MAX_CATCHUP_TICKS) s.oceanClock = 0;
}

// 0 to 1 toward the next tick; null when there's no ocean to tick
export const oceanTickProgress = (s) =>
    oceanIsDry(s) ? null : clamp01((s.oceanClock || 0) / tickSeconds());


//    !!! SELECTION AND CURRENTS !!!

const selectionOf = (s) => (s.oceanSelection && s.oceanSelection.kind) ? s.oceanSelection : null;
const selectedOf = (s, kind) => { const at = selectionOf(s); return at && at.kind === kind ? at.id : null; };
const selectedRegion = (s) => selectedOf(s, "region");
const selectedSchool = (s) => selectedOf(s, "school");

let picking = null;

const isPicking = (id) => picking === id;
const stopPicking = () => { picking = null; };

const select = (s, kind, id) => {
    stopPicking();
    s.oceanSelection = kind ? { kind, id } : null;
};

// Picked from somewhere else; the panel moves the camera onto it next time it's drawn
let focusing = null;

export function focusSchool(id) {
    select(getLayerState("aquatic"), "school", id);
    focusing = id;
}

// Clicking a region alternates between its page and the school's page
function clickRegion(s, id) {
    const here = schoolsAt(s, id);
    if (selectedRegion(s) === id && here.length) {
        select(s, "school", here[0].id);
        return;
    }
    select(s, "region", id);
}

// While picking a path, clicking the end region counts, since it's a bigger target than the line
function pickedTarget(s, id) {
    if (!picking || !currentOptions(s, picking).includes(id)) return false;
    setCurrent(s, picking, id);
    return true;
}

// Points a region's current at one of the places it's allowed to reach
function setCurrent(s, id, target) {
    if (!currentOptions(s, id).includes(target)) return;
    regionState(s, id).flowTo = target;
    stopPicking();
}


//    !!! THE MAP !!!

const regionCenter = (id) => REGIONS[id].position;

// A current runs between the edges of two shapes, so it needs to pull back a bit at both ends
function currentShape(fromId, toId) {
    const from = regionCenter(fromId);
    const to = regionCenter(toId);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length;
    const uy = dy / length;

    const clear = REGION_WIDTH * 0.42;
    const startX = from.x + ux * clear;
    const startY = from.y + uy * clear;
    const endX = to.x - ux * (clear + 30);
    const endY = to.y - uy * (clear + 30);

    const bend = length * 0.12;
    const bendX = (startX + endX) / 2 - uy * bend;
    const bendY = (startY + endY) / 2 + ux * bend;
    return {
        d: `M${startX.toFixed(1)} ${startY.toFixed(1)} Q${bendX.toFixed(1)} ${bendY.toFixed(1)}`
            + ` ${endX.toFixed(1)} ${endY.toFixed(1)}`,
        // I LOVE FUNNY MATH!!!! halfway along the curve, not halfway before it ends
        mid: { x: (startX + 2 * bendX + endX) / 4, y: (startY + 2 * bendY + endY) / 4 },
    };
}

// A changed current fades out at the old spot and in at the new one
function swapCurrent(group, line, d, fadeOut) {
    clearTimeout(group.__fade);
    const fadeIn = () => {
        line.setAttribute("d", d);
        group.classList.remove("current-out");
    };
    if (fadeOut) {
        group.classList.add("current-out");
        group.__fade = setTimeout(fadeIn, CURRENT_FADE_MS);
        return;
    }
    group.classList.add("current-out", "current-snap");
    group.getBoundingClientRect(); // Makes the browser take in the clear state before fading from it
    group.classList.remove("current-snap");
    fadeIn();
}

const SCENE_MARGIN = 260;

function buildCurrent(svg) {
    const group = svgEl("g", { class: "ocean-current-group" });
    const line = svgEl("path", { class: "ocean-current", "marker-end": "url(#current-head)" });

    group.appendChild(line);
    svg.appendChild(group);
    return { group, line };
}


const MOST_FLOWS = Math.max(...REGION_IDS.map(id => REGIONS[id].flows.length));

function buildPicks(svg, layer) {
    const picks = [];
    for (let i = 0; i < MOST_FLOWS; i++) {
        const group = svgEl("g", { class: "ocean-pick-group" });
        const hit = svgEl("path", { class: "ocean-current-hit scene-hit" });
        const line = svgEl("path", { class: "ocean-pick", "marker-end": "url(#current-head)" });

        group.append(hit, line);
        svg.appendChild(group);

        hit.addEventListener("click", () => {
            const s = getLayerState(layer.stateKey);
            if (!picking || !group.dataset.target) return;
            setCurrent(s, picking, group.dataset.target);
        });
        picks.push({ group, line, hit });
    }
    return picks;
}

function buildRegion(el, id, canvas, layer) {
    const def = REGIONS[id];
    const region = document.createElement("div");
    region.className = "ocean-region scene-hit";
    region.dataset.region = id;
    region.style.width = `${REGION_WIDTH}px`;
    region.style.height = `${REGION_HEIGHT}px`;
    region.style.left = `${def.position.x - REGION_WIDTH / 2}px`;
    region.style.top = `${def.position.y - REGION_HEIGHT / 2}px`;
    region.innerHTML = `
        <svg class="region-shape" viewBox="0 0 ${REGION_WIDTH} ${REGION_HEIGHT}" aria-hidden="true">
            <path d="${regionPath(def.seed, REGION_WIDTH, REGION_HEIGHT, def.corners)}"/>
        </svg>
        <div class="region-name">${def.name}</div>
        <div class="region-boost"></div>
        <div class="region-warning">
            ${WARNING_ICON}
            <div class="region-warning-tip"></div>
        </div>
    `;
    region.addEventListener("click", () => {
        if (canvas.movedWhileDown) return;
        const s = getLayerState(layer.stateKey);
        if (pickedTarget(s, id)) return;
        clickRegion(s, id);
        canvas.centerOn(def.position.x, def.position.y);
    });
    el.appendChild(region);
    return region;
}

function buildSchool(el, id, canvas, layer) {
    const species = SPECIES[id];
    const school = document.createElement("div");
    school.className = "ocean-school scene-hit";
    school.dataset.school = id;
    school.title = species.name; // Named in the side window, so the map only needs the hover
    school.style.setProperty("--school-color", species.color);
    school.innerHTML = `
        <div class="school-buffs"></div>
        <div class="school-body">
            <span class="school-fish school-fish-lead">${fishArt(id)}</span>
            <span class="school-fish school-fish-wing">${fishArt(id)}</span>
            <span class="school-fish school-fish-tail">${fishArt(id)}</span>
        </div>
    `;
    school.addEventListener("click", () => {
        if (canvas.movedWhileDown) return;
        const s = getLayerState(layer.stateKey);
        if (pickedTarget(s, schoolState(s, id).at)) return;
        select(s, "school", id);
        const at = regionCenter(schoolState(s, id).at);
        canvas.centerOn(at.x, at.y);
    });
    el.appendChild(school);
    return school;
}

const OCEAN_SCENE = {
    build(el, s, layer, canvas) {
        el.classList.add("ocean-scene");

        const svg = svgEl("svg", { class: "ocean-currents" });
        svg.innerHTML = CURRENT_DEFS;
        el.appendChild(svg);

        const built = { currents: {}, regions: {}, schools: {} };
        for (const id of REGION_IDS) {
            built.currents[id] = buildCurrent(svg);
            built.regions[id] = buildRegion(el, id, canvas, layer);
        }
        built.picks = buildPicks(svg, layer);

        const schoolLayer = document.createElement("div");
        schoolLayer.className = "ocean-school-layer";
        el.appendChild(schoolLayer);
        for (const id of SPECIES_IDS) built.schools[id] = buildSchool(schoolLayer, id, canvas, layer);

        el.__ocean = built;
    },

    update(el, s) {
        const built = el.__ocean;
        const region = selectedRegion(s);
        const school = selectedSchool(s);
        const { contested } = planMovement(s);

        for (const id of REGION_IDS) {
            const node = built.regions[id];
            const { group, line } = built.currents[id];

            // Neither a region that hasn't been opened yet nor its current are drawn
            const open = regionOpen(s, id);
            setDisplay(node, open);
            if (!open) { setDisplay(group, false); continue; }

            const data = regionState(s, id);
            node.classList.toggle("selected", region === id);

            const clash = contested.get(id);
            const warning = node.querySelector(".region-warning");
            setDisplay(warning, !!clash);
            if (clash) setText(warning.querySelector(".region-warning-tip"), clashText(id, clash));

            // A region being pointed has its line drawn as a gold option, so the ordinary one is skipped
            const flowTo = flowTarget(s, id);
            const wasShown = group.style.display !== "none";
            setDisplay(group, !isPicking(id));
            const key = `${id}>${flowTo}`;
            if (line.dataset.key !== key) {
                const d = currentShape(id, flowTo).d;
                if (line.dataset.key) swapCurrent(group, line, d, wasShown);
                else line.setAttribute("d", d);
                line.dataset.key = key;
            }

            const boostEl = node.querySelector(".region-boost");
            const shown = data.boost || "";
            if (boostEl.dataset.boost !== shown) {
                boostEl.dataset.boost = shown;
                boostEl.innerHTML = shown ? boostIcon(shown) : "";
                boostEl.title = shown ? `${BOOSTS[shown].name}: ${BOOSTS[shown].text}` : "";
            }
        }

        for (const id of SPECIES_IDS) {
            const node = built.schools[id];
            const shown = schoolUnlocked(s, id);
            setDisplay(node, shown);
            if (!shown) continue;

            const state = schoolState(s, id);
            const center = regionCenter(state.at);
            const place = `translate(${center.x}px, ${center.y}px)`;
            if (node.style.transform !== place) node.style.transform = place;

            // Which way the water is taking it, so the school turns around when a current does
            const facing = regionCenter(flowTarget(s, state.at)).x < center.x ? "left" : "right";
            if (node.dataset.facing !== facing) node.dataset.facing = facing;

            node.classList.toggle("selected", school === id);
            node.style.pointerEvents = region === state.at ? "auto" : "none";
            renderBuffRow(node.querySelector(".school-buffs"), state);
        }

        if (picking && picking !== region) stopPicking();
        const options = picking && regionOpen(s, picking) ? currentOptions(s, picking) : [];
        const running = picking ? flowTarget(s, picking) : null;
        built.picks.forEach((pick, slot) => {
            const target = options[slot];
            setDisplay(pick.group, !!target);
            if (!target) { pick.group.dataset.target = ""; return; }

            if (pick.group.dataset.target !== target || pick.group.dataset.from !== picking) {
                pick.group.dataset.target = target;
                pick.group.dataset.from = picking;
                const shape = currentShape(picking, target);
                pick.line.setAttribute("d", shape.d);
                pick.hit.setAttribute("d", shape.d);
            }
            pick.group.classList.toggle("chosen", target === running);
        });

    },

    bounds(s) {
        const ids = openRegionIds(s);
        if (!ids.length) return { minX: -SCENE_MARGIN, maxX: SCENE_MARGIN, minY: -SCENE_MARGIN, maxY: SCENE_MARGIN };
        const xs = ids.map(id => REGIONS[id].position.x);
        const ys = ids.map(id => REGIONS[id].position.y);
        return {
            minX: Math.min(...xs) - SCENE_MARGIN, maxX: Math.max(...xs) + SCENE_MARGIN,
            minY: Math.min(...ys) - SCENE_MARGIN, maxY: Math.max(...ys) + SCENE_MARGIN,
        };
    },
};

// Why the warning on the region is given
function clashText(regionId, clash) {
    const named = (id) => SPECIES[id].name;
    const staying = clash.blocked.map(named).join(" and ");
    const stay = clash.blocked.length > 1 ? "stay" : "stays";
    return `${REGIONS[regionId].name} only holds one school.`
        + (clash.arriving ? ` ${named(clash.arriving)} takes it, and ${staying} ${stay} put.`
            : ` ${staying} ${stay} where ${clash.blocked.length > 1 ? "they are" : "it is"}.`);
}


//    !!! UPGRADE AND SKILL CARDS !!!

const SKILL_MARKUP = `
    <div class="skill-head"><span class="skill-stat"></span><span class="skill-level"></span></div>
    <button class="skill-buy" type="button">
        <span class="skill-plus" aria-hidden="true">+</span>
        <span class="skill-lines">
            <span class="skill-cost"></span>
            <span class="skill-effect"></span>
        </span>
    </button>
`;

function skillGrid(count, onClick) {
    const grid = document.createElement("div");
    grid.className = "fish-skills";
    for (let i = 0; i < count; i++) {
        const card = document.createElement("div");
        card.className = "skill";
        card.innerHTML = SKILL_MARKUP;
        card.dataset.slot = i;
        card.querySelector(".skill-buy").addEventListener("click", () => onClick(i));
        grid.appendChild(card);
    }
    return grid;
}

function fillSkill(card, { stat, color, level, max, effect, cost }) {
    const maxed = level >= max;
    const want = maxed ? "owned" : canAfford(cost) ? "affordable" : "locked";
    if (card.dataset.state !== want) {
        card.className = `skill ${want}`;
        card.dataset.state = want;
    }
    if (card.dataset.color !== color) {
        card.dataset.color = color;
        card.style.setProperty("--skill-color", color);
    }

    setRichText(card.querySelector(".skill-stat"), stat);
    setText(card.querySelector(".skill-level"), roman(level));
    setRichText(card.querySelector(".skill-cost"), maxed ? "Fully grown" : costHtml(cost, true));
    setText(card.querySelector(".skill-effect"), effect);
}


//    !!! SHARED READOUTS !!!

// Row of icons for what boosts a school has, empty slots are shown when no boost fills it
function renderBuffRow(host, school, slots = 0) {
    const boosts = activeBoosts(school);
    const key = `${slots}:${boosts.map(id => `${id}:${school.buffs[id]}`).join(",")}`;
    if (host.dataset.key === key) return;
    host.dataset.key = key;

    const filled = boosts.map(id => `
        <span class="school-buff" title="${BOOSTS[id].name} - ${BOOSTS[id].text}">
            ${boostIcon(id)}<span class="buff-ticks">${school.buffs[id]}</span>
        </span>`);
    const empty = Math.max(0, slots - boosts.length);
    host.innerHTML = filled.join("")
        + `<span class="buff-slot" title="Room for another boost"></span>`.repeat(empty);
}

function renderYield(host, amounts, prefix = "+") {
    const ids = Object.keys(amounts).filter(id => D(amounts[id]).gt(0));
    const key = ids.map(id => `${id}:${formatNumber(amounts[id])}`).join(",");
    if (host.dataset.key === key) return;
    host.dataset.key = key;

    host.innerHTML = ids.length === 0 ? `<span class="ocean-yield-empty">Nothing next tick</span>`
        : ids.map(id => {
            const def = resourceDef(id);
            return `<span class="ocean-chip" style="--resource-color:${def.color || "var(--text)"}">`
                + `${prefix}${formatNumber(amounts[id])} <em>${def.name}</em></span>`;
        }).join("");
}


//    !!! THE SIDE PANEL !!!

const OCEAN_HUD = {
    build(el, s, layer, canvas) {
        el.innerHTML = `
            <div class="ocean-clock">
                <div class="ocean-clock-head"><span>Ocean tick</span><span class="ocean-clock-time"></span></div>
                <div class="ocean-clock-bar"><div class="ocean-clock-fill"></div></div>
            </div>
            <aside class="ocean-panel" data-canvas-cover>
                <div class="ocean-page" data-page="overview">
                    <div class="ocean-card ocean-summary">
                        <div class="summary-head">
                            <span class="ocean-page-label">Next ocean tick</span>
                            <span class="summary-time"></span>
                        </div>
                        <div class="summary-bar"><div class="summary-fill"></div></div>
                        <div class="ocean-yield"></div>
                    </div>
                    <div class="ocean-page-label">Schools</div>
                    <div class="ocean-school-list"></div>
                </div>

                <div class="ocean-page" data-page="region">
                    <div class="ocean-page-title"></div>
                    <button class="ocean-redirect" type="button"></button>
                    <div class="ocean-page-note"></div>
                    <div class="ocean-school-list ocean-here"></div>
                    <div class="ocean-banner"></div>
                </div>

                <div class="ocean-page" data-page="school">
                    <div class="fish-card">
                        <div class="school-buffs"></div>
                        <div class="portrait-art"></div>
                        <div class="portrait-name"></div>
                    </div>
                    <div class="fish-where"></div>
                    <button class="fish-reef" type="button">Reef compendium &#8250;</button>
                    <div class="fish-readout">
                        <span class="ocean-page-label">Next tick</span>
                        <div class="ocean-yield"></div>
                    </div>
                    <div class="fish-flavor"></div>
                </div>

                <div class="ocean-page" data-page="dry">
                    <div class="ocean-page-title">No ocean yet</div>
                    <div class="ocean-page-note">There is no open water anywhere in the world, so
                        there is nothing here to swim in.</div>
                    <div class="ocean-page-note">Ocean is made on the world map, out of three
                        ponds at a time. More regions unlock as more oceans are formed.</div>
                </div>
            </aside>
        `;

        const pages = {};
        for (const page of el.querySelectorAll(".ocean-page")) pages[page.dataset.page] = page;

        const stateOf = () => getLayerState(layer.stateKey);

        pages.region.appendChild(
            slotGrid(REGION_UPGRADE_IDS.length, (slot, buyMax = false) => {
                const s = stateOf();
                const id = selectedRegion(s);
                if (!id) return;
                const upgradeId = REGION_UPGRADE_IDS[slot];
                const max = regionUpgradeMax(upgradeId);
                let level = regionLevel(s, id, upgradeId);
                // One purchase per pass; on Max it keeps going until the pool runs dry or the cap
                while (level < max) {
                    if (!spend(regionUpgradeCost(s, level, upgradeId))) return;
                    level += 1;
                    regionState(s, id).upgrades[upgradeId] = level;
                    if (!buyMax) return;
                }
            }, "ocean-upgrades"));

        // The skills sit between the readout and the flavor line, the way the fish page reads
        pages.school.insertBefore(skillGrid(ASPECTS, (slot) => {
            const s = stateOf();
            const id = selectedSchool(s);
            if (!id) return;
            const school = schoolState(s, id);
            const aspectId = aspectIds(id)[slot];
            const aspect = SPECIES[id].aspects[aspectId];
            const level = aspectLevel(school, aspectId);
            if (level >= aspectCeiling(aspect)) return;
            if (!spend(aspectUpgradeCost(level))) return;
            school.upgrades[aspectId] = level + 1;
        }), pages.school.querySelector(".fish-flavor"));

        // Lays every place this region's water is allowed to go out on the map, in gold
        pages.region.querySelector(".ocean-redirect").addEventListener("click", () => {
            const id = selectedRegion(stateOf());
            picking = isPicking(id) ? null : id;
        });

        // Both lists hand out the same two jobs: pick that school, and go and look at it
        for (const list of el.querySelectorAll(".ocean-school-list")) {
            list.addEventListener("click", (e) => {
                const s = stateOf();
                const row = e.target.closest("[data-school]");
                if (!row) return;

                const id = row.dataset.school;
                select(s, "school", id);
                const at = regionCenter(schoolState(s, id).at);
                canvas.centerOn(at.x, at.y);
            });
        }

        pages.school.querySelector(".fish-reef").addEventListener("click", openReefBook);

        el.__ocean = { pages, canvas };
    },

    update(el, s, layer) {
        const { pages, canvas } = el.__ocean;

        if (focusing && el.getClientRects().length) {
            if (selectedSchool(s) === focusing) {
                const at = regionCenter(schoolState(s, focusing).at);
                canvas.centerOn(at.x, at.y);
            }
            focusing = null;
        }

        const left = tickSeconds() - (s.oceanClock || 0);
        const part = oceanTickProgress(s) ?? 0;
        setText(el.querySelector(".ocean-clock-time"), clockText(left));
        setWidth(el.querySelector(".ocean-clock-fill"), part);

        const dry = oceanIsDry(s);
        const regionId = dry ? null : selectedRegion(s);
        const schoolId = dry ? null : selectedSchool(s);
        const page = dry ? "dry" : schoolId ? "school" : regionId ? "region" : "overview";
        for (const id in pages) setDisplay(pages[id], id === page);

        // No water, no tick worth counting down to
        setDisplay(el.querySelector(".ocean-clock"), !dry);

        if (page === "dry") return;
        if (page === "overview") updateOverview(pages.overview, s, left, part);
        else if (page === "region") updateRegionPage(pages.region, s, regionId);
        else updateSchoolPage(pages.school, s, schoolId);
    },
};

function updateOverview(page, s, left, part) {
    setText(page.querySelector(".summary-time"), clockText(left));
    setWidth(page.querySelector(".summary-fill"), part);
    renderYield(page.querySelector(".ocean-yield"), tickProduction(s));
    // Only fish already in the water, so species not given yet aren't teased
    renderSchoolList(page.querySelector(".ocean-school-list"), s,
        SPECIES_IDS.filter(id => schoolUnlocked(s, id)));
}

function updateRegionPage(page, s, id) {
    const def = REGIONS[id];
    const region = regionState(s, id);

    const banner = page.querySelector(".ocean-banner");
    const boost = region.boost;
    if (banner.dataset.boost !== (boost || "")) {
        banner.dataset.boost = boost || "";
        // A blank slot rather than nothing, so losing a boost doesn't shuffle the page up
        banner.innerHTML = boost ? `${boostIcon(boost)}<div><div class="banner-name">${BOOSTS[boost].name}</div>`
            + `<div class="banner-text">${colorResources(BOOSTS[boost].text)}</div></div>`
            : `<span class="buff-slot" title="No boost here right now"></span>`
            + `<div><div class="banner-name">&nbsp;</div><div class="banner-text">&nbsp;</div></div>`;
        banner.classList.toggle("empty", !boost);
    }

    setText(page.querySelector(".ocean-page-title"), def.name);
    const crowded = planMovement(s).contested.has(id)
        ? " Two schools are heading here, and only one will arrive." : "";
    setRichText(page.querySelector(".ocean-page-note"),
        `Water worth ${Math.round(def.water * 100)}% of the ordinary.`
        + ` Flowing into ${REGIONS[flowTarget(s, id)].name}.${crowded}`);
    renderSchoolList(page.querySelector(".ocean-here"), s, schoolsAt(s, id).map(school => school.id));

    const buttons = page.querySelectorAll(".ocean-upgrades .upgrade-button");
    REGION_UPGRADE_IDS.forEach((upgradeId, slot) => {
        const upgrade = REGION_UPGRADES[upgradeId];
        const level = regionLevel(s, id, upgradeId);
        fillUpgrade(buttons[slot], {
            title: upgrade.title,
            level,
            max: regionUpgradeMax(upgradeId),
            description: upgrade.description(level, regionUpgradeMax(upgradeId)),
            cost: regionUpgradeCost(s, level, upgradeId),
        });
    });

    const redirect = page.querySelector(".ocean-redirect");
    redirect.classList.toggle("picking", isPicking(id));
    setText(redirect, isPicking(id) ? "Pick a gold path, or press to stop" : "Redirect the current");
}

function aspectHeadline(aspect, level) {
    if (aspect.kind === "production") {
        const name = resourceDef(aspect.resource).short;
        return `+${formatNumber(aspect.base.mul(1 + PROD_PER_LEVEL * (level - 1)))} ${name}`;
    }
    if (aspect.kind === "boost") {
        return `x${aspect.effect(level).toFixed(2)} ${resourceDef(aspect.resource).short}`;
    }
    return aspect.headline(level);
}

function aspectColor(aspect) {
    if (aspect.kind === "trait") return "var(--gold)";
    return resourceDef(aspect.resource).color || "var(--text)";
}

const aspectDescription = (aspect, level) => aspect.kind === "production"
    ? `Base ${formatNumber(aspect.base.mul(1 + PROD_PER_LEVEL * (level - 1)))} `
        + `${resourceDef(aspect.resource).name} each tick.`
    : aspect.description(level);

function updateSchoolPage(page, s, id) {
    const species = SPECIES[id];
    const school = schoolState(s, id);

    const card = page.querySelector(".fish-card");
    if (card.dataset.species !== id) {
        card.dataset.species = id;
        card.style.setProperty("--school-color", species.color);
        page.querySelector(".portrait-art").innerHTML = fishArt(id);
    }
    setText(page.querySelector(".portrait-name"), species.name);
    renderBuffRow(page.querySelector(".school-buffs"), school, maxBuffs());
    setText(page.querySelector(".fish-where"), `Currently in ${REGIONS[school.at].name}`);
    setDisplay(page.querySelector(".fish-reef"), reefOpen() && unlockedSpecies().includes(id));
    setText(page.querySelector(".fish-flavor"), species.blurb);
    renderYield(page.querySelector(".fish-readout .ocean-yield"), schoolProduction(s, school));

    const cards = page.querySelectorAll(".fish-skills .skill");
    aspectIds(id).forEach((aspectId, slot) => {
        const aspect = species.aspects[aspectId];
        const level = aspectLevel(school, aspectId);
        fillSkill(cards[slot], {
            stat: aspectHeadline(aspect, level),
            color: aspectColor(aspect),
            level,
            max: aspectCeiling(aspect),
            effect: aspect.step || `+${Math.round(PROD_PER_LEVEL * 100)}% per level`,
            cost: aspectUpgradeCost(level),
        });
        cards[slot].title = `${aspect.title}: ${aspectDescription(aspect, level)}`;
    });
}

// The list of fish schools
function renderSchoolList(host, s, ids) {
    const key = ids.map(id => {
        const school = schoolState(s, id);
        return `${id}:${school.at}:${activeBoosts(school).join("|")}`;
    }).join(",");
    if (host.dataset.key !== key) {
        host.dataset.key = key;
        host.innerHTML = ids.map(id => schoolRow(s, id)).join("")
            || `<div class="ocean-empty">No schools here.</div>`;
    }

    for (const row of host.querySelectorAll("[data-school]")) {
        const school = schoolState(s, row.dataset.school);
        setText(row.querySelector(".row-where"), REGIONS[school.at].name);
        renderYield(row.querySelector(".ocean-yield"), schoolProduction(s, school));
        renderBuffRow(row.querySelector(".school-buffs"), school, maxBuffs());
    }
}

function schoolRow(s, id) {
    const species = SPECIES[id];
    return `<button class="ocean-row" type="button" data-school="${id}">
            <span class="row-art" style="--school-color:${species.color}">${fishArt(id)}</span>
            <span class="row-body">
                <span class="row-head">
                    <span class="row-name">${species.name}</span>
                    <span class="row-where"></span>
                </span>
                <span class="ocean-yield"></span>
                <span class="school-buffs"></span>
            </span>
        </button>`;
}


export const OCEAN_VIEW = {
    name: "Ocean",
    color: "#3f9ad4",
    canvasType: "drag",
    viewportClass: "ocean-viewport",
    // Shifted off the middle of the ring so it doesn't open on top of stuff
    defaultView: { x: 250, y: 0 },
    defaultZoom: 0.75,

    scene: OCEAN_SCENE,
    hud: OCEAN_HUD,

    onCanvasClick(s) {
        select(s, null, null);
    },

    // Comes up on the overview, unless it was opened to show one fish in particular
    onEnter(s) {
        if (!focusing) select(s, null, null);
    },

    subWindows: {},
    nodes: {},
};