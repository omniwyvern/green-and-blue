// expeditions.js
//
// People sent out along a route on the world map and back, for what they carry home and what they learn

import { neighborsOf } from "../../../utils/hex.js";
import {
    TERRAIN, REEF_KINDS, tileById, tileKind, isClaimed, tierOf, worldState, contributeMapRadius,
} from "../../main/systems/worldMap.js";
import {
    settlements, landOf, landFamily, PROJECTS, isDiscovery, projectsDone, learn, modsOf, idle, away, economy,
} from "./settlements.js";
import { notionOutlook, sealNotions, bringNotions, innovated } from "./knowledge.js";

export const expeditionsOpen = (t) => projectsDone(t, "scouting") > 0;

contributeMapRadius("expeditions", () => settlements().some(expeditionsOpen) ? 1 : 0);


//    !!! ROUTES !!!

export const MOST_ROUTE = 12;
const IMPASSABLE = new Set(["ice-cap"]);
const BY_BOAT = new Set(["ocean", "deep-ocean", ...Object.keys(REEF_KINDS)]);
const SLOW = { woodland: 20, fungus: 20, aquatic: 30, reef: 30, wetlands: 40, ice: 40 };

// Seconds to cross a tile, one way
export const crossing = (kind) => 40 + 20 * Math.max(0, tierOf(kind) - 1) + (SLOW[TERRAIN[kind]?.family] || 0);

export function crossProblem(s, id) {
    if (!tileById(id) || !isClaimed(s, id)) return "Unclaimed land.";
    const kind = tileKind(s, id);
    const name = TERRAIN[kind].name.toLowerCase();
    if (IMPASSABLE.has(kind)) return `Nobody can cross ${name} on foot.`;
    return BY_BOAT.has(kind) && !innovated("canoes") ? `Crossing ${name} takes Dugout Canoes.` : null;
}

// A route that ends back on the settlement's own land comes home that way; any other turns back
export const loops = (t, route) => route.length > 0 && t.tiles.includes(route[route.length - 1]);
export const outside = (t, route) => loops(t, route) ? route.slice(0, -1) : route;

// Tiles the route can take next: out of the settlement's land first, then from its last tile
export function nextSteps(t, route, s = worldState()) {
    const steps = new Set();
    if (loops(t, route)) return steps;
    for (const id of route.length ? [route[route.length - 1]] : t.tiles) {
        for (const n of neighborsOf(tileById(id))) {
            if (t.tiles.includes(n.id)) {
                if (route.length >= 2) steps.add(n.id);
            } else if (route.length < MOST_ROUTE && !route.includes(n.id) && !crossProblem(s, n.id)) steps.add(n.id);
        }
    }
    return steps;
}

// The settlement tile the route leaves from, for drawing it
export const routeStart = (t, route) => route.length === 0 ? t.center
    : [t.center, ...t.tiles].find(id => neighborsOf(tileById(id)).some(n => n.id === route[0])) || t.center;

// Notions also come from the settlement tile the route leaves from
const notionTiles = (t, route) => [routeStart(t, route), ...outside(t, route)];

const pace = (t) => 1 + (modsOf(t).pace || 0);
const legsOf = (t, route, s) => route.map(id => crossing(tileKind(s, id)) / pace(t));
const sum = (list) => list.reduce((a, b) => a + b, 0);
const routeTime = (t, route, s = worldState()) => sum(legsOf(t, route, s)) * (loops(t, route) ? 1 : 2);


//    !!! SUPPLIES AND HAUL !!!

const FOOD_PER_SECOND = 0.006;
const WATER_PER_SECOND = 0.004;
const GEAR = 2;
const GEAR_PER_TILE = 0.5;
export const STOCKS = ["food", "water", "materials"];

export function expeditionCost(t, route, people, s = worldState()) {
    const time = routeTime(t, route, s);
    return {
        food: Math.ceil(people * time * FOOD_PER_SECOND),
        water: Math.ceil(people * time * WATER_PER_SECOND),
        materials: Math.ceil(people * (GEAR + GEAR_PER_TILE * outside(t, route).length)),
        time,
    };
}

// What each person can carry home, and what a tile has to take
const CARRY = 10;
const FOOD_HAUL = 8;
const MATERIALS_HAUL = 5;
const tileHaul = (kind) => ({ food: landOf(kind).food * FOOD_HAUL, materials: (0.4 + landOf(kind).wood) * MATERIALS_HAUL });

function carried(found, people) {
    const total = found.food + found.materials;
    const scale = total > 0 ? Math.min(1, people * CARRY / total) : 0;
    return { food: found.food * scale, materials: found.materials * scale, full: scale < 1 };
}

// Pop-seconds of discovery, per person per tile; an event's learning is per person too
const LEARN_PER_TILE = 90;
export const openDiscoveries = (t, kind) => Object.keys(PROJECTS)
    .filter(id => isDiscovery(id) && !projectsDone(t, id) && PROJECTS[id].lands.includes(landFamily(kind)));
const spread = (into, ids, amount) => {
    for (const id of ids) into[id] = (into[id] || 0) + amount / ids.length;
};

function crossTile(t, trip, kind, people) {
    const haul = tileHaul(kind);
    trip.found.food += haul.food;
    trip.found.materials += haul.materials;
    spread(trip.learned, openDiscoveries(t, kind), people * LEARN_PER_TILE);
}

export function expeditionOutlook(t, route, people, s = worldState()) {
    const trip = { found: { food: 0, materials: 0 }, learned: {} };
    const tiles = outside(t, route);
    for (const id of tiles) crossTile(t, trip, tileKind(s, id), people);
    return { ...carried(trip.found, people), learned: trip.learned, notions: notionOutlook(t, notionTiles(t, route), people, s) };
}


//    !!! SENDING !!!

export function sendProblem(t, route, people) {
    if (!expeditionsOpen(t)) return "Scout the surroundings first.";
    if (t.expedition) return "An expedition is already out.";
    if (route.length === 0) return "Pick a route first.";
    if (people < 1) return "Someone has to go.";
    if (people > idle(t)) return "Not enough gatherers free to go.";
    if (people >= t.pops - away(t)) return "Someone has to stay home.";
    const cost = expeditionCost(t, route, people);
    if (cost.materials > economy(t).materialStore) return "Needs more materials than can be stored.";
    const short = STOCKS.find(key => t[key] < cost[key]);
    return short ? `Not enough ${short} stored.` : null;
}

export function sendExpedition(t, route, people, s = worldState()) {
    if (sendProblem(t, route, people)) return false;
    const cost = expeditionCost(t, route, people, s);
    for (const key of STOCKS) t[key] -= cost[key];
    const tiles = outside(t, route);
    t.expedition = {
        route: tiles, loop: loops(t, route) ? route[route.length - 1] : null, people, legs: legsOf(t, route, s),
        walked: 0, busy: 0, rested: 0, reached: 0,
        found: { food: 0, materials: 0 }, learned: {}, event: null, events: 0, log: [],
        notions: sealNotions(t, notionTiles(t, route), s),
    };
    return true;
}


//    !!! ON THE ROAD !!!

// Every choice trades time for something; nothing on the road costs what they already have
export const EVENTS = [
    { lands: ["woodland"], text: "The expedition has found an unusual plant.", options: [
        { label: "Collect it", time: 90, learn: 60, then: "They dug it up to bring home." },
        { label: "Leave it", then: "They left it where it grew." }] },
    { lands: ["woodland"], text: "A fallen tree has left long, straight branches.", options: [
        { label: "Take some", time: 60, materials: 10, then: "They cut the best of them." },
        { label: "Leave them", then: "They stepped over it and went on." }] },
    { lands: ["woodland", "grass"], text: "Fresh tracks cross the path.", options: [
        { label: "Follow them", time: 80, food: 10, then: "The tracks led to a meal." },
        { label: "Keep going", then: "They kept to the route." }] },
    { lands: ["grass"], text: "A herd is grazing on the slope ahead.", options: [
        { label: "Watch how they move", time: 90, learn: 60, then: "They watched until the herd moved on." },
        { label: "Let them be", then: "They gave the herd a wide berth." }] },
    { lands: ["grass"], text: "Tall seed heads are swaying in the wind.", options: [
        { label: "Strip some", time: 50, food: 6, then: "They filled a bag with seed." },
        { label: "Walk on", then: "They walked on through it." }] },
    { lands: ["wetlands"], text: "The reeds here grow tall and strong.", options: [
        { label: "Cut a bundle", time: 60, materials: 10, then: "They cut and tied a bundle." },
        { label: "Push through", then: "They pushed through." }] },
    { lands: ["wetlands", "aquatic"], text: "Birds are nesting along the water's edge.", options: [
        { label: "Look for eggs", time: 50, food: 6, then: "They found a few nests." },
        { label: "Leave them", then: "They left the birds alone." }] },
    { lands: ["wetlands"], text: "A bitter-smelling plant grows thick in the mud.", options: [
        { label: "Pull some up", time: 80, learn: 60, then: "They pulled up a few, roots and all." },
        { label: "Leave it", then: "They went around it." }] },
    { lands: ["aquatic", "reef"], text: "Fish are crowding the shallows.", options: [
        { label: "Wade in", time: 70, food: 10, then: "They came out with dinner." },
        { label: "Keep to the shore", then: "They kept their feet dry." }] },
    { lands: ["aquatic", "reef"], text: "Strange shells have washed up along the shore.", options: [
        { label: "Study them", time: 80, learn: 60, then: "They turned them over for a long while." },
        { label: "Leave them", then: "They walked past them." }] },
    { lands: ["ice"], text: "A crack in the ice shows dark water moving underneath.", options: [
        { label: "Watch it a while", time: 100, learn: 60, then: "Something moved down there." },
        { label: "Move on", then: "They moved on." }] },
    { lands: ["fungus"], text: "Pale mushrooms ring a quiet clearing.", options: [
        { label: "Take a few to study", time: 70, learn: 60, then: "They wrapped a few in leaves." },
        { label: "Leave them", then: "They left the ring unbroken." }] },
    { lands: ["fungus", "woodland"], text: "A dry, hollow log is full of dead wood.", options: [
        { label: "Break it up", time: 50, materials: 8, then: "They took the driest pieces." },
        { label: "Leave it", then: "They left it for the beetles." }] },
    { lands: ["bare"], text: "A seam of good, sharp stone shows in the rock.", options: [
        { label: "Break some off", time: 80, materials: 12, then: "They chipped off a good load." },
        { label: "Walk on", then: "They walked on." }] },
    { lands: ["bare", "ice"], text: "Water is trickling out from under a rock.", options: [
        { label: "Follow it back", time: 90, learn: 60, then: "They found where it came from." },
        { label: "Drink and go on", then: "They drank and went on." }] },
    { lands: ["bare", "grass", "ice"], text: "The night is clear, and the stars are bright.", options: [
        { label: "Stay up and watch", time: 60, learn: 60, then: "They watched the stars turn." },
        { label: "Sleep", then: "They slept well." }] },
];
const EVENT_CHANCE = 0.4;
const MOST_EVENTS = 3;
export const EVENT_WAIT = 120;

const walkTotal = (ex) => sum(ex.legs) * (ex.loop ? 1 : 2);
export const expeditionLeft = (t) => walkTotal(t.expedition) - t.expedition.walked + t.expedition.busy;
export const expeditionTotal = (t) => walkTotal(t.expedition) + t.expedition.rested + t.expedition.busy;
export const expeditionElapsed = (t) => t.expedition.walked + t.expedition.rested;
export const expeditionCarrying = (t) => carried(t.expedition.found, t.expedition.people);
const arrival = (ex, i) => sum(ex.legs.slice(0, i)) + ex.legs[i] / 2;

// Where on the route it is: between point index and index + 1, where point 0 is the settlement
export function expeditionSpot(t) {
    const ex = t.expedition;
    const out = sum(ex.legs);
    const back = ex.loop ? ex.walked > out / 2 : ex.walked > out;
    let walked = Math.max(0, Math.min(out, ex.loop || ex.walked <= out ? ex.walked : 2 * out - ex.walked));
    for (let i = 0; i < ex.legs.length; i++) {
        if (walked <= ex.legs[i]) return { index: i, frac: walked / ex.legs[i], back };
        walked -= ex.legs[i];
    }
    return { index: ex.legs.length - 1, frac: 1, back };
}

export function tickExpeditions(dt) {
    for (const t of settlements()) if (t.expedition) walk(t, dt);
}

function walk(t, dt) {
    const ex = t.expedition;
    if (ex.event && (ex.event.waited += dt) >= EVENT_WAIT) chooseEvent(t, EVENTS[ex.event.index].options.length - 1);
    const resting = Math.min(ex.busy, dt);
    ex.busy -= resting;
    ex.rested += resting;
    ex.walked += dt - resting;
    while (ex.reached < ex.route.length && ex.walked >= arrival(ex, ex.reached)) pass(t, ex.reached++);
    if (ex.walked >= walkTotal(ex)) comeHome(t);
}

function pass(t, i) {
    const ex = t.expedition;
    const kind = tileKind(worldState(), ex.route[i]);
    crossTile(t, ex, kind, ex.people);
    if (!ex.event && ex.events < MOST_EVENTS && Math.random() < EVENT_CHANCE) rollEvent(t, ex.route[i], kind);
}

function rollEvent(t, tile, kind) {
    const family = landFamily(kind);
    const canLearn = openDiscoveries(t, kind).length > 0;
    const pool = EVENTS.map((_, index) => index).filter(index => EVENTS[index].lands.includes(family)
        && (canLearn || !EVENTS[index].options.some(option => option.learn)));
    if (!pool.length) return;
    t.expedition.event = { index: pool[Math.floor(Math.random() * pool.length)], tile, waited: 0 };
    t.expedition.events += 1;
}

export function chooseEvent(t, choice) {
    const ex = t.expedition;
    const def = ex?.event && EVENTS[ex.event.index];
    const option = def?.options[choice];
    if (!option) return;
    ex.busy += option.time || 0;
    ex.found.food += option.food || 0;
    ex.found.materials += option.materials || 0;
    if (option.learn) spread(ex.learned, openDiscoveries(t, tileKind(worldState(), ex.event.tile)), option.learn * ex.people);
    ex.log.push(`${def.text} ${option.then}`);
    ex.event = null;
}

function comeHome(t) {
    const ex = t.expedition;
    if (ex.event) chooseEvent(t, EVENTS[ex.event.index].options.length - 1);
    const brought = carried(ex.found, ex.people);
    const e = economy(t);
    t.food = Math.min(e.storage, t.food + brought.food);
    t.materials = Math.min(e.materialStore, t.materials + brought.materials);
    const learned = Object.fromEntries(Object.keys(ex.learned).filter(id => !projectsDone(t, id)).map(id => [id, ex.learned[id]]));
    const finished = Object.keys(learned).filter(id => learn(t, id, learned[id]));
    t.lastExpedition = { people: ex.people, tiles: ex.route.length, food: brought.food, materials: brought.materials,
                         full: brought.full, learned, finished, log: ex.log, notions: bringNotions(ex.notions, ex.people) };
    delete t.expedition;
}
