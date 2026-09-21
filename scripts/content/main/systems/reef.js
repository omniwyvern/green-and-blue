// reef.js
//
// Sites hold rocks and kelp, each feature meets one fish need, and events give boosts

import { getLayerState } from "../../../core/state.js";
import { spend, addResource, levelsIn } from "../../../core/resources.js";
import { registerBoost } from "../../../core/boosts.js";
import { traitBonus } from "./evolutionTraits.js";
import { D } from "../../../utils/decimal.js";
import { clamp } from "../../../utils/math.js";
import {
    worldState, countOf, tileKind, tileById, neighboringTiles, kindIsOcean,
    contributeTileOutput, contributeNeighborBoost, soften, REEF_KINDS,
} from "./worldMap.js";
import { SPECIES, unlockedSchools, drawInSchool } from "../sublayers/oceanSublayer.js";

export const reefState = () => getLayerState("reef");
const level = levelsIn("reef");


//    !!! HOW MUCH REEF THERE IS !!!

export const reefOpen = (world = worldState()) => countOf(REEF_KINDS, world) > 0;


//    !!! PIECES AND CHARACTERISTICS !!!

export const SIZES = {
    small: { name: "Small", slots: 1, price: 1 },
    medium: { name: "Medium", slots: 2, price: 5 },
    large: { name: "Large", slots: 3, price: 25 },
};

export const PIECES = {
    smallRock: { name: "Small Rock", size: "small", kind: "rock",
        blurb: "A loose stone off the seabed. Room for one characteristic.",
        cost: { blueEssence: D(2e27) } },

    mediumRock: { name: "Medium Rock", size: "medium", kind: "rock",
        blurb: "A boulder big enough to hide behind. Room for two characteristics.",
        cost: { blueEssence: D(1e28), greenEssence: D(4e27) } },

    largeRock: { name: "Large Rock", size: "large", kind: "rock",
        blurb: "A tall outcrop. Room for three characteristics.",
        cost: { blueEssence: D(5e28), greenEssence: D(2e28) } },

    kelp: { name: "Kelp", kind: "kelp",
        blurb: "Kelp in the sand. Can't be shaped, but some fish love it.",
        cost: { greenEssence: D(4e28) } },
};

export const PIECE_IDS = Object.keys(PIECES);

export const TRAITS = {
    crevice: { name: "Crevice", one: "crevice", many: "crevices",
        blurb: "A crack running into the stone, just wide enough to back into." },

    sheltered: { name: "Sheltered", one: "sheltered rock", many: "sheltered rocks", clash: "exposed",
        blurb: "A sheltered pocket out of the current." },

    exposed: { name: "Exposed", one: "exposed rock", many: "exposed rocks", clash: "sheltered",
        blurb: "Flat on top, out in open water." },

    algae: { name: "Algae", one: "algae rock", many: "algae rocks",
        blurb: "Grown over with something green to graze on.",
        cost: { greenEssence: D(8e26) } },
};

export const TRAIT_IDS = Object.keys(TRAITS);

const TRAIT_COST = { blueEssence: D(6e26) };

export const traitCost = (pieceId, traitId) => {
    const price = SIZES[PIECES[pieceId].size]?.price || 1;
    const base = TRAITS[traitId]?.cost || TRAIT_COST;
    const cost = {};
    for (const id in base) cost[id] = base[id].mul(price);
    return cost;
};

export const slotsOf = (pieceId) => SIZES[PIECES[pieceId].size]?.slots || 0;


//    !!! WHAT OPENS WHEN !!!

const STARTING = ["smallRock", "crevice", "sheltered"];

// Checked every tick and kept once reached, so losing the condition later takes nothing back
const UNLOCKS = {
    mediumRock: { hint: "Keep the Cod settled for 20 seconds",
        met: (s) => (s.reefSettledTime.cod || 0) >= 20 },
    exposed: { hint: "Have 3 pieces on the reef at once",
        met: (s) => placedCount(s) >= 3 },
    algae: { hint: "Answer an event",
        met: (s) => s.reefAnswered >= 1 },
    largeRock: { hint: "Have 2 species settled at once. Mackerel come to the reef with it",
        met: (s) => settledCount(s) >= 2 },
    kelp: { hint: "Have 3 species settled at once",
        met: (s) => settledCount(s) >= 3 },
};

export const isUnlocked = (id, s = reefState()) =>
    STARTING.includes(id) || !!s.reefUnlocks?.[id];

export const unlockHint = (id) => UNLOCKS[id]?.hint || "";


//    !!! THE FISH !!!

// A need is some count of one size of rock with one characteristic, or some count of a piece
const need = (count, size, trait) => ({ count, size, trait });
const pieceNeed = (count, piece) => ({ count, piece });

export const HABITAT = {
    cod: {
        needs: [need(2, "small", "crevice"), need(1, "small", "sheltered")],
        settled: { name: "Home Waters", resource: "blueEssence", base: 1.9 },
        boost: { name: "Teeming Shoals", resource: "biomass", base: 3 },
        events: {
            overpopulation: { name: "Overpopulation",
                blurb: "Too many cod, not enough cover.",
                needs: [need(2, "small", "exposed")] },
            coldSnap: { name: "Cold Snap",
                blurb: "Cold water is coming in. The cod want deep cover.",
                needs: [need(2, "large", "crevice")] },
        },
    },
    herring: {
        needs: [need(1, "medium", "algae"), need(1, "medium", "sheltered")],
        settled: { name: "Quiet Shallows", resource: "greenEssence", base: 1.9 },
        boost: { name: "Silver Tide", resource: "blueEssence", base: 4 },
        events: {
            stormSurge: { name: "Storm Surge",
                blurb: "Rough water. The shoal wants shelter.",
                needs: [need(2, "medium", "sheltered")] },
            spawningRun: { name: "Spawning Run",
                blurb: "The herring are spawning, and want kelp to lay against.",
                needs: [pieceNeed(2, "kelp")] },
        },
    },
    mackerel: {
        needs: [need(1, "large", "algae"), need(1, "large", "exposed")],
        settled: { name: "Hunting Grounds", resource: "biomass", base: 1.5 },
        boost: { name: "Chasing Bait", resource: "greenEssence", base: 4 },
        events: {
            baitBall: { name: "Bait Ball",
                blurb: "A bait ball is here, and the mackerel want room to hunt.",
                needs: [need(2, "medium", "exposed")] },
            warmCurrent: { name: "Warm Current",
                blurb: "Warm water. The mackerel want kelp and shade.",
                needs: [pieceNeed(1, "kelp"), need(1, "small", "sheltered")] },
        },
    },
};

export const HABITAT_IDS = Object.keys(HABITAT);

export const speciesName = (id) => SPECIES[id]?.name || id;
export const speciesColor = (id) => SPECIES[id]?.color || "#8fb6c8";

export const unlockedSpecies = () => {
    const open = unlockedSchools(getLayerState("aquatic"));
    return HABITAT_IDS.filter(id => open.some(school => school.id === id));
};

export const needText = (n) => {
    if (n.piece) return `${n.count} ${PIECES[n.piece].name.toLowerCase()}`;
    const trait = TRAITS[n.trait];
    return `${n.count} ${n.size} ${n.count === 1 ? trait.one : trait.many}`;
};

const needOpen = (n, s) => n.piece ? isUnlocked(n.piece, s)
    : isUnlocked(n.trait, s) && isUnlocked(`${n.size}Rock`, s);


//    !!! THE SITES !!!

// In opening order: x in site widths from center, y from far (0) to near (1)
export const SITES = [
    { x: 0, y: 0.5 }, { x: -1.3, y: 0.82 }, { x: 1.3, y: 0.22 },
    { x: 1.45, y: 0.86 }, { x: -1.4, y: 0.16 }, { x: -2.7, y: 0.52 }, { x: 2.75, y: 0.56 },
    { x: 0.1, y: 0 }, { x: -0.15, y: 1 }, { x: -2.65, y: 0.02 }, { x: 2.7, y: 0.04 },
    { x: -2.85, y: 0.98 }, { x: 2.9, y: 1 }, { x: -4.05, y: 0.3 }, { x: 4.05, y: 0.3 },
    { x: -4.1, y: 0.78 }, { x: 4.15, y: 0.8 }, { x: -5.35, y: 0.52 }, { x: 5.35, y: 0.55 },
    { x: -5.4, y: 0.04 }, { x: 5.45, y: 0.98 }, { x: -5.5, y: 1 }, { x: 5.4, y: 0.06 },
];

const START_SITES = 3;
const SITES_FROM_TILES = 4;

export const siteCount = (s = reefState(), world = worldState()) =>
    clamp(START_SITES + Math.min(SITES_FROM_TILES, countOf(REEF_KINDS, world))
        + Math.floor(Number(s.reefSitesAdded) || 0), START_SITES, SITES.length);

// For whatever opens more of the reef. Returns how many actually opened
export function addReefSites(count = 1, s = reefState()) {
    const before = siteCount(s);
    s.reefSitesAdded = (Number(s.reefSitesAdded) || 0) + Math.min(SITES.length, before + Math.max(0, Math.floor(count))) - before;
    return siteCount(s) - before;
}

function spots(s = reefState()) {
    if (!Array.isArray(s.reefSpots)) s.reefSpots = [];
    for (let i = 0; i < s.reefSpots.length; i++) {
        const spot = s.reefSpots[i];
        if (spot && (!PIECES[spot.piece] || !Array.isArray(spot.traits))) s.reefSpots[i] = null;
        // Characteristics that no longer exist come off, and hand back what they cost
        else if (spot && spot.traits.some(id => !TRAITS[id])) {
            for (const id of spot.traits) if (!TRAITS[id]) refund(traitCost(spot.piece));
            spot.traits = spot.traits.filter(id => TRAITS[id]);
        }
    }
    return s.reefSpots;
}

export const spotAt = (i, s = reefState()) => spots(s)[i] || null;

const placedCount = (s = reefState()) =>
    spots(s).slice(0, siteCount(s)).filter(Boolean).length;

const refund = (cost) => { for (const id in cost) addResource(id, cost[id]); };

const spotValue = (spot) => {
    const cost = { ...PIECES[spot.piece].cost };
    for (const trait of spot.traits) {
        const extra = traitCost(spot.piece, trait);
        for (const id in extra) cost[id] = cost[id] ? cost[id].add(extra[id]) : extra[id];
    }
    return cost;
};

// Removing hands back everything the spot cost, so rearranging for an event isn't punished
export function clearSpot(i, s = reefState()) {
    const spot = spotAt(i, s);
    if (!spot) return false;
    refund(spotValue(spot));
    spots(s)[i] = null;
    return true;
}

export function placePiece(i, pieceId, s = reefState()) {
    if (!PIECES[pieceId] || !isUnlocked(pieceId, s) || i >= siteCount(s)) return false;
    const old = spotAt(i, s);
    if (old && old.piece === pieceId) return false;
    if (old) refund(spotValue(old));
    if (!spend(PIECES[pieceId].cost)) {
        if (old) spend(spotValue(old));
        return false;
    }
    spots(s)[i] = { piece: pieceId, traits: [] };
    return true;
}

export const traitBlocked = (spot, traitId) => {
    const clash = TRAITS[traitId].clash;
    return !!clash && spot.traits.includes(clash);
};

export function toggleTrait(i, traitId, s = reefState()) {
    const spot = spotAt(i, s);
    if (!spot || !TRAITS[traitId]) return false;
    if (spot.traits.includes(traitId)) {
        spot.traits = spot.traits.filter(id => id !== traitId);
        refund(traitCost(spot.piece, traitId));
        return true;
    }
    if (!isUnlocked(traitId, s) || traitBlocked(spot, traitId)) return false;
    if (spot.traits.length >= slotsOf(spot.piece)) return false;
    if (!spend(traitCost(spot.piece, traitId))) return false;
    spot.traits = [...spot.traits, traitId];
    return true;
}


//    !!! WHO GETS WHAT !!!

// Each characteristic or kelp meets one need, and needs can't share
function features(s) {
    const list = [];
    spots(s).slice(0, siteCount(s)).forEach((spot, i) => {
        if (!spot) return;
        const piece = PIECES[spot.piece];
        if (piece.kind !== "rock") list.push({ spot: i, piece: spot.piece, size: null, trait: null });
        else for (const trait of spot.traits) list.push({ spot: i, piece: spot.piece, size: piece.size, trait });
    });
    return list;
}

const fits = (n, f) => n.piece ? f.piece === n.piece : f.size === n.size && f.trait === n.trait;

// Species settle in order, then events; a group that falls short gives back what it took
export function habitatReport(s = reefState()) {
    const feats = features(s);
    const owner = new Array(feats.length).fill(-1);
    const units = [];
    const unseen = () => new Array(feats.length).fill(false);

    const tryUnit = (u, seen) => {
        for (let f = 0; f < feats.length; f++) {
            if (seen[f] || !fits(units[u].need, feats[f])) continue;
            seen[f] = true;
            if (owner[f] < 0 || tryUnit(owner[f], seen)) {
                owner[f] = u;
                return true;
            }
        }
        return false;
    };

    const groups = [];
    for (const id of unlockedSpecies()) groups.push({ key: id, species: id, needs: HABITAT[id].needs });
    for (const event of activeEvents(s)) {
        groups.push({ key: `event:${event.id}`, species: event.species, event: event.id,
            needs: eventDef(event).needs });
    }

    const met = {};
    const pending = [];
    for (const group of groups) {
        const saved = owner.slice();
        const start = units.length;
        let whole = true;
        group.needs.forEach((n, index) => {
            for (let c = 0; c < n.count; c++) {
                units.push({ group: group.key, index, need: n });
                if (whole && !tryUnit(units.length - 1, unseen())) whole = false;
            }
        });
        met[group.key] = whole;
        if (!whole) {
            for (let f = 0; f < owner.length; f++) owner[f] = saved[f];
            units.length = start;
            pending.push(group);
        }
    }

    // Whatever is left over goes toward the groups that fell short, only so they can show how close
    for (const group of pending) {
        group.needs.forEach((n, index) => {
            for (let c = 0; c < n.count; c++) {
                units.push({ group: group.key, index, need: n, partial: true });
                if (!tryUnit(units.length - 1, unseen())) units.pop();
            }
        });
    }

    const progress = {};
    const uses = {};
    owner.forEach((u, f) => {
        if (u < 0) return;
        const unit = units[u];
        const key = `${unit.group}:${unit.index}`;
        progress[key] = (progress[key] || 0) + 1;
        if (unit.partial) return;
        const feat = feats[f];
        (uses[feat.spot] = uses[feat.spot] || []).push({ group: unit.group, trait: feat.trait });
    });

    return { met, progress, uses };
}

export const needProgress = (report, groupKey, index) => report.progress[`${groupKey}:${index}`] || 0;

const settledIn = (report) => unlockedSpecies().filter(id => report.met[id]);

const settledCount = (s = reefState()) => settledIn(habitatReport(s)).length;


//    !!! EVENTS !!!

const EVENT_SECONDS = 150;
const EVENT_GAP_MIN = 70;
const EVENT_GAP_MAX = 130;
const EVENT_RETRY = 20;
const ANSWER_SECONDS = 15;

export const eventDef = (event) => HABITAT[event.species]?.events[event.id];

export function activeEvents(s = reefState()) {
    if (!Array.isArray(s.reefEvents)) s.reefEvents = [];
    s.reefEvents = s.reefEvents.filter(event => eventDef(event));
    return s.reefEvents;
}

const eventSeconds = () => EVENT_SECONDS * (1 + SLACK_PER_LEVEL * level("slackWater")) * (1 + traitBonus("reefEvents"));

export const eventRoom = (s = reefState()) =>
    1 + (s.reefAnswered >= 4 ? 1 : 0) + (s.reefAnswered >= 12 ? 1 : 0);

// The boost only counts while the species' own needs and the event's extra needs are both met
export const eventAnswered = (event, report = habitatReport()) =>
    !!report.met[event.species] && !!report.met[`event:${event.id}`];

export const nextEventIn = (s = reefState()) => Math.max(0, Number(s.reefEventClock) || 0);

function startEvent(s) {
    const busy = new Set(activeEvents(s).map(event => event.species));
    const choices = [];
    for (const species of unlockedSpecies()) {
        if (busy.has(species) || !HABITAT[species].needs.every(n => needOpen(n, s))) continue;
        for (const [id, def] of Object.entries(HABITAT[species].events)) {
            if (def.needs.every(n => needOpen(n, s))) choices.push({ id, species });
        }
    }
    if (!choices.length) return false;
    const pick = choices[Math.floor(Math.random() * choices.length)];
    const length = eventSeconds();
    activeEvents(s).push({ ...pick, left: length, length, held: 0 });
    return true;
}


//    !!! BOOSTS !!!

const boostPower = () => (1 + KINSHIP_PER_LEVEL * level("kinship")) * (1 + traitBonus("reefKinship"));

const strengthen = (bonus, share) => 1 + (bonus.base - 1) * share * (1 + SETTLED_GROWTH) * boostPower();

export const boostMultiplier = (id) => 1 + (HABITAT[id].boost.base - 1) * boostPower();

const SETTLED_GROWTH = 3;
const SETTLED_GROWTH_SECONDS = 1200;

export const settledStreak = (id, s = reefState()) => s.reefSettledStreak?.[id] || 0;

const settledGrowth = (t) => 1 + SETTLED_GROWTH * (1 - Math.exp(-t * (1 + traitBonus("settledSpeed")) / SETTLED_GROWTH_SECONDS));

export const settledMultiplier = (id, s = reefState()) =>
    strengthen(HABITAT[id].settled, settledGrowth(settledStreak(id, s)) / (1 + SETTLED_GROWTH));

export const settledMax = (id) => strengthen(HABITAT[id].settled, 1);

// Read off the last tick rather than worked out on every production call
let liveBoosts = {};
let liveSettled = {};

for (const id of HABITAT_IDS) {
    registerBoost(`Reef: ${HABITAT[id].settled.name}`, (resourceId) =>
        liveSettled[id] && resourceId === HABITAT[id].settled.resource ? settledMultiplier(id) : 1);
    registerBoost(`Reef: ${HABITAT[id].boost.name}`, (resourceId) =>
        liveBoosts[id] && resourceId === HABITAT[id].boost.resource ? boostMultiplier(id) : 1);
}


//    !!! WHAT THE MAP GETS OUT OF IT !!!

const REEF_BLUE_BASE = 4e10;
const REEF_PER_STRENGTH = 0.9;

// Every settled species and every answered event is worth a share
function reefStrength(s = reefState()) {
    const report = habitatReport(s);
    let total = settledIn(report).length;
    for (const event of activeEvents(s)) if (eventAnswered(event, report)) total += 0.5;
    return total;
}

function reefOutput(world, id) {
    const worth = REEF_KINDS[tileKind(world, id)];
    if (!worth) return {};
    return { blueEssence: REEF_BLUE_BASE * worth * (1 + REEF_PER_STRENGTH * reefStrength()) * (1 + traitBonus("reefOutput")) };
}

for (const kind of Object.keys(REEF_KINDS)) contributeTileOutput(kind, reefOutput);

const NEIGHBOR_PER_REEF = 0.22;
const NEIGHBOR_CEILING = 40;

const symbiosis = () => (1 + SYMBIOSIS_PER_LEVEL * level("symbiosis")) * (1 + traitBonus("reefNeighbor"));

function reefNeighborBoost(world, id) {
    if (!kindIsOcean(tileKind(world, id))) return 1;
    const tile = tileById(id);
    if (!tile) return 1;

    let touching = 0;
    for (const n of neighboringTiles(tile)) touching += REEF_KINDS[tileKind(world, n.id)] || 0;
    if (touching === 0) return 1;

    return 1 + soften(NEIGHBOR_PER_REEF * touching * reefStrength() * symbiosis(), NEIGHBOR_CEILING);
}

contributeNeighborBoost("reef", reefNeighborBoost);


//    !!! WHAT THE OCEAN GETS !!!

export const ASPECT_PER_LEVEL = 2;

export const reefAspectBonus = () => ASPECT_PER_LEVEL * level("spawningGrounds");


//    !!! UPGRADE EFFECTS !!!

export const SLACK_PER_LEVEL = 0.15;       // Events last longer
export const KINSHIP_PER_LEVEL = 0.2;      // Fish boosts are stronger
export const SYMBIOSIS_PER_LEVEL = 0.2;    // Ocean next to reef pays more


//    !!! THE TICK !!!

const MAX_STEP = 1;

export function tickReef(dt, s = reefState()) {
    if (!reefOpen()) {
        liveBoosts = {};
        liveSettled = {};
        s.reefSettledStreak = {};
        return;
    }
    const step = Math.min(dt, MAX_STEP);
    if (!s.reefSettledTime || typeof s.reefSettledTime !== "object") s.reefSettledTime = {};
    if (!s.reefUnlocks || typeof s.reefUnlocks !== "object") s.reefUnlocks = {};
    s.reefAnswered = Number(s.reefAnswered) || 0;

    // A site that has closed (a reset, or an older save with more) hands back what was on it
    for (let i = siteCount(s); i < spots(s).length; i++) clearSpot(i, s);
    spots(s).length = Math.min(spots(s).length, siteCount(s));

    const report = habitatReport(s);
    const settled = settledIn(report);
    for (const id of settled) s.reefSettledTime[id] = (s.reefSettledTime[id] || 0) + step;
    liveSettled = Object.fromEntries(settled.map(id => [id, true]));
    s.reefSettledStreak = Object.fromEntries(settled.map(id => [id, settledStreak(id, s) + step]));

    const live = {};
    for (const event of activeEvents(s)) {
        event.left -= step;
        if (eventAnswered(event, report)) {
            event.held = (event.held || 0) + step;
            live[event.species] = true;
        }
    }
    liveBoosts = live;

    s.reefEvents = activeEvents(s).filter(event => {
        if (event.left > 0) return true;
        if (event.held >= ANSWER_SECONDS) s.reefAnswered += 1;
        return false;
    });

    s.reefEventClock = nextEventIn(s) - step;
    if (s.reefEventClock <= 0) {
        const room = activeEvents(s).length < eventRoom(s);
        const started = room && startEvent(s);
        s.reefEventClock = started
            ? (EVENT_GAP_MIN + Math.random() * (EVENT_GAP_MAX - EVENT_GAP_MIN)) / (1 + traitBonus("eventGap"))
            : EVENT_RETRY;
    }

    for (const id in UNLOCKS) if (!s.reefUnlocks[id] && UNLOCKS[id].met(s)) s.reefUnlocks[id] = true;
    if (s.reefUnlocks.largeRock) drawInSchool(getLayerState("aquatic"), "mackerel");
}

export const reefNeedsAttention = (s = reefState()) => {
    if (!reefOpen()) return false;
    const report = habitatReport(s);
    return activeEvents(s).some(event => !eventAnswered(event, report));
};
