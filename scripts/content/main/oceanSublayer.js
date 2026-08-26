// oceanSublayer.js
//
// A pannable map of region nodes connected by currents. Each region can only have
// one current going out of it. Every minute an ocean tick occurs, which makes
// fish give resources based on where they are, then move into the region based on
// their region's current direction, then pick up whatever drifting boost is on the new node.
// Then it places some drifting boosts in random places.
//
// It's a view instead of a registered layer because it goes under the aquatic layer, which owns the state.
// Needs balancing, all the constants are at the top so that can be done easier instead of hunting them down


import { getLayerState } from "../../core/state.js";
import { addResource, canAfford, spend, costParts } from "../../core/resources.js";
import { registerBoost, boostResource } from "../../core/boosts.js";
import { D } from "../../utils/decimal.js";
import { formatNumber } from "../../utils/format.js";
import { cardBonus } from "./cards.js";
import { oceanTiles } from "./worldMap.js";
import { regionPath, fishArt, boostIcon, WARNING_ICON, CURRENT_DEFS } from "./oceanArt.js";

const TICK_SECONDS = 60;
const MAX_CATCHUP_TICKS = 20;   // A tab left in the background shouldn't run millions of ticks

const REGION_WIDTH = 195;
const REGION_HEIGHT = 165;

const BOOST_SPAWN_SHARE = 3;    // One boost wants to appear per this many regions in the water
const BOOST_PER_LEFT = 1;       // Every this many still lying around cancels one of those
const BOOST_WEIGHT = 2;         // Extra weight per level of boostier boosts
const MAX_BUFFS = 3;            // How many boosts one school can carry at a time

const PROD_PER_LEVEL = 0.4;     // Each level of a production aspect 
const REGION_COST = D(3e9);
const REGION_SCALE = 1.7; 
const FISH_COST = D(3);
const FISH_SCALE = 1.7;
 
export const REGIONS_AT_FIRST_OCEAN = 5;
export const PER_OCEAN_TILE = 0.08;    // What each of those tiles is worth to everything in the water
 
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

    // One more of these for every ocean past the first
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
    const tiles = oceanTiles();
    return tiles <= 0 ? 0 : REGIONS_AT_FIRST_OCEAN + Math.floor(tiles / 2) - 1;
};

// Anything else that hands regions over, on top of the tiles. Kept apart from the tile count so
// that claiming ocean and spending it again can't quietly bank regions into the save
const grantedRegions = (s) => Math.max(0, Number(s.oceanOpenRegions) || 0);

// Which regions are active. It's a count rather than list, so it's always in the order above
export const openRegionCount = (s) =>
    Math.min(REGION_IDS.length, regionsFromTiles() + grantedRegions(s));

// No ocean on the map means no ocean here. Everything else falls out of this
export const oceanIsDry = (s) => openRegionCount(s) === 0;

export const openRegionIds = (s) => REGION_IDS.slice(0, openRegionCount(s));
const regionOpen = (s, id) => REGION_IDS.indexOf(id) < openRegionCount(s);

/**
 * Opens the next region (or several), for whatever ends up paying for them
 * @param {number} [amount]
 * @returns {string[]} the regions that opened, in order
 */
export function openOceanRegions(amount = 1) {
    const s = getLayerState("aquatic");
    const before = openRegionCount(s);
    s.oceanOpenRegions = Math.min(REGION_IDS.length, grantedRegions(s) + Math.max(0, amount));
    return REGION_IDS.slice(before, openRegionCount(s));
}

export const lockedRegionsLeft = (s) => REGION_IDS.length - openRegionCount(s);

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
        max: 10,
        description: (level) => `Everything a school produces here is boosted by ${Math.round(25 * level)}%.`,
        effect: (level) => 1 + 0.25 * level,
    },
    bed: {
        title: "Nutrient Bed",
        max: 8,
        description: (level) => `Biomass produced here is boosted by a further ${Math.round(40 * level)}%.`,
        effect: (level) => 1 + 0.40 * level,
    },
    longer: {
        title: "Yippee! Long boosts!",
        max: 2,
        description: (level) => `Boosts picked up here last ${level} more ocean tick${level === 1 ? "" : "s"}.`,
        effect: (level) => level,
    },
    boostier: {
        title: "Yippee! Boostier boosts!",
        max: 5,
        description: (level) => `Drifting boosts are ${1 + BOOST_WEIGHT * level} times as likely to appear here.`,
        effect: (level) => 1 + BOOST_WEIGHT * level,
    },
};

const REGION_UPGRADE_IDS = Object.keys(REGION_UPGRADES);



// Boosts stay on a region until a school swims through, where they're picked up
const BOOSTS = {
    upwelling: { name: "Upwelling", ticks: 3, output: 0.3,
        text: "+30% to everything the school produces." },
    bloom: { name: "Plankton Bloom", ticks: 2, biomass: 1,
        text: "Doubles the Biomass the school produces." },
    glint: { name: "Sunlit Water", ticks: 3, essence: 0.6,
        text: "+60% to the essence the school produces." },
    riptide: { name: "Riptide", ticks: 2, extraStep: true,  // NEED TO MAKE THIS ONE BETTER ANIMATION
        text: "The school is carried two regions on each tick instead of one." },
    spawn: { name: "Spawning Urge", ticks: 2, output: 0.15, evolution: 0.5,
        text: "+15% output, and 50% more to the school's Evolution bonus." },
};

const BOOST_IDS = Object.keys(BOOSTS);


// All the fish. Each one has four things from: resource production, resource boost, and traits.
// A boost follows its resource everywhere that resource is made rather than only around the
// ocean, and names which one it is. Evolution Points count as one of those even though nothing
// produces them per second.
//
// Fish are only ever drawn in by another layer calling drawInSchool().
const SPECIES = {
    cod: {
        name: "Cod",
        color: "#8fb6c8",
        home: "shelf",
        blurb: "big ol fish yay! make a description here.",
        aspects: {
            muscle: { kind: "production", resource: "blueEssence", title: "bluer fish...",
                base: D(6e7), max: 25 },
            roe: { kind: "production", resource: "biomass", title: "Bigger Schools",
                base: D(1.5e6), max: 25 },
            deepRoe: { kind: "boost", resource: "evolutionPoints", title: "Adaptive Bodies",
                max: 10, step: "+0.15x per level",
                description: (level) => `Every Evolution Point you earn is multiplied by ${(1 + 0.15 * level).toFixed(2)}.`,
                effect: (level) => 1 + 0.15 * level },
            opportunist: { kind: "trait", title: "Opportunist", max: 10, step: "+10% per level",
                headline: (level) => `+${Math.round(100 * (0.2 + 0.1 * level))}% per boost`,
                description: (level) => `Produces ${Math.round(100 * (0.2 + 0.1 * level))}% more for every active boost.`,
                effect: (level, school) => 1 + activeBoosts(school).length * (0.2 + 0.1 * level) },
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
                base: D(2.6e6), max: 25 },
            silverRun: { kind: "boost", resource: "blueEssence", title: "Silver Run", max: 10,
                step: "+12% per level",
                description: (level) => `All Blue Essence, wherever it is made, is boosted by ${Math.round(12 * level)}%.`,
                effect: (level) => 1 + 0.12 * level },
            // A region only ever holds one school, so this counts the water it joins on to
            // instead - a herring is worth most where the map around it is busiest.
            shoaling: { kind: "trait", title: "Shoaling", max: 10, step: "+8% per level",
                headline: (level) => `+${Math.round(100 * (0.12 + 0.08 * level))}% per neighbour`,
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
            streak: { kind: "production", resource: "blueEssence", title: "bluer fish...",
                base: D(9e7), max: 25 },
            graze: { kind: "production", resource: "greenEssence", title: "greener fish...",
                base: D(4.5e7), max: 25 },
            baitBall: { kind: "boost", resource: "biomass", title: "biomassive...", max: 10,
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

// Cod appears as soon as the ocean is unlocked
const schoolUnlocked = (s, id) => id === "cod" || !!(s.oceanSchools || {})[id];

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

// Every aspect starts at level 1, so a school is worth something when it spawns
const aspectLevel = (school, aspectId) => Math.max(1, Number(school.upgrades[aspectId]) || 1);
const activeBoosts = (school) => BOOST_IDS.filter(id => (school.buffs || {})[id] > 0);

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

export const roomForAnotherSchool = (s) =>
    unlockedSchools(s).length < openRegionIds(s).length;



const tickSeconds = () => TICK_SECONDS / (1 + cardBonus("oceanTickSpeed"));

// What one level of a region upgrade costs next, and the same for a fish aspect
const regionUpgradeCost = (level) => ({ blueEssence: REGION_COST.mul(D(REGION_SCALE).pow(level)) });
const aspectUpgradeCost = (level) => ({ evolutionPoints: FISH_COST.mul(D(FISH_SCALE).pow(level - 1)).ceil() });

// Boosts stack additively within a kind, the way card bonuses do
function boostBonus(school, key) {
    let total = 0;
    for (const id of activeBoosts(school)) total += BOOSTS[id][key] || 0;
    return total;
}

const traitMultiplier = (s, school) => {
    const species = SPECIES[school.id];
    const trait = Object.values(species.aspects).find(a => a.kind === "trait");
    const id = aspectIds(school.id).find(key => species.aspects[key] === trait);
    return trait ? trait.effect(aspectLevel(school, id), school, s) : 1;
};

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

            // Spawning Urge sharpens whatever the school is boosting while it lasts.
            const bonus = aspect.effect(aspectLevel(school, aspectId));
            total = total.mul(1 + (bonus - 1) * (1 + boostBonus(school, "evolution")));
        }
    }
    return total;
}

registerBoost("Schools", schoolBoost);

// Every ocean tile claimed on the world map makes the whole ocean worth more
const oceanTileShare = () => 1 + PER_OCEAN_TILE * oceanTiles();

// One school's payout on the next tick, as { resourceId: Decimal }
export function schoolProduction(s, school) {
    const species = SPECIES[school.id];
    const region = regionState(s, school.at);
    const trait = traitMultiplier(s, school);
    const cardShare = 1 + cardBonus("oceanOutput");
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
            .mul(boostResource(aspect.resource));

        if (aspect.resource === "biomass") {
            amount = amount.mul(REGION_UPGRADES.bed.effect(Number(region.upgrades.bed) || 0));
        }
        out[aspect.resource] = D(out[aspect.resource] || 0).add(amount);
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






// Schools can't share a region, so everything in the tick's movement is worked out before
// things happen. Multiple passes so that one fish can still do something if multiple are blocked
export function planMovement(s) {
    const schools = unlockedSchools(s);
    const at = new Map(schools.map(school => [school.id, school.at]));
    const left = new Map(schools.map(school =>
        [school.id, activeBoosts(school).some(id => BOOSTS[id].extraStep) ? 2 : 1]));
    const paths = new Map(schools.map(school => [school.id, []]));
    const standing = new Map(schools.map(school => [school.at, school.id]));

    const targetOf = (school) => flowTarget(s, at.get(school.id));
    const schoolById = (id) => schools.find(school => school.id === id);

    const step = (school, to) => {
        at.set(school.id, to);
        paths.get(school.id).push(to);
        left.set(school.id, left.get(school.id) - 1);
    };

    // If there's a ring of schools waiting on each other, this makes them all rotate
    // otherwise it gets unhappy and they get into a deadlock
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

// Picking up whatever was drifting on a region, once a school has actually landed on it
function takeBoost(s, school, regionId) {
    const region = regionState(s, regionId);
    if (!region.boost) return;

    // A school with max boosts leaves the boost where it is rather than wasting it
    const held = school.buffs[region.boost] || 0;
    if (!held && activeBoosts(school).length >= MAX_BUFFS) return;

    school.buffs[region.boost] = Math.max(held, BOOSTS[region.boost].ticks + regionLevel(s, regionId, "longer"));
    region.boost = null;
}

// Fewer new boosts turn up while the map is still covered in them
function spawnBoosts(s) {
    const inPlay = openRegionIds(s);
    const open = inPlay.filter(id => !regionState(s, id).boost);
    const left = inPlay.length - open.length;
    let wanted = Math.min(open.length,
        Math.ceil(inPlay.length / BOOST_SPAWN_SHARE) - Math.floor(left / BOOST_PER_LEFT));

    while (wanted-- > 0) {
        const weights = open.map(id => REGION_UPGRADES.boostier.effect(regionLevel(s, id, "boostier")));
        const total = weights.reduce((sum, weight) => sum + weight, 0);
        let roll = Math.random() * total;
        let index = 0;
        while (index < open.length - 1 && (roll -= weights[index]) > 0) index++;

        const id = open.splice(index, 1)[0];
        regionState(s, id).boost = BOOST_IDS[Math.floor(Math.random() * BOOST_IDS.length)];
    }
}

function oceanTick(s, layer) {
    s.oceanTicks = (s.oceanTicks || 0) + 1;

    const gains = tickProduction(s);
    for (const resourceId in gains) addResource(layer, resourceId, gains[resourceId]);

    for (const school of unlockedSchools(s)) {
        for (const id of activeBoosts(school)) {
            school.buffs[id] -= 1;
            if (school.buffs[id] <= 0) delete school.buffs[id];
        }
    }

    const { paths } = planMovement(s);
    for (const school of unlockedSchools(s)) {
        for (const regionId of paths.get(school.id) || []) {
            school.at = regionId;
            takeBoost(s, school, regionId);
        }
    }

    spawnBoosts(s);
}

export function tickOcean(dt, layer) {
    const s = getLayerState(layer.id);
    s.oceanClock = (s.oceanClock || 0) + dt;

    const length = tickSeconds();
    let ticks = 0;
    while (s.oceanClock >= length && ticks++ < MAX_CATCHUP_TICKS) {
        s.oceanClock -= length;
        oceanTick(s, layer);
    }
    if (ticks >= MAX_CATCHUP_TICKS) s.oceanClock = 0;
}


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

// Clicking a region alternates between its page and the school's page
function clickRegion(s, id) {
    const here = schoolsAt(s, id);
    if (selectedRegion(s) === id && here.length) {
        select(s, "school", here[0].id);
        return;
    }
    select(s, "region", id);
}

// While the gold paths are out, the region one ends at counts as a click on that path. The
// node is a far bigger target than the line, and the fish sitting on it covers the line anyway
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

const SVG_NS = "http://www.w3.org/2000/svg";
const SCENE_MARGIN = 260;

function buildCurrent(svg) {
    const group = document.createElementNS(SVG_NS, "g");
    group.setAttribute("class", "ocean-current-group");

    const line = document.createElementNS(SVG_NS, "path");
    line.setAttribute("class", "ocean-current");
    line.setAttribute("marker-end", "url(#current-head)");

    group.appendChild(line);
    svg.appendChild(group);
    return { group, line };
}


const MOST_FLOWS = Math.max(...REGION_IDS.map(id => REGIONS[id].flows.length));

function buildPicks(svg, layer) {
    const picks = [];
    for (let i = 0; i < MOST_FLOWS; i++) {
        const group = document.createElementNS(SVG_NS, "g");
        group.setAttribute("class", "ocean-pick-group");

        const hit = document.createElementNS(SVG_NS, "path");
        hit.setAttribute("class", "ocean-current-hit scene-hit");
        const line = document.createElementNS(SVG_NS, "path");
        line.setAttribute("class", "ocean-pick");
        line.setAttribute("marker-end", "url(#current-head)");

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

        const svg = document.createElementNS(SVG_NS, "svg");
        svg.setAttribute("class", "ocean-currents");
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

            // While a region is being pointed somewhere its own line is one of the gold
            // options drawn over the top, so the ordinary one underneath would just double it
            const flowTo = flowTarget(s, id);
            setDisplay(group, !isPicking(id));
            const key = `${id}>${flowTo}`;
            if (line.dataset.key !== key) {
                line.dataset.key = key;
                line.setAttribute("d", currentShape(id, flowTo).d);
            }

            const boostEl = node.querySelector(".region-boost");
            const shown = data.boost || "";
            if (boostEl.dataset.boost !== shown) {
                boostEl.dataset.boost = shown;
                boostEl.innerHTML = shown ? boostIcon(shown) : "";
                boostEl.title = shown ? `${BOOSTS[shown].name} - ${BOOSTS[shown].text}` : "";
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


const OUTSIDE_RESOURCES = { Evolution: "#b06ad0" };

// Short forms for the places a full name won't fit, like the header for the fish skills
const SHORT_NAMES = { "Blue Essence": "BE", "Green Essence": "GE", "Evolution Points": "Evo" };

const escapeHtml = (text) => String(text).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

const resourceSpan = (name, color, text = name) =>
    `<span class="res" style="--resource-color:${color}">${escapeHtml(text)}</span>`;

function resourcecolors(layer) {
    const out = { ...OUTSIDE_RESOURCES };
    for (const def of Object.values(layer.resources || {})) if (def.name) out[def.name] = def.color;
    return out;
}

// Longest name first, so "Blue Essence" is taken before anything that sits inside it
function colorResources(text, layer) {
    const colors = resourcecolors(layer);
    let html = escapeHtml(text);
    for (const name of Object.keys(colors).sort((a, b) => b.length - a.length)) {
        html = html.split(name).join(resourceSpan(name, colors[name]));
    }
    return html;
}

const shortResource = (name) => SHORT_NAMES[name] || name;

// A price, with each resource named in its own color
// only thought of this when working on this layer. I will need to implement this everywhere else
// feck
const costHtml = (cost, layer, short = false) => costParts(cost, layer.resources || {})
    .map(part => `${part.amount} ${resourceSpan(part.label, part.color || "var(--text)",
        short ? shortResource(part.label) : part.label)}`)
    .join(" + ");

// Levels read as numerals on the fish page because I like them
const NUMERALS = [
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];
function roman(value) {
    let left = Math.max(0, Math.round(value));
    let out = "";
    while (left > 0) {
        const [size, mark] = NUMERALS.find(([size]) => size <= left);
        out += mark;
        left -= size;
    }
    return out || "-";
}

const UPGRADE_MARKUP = `
    <div class="upgrade-head"><span class="upgrade-title"></span><span class="upgrade-level"></span></div>
    <div class="upgrade-description"></div>
    <div class="upgrade-cost"></div>
`;

function upgradeGrid(count, onClick) {
    const grid = document.createElement("div");
    grid.className = "ocean-upgrades";
    for (let i = 0; i < count; i++) {
        const btn = document.createElement("button");
        btn.className = "upgrade-button";
        btn.innerHTML = UPGRADE_MARKUP;
        btn.addEventListener("click", () => onClick(Number(btn.dataset.slot)));
        btn.dataset.slot = i;
        grid.appendChild(btn);
    }
    return grid;
}

function fillUpgrade(btn, layer, { title, level, max, description, cost }) {
    const maxed = level >= max;
    const affordable = !maxed && canAfford(layer, cost);
    const want = maxed ? "owned" : affordable ? "affordable" : "locked";
    if (btn.dataset.state !== want) {
        btn.className = `upgrade-button ${want}`;
        btn.dataset.state = want;
    }
    setText(btn.querySelector(".upgrade-title"), title);
    setText(btn.querySelector(".upgrade-level"), `${level}/${max}`);
    setRich(btn.querySelector(".upgrade-description"), description, layer);
    setRich(btn.querySelector(".upgrade-cost"), maxed ? "Maxed" : `Cost: ${costHtml(cost, layer)}`, layer);
}

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

function fillSkill(card, layer, { stat, color, level, max, effect, cost }) {
    const maxed = level >= max;
    const want = maxed ? "owned" : canAfford(layer, cost) ? "affordable" : "locked";
    if (card.dataset.state !== want) {
        card.className = `skill ${want}`;
        card.dataset.state = want;
    }
    if (card.dataset.color !== color) {
        card.dataset.color = color;
        card.style.setProperty("--skill-color", color);
    }

    setRich(card.querySelector(".skill-stat"), stat, layer);
    setText(card.querySelector(".skill-level"), roman(level));
    setRich(card.querySelector(".skill-cost"), maxed ? "Fully grown" : costHtml(cost, layer, true), layer);
    setText(card.querySelector(".skill-effect"), effect);
}

function renderYield(host, amounts, layer, prefix = "+") {
    const ids = Object.keys(amounts).filter(id => D(amounts[id]).gt(0));
    const key = ids.map(id => `${id}:${formatNumber(amounts[id])}`).join(",");
    if (host.dataset.key === key) return;
    host.dataset.key = key;

    host.innerHTML = ids.length === 0 ? `<span class="ocean-yield-empty">Nothing next tick</span>`
        : ids.map(id => {
            const def = layer.resources[id] || {};
            return `<span class="ocean-chip" style="--resource-color:${def.color || "var(--text)"}">`
                + `${prefix}${formatNumber(amounts[id])} <em>${def.name || id}</em></span>`;
        }).join("");
}

const clockText = (seconds) => {
    const left = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(left / 60)}m ${String(left % 60).padStart(2, "0")}s`;
};

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
                    <div class="ocean-banner"></div>
                    <div class="ocean-school-list ocean-here"></div>
                    <br>
                </div>

                <div class="ocean-page" data-page="school">
                    <div class="fish-card">
                        <div class="school-buffs"></div>
                        <div class="portrait-art"></div>
                        <div class="portrait-name"></div>
                    </div>
                    <div class="fish-where"></div>
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
            upgradeGrid(REGION_UPGRADE_IDS.length, (slot) => {
                const s = stateOf();
                const id = selectedRegion(s);
                if (!id) return;
                const upgradeId = REGION_UPGRADE_IDS[slot];
                const level = regionLevel(s, id, upgradeId);
                if (level >= REGION_UPGRADES[upgradeId].max) return;
                if (!spend(layer, regionUpgradeCost(level))) return;
                regionState(s, id).upgrades[upgradeId] = level + 1;
            }));

        // The skills sit between the readout and the flavor line, the way the fish page reads
        pages.school.insertBefore(skillGrid(ASPECTS, (slot) => {
            const s = stateOf();
            const id = selectedSchool(s);
            if (!id) return;
            const school = schoolState(s, id);
            const aspectId = aspectIds(id)[slot];
            const aspect = SPECIES[id].aspects[aspectId];
            const level = aspectLevel(school, aspectId);
            if (level >= aspect.max) return;
            if (!spend(layer, aspectUpgradeCost(level))) return;
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

        el.__ocean = { pages };
    },

    update(el, s, layer) {
        const { pages } = el.__ocean;

        const left = tickSeconds() - (s.oceanClock || 0);
        const part = Math.max(0, Math.min(1, (s.oceanClock || 0) / tickSeconds()));
        setText(el.querySelector(".ocean-clock-time"), clockText(left));
        el.querySelector(".ocean-clock-fill").style.width = `${(100 * part).toFixed(1)}%`;

        const dry = oceanIsDry(s);
        const regionId = dry ? null : selectedRegion(s);
        const schoolId = dry ? null : selectedSchool(s);
        const page = dry ? "dry" : schoolId ? "school" : regionId ? "region" : "overview";
        for (const id in pages) setDisplay(pages[id], id === page);

        // No water, no tick worth counting down to
        setDisplay(el.querySelector(".ocean-clock"), !dry);

        if (page === "dry") return;
        if (page === "overview") updateOverview(pages.overview, s, layer, left, part);
        else if (page === "region") updateRegionPage(pages.region, s, layer, regionId);
        else updateSchoolPage(pages.school, s, layer, schoolId);
    },
};

function updateOverview(page, s, layer, left, part) {
    setText(page.querySelector(".summary-time"), clockText(left));
    page.querySelector(".summary-fill").style.width = `${(100 * part).toFixed(1)}%`;
    renderYield(page.querySelector(".ocean-yield"), tickProduction(s), layer);
    // Only the fish already in the water. A species you haven't been given yet isn't
    // something to buy from here, so listing it would just be a tease.
    renderSchoolList(page.querySelector(".ocean-school-list"), s, layer,
        SPECIES_IDS.filter(id => schoolUnlocked(s, id)));
}

function updateRegionPage(page, s, layer, id) {
    const def = REGIONS[id];
    const region = regionState(s, id);

    const banner = page.querySelector(".ocean-banner");
    const boost = region.boost;
    if (banner.dataset.boost !== (boost || "")) {
        banner.dataset.boost = boost || "";
        // Hidden rather than removed, so losing a boost doesn't shuffle the whole page up
        banner.innerHTML = boost ? `${boostIcon(boost)}<div><div class="banner-name">${BOOSTS[boost].name}</div>`
            + `<div class="banner-text">${colorResources(BOOSTS[boost].text, layer)}</div></div>`
            : `${boostIcon("upwelling")}<div><div class="banner-name">&nbsp;</div>`
            + `<div class="banner-text">&nbsp;</div></div>`;
        banner.classList.toggle("empty", !boost);
    }

    setText(page.querySelector(".ocean-page-title"), def.name);
    const crowded = planMovement(s).contested.has(id)
        ? " Two schools are heading here, and only one will arrive." : "";
    setRich(page.querySelector(".ocean-page-note"),
        `Water worth ${Math.round(def.water * 100)}% of the ordinary.`
        + ` Flowing into ${REGIONS[flowTarget(s, id)].name}.${crowded}`, layer);
    renderSchoolList(page.querySelector(".ocean-here"), s, layer, schoolsAt(s, id).map(school => school.id));

    const buttons = page.querySelectorAll(".ocean-upgrades .upgrade-button");
    REGION_UPGRADE_IDS.forEach((upgradeId, slot) => {
        const upgrade = REGION_UPGRADES[upgradeId];
        const level = regionLevel(s, id, upgradeId);
        fillUpgrade(buttons[slot], layer, {
            title: upgrade.title,
            level,
            max: upgrade.max,
            description: upgrade.description(Math.max(1, level)),
            cost: regionUpgradeCost(level),
        });
    });

    const redirect = page.querySelector(".ocean-redirect");
    redirect.classList.toggle("picking", isPicking(id));
    setText(redirect, isPicking(id) ? "Pick a gold path, or press to stop" : "Redirect the current");
}

function aspectHeadline(aspect, level, layer) {
    if (aspect.kind === "production") {
        const name = (layer.resources[aspect.resource] || {}).name || aspect.resource;
        return `+${formatNumber(aspect.base.mul(1 + PROD_PER_LEVEL * (level - 1)))} ${shortResource(name)}`;
    }
    if (aspect.kind === "boost") {
        const name = (layer.resources[aspect.resource] || {}).name || aspect.resource;
        return `x${aspect.effect(level).toFixed(2)} ${shortResource(name)}`;
    }
    return aspect.headline(level);
}

function aspectcolor(aspect, layer) {
    if (aspect.kind === "trait") return "var(--gold)";
    const def = layer.resources[aspect.resource];
    return (def && def.color) || "var(--text)";
}

function updateSchoolPage(page, s, layer, id) {
    const species = SPECIES[id];
    const school = schoolState(s, id);

    const card = page.querySelector(".fish-card");
    if (card.dataset.species !== id) {
        card.dataset.species = id;
        card.style.setProperty("--school-color", species.color);
        page.querySelector(".portrait-art").innerHTML = fishArt(id);
    }
    setText(page.querySelector(".portrait-name"), species.name);
    renderBuffRow(page.querySelector(".school-buffs"), school, MAX_BUFFS);
    setText(page.querySelector(".fish-where"), `Currently in ${REGIONS[school.at].name}`);
    setText(page.querySelector(".fish-flavor"), species.blurb);
    renderYield(page.querySelector(".fish-readout .ocean-yield"), schoolProduction(s, school), layer);

    const cards = page.querySelectorAll(".fish-skills .skill");
    aspectIds(id).forEach((aspectId, slot) => {
        const aspect = species.aspects[aspectId];
        const level = aspectLevel(school, aspectId);
        fillSkill(cards[slot], layer, {
            stat: aspectHeadline(aspect, level, layer),
            color: aspectcolor(aspect, layer),
            level,
            max: aspect.max,
            effect: aspect.step || `+${Math.round(PROD_PER_LEVEL * 100)}% per level`,
            cost: aspectUpgradeCost(level),
        });
        cards[slot].title = `${aspect.title} - ${aspectDescription(aspect, level, layer)}`;
    });
}

const aspectDescription = (aspect, level, layer) => aspect.kind === "production"
    ? `Base ${formatNumber(aspect.base.mul(1 + PROD_PER_LEVEL * (level - 1)))} `
        + `${(layer.resources[aspect.resource] || {}).name || aspect.resource} each tick.`
    : aspect.description(level);

// The list of fish types
// Need to make it so ones that aren't unlocked just don't appear
function renderSchoolList(host, s, layer, ids) {
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
        renderYield(row.querySelector(".ocean-yield"), schoolProduction(s, school), layer);
        renderBuffRow(row.querySelector(".school-buffs"), school, MAX_BUFFS);
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

    subWindows: {},
    nodes: {},
};

function setText(el, text) {
    if (el.textContent !== text) el.textContent = text;
}

function setRich(el, text, layer) {
    if (el.dataset.rich === text) return;
    el.dataset.rich = text;
    el.innerHTML = text.includes("<span") ? text : colorResources(text, layer);
}

function setDisplay(el, shown) {
    const display = shown ? "" : "none";
    if (el.style.display !== display) el.style.display = display;
}
