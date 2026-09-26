// settlements.js
//
// Where a settlement can stand, what it becomes, and how its people live once it's founded

import { getLayerState } from "../../../core/state.js";
import { canAfford, spend } from "../../../core/resources.js";
import { D } from "../../../utils/decimal.js";
import { neighborsOf } from "../../../utils/hex.js";
import {
    TERRAIN, tileById, tileKind, isClaimed, isRazing, fireOn, tierOf, worldState, setTerrain, contributeTileGuard,
    buildupTotalOn, contributeTileCare,
} from "../../main/systems/worldMap.js";

export const settlementState = () => getLayerState("settlement");
export const settlements = () => settlementState().settlements;
export const activeSettlement = () => {
    const s = settlementState();
    const list = settlements();
    return list[Math.min(Math.max(0, s.activeSettlement || 0), list.length - 1)] || null;
};


//    !!! THE LAND !!!

// What each tile of a territory brings; game is the share of its food that runs, swims or flies
const LAND = {
    bare:               { food: 0.1,  game: 0,    water: 0,    wood: 0,    harsh: 0.1 },
    grass:              { food: 0.6,  game: 0.4,  water: 0.1,  wood: 0,    harsh: 0,    type: "pastoral" },
    pond:               { food: 0.5,  game: 0.3,  water: 0.8,  wood: 0,    harsh: 0,    type: "fishing" },
    ocean:              { food: 0.5,  game: 0.4,  water: 0.2,  wood: 0,    harsh: 0.1,  type: "harbor" },
    "deep-ocean":       { food: 0.3,  game: 0.3,  water: 0.2,  wood: 0,    harsh: 0.3,  type: "harbor" },
    reef:               { food: 0.6,  game: 0.4,  water: 0.1,  wood: 0,    harsh: 0.1,  type: "harbor" },
    "coral-reef":       { food: 0.7,  game: 0.4,  water: 0.1,  wood: 0,    harsh: 0.1,  type: "harbor" },
    "great-reef":       { food: 0.8,  game: 0.5,  water: 0.1,  wood: 0,    harsh: 0.15, type: "harbor" },
    forest:             { food: 0.3,  game: 0.15, water: 0.1,  wood: 1,    harsh: 0,    type: "wooded" },
    "dense-forest":     { food: 0.3,  game: 0.15, water: 0.1,  wood: 1.1,  harsh: 0.1,  type: "wooded" },
    "ancient-forest":   { food: 0.2,  game: 0.1,  water: 0.1,  wood: 1.2,  harsh: 0.15, type: "wooded" },
    "ice-field":        { food: 0.1,  game: 0.1,  water: 0.3,  wood: 0,    harsh: 0.6,  type: "frost" },
    glacier:            { food: 0,    game: 0,    water: 0.3,  wood: 0,    harsh: 0.8,  type: "frost" },
    "ice-cap":          { food: 0,    game: 0,    water: 0.2,  wood: 0,    harsh: 1,    type: "frost" },
    marsh:              { food: 0.3,  game: 0.1,  water: 0.7,  wood: 0.1,  harsh: 0.15, type: "fen" },
    swamp:              { food: 0.2,  game: 0.1,  water: 0.8,  wood: 0.3,  harsh: 0.3,  type: "fen" },
    mangrove:           { food: 0.5,  game: 0.3,  water: 0.6,  wood: 0.5,  harsh: 0.2,  type: "fen" },
    "mushroom-grove":   { food: 0.4,  game: 0.05, water: 0.1,  wood: 0.1,  harsh: 0.1,  type: "fungal" },
    "fungal-forest":    { food: 0.4,  game: 0.1,  water: 0.1,  wood: 0.4,  harsh: 0.2,  type: "fungal" },
    "mycelial-network": { food: 0.5,  game: 0.05, water: 0.1,  wood: 0.2,  harsh: 0.25, type: "fungal" },
};
export const landOf = (kind) => LAND[kind] || LAND.bare;
const LOOSE_FAMILY = { grass: "grass", water: "aquatic", snow: "ice" };
export const landFamily = (kind) => TERRAIN[kind]?.family || LOOSE_FAMILY[kind] || "bare";

// Puddles and snow don't stop anyone: they drain and melt once people live there
const FLEETING = new Set(["water", "snow"]);
const settledKind = (kind) => FLEETING.has(kind) ? "bare" : kind;
export const willClear = (s, tiles) => tiles.some(id => FLEETING.has(tileKind(s, id)));
export const bareTiles = (kinds) => kinds.filter(kind => kind === "bare").length;

// Dry, buildable ground only: no open water, reef, marsh, glacier or old growth under the huts
export const CENTER_KINDS = new Set(["bare", "grass", "forest", "dense-forest", "ice-field", "mushroom-grove"]);
const MIN_DRY_TILES = 3;

// A type's first job to replace a baseline one wins; what else it gives is in text
export const TYPES = {
    pastoral: { name: "Pastoral", color: "#b5d65a", needs: 2 },
    wooded:   { name: "Wooded",   color: "#6fae5b", needs: 2 },
    fishing:  { name: "Fishing",  color: "#5fb8d9", needs: 2, text: "Fresh water close by: +25% from Water Carriers", mods: { carry: 0.25 } },
    harbor:   { name: "Harbor",   color: "#4a8fd9", needs: 2 },
    fen:      { name: "Fen",      color: "#7f9a6a", needs: 2 },
    frost:    { name: "Frost",    color: "#bfe0f0", needs: 2, text: "Food keeps: +50% food storage, -10% growth", mods: { storage: 0.5, growth: -0.1 } },
    fungal:   { name: "Fungal",   color: "#c9a8e0", needs: 2 },
    frontier: { name: "Frontier", color: "#c8a27a", needs: Infinity, text: "Nothing special here, so everyone moves on quickly: +15% growth", mods: { growth: 0.15 } },
};
const TYPE_WEIGHT_BY_TIER = [1, 1, 1.5, 2];
const MOST_TYPES = 3;

export const QUALITY = {
    ideal:     { name: "Ideal",     min: 0.85,      output: 1.1,  growth: 1.3,  color: "#7fd46a" },
    favorable: { name: "Favorable", min: 0.65,      output: 1.05, growth: 1.1,  color: "#b5d65a" },
    adequate:  { name: "Adequate",  min: 0.45,      output: 1,    growth: 1,    color: "#e0c35a" },
    harsh:     { name: "Harsh",     min: 0.25,      output: 0.85, growth: 0.4,  color: "#e08a4f" },
    doomed:    { name: "Doomed",    min: -Infinity, output: 0.7,  growth: 0.15, color: "#d9534f" },
};
const qualityFor = (score) => Object.keys(QUALITY).find(id => score >= QUALITY[id].min);

// Each reading helps up to "full"; past "over" it turns against the site
export const FACTORS = {
    food:  { name: "Food",     full: 2.5, weight: 0.4 },
    water: { name: "Water",    full: 1.5, weight: 0.35,  over: 2.6, overName: "Too wet",   overCost: 0.6 },
    wood:  { name: "Wood",     full: 1.5, weight: 0.25,  over: 4.5, overName: "Overgrown", overCost: 0.3 },
    harsh: { name: "Hardship", full: 1,   weight: -0.6,  over: 0.4, overName: "Too harsh", overCost: 0.8 },
};

export function factorReading(key, value) {
    const f = FACTORS[key];
    const scale = Math.max(f.full, (f.over || 0) * 1.3);
    return {
        fill: Math.min(1, value / scale),
        mark: f.over ? f.over / scale : null,
        over: f.over != null && value > f.over,
    };
}

export function territoryOf(centerId) {
    const center = tileById(centerId);
    if (!center) return null;
    const around = neighborsOf(center).map(n => tileById(n.id));
    return around.every(Boolean) ? [centerId, ...around.map(n => n.id)] : null;
}

export const settlementOn = (id) => settlements().find(t => t.tiles.includes(id)) || null;
const touchesTerritory = (id) => settlementOn(id) || neighborsOf(tileById(id)).some(n => settlementOn(n.id));

// Why a tile can't be a settlement's center, or null when it can
function siteProblem(s, id) {
    if (!isClaimed(s, id)) return "Unclaimed land.";
    const kind = settledKind(tileKind(s, id));
    if (!CENTER_KINDS.has(kind)) return `Nobody can build on ${TERRAIN[kind].name.toLowerCase()}.`;
    const tiles = territoryOf(id);
    if (!tiles || tiles.some(t => !isClaimed(s, t))) return "All six tiles around it have to be claimed.";
    if (tiles.some(touchesTerritory)) return "Too close to another settlement.";
    if (tiles.some(t => isRazing(s, t) || fireOn(s, t))) return "The land around it is being razed or burning.";
    if (tiles.filter(t => TERRAIN[settledKind(tileKind(s, t))].madeOf !== "water").length < MIN_DRY_TILES) {
        return "Too little dry land around it.";
    }
    return null;
}

export const isCandidate = (s, id) => siteProblem(s, id) === null;
export const candidateSites = (s = worldState()) => Object.keys(s.tiles || {}).filter(id => isCandidate(s, id));

export function evaluateSite(s, centerId) {
    const tiles = territoryOf(centerId);
    const kinds = Object.fromEntries(tiles.map(id => [id, settledKind(tileKind(s, id))]));
    return { center: centerId, tiles, kinds, ...judgeLand(Object.values(kinds)) };
}

// The same verdict from the kinds alone, so a founded settlement can be read back from its snapshot
function judgeLand(kinds) {
    const sum = (key) => kinds.reduce((total, kind) => total + landOf(kind)[key], 0);
    const parts = { food: sum("food"), game: sum("game"), water: sum("water"), wood: sum("wood"), harsh: sum("harsh") / kinds.length };
    const families = new Set(kinds.map(kind => landOf(kind).type).filter(Boolean)).size;
    let score = Math.min(0.1, 0.03 * Math.max(0, families - 1));
    for (const key in FACTORS) {
        const f = FACTORS[key];
        score += f.weight < 0 ? f.weight * parts[key] : f.weight * Math.min(1, parts[key] / f.full);
        if (f.over) score -= f.overCost * Math.max(0, parts[key] - f.over);
    }

    const weights = {};
    for (const kind of kinds) {
        const type = landOf(kind).type;
        if (type) weights[type] = (weights[type] || 0) + TYPE_WEIGHT_BY_TIER[tierOf(kind)];
    }
    const types = Object.keys(weights)
        .filter(type => weights[type] >= TYPES[type].needs)
        .sort((a, b) => weights[b] - weights[a])
        .slice(0, MOST_TYPES);

    return { parts, score, quality: qualityFor(score), types: types.length ? types : ["frontier"] };
}


//    !!! SIZE !!!

// Placeholder thresholds, in population
const TIERS = [
    { name: "Settlement", from: 0 },
    { name: "Hamlet",     from: 10 },
    { name: "Village",    from: 50 },
    { name: "Small Town", from: 500 },
    { name: "Town",       from: 2000 },
    { name: "Large Town", from: 5000 },
    { name: "City",       from: 20000 },
    { name: "Large City", from: 100000 },
    { name: "Metropolis", from: 1e6 },
];
export const sizeOf = (t) => TIERS.filter(tier => t.pops >= tier.from).pop();
export const nextSize = (t) => TIERS.find(tier => tier.from > t.pops) || null;

// How many stone-age people can keep together; language raises it
const KNOWN_LIMIT = 25;
const BASE_SHELTER = 2;

const BORDER_COLORS = ["#e0735a", "#5ab4e0", "#b67ae0", "#5ad0a0", "#e07ab4", "#7a8ce0"];
export const borderColor = (t) => BORDER_COLORS[t.hue];


//    !!! JOBS !!!

// Every settlement gathers and hunts; its land can swap either for something better. Per pop, per second
export const JOBS = {
    gatherer:   { role: "gather", name: "Gatherer",        food: 0.1, materials: 0.02, text: "Berries, roots and nuts. Anyone without a job gathers" },
    nutter:     { role: "gather", name: "Nut Gatherer",    food: 0.12, materials: 0.025, types: ["wooded"], text: "Acorns and hazelnuts, cracked and roasted" },
    reedCutter: { role: "gather", name: "Reed Cutter",     food: 0.12, materials: 0.025, types: ["fen"], text: "Reed roots, cattails and bird eggs" },
    picker:     { role: "gather", name: "Mushroom Picker", food: 0.12, materials: 0.025, types: ["fungal"], text: "Knows which caps are safe" },
    hunter:     { role: "hunt",   name: "Hunter",          food: 0.14, materials: 0.006, text: "Spears and patience" },
    herdHunter: { role: "hunt",   name: "Herd Hunter",     food: 0.18, materials: 0.008, types: ["pastoral"], text: "Follows the herds across the grass" },
    fisher:     { role: "hunt",   name: "Spear Fisher",    food: 0.18, materials: 0.008, types: ["fishing", "harbor"], text: "Wades out and waits" },
    sealHunter: { role: "hunt",   name: "Seal Hunter",     food: 0.18, materials: 0.008, types: ["frost"], text: "Waits by the breathing holes" },
    carrier:    { role: "water",  name: "Water Carrier",   water: 0.5, text: "Walks to water and back, all day" },
};
export const ROLES = ["gather", "hunt", "water"];
const ROOM_BASE = 1;
const ROOM_PER_FOOD = 2.5;
const PAST_ROOM = 0.25;

export function jobFor(t, role) {
    for (const type of t.types) {
        const id = Object.keys(JOBS).find(id => JOBS[id].role === role && JOBS[id].types?.includes(type));
        if (id) return id;
    }
    return Object.keys(JOBS).find(id => JOBS[id].role === role && !JOBS[id].types);
}
export const upgradedJobs = (type) => Object.keys(JOBS).filter(id => JOBS[id].types?.includes(type));

export const building = (t) => Object.values(t.builders).reduce((a, b) => a + b, 0);
export const away = (t) => t.expedition?.people || 0;
export const working = (t, role) => role === "gather"
    ? t.pops - building(t) - away(t) - Object.values(t.work).reduce((a, b) => a + b, 0)
    : t.work[role] || 0;
export const idle = (t) => working(t, "gather");

// Past its room, a job is picking over what's already been picked
export function roomFor(t, role) {
    if (role === "water") return Infinity;
    const parts = judgeLand(Object.values(t.kinds)).parts;
    const food = role === "hunt" ? parts.game : parts.food - parts.game;
    return Math.round(ROOM_BASE + ROOM_PER_FOOD * food) + (projectEffects(t).room[role] || 0);
}

export const canAssign = (t, role) => role !== "gather" && idle(t) >= 1;
export const canUnassign = (t, role) => role !== "gather" && working(t, role) > 0;
export function assign(t, role) {
    if (canAssign(t, role)) t.work[role] = working(t, role) + 1;
}
export function unassign(t, role) {
    if (canUnassign(t, role)) t.work[role] -= 1;
}


//    !!! PROJECTS !!!

const innovationKnown = (id) => !!getLayerState("knowledge").innovations?.[id];

// Work is in pop-seconds, essence is paid when the first pop starts on it
const BUILDING = { work: 300, essence: [3e52, 3e52], materials: 45 };
const LATER_BUILDING = { tier: 2, work: 600, essence: [3e53, 3e53], materials: 90 };
// Found at home when at least two of the settlement's tiles are their land, or learned on expeditions
const DISCOVERY = { tier: 1, work: 600, essence: [1e53, 1e53], materials: 30 };
const SHELTER_PROJECT = "shelter";
const SCOUTING_POPS = 8;
export const PROJECTS = {
    shelter:  { name: "Build Shelter", text: "+1 shelter", tier: 0, shelter: 1,
                work: 60, scale: 1.35, essence: [1e52, 1e52], essenceScale: 5, materials: 5 },
    scouting: { name: "Scout the Surroundings", text: "Unlocks expeditions", tier: 0,
                needs: (t) => t.pops >= SCOUTING_POPS, work: 400, essence: [3e52, 3e52], materials: 40 },

    waterStore: { name: "Dig a Water Pit", text: "+15 water storage", tier: 1, waterStore: 15, ...BUILDING },
    foodStore:  { name: "Construct a Food Store", text: "+20 food storage", tier: 1, storage: 20, ...BUILDING },
    hearth:     { name: "Build a Shared Hearth", text: "+15% growth", tier: 1, mods: { growth: 0.15 }, ...BUILDING },
    meeting:    { name: "Build a Meeting Place", text: "Projects go 20% faster, +150 materials storage", tier: 1,
                  mods: { build: 0.2 }, materialStore: 150, ...BUILDING },
    trails:     { name: "Clear Foraging Trails", text: "+20% food from gathering jobs", tier: 1, jobs: { gather: 0.2 }, ...BUILDING },
    lookout:    { name: "Build a Lookout", text: "+20% food from hunting jobs", tier: 1, jobs: { hunt: 0.2 }, ...BUILDING },

    racks:      { name: "Build Drying Racks", text: "+25 food storage", storage: 25, ...LATER_BUILDING },
    smokeHut:   { name: "Build a Smoking Hut", text: "+25% food storage", needs: () => innovationKnown("preserving"),
                  mods: { storage: 0.25 }, ...LATER_BUILDING },
    firingPit:  { name: "Dig a Firing Pit", text: "+20 water storage", needs: () => innovationKnown("pottery"), waterStore: 20, ...LATER_BUILDING },
    weir:       { name: "Build a Fish Weir", text: "+25% food from Spear Fishers, +2 hunting room",
                  needs: (t) => innovationKnown("nets") && jobFor(t, "hunt") === "fisher", jobs: { fisher: 0.25 }, room: { hunt: 2 },
                  ...LATER_BUILDING },

    fibers:     { name: "Discovery: Useful Fibers", text: "+25% food from Reed Cutters, +1 gathering room",
                  lands: ["wetlands", "grass"], jobs: { reedCutter: 0.25 }, room: { gather: 1 }, ...DISCOVERY },
    fishing:    { name: "Discovery: Fishing Techniques", text: "+25% food from Spear Fishers, +1 hunting room",
                  lands: ["aquatic", "reef"], jobs: { fisher: 0.25 }, room: { hunt: 1 }, ...DISCOVERY },
    tracking:   { name: "Discovery: Animal Tracking", text: "+25% food from Hunters, +1 hunting room",
                  lands: ["woodland", "grass"], jobs: { hunter: 0.25, herdHunter: 0.25, sealHunter: 0.25 }, room: { hunt: 1 }, ...DISCOVERY },
    nutCaches:  { name: "Discovery: Nut Caches", text: "+25% food from Nut Gatherers, +1 gathering room",
                  lands: ["woodland"], jobs: { nutter: 0.25 }, room: { gather: 1 }, ...DISCOVERY },
    wildGrains: { name: "Discovery: Wild Grains", text: "+20% food from gathering jobs, +1 gathering room",
                  lands: ["grass"], jobs: { gather: 0.2 }, room: { gather: 1 }, ...DISCOVERY },
    mushrooms:  { name: "Discovery: Mushroom Lore", text: "+25% food from Mushroom Pickers, +1 gathering room",
                  lands: ["fungus"], jobs: { picker: 0.25 }, room: { gather: 1 }, ...DISCOVERY },
    iceFishing: { name: "Discovery: Ice Fishing", text: "+25% food from Seal Hunters, +1 hunting room",
                  lands: ["ice"], jobs: { sealHunter: 0.25 }, room: { hunt: 1 }, ...DISCOVERY },
    shellfish:  { name: "Discovery: Shellfish Beds", text: "+15% food from gathering jobs, +1 gathering room",
                  lands: ["reef", "aquatic"], jobs: { gather: 0.15 }, room: { gather: 1 }, ...DISCOVERY },
    roots:      { name: "Discovery: Edible Roots", text: "+10% food from gathering jobs, +1 gathering room",
                  lands: ["grass", "woodland", "wetlands"], jobs: { gather: 0.1 }, room: { gather: 1 }, ...DISCOVERY },
    herbs:      { name: "Discovery: Healing Herbs", text: "+15% growth",
                  lands: ["woodland", "wetlands", "fungus"], mods: { growth: 0.15 }, ...DISCOVERY },
    flint:      { name: "Discovery: Flint", text: "+10% food from hunting jobs, +50 materials storage",
                  lands: ["bare", "grass"], jobs: { hunt: 0.1 }, materialStore: 50, ...DISCOVERY },
    clay:       { name: "Discovery: Riverbank Clay", text: "+5 water storage",
                  lands: ["wetlands", "aquatic"], waterStore: 5, ...DISCOVERY },
    ochre:      { name: "Discovery: Red Ochre", text: "+5% growth",
                  lands: ["bare", "wetlands"], mods: { growth: 0.05 }, ...DISCOVERY },
    tinder:     { name: "Discovery: Tinder Fungus", text: "Expeditions travel 10% faster",
                  lands: ["woodland", "fungus"], mods: { pace: 0.1 }, ...DISCOVERY },
    resin:      { name: "Discovery: Tree Resin", text: "+10 water storage",
                  lands: ["woodland"], waterStore: 10, ...DISCOVERY },
    saltLicks:  { name: "Discovery: Salt Licks", text: "+1 hunting room",
                  lands: ["bare", "aquatic", "reef"], room: { hunt: 1 }, ...DISCOVERY },
    reeds:      { name: "Discovery: Hollow Reeds", text: "+1 gathering room, +50 materials storage",
                  lands: ["wetlands", "aquatic"], room: { gather: 1 }, materialStore: 50, ...DISCOVERY },
    springs:    { name: "Discovery: Hidden Springs", text: "+0.3 water a second from springs",
                  lands: ["bare", "ice"], far: true, spring: 0.3, ...DISCOVERY },
    stars:      { name: "Discovery: Star Paths", text: "Expeditions travel 25% faster",
                  lands: ["bare", "grass", "ice"], far: true, mods: { pace: 0.25 }, ...DISCOVERY },
};
const FIXED_PROJECTS = [SHELTER_PROJECT, "scouting"];
const BUILD_SLOTS = 2;
const DISCOVERY_SLOTS = 1;
export const isDiscovery = (id) => !!PROJECTS[id]?.lands;
export const discoveryName = (id) => PROJECTS[id].name.replace("Discovery: ", "");
export const discoveriesMade = (t) => Object.keys(PROJECTS).filter(id => isDiscovery(id) && projectsDone(t, id) > 0);

const projectOf = (t, id) => t.projects[id] || (t.projects[id] = { done: 0, progress: 0, paid: false });
export const projectsDone = (t, id) => t.projects[id]?.done || 0;
const finished = (t, id) => id === SHELTER_PROJECT ? shelter(t) >= knownLimit(t) : projectsDone(t, id) > 0;

const HOME_TILES = 2;
const foundAtHome = (t, def) => !def.far
    && Object.values(t.kinds).filter(kind => def.lands.includes(landFamily(kind))).length >= HOME_TILES;
const available = (t, id) => {
    const def = PROJECTS[id];
    return (!def.needs || def.needs(t)) && (!def.lands || foundAtHome(t, def));
};

// Rolls from the lowest tier that still has something new to offer
function rollProject(t, discovering) {
    const open = Object.keys(PROJECTS).filter(id => PROJECTS[id].tier > 0 && isDiscovery(id) === discovering
        && !finished(t, id) && !t.offered.includes(id) && available(t, id));
    if (!open.length) return null;
    const tier = Math.min(...open.map(id => PROJECTS[id].tier));
    const pool = open.filter(id => PROJECTS[id].tier === tier);
    return pool[Math.floor(Math.random() * pool.length)];
}

function refillOffers(t) {
    t.offered = (t.offered || []).map(id => id && PROJECTS[id] && !finished(t, id) ? id : null);
    while (t.offered.length < BUILD_SLOTS + DISCOVERY_SLOTS) t.offered.push(null);
    t.offered.forEach((id, i) => { if (!id) t.offered[i] = rollProject(t, i >= BUILD_SLOTS); });
}

export const projectsOffered = (t) => [
    ...FIXED_PROJECTS.filter(id => !finished(t, id) && available(t, id)),
    ...t.offered.filter(Boolean),
];

export const projectNeed = (t, id) => PROJECTS[id].work * (PROJECTS[id].scale || 1) ** projectsDone(t, id);
export const projectProgress = (t, id) => t.projects[id]?.progress || 0;
export const projectPaid = (t, id) => !!t.projects[id]?.paid;
export const builders = (t, id) => t.builders[id] || 0;

export function projectEssence(t, id) {
    const def = PROJECTS[id];
    const scale = D(def.essenceScale || 1).pow(projectsDone(t, id));
    return { greenEssence: D(def.essence[0]).mul(scale), blueEssence: D(def.essence[1]).mul(scale) };
}

export const projectMaterials = (t, id) =>
    Math.ceil((PROJECTS[id].materials || 0) * (PROJECTS[id].scale || 1) ** projectsDone(t, id));

const canPayFor = (t, id) => t.materials >= projectMaterials(t, id) && canAfford(projectEssence(t, id));
function payFor(t, id) {
    if (!canPayFor(t, id)) return false;
    spend(projectEssence(t, id));
    t.materials -= projectMaterials(t, id);
    return true;
}

export const canAddBuilder = (t, id) => idle(t) >= 1 && projectsOffered(t).includes(id)
    && (projectPaid(t, id) || canPayFor(t, id));
export function addBuilder(t, id) {
    if (!canAddBuilder(t, id)) return;
    if (!projectPaid(t, id)) {
        if (!payFor(t, id)) return;
        projectOf(t, id).paid = true;
    }
    t.builders[id] = builders(t, id) + 1;
}
export function removeBuilder(t, id) {
    if (builders(t, id) > 0) t.builders[id] -= 1;
    if (!t.builders[id]) delete t.builders[id];
}

function workOnProjects(t, pace, dt) {
    for (const id in t.builders) {
        if (!PROJECTS[id] || !projectsOffered(t).includes(id)) { delete t.builders[id]; continue; }
        const p = projectOf(t, id);
        p.progress += t.builders[id] * pace * dt;
        if (p.progress >= projectNeed(t, id)) complete(t, id);
    }
}

function complete(t, id) {
    const p = projectOf(t, id);
    p.done += 1;
    p.progress = 0;
    p.paid = id === SHELTER_PROJECT && !finished(t, id) && payFor(t, id);
    if (!p.paid) delete t.builders[id];
}

// Returns whether that finished it
export function learn(t, id, amount) {
    if (!isDiscovery(id) || finished(t, id)) return false;
    const p = projectOf(t, id);
    p.progress += amount;
    if (p.progress < projectNeed(t, id)) return false;
    complete(t, id);
    return true;
}

// Anything besides projects that improves every settlement, e.g. innovations
const effectSources = [];
export const addEffectSource = (source) => effectSources.push(source);

function projectEffects(t) {
    const total = { shelter: 0, storage: 0, waterStore: 0, materialStore: 0, spring: 0, limit: 0, room: {}, jobs: {}, mods: { growth: 0 } };
    const add = (def, times) => {
        for (const key of ["shelter", "storage", "waterStore", "materialStore", "spring", "limit"]) total[key] += (def[key] || 0) * times;
        for (const group of ["room", "jobs", "mods"]) {
            for (const key in def[group]) total[group][key] = (total[group][key] || 0) + def[group][key] * times;
        }
    };
    for (const id in t.projects) if (PROJECTS[id] && t.projects[id].done) add(PROJECTS[id], t.projects[id].done);
    for (const source of effectSources) for (const def of source(t)) add(def, 1);
    return total;
}

export const shelter = (t) => BASE_SHELTER + projectEffects(t).shelter;
export const knownLimit = (t) => KNOWN_LIMIT + projectEffects(t).limit;
const popLimit = (t) => Math.min(shelter(t), knownLimit(t));


//    !!! LIVING !!!

const EATEN = 0.1;
const DRUNK = 0.1;
const BASE_STORAGE = 20;
const BASE_WATER_STORE = 10;
const BASE_MATERIAL_STORE = 300;
const SPRING = 0.2;
const SPRING_PER_LAND = 0.15;
// Rain and snow on a settlement's ground fill its springs, per tile of it soaked through
const SPRING_PER_SOAKED = 0.1;
const FOOD_PER_POP = 60;
const STARVE_PER_SECOND = 1 / 120;
// Sticks picked up around camp, per pop at home
const ACQUIRED_PER_WOOD = 0.005;

export function modsOf(t) {
    const total = { food: 0, carry: 0, storage: 0, ...projectEffects(t).mods };
    for (const type of t.types) for (const key in TYPES[type].mods) total[key] = (total[key] || 0) + TYPES[type].mods[key];
    return total;
}

// Short on water, everything suffers, and growth most of all
const thirstOutput = (ratio) => ratio >= 1 ? 1 : Math.max(0.15, ratio * ratio);
const thirstGrowth = (ratio) => ratio >= 1 ? 1 : ratio ** 4;

// What one pop in a job makes, after the land and the settlement's bonuses
export function jobYield(t, id) {
    const def = JOBS[id];
    const mods = modsOf(t);
    const jobs = projectEffects(t).jobs;
    if (def.water) return { water: def.water * (1 + mods.carry) };
    const bonus = 1 + mods.food + (jobs[def.role] || 0) + (jobs[id] || 0);
    const output = QUALITY[t.quality].output;
    return { food: def.food * bonus * output, materials: def.materials * output };
}

const effective = (count, room) => Math.min(count, room) + PAST_ROOM * Math.max(0, count - room);

export function economy(t) {
    const mods = modsOf(t);
    const effects = projectEffects(t);
    const quality = QUALITY[t.quality];
    const jobs = Object.fromEntries(ROLES.map(role => [role, jobFor(t, role)]));
    const room = { gather: roomFor(t, "gather"), hunt: roomFor(t, "hunt") };

    const land = judgeLand(Object.values(t.kinds)).parts;
    const home = t.pops - away(t);
    const soaked = SPRING_PER_SOAKED * t.tiles.reduce((total, id) => total + buildupTotalOn(worldState(), id), 0);
    const spring = SPRING + SPRING_PER_LAND * land.water + effects.spring + soaked;
    const waterMade = spring + working(t, "water") * jobYield(t, "carrier").water;
    const drunk = home * DRUNK;
    const waterNet = waterMade - drunk;
    const waterStore = BASE_WATER_STORE + effects.waterStore;
    const waterRatio = t.water > 0 || waterNet >= 0 ? 1 : waterMade / Math.max(drunk, 1e-9);
    const thirst = thirstOutput(waterRatio);

    const made = (key) => ["gather", "hunt"].reduce((total, role) =>
        total + effective(working(t, role), room[role]) * jobYield(t, jobs[role])[key], 0) * thirst;
    const gathered = made("food");
    const eaten = home * EATEN;
    const food = gathered - eaten;
    const storage = (BASE_STORAGE + effects.storage) * (1 + mods.storage);
    const materials = made("materials") + home * ACQUIRED_PER_WOOD * land.wood;
    const materialStore = BASE_MATERIAL_STORE + effects.materialStore;

    // The land stops growth before it would have to starve someone
    const newcomer = Math.max(...["gather", "hunt"].map(role =>
        jobYield(t, jobs[role]).food * (working(t, role) < room[role] ? 1 : PAST_ROOM))) * thirst;
    const crowded = food + newcomer < EATEN;

    const limit = popLimit(t);
    const growth = t.pops >= limit || food <= 0 || crowded ? 0
        : (food / FOOD_PER_POP) * quality.growth * Math.max(0.1, 1 + mods.growth) * thirstGrowth(waterRatio);
    return { jobs, room, limit, eaten, gathered, food, storage, materials, materialStore, spring, soaked, waterMade, drunk, waterNet, waterStore,
             waterRatio, thirst, growth, crowded };
}

export function tickSettlements(dt) {
    for (const t of [...settlements()]) tickOne(t, dt);
}

function tickOne(t, dt) {
    const e = economy(t);
    t.food = Math.min(e.storage, Math.max(0, t.food + e.food * dt));
    t.water = Math.min(e.waterStore, Math.max(0, t.water + e.waterNet * dt));
    t.materials = Math.min(e.materialStore, t.materials + e.materials * dt);
    t.age += dt;
    refillOffers(t);
    workOnProjects(t, e.thirst * (1 + (modsOf(t).build || 0)), dt);

    t.starving = e.food < 0 && t.food <= 0;
    if (t.starving) {
        const short = Math.min(1, -e.food / Math.max(e.eaten, 1e-9));
        t.growth = Math.min(0, t.growth) - STARVE_PER_SECOND * short * dt;
        if (t.growth <= -1) {
            t.growth += 1;
            loseOne(t);
        }
    } else if (e.growth > 0) {
        t.growth = Math.max(0, t.growth) + e.growth * dt;
        if (t.growth >= 1) {
            t.growth -= 1;
            gainOne(t);
        }
    } else if (t.growth < 0) {
        t.growth = Math.min(0, t.growth + STARVE_PER_SECOND * dt);
    }
}

// A new pop gathers unless the settlement is short on water or the gathering is crowded
function placeNewPop(t) {
    if (idle(t) < 1) return;
    const e = economy(t);
    if (e.waterNet < 0) return assign(t, "water");
    const slack = (role) => e.room[role] - working(t, role);
    if (slack("hunt") > slack("gather") - 1) assign(t, "hunt");
}

function gainOne(t) {
    t.pops += 1;
    t.peak = Math.max(t.peak, t.pops);
    placeNewPop(t);
}

function loseOne(t) {
    t.pops -= 1;
    if (idle(t) < 0) {
        const most = Object.keys(t.work).sort((a, b) => t.work[b] - t.work[a])[0];
        if (most && t.work[most] > 0) t.work[most] -= 1;
        else {
            const project = Object.keys(t.builders)[0];
            if (project) removeBuilder(t, project);
        }
    }
    if (t.pops <= 0) removeSettlement(t.id, true);
}

export function removeSettlement(id, diedOut = false) {
    const s = settlementState();
    const index = s.settlements.findIndex(t => t.id === id);
    if (index < 0) return null;
    const [t] = s.settlements.splice(index, 1);
    if (s.activeSettlement >= index) s.activeSettlement = Math.max(0, s.activeSettlement - 1);
    if (diedOut) s.fallen.push({ name: t.name, types: t.types, age: t.age, peak: t.peak });
    return t;
}


//    !!! FOUNDING !!!

const FOUNDING_ESSENCE = [1e61, 1e61];
const FOUNDING_SCALE = 100;
const FOUNDING_MATERIALS = 1000;
export const foundCost = () => {
    const count = settlements().length;
    if (count === 0) return {};
    const scale = D(FOUNDING_SCALE).pow(count - 1);
    return { greenEssence: D(FOUNDING_ESSENCE[0]).mul(scale), blueEssence: D(FOUNDING_ESSENCE[1]).mul(scale) };
};
export const foundMaterials = () => settlements().length ? FOUNDING_MATERIALS : 0;
export const canPayFounding = () => (activeSettlement()?.materials || 0) >= foundMaterials() && canAfford(foundCost());

const STARTING_POPS = 2;
const STARTING_FOOD = 20;
const STARTING_WATER = 10;

export function foundSettlement(site, name) {
    const s = settlementState();
    const world = worldState();
    if (!isCandidate(world, site.center) || !canPayFounding()) return null;
    const payer = activeSettlement();
    if (payer) payer.materials -= foundMaterials();
    spend(foundCost());

    const judged = evaluateSite(world, site.center);
    for (const id of judged.tiles) {
        if (FLEETING.has(tileKind(world, id))) setTerrain(world, id, "bare");
        if (world.razing) delete world.razing[id];
        if (world.fires) delete world.fires[id];
    }

    const hues = new Set(settlements().map(other => other.hue));
    const t = {
        id: settlements().reduce((most, other) => Math.max(most, other.id), 0) + 1,
        name,
        center: judged.center,
        tiles: judged.tiles,
        kinds: judged.kinds,
        types: judged.types,
        quality: judged.quality,
        score: judged.score,
        hue: Math.max(0, BORDER_COLORS.findIndex((_, i) => !hues.has(i))),
        age: 0,
        pops: 0,
        peak: 0,
        growth: 0,
        food: STARTING_FOOD,
        water: STARTING_WATER,
        materials: 0,
        starving: false,
        work: {},
        builders: {},
        projects: {},
        offered: [],
    };
    for (let i = 0; i < STARTING_POPS; i++) gainOne(t);
    s.settlements.push(t);
    s.activeSettlement = s.settlements.length - 1;
    s.siting = false;
    s.siteChoice = null;
    return t;
}


//    !!! HISTORICAL PROTECTION !!!

let guardedKey = null;
let guarded = new Set();
const protectedIds = () => {
    const list = settlements();
    const key = list.map(t => t.center).join();
    if (key !== guardedKey) {
        guarded = new Set(list.flatMap(t => t.tiles));
        guardedKey = key;
    }
    return guarded;
};
contributeTileGuard("settlements", (id) => protectedIds().has(id));


//    !!! TENDED LAND !!!

// Each tenfold of people adds x1.5 to everything their seven tiles make
const TENDED_PER_DECADE = 1.5;
const MOST_TENDED = 10;
export const tended = (t) => Math.min(MOST_TENDED, 1 + TENDED_PER_DECADE * Math.log10(1 + t.pops));
contributeTileCare("settlements", (s, id) => protectedIds().has(id) ? tended(settlementOn(id)) : 1);
