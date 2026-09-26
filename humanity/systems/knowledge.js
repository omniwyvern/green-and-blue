// knowledge.js
//
// Notions brought home by expeditions, what they combine into, and the innovations worked out of them

import { state, getLayerState, layerUnlocked, unlockLayer } from "../../../core/state.js";
import { resourceDefs } from "../../../core/registry.js";
import { registerBoost } from "../../../core/boosts.js";
import { hexId, hexesWithin, neighborsOf, HEX_DIRECTIONS } from "../../../utils/hex.js";
import { seededRandom, hashText } from "../../../utils/math.js";
import { TERRAIN, tileKind, worldState, hasSeenKind } from "../../main/systems/worldMap.js";
import { settlements, PROJECTS, discoveriesMade, discoveryName, addEffectSource } from "./settlements.js";

export const knowledgeState = () => getLayerState("knowledge");

const INNOVATION_AFTER = 4;
export const knownDiscoveries = () => [...new Set(settlements().flatMap(discoveriesMade))];
export const innovationOpen = () => knowledgeState().innovationOpen;

export function checkKnowledge() {
    const found = knownDiscoveries().length;
    if (!layerUnlocked("knowledge") && found > 0) unlockLayer("knowledge");
    if (!innovationOpen() && found >= INNOVATION_AFTER) knowledgeState().innovationOpen = true;
}


//    !!! NOTIONS !!!

export const NOTIONS = {
    earth:   { name: "Earth",   color: "#b8702e" },
    water:   { name: "Water",   color: "#2f8cf0" },
    wind:    { name: "Wind",    color: "#8fe3ff" },
    fire:    { name: "Fire",    color: "#ff5a1f" },
    pattern: { name: "Pattern", color: "#ffd21f" },
    rot:     { name: "Rot",     color: "#8fae1b" },

    clay:    { name: "Clay",    color: "#e0703a", of: ["earth", "water"] },
    weather: { name: "Weather", color: "#6f9ee8", of: ["wind", "water"] },
    light:   { name: "Light",   color: "#fff06a", of: ["fire", "wind"] },
    crystal: { name: "Crystal", color: "#5fe6f0", of: ["earth", "pattern"] },
    motion:  { name: "Motion",  color: "#e6f04a", of: ["wind", "pattern"] },
    hollow:  { name: "Hollow",  color: "#8a6fd0", of: ["wind", "rot"] },
    ash:     { name: "Ash",     color: "#b0a8a0", of: ["fire", "rot"] },
    cold:    { name: "Cold",    color: "#bfefff", of: ["water", "pattern"] },

    life:    { name: "Life",    color: "#5ee83a", of: ["water", "light"] },
    salt:    { name: "Salt",    color: "#f4f0e6", of: ["water", "crystal"] },
    flow:    { name: "Flow",    color: "#1fc8f0", of: ["water", "motion"] },
    depth:   { name: "Depth",   color: "#3a5cf0", of: ["cold", "hollow"] },
    seasons: { name: "Seasons", color: "#f0b020", of: ["weather", "pattern"] },
    journey: { name: "Journey", color: "#f0a060", of: ["motion", "earth"] },

    plant:   { name: "Plant",   color: "#2fc84a", of: ["life", "earth"] },
    beast:   { name: "Beast",   color: "#d06a2a", of: ["life", "motion"] },
    hunger:  { name: "Hunger",  color: "#f03a3a", of: ["life", "hollow"] },
    mold:    { name: "Mold",    color: "#b0e05a", of: ["life", "rot"] }, // what is this for
    age:     { name: "Age",     color: "#b09070", of: ["seasons", "crystal"] },

    mind:    { name: "Mind",    color: "#c060ff", of: ["beast", "pattern"] },
    harvest: { name: "Harvest", color: "#ffb000", of: ["plant", "seasons"] },
    shell:   { name: "Shell",   color: "#ff8fa8", of: ["beast", "crystal"] }, // shell event in expedition nothing for this
    web:     { name: "Web",     color: "#e08aff", of: ["mold", "pattern"] }, // what is this for why exist

    kin:     { name: "Kin",     color: "#ff9a3a", of: ["mind", "fire"] },
    mark:    { name: "Mark",    color: "#d0a060", of: ["mind", "clay"] },
    voice:   { name: "Voice",   color: "#ff4fb0", of: ["mind", "wind"] },

    craft:   { name: "Craft",   color: "#f07f2a", of: ["kin", "crystal"] },
    herd:    { name: "Herd",    color: "#d8c040", of: ["beast", "kin"] },
};
export const isPrimal = (id) => !NOTIONS[id].of;
export const notionTier = (id) => isPrimal(id) ? 0 : 1 + Math.max(...NOTIONS[id].of.map(notionTier));
const madeFrom = (a, b) => Object.keys(NOTIONS).find(id => {
    const of = NOTIONS[id].of;
    return of && ((of[0] === a && of[1] === b) || (of[0] === b && of[1] === a));
}) || null;

const unlimited = () => !!state.settings.enableUnlimitedNotions;   // Dev tool
export const notionCount = (id) => unlimited() ? Infinity : knowledgeState().notions[id] || 0;
export const notionKnown = (id) => unlimited() || knowledgeState().known.includes(id);
export const knownNotions = () => Object.keys(NOTIONS).filter(notionKnown);

// Linked on a note when one is half of the other, and both are known
export const linked = (a, b) => notionKnown(a) && notionKnown(b) && !!(NOTIONS[a].of?.includes(b) || NOTIONS[b].of?.includes(a));

// A hint: how many unfound notions could be made from known ones, optionally using a given one
export const makeableCount = (using) => Object.keys(NOTIONS).filter(id => !isPrimal(id) && !notionKnown(id)
    && NOTIONS[id].of.every(notionKnown) && (!using || NOTIONS[id].of.includes(using))).length;

function gainNotion(id, amount) {
    const k = knowledgeState();
    k.notions[id] = (k.notions[id] || 0) + amount;
    if (k.known.includes(id)) return;
    k.known.push(id);
    // A pinned notion only links once known, so learning one can finish a note
    for (const inn in k.notes) if (canWork(inn) && noteDone(inn)) k.innovations[inn] = true;
}

function spendNotion(id) {
    const k = knowledgeState();
    if (unlimited()) return true;
    if (!(k.notions[id] >= 1)) return false;
    k.notions[id] -= 1;
    return true;
}

const pairKey = (a, b) => [a, b].sort().join("+");
export const triedNothing = (a, b) => (knowledgeState().failed || []).includes(pairKey(a, b));
export const knownResult = (a, b) => {
    const made = madeFrom(a, b);
    return made && notionKnown(made) ? made : null;
};

// Both are spent either way: null when the pair makes nothing, false when one is missing
export function combine(a, b) {
    if (notionCount(a) < (a === b ? 2 : 1) || notionCount(b) < 1) return false;
    spendNotion(a);
    spendNotion(b);
    const made = madeFrom(a, b);
    if (made) gainNotion(made, 1);
    else if (!triedNothing(a, b)) knowledgeState().failed.push(pairKey(a, b));
    return made;
}


//    !!! FROM THE LAND !!!

// Mean notions an expedition picks up crossing one tile; tier 2 and 3 land has its own besides
const TILE_NOTIONS = {
    bare:               { earth: 3, wind: 1.5, fire: 1, pattern: 0.5 },
    grass:              { wind: 2, earth: 1, fire: 1, pattern: 1 },
    water:              { water: 2, wind: 0.5 },
    snow:               { water: 1, pattern: 1.5, wind: 1 },
    pond:               { water: 3, rot: 1 },
    ocean:              { water: 4, wind: 2, salt: 1.5, depth: 1 },
    "deep-ocean":       { water: 5, wind: 1, depth: 2.5 },
    reef:               { water: 2, pattern: 2 },
    "coral-reef":       { water: 3, pattern: 3, shell: 1.5 },
    "great-reef":       { water: 3, pattern: 3, shell: 2, crystal: 1 },
    forest:             { earth: 2, rot: 1, wind: 1, fire: 0.5 },
    "dense-forest":     { earth: 3, rot: 2, wind: 1, plant: 1.5, beast: 1 },
    "ancient-forest":   { earth: 3, rot: 3, plant: 2, age: 1.5 },
    "ice-field":        { water: 1, pattern: 2, wind: 2 },
    glacier:            { water: 2, pattern: 3, wind: 2, crystal: 1.5 },
    "ice-cap":          { pattern: 3, wind: 3, crystal: 1.5, age: 1 },
    marsh:              { water: 2, rot: 2, earth: 1 },
    swamp:              { water: 3, rot: 3, earth: 1, mold: 1.5 },
    mangrove:           { water: 3, rot: 2, earth: 2, salt: 1, plant: 1 },
    "mushroom-grove":   { rot: 3, earth: 1 },
    "fungal-forest":    { rot: 4, earth: 2, mold: 1.5 },
    "mycelial-network": { rot: 4, earth: 2, web: 1.5 },
};
const tileNotions = (kind) => TILE_NOTIONS[kind] || TILE_NOTIONS.bare;
const seenWith = (id) => Object.keys(TILE_NOTIONS).filter(kind => TILE_NOTIONS[kind][id] && hasSeenKind(worldState(), kind));
export const landsWith = (id) => seenWith(id).map(kind => TERRAIN[kind]?.name || kind);
export const fromLand = (id) => Object.values(TILE_NOTIONS).some(found => found[id]);
export const seenLandCount = () => Object.keys(worldState().seenTerrain || {}).length;

// Broad kinds of land, so the manual doesn't name terrain that hasn't been reached yet
export const landGroupsWith = (id) =>
    [...new Set(seenWith(id).map(kind => TERRAIN[kind].family || { water: "aquatic", snow: "ice" }[kind] || "grass"))];

// What each person has room to bring home, on top of food and materials
const NOTION_CARRY = 3;

const seedOf = (t) => t.id * 7919 + (knowledgeState().packed[t.id] || 0);

// Rolled once per expedition, so replanning the same route shows the same haul
function rollTile(seed, tileId, kind) {
    const found = {};
    const base = tileNotions(kind);
    for (const id in base) {
        const salt = hashText(`${tileId}:${id}`);
        const amount = base[id] * (0.4 + 1.2 * seededRandom(seed, salt));
        const whole = Math.floor(amount + seededRandom(seed, salt + 1));
        if (whole > 0) found[id] = whole;
    }
    return found;
}

function routeNotions(t, route, s = worldState(), seed = seedOf(t)) {
    const found = {};
    for (const id of route) {
        const rolled = rollTile(seed, id, tileKind(s, id));
        for (const n in rolled) found[n] = (found[n] || 0) + rolled[n];
    }
    return found;
}

// Largest remainder, so a full pack is exactly full
function packNotions(found, people) {
    const room = people * NOTION_CARRY;
    const total = Object.values(found).reduce((a, b) => a + b, 0);
    if (total <= room) return { notions: { ...found }, full: false };
    const scaled = Object.keys(found).map(id => ({ id, exact: found[id] * room / total }));
    const notions = Object.fromEntries(scaled.map(({ id, exact }) => [id, Math.floor(exact)]));
    let left = room - Object.values(notions).reduce((a, b) => a + b, 0);
    for (const { id } of scaled.sort((a, b) => (b.exact % 1) - (a.exact % 1))) {
        if (left-- <= 0) break;
        notions[id] += 1;
    }
    for (const id in notions) if (!notions[id]) delete notions[id];
    return { notions, full: true };
}

export const notionOutlook = (t, route, people, s = worldState()) =>
    innovationOpen() ? packNotions(routeNotions(t, route, s), people) : null;

// Called as an expedition leaves: fixes its roll and moves the settlement on to the next one
export function sealNotions(t, route, s = worldState()) {
    if (!innovationOpen()) return null;
    const found = routeNotions(t, route, s);
    const k = knowledgeState();
    k.packed[t.id] = (k.packed[t.id] || 0) + 1;
    return found;
}

export function bringNotions(found, people) {
    if (!found) return null;
    const { notions, full } = packNotions(found, people);
    for (const id in notions) gainNotion(id, notions[id]);
    return { notions, full };
}


//    !!! INNOVATIONS !!!

// Effects reach every settlement, in the same shape as a project's; world multiplies a resource everywhere it is made.
// Needs are discoveries (made by any settlement) or other innovations
export const INNOVATIONS = {
    stonePoints: { name: "Stone Points", text: "+20% food from hunting jobs",
                   notions: ["earth", "crystal", "motion"], needs: ["flint"], jobs: { hunt: 0.2 },
                   desc: "Flint struck into a sharp edge and a point, and bound to the end of a stick.",
                   lore: "A point that goes where it's thrown, and causes more damage than clubs or bare hands." },
    cordage:     { name: "Cordage", text: "+25% from Water Carriers, expeditions travel 10% faster, +100 materials storage",
                   notions: ["pattern", "motion", "wind"], needs: ["fibers"], mods: { carry: 0.25, pace: 0.1 }, materialStore: 100,
                   desc: "Fibers twisted together into something stronger than any one of them.",
                   lore: "Two weak strands, twisted, hold what neither could alone." },
    basketry:    { name: "Basketry", text: "+20% food from gathering jobs, +10 food storage, +200 materials storage",
                   notions: ["pattern", "hollow", "earth"], needs: ["fibers"], jobs: { gather: 0.2 }, storage: 10, materialStore: 200,
                   desc: "Stems and strips woven over and under, around a space to fill.",
                   lore: "Over, under, over. The gap in the middle is the whole point." },
    firemaking:  { name: "Firemaking", text: "+10% growth",
                   notions: ["fire", "ash", "light"], needs: ["flint", "tinder"], mods: { growth: 0.1 },
                   desc: "Sparks from struck flint caught in dry plants, so fire no longer has to be carried from camp to camp.",
                   lore: "Fire, whenever it's wanted, wherever they are." },
    ochrePaint:  { name: "Ochre Paint", text: "+10% growth",
                   notions: ["clay", "light", "pattern"], needs: ["ochre"], mods: { growth: 0.1 },
                   desc: "Red earth ground to powder and mixed with fat, for skin, for hides and for walls.",
                   lore: "A red hand pressed to the rock, still there in the morning." },
    snares:      { name: "Snares", text: "+15% food from Hunters, +1 hunting room",
                   notions: ["beast", "hollow", "motion"], needs: ["cordage", "tracking"], jobs: { hunter: 0.15 }, room: { hunt: 1 },
                   desc: "A loop of cord set where the tracks say an animal will pass.",
                   lore: "A trap that hunts while everyone sleeps." },
    boneNeedles: { name: "Bone Needles", text: "+10 food storage, +100 materials storage",
                   notions: ["beast", "crystal", "pattern"], needs: ["stonePoints", "tracking"], storage: 10, materialStore: 100,
                   desc: "Splinters of bone scraped thin with a stone edge, with an eye bored through one end.",
                   lore: "The smallest tool anyone owns, and the easiest to lose." },
    clothing:    { name: "Sewn Clothing", text: "Expeditions travel 20% faster, +10% growth",
                   notions: ["beast", "cold", "motion"], needs: ["boneNeedles", "cordage"], mods: { pace: 0.2, growth: 0.1 },
                   desc: "Hides from the hunt, worn against the cold while on the move.",
                   lore: "A bone needle and sinew thread turn a hide into a coat." },
    pottery:     { name: "Pottery", text: "+15 food storage, +15 water storage, +200 materials storage",
                   notions: ["clay", "fire", "hollow"], needs: ["clay", "firemaking"], storage: 15, waterStore: 15, materialStore: 200,
                   desc: "Mud from the riverbank, shaped around an empty middle and hardened in the fire.",
                   lore: "Wet clay holds the shape of a hand. Fire keeps it there." },
    preserving:  { name: "Food Preservation", text: "+40% food storage",
                   notions: ["hunger", "ash", "cold"], needs: ["saltLicks", "firemaking"], mods: { storage: 0.4 },
                   desc: "Holding off the lean months with smoke, embers and the winter chill.",
                   lore: "Smoke, frost and salt: meat that lasts past the next moon." },
    nets:        { name: "Fishing Nets", text: "+25% food from Spear Fishers, +1 hunting room",
                   notions: ["web", "water", "flow"], needs: ["cordage", "fishing"], jobs: { fisher: 0.25 }, room: { hunt: 1 },
                   desc: "Cord knotted into a mesh, wide enough for water and too tight for fish.",
                   lore: "One throw acts as if there was another person fishing." },
    hafting:     { name: "Hafted Tools", text: "+10% food from every job",
                   notions: ["crystal", "plant", "motion", "flow"], needs: ["stonePoints", "cordage", "resin"], mods: { food: 0.1 }, world: { greenEssence: 4 },
                   desc: "A stone head fixed to a handle with resin and cord, so the whole arm swings behind it.",
                   lore: "A stone that used to fit the hand now reaches past it." },
    diggingSticks: { name: "Digging Sticks", text: "+15% food from gathering jobs",
                   notions: ["earth", "plant", "hollow"], needs: ["hafting", "roots"], jobs: { gather: 0.15 }, world: { greenEssence: 6 },
                   desc: "A hardened point for turning the soil, pulling roots and loosening the ground around what grows.",
                   lore: "Turned earth grows back thicker than it was." },
    burning:     { name: "Controlled Burns", text: "+1 hunting room",
                   notions: ["fire", "ash", "plant", "seasons"], needs: ["firemaking", "diggingSticks", "wildGrains"], room: { hunt: 1 },
                   world: { greenEssence: 8 },
                   desc: "Old growth burned off at the right time of year, so fresh shoots come up green through the ash.",
                   lore: "Burn it in the dry season, and the grazers come to the green." },
    canoes:      { name: "Dugout Canoes", text: "Expeditions can cross the ocean, +25% food from Spear Fishers",
                   notions: ["hollow", "fire", "flow"], needs: ["hafting", "firemaking"], jobs: { fisher: 0.25 }, world: { biomass: 2 },
                   desc: "A fallen trunk, burned out in the middle, that rides the current downstream.",
                   lore: "A log, hollowed with fire and stone, carries four across the water." },
    remedies:    { name: "Herbal Remedies", text: "+15% growth",
                   notions: ["plant", "water", "fire"], needs: ["herbs", "pottery"], mods: { growth: 0.15 },
                   desc: "Leaves and roots steeped in hot water, for fevers, wounds and aching bellies.",
                   lore: "The bitter ones work. Nobody knows why yet." },
    beads:       { name: "Shell Beads", text: "+10% growth, +10% food from gathering jobs",
                   notions: ["shell", "crystal", "pattern"], needs: ["shellfish", "stonePoints"], mods: { growth: 0.1 }, jobs: { gather: 0.1 },
                   desc: "Shells ground smooth and bored through, strung together and worn so others can see.",
                   lore: "Worn at the neck, a string of shells shows others that you are important." },
    reedPipes:   { name: "Reed Pipes", text: "+10% growth",
                   notions: ["hollow", "wind", "voice"], needs: ["reeds"], mods: { growth: 0.1 },
                   desc: "A cut reed with holes along it, blown across until it sings back.",
                   lore: "The same tune, played the same way, by someone else." },
    counting:    { name: "Counting", text: "+10% food from every job",
                   notions: ["pattern", "mind", "seasons"], needs: ["stars", "ochrePaint"], mods: { food: 0.1 },
                   desc: "Seeing the same shapes come around again, and keeping track in your head of how the year turns.",
                   lore: "Notches on a bone, one for every day since the last full moon." },
    language:    { name: "Language", text: "+25% growth",
                   notions: ["voice", "mind", "kin"], needs: ["counting", "reedPipes", "beads"], mods: { growth: 0.25 },
                   desc: "Sounds that carry a thought from one head to another, shared among family.",
                   lore: "Names for things that aren't here, and for things that haven't happened yet." },

    writing:     { name: "Writing", text: "+15% growth, +10% food from every job",
                   notions: ["mark", "voice", "clay", "pattern"], needs: ["pottery", "language"],
                   desc: "Scratches in soft clay, in shapes that stand for spoken words.",
                   mods: { growth: 0.15, food: 0.1 }, world: { adaptationPoints: 2 },
                   lore: "What one person knew, pressed into clay for someone who never met them." },
    farming:     { name: "Farming", text: "+25% food from gathering jobs, +2 gathering room",
                   notions: ["harvest", "seasons", "earth", "kin"], needs: ["pottery", "wildGrains", "language"],
                   desc: "Families gathering the crop, and learning what time of year to put seed in the ground.",
                   jobs: { gather: 0.25 }, room: { gather: 2 },
                   lore: "Seeds kept back, and put in the ground on purpose." },
    irrigation:  { name: "Irrigation", text: "+25% food from gathering jobs, +0.3 water a second",
                   notions: ["flow", "plant", "earth", "craft"], needs: ["farming"],
                   desc: "Tools that cut channels through the ground so the water runs to the crops.",
                   jobs: { gather: 0.25 }, spring: 0.3, world: { blueEssence: 3 },
                   lore: "A ditch dug from the river, and the river goes where it's told." },
    herding:     { name: "Herding", text: "+20% food from hunting jobs, +2 hunting room",
                   notions: ["herd", "plant", "journey", "hunger"], needs: ["tracking", "language"],
                   desc: "Leading the animals from pasture to pasture, keeping them fed so everyone is fed.",
                   jobs: { hunt: 0.2 }, room: { hunt: 2 }, world: { vitality: 2 },
                   lore: "Follow the herd long enough and it starts following you." },
};

export const innovated = (id) => !!knowledgeState().innovations[id];
const needMet = (id) => INNOVATIONS[id] ? innovated(id) : knownDiscoveries().includes(id);
export const needName = (id) => INNOVATIONS[id]?.name || (PROJECTS[id] && discoveryName(id)) || id;
export const missingNeeds = (id) => (INNOVATIONS[id].needs || []).filter(need => !needMet(need));
export const missingNotions = (id) => INNOVATIONS[id].notions.filter(n => !notionKnown(n));
// Listed once every discovery it rests on, however far back, has been made
export const innovationShown = (id) => (INNOVATIONS[id].needs || [])
    .every(need => INNOVATIONS[need] ? innovationShown(need) : needMet(need));
export const canWork = (id) => !innovated(id) && !missingNeeds(id).length;
export const canStudy = (id) => canWork(id) && !missingNotions(id).length;

addEffectSource(() => Object.keys(INNOVATIONS).filter(innovated).map(id => INNOVATIONS[id]));

registerBoost("Innovations", (resourceId) => Object.keys(INNOVATIONS)
    .reduce((total, id) => total * (innovated(id) && INNOVATIONS[id].world?.[resourceId] || 1), 1));
export const worldText = (id) => Object.entries(INNOVATIONS[id].world || {})
    .map(([resourceId, times]) => `x${times} ${resourceDefs[resourceId].name} everywhere`).join(", ");


//    !!! THE NOTE !!!

// A hex sheet with the innovation's notions pinned around the edge; joining them all up finishes it
const radiusFor = (id) => INNOVATIONS[id].notions.length > 3 ? 3 : 2;

function layout(id) {
    const radius = radiusFor(id);
    const cells = hexesWithin(radius);
    const count = INNOVATIONS[id].notions.length;
    const pinned = {};
    INNOVATIONS[id].notions.forEach((notion, i) => {
        const dir = HEX_DIRECTIONS[Math.round(i * 6 / count) % 6];
        pinned[hexId(dir.q * radius, dir.r * radius)] = notion;
    });
    const seed = hashText(id);
    for (let tries = 0; tries < 20; tries++) {
        const blocked = new Set(cells.map(c => c.id).filter(cid => !pinned[cid])
            .sort((a, b) => seededRandom(seed + tries, hashText(a)) - seededRandom(seed + tries, hashText(b)))
            .slice(0, radius * 2 - 1));
        const open = reach(cells, pinned, (from, to) => !blocked.has(to));
        if (Object.keys(pinned).every(cid => open.has(cid))) return { radius, cells, pinned, blocked };
    }
    return { radius, cells, pinned, blocked: new Set() };
}

// Cells reachable from the first pinned one, stepping only where step allows
function reach(cells, pinned, step) {
    const byId = Object.fromEntries(cells.map(c => [c.id, c]));
    const start = Object.keys(pinned)[0];
    const seen = new Set([start]);
    const queue = [byId[start]];
    while (queue.length) {
        const cell = queue.shift();
        for (const n of neighborsOf(cell)) {
            if (!byId[n.id] || seen.has(n.id) || !step(cell.id, n.id)) continue;
            seen.add(n.id);
            queue.push(byId[n.id]);
        }
    }
    return seen;
}

const layouts = {};
export const noteLayout = (id) => layouts[id] || (layouts[id] = layout(id));
export const notePlaced = (id) => knowledgeState().notes[id] || {};
export const noteAt = (id, cellId) => noteLayout(id).pinned[cellId] || notePlaced(id)[cellId] || null;

// Cells joined to the first pinned notion through linked neighbors
export function noteJoined(id) {
    const { cells, pinned } = noteLayout(id);
    return reach(cells, pinned, (from, to) => {
        const there = noteAt(id, to);
        return there && linked(noteAt(id, from), there);
    });
}
const noteDone = (id) => Object.keys(noteLayout(id).pinned).every(cid => noteJoined(id).has(cid));

export function placeProblem(id, cellId, notion) {
    const { cells, pinned, blocked } = noteLayout(id);
    if (!canWork(id)) return "Can't work on this yet.";
    if (!cells.some(c => c.id === cellId) || blocked.has(cellId) || pinned[cellId]) return "Nothing can go there.";
    if (notePlaced(id)[cellId]) return "Something is already there.";
    if (!notion) return "Pick a notion to place.";
    return notionCount(notion) < 1 ? `No ${NOTIONS[notion].name} left.` : null;
}

// Returns whether that finished the innovation
export function placeNotion(id, cellId, notion) {
    if (placeProblem(id, cellId, notion)) return false;
    spendNotion(notion);
    const k = knowledgeState();
    (k.notes[id] ||= {})[cellId] = notion;
    if (!noteDone(id)) return false;
    k.innovations[id] = true;
    return true;
}

// A notion taken back off the note is spent
export function clearCell(id, cellId) {
    const placed = knowledgeState().notes[id];
    if (placed && !innovated(id)) delete placed[cellId];
}
export const clearNote = (id) => { if (!innovated(id)) delete knowledgeState().notes[id]; };
