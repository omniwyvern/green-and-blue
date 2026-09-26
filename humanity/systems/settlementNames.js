// settlementNames.js
//
// Two halves glued together, each drawn from what the land around the site actually has

import { settlements } from "./settlements.js";

const POOLS = {
    pastoral: { first: ["Barley", "Oat", "Hay", "Meadow", "Clover", "Sheaf", "Plow", "Rye", "Bramble"],
                last: ["field", "ham", "stead", "furrow", "acre", "ley"] },
    wooded:   { first: ["Oak", "Ash", "Elm", "Pine", "Birch", "Alder", "Thorn", "Holly"],
                last: ["wood", "holt", "grove", "stump", "bough", "hurst"] },
    fishing:  { first: ["Lake", "Brook", "Reed", "Pike", "Trout", "Well", "Carp"],
                last: ["mere", "ford", "brook", "well", "pool", "water"] },
    harbor:   { first: ["Salt", "Tide", "Gull", "Brine", "Kelp", "Anchor", "Wave", "Shell", "Boat", "Fish", "Whale"],
                last: ["haven", "port", "wick", "mouth", "strand", "cove"] },
    fen:      { first: ["Moss", "Peat", "Bog", "Mire", "Sedge", "Rush", "Murk"],
                last: ["fen", "moor", "mire", "marsh", "bog"] },
    frost:    { first: ["Frost", "Rime", "Snow", "Ice", "Hail", "Winter", "Sleet", "White"],
                last: ["hold", "holm", "drift", "frost", "fell", "peak"] },
    fungal:   { first: ["Spore", "Cap", "Mold", "Puff", "Truffle", "Morel"],
                last: ["gill", "hollow", "cap", "rot", "ring", "shade"] },
    frontier: { first: ["Dust", "Far", "Lone", "Last", "Wander", "Scrub"],
                last: ["reach", "rest", "end", "camp", "cross"] },
};
const GENERIC = {
    first: ["Stone", "Black", "High", "Old", "New", "Bone", "Iron"],
    last: ["ton", "by", "burg", "thorpe", "stead", "gate", "hearth", "bury"],
};
const GRIM = {
    first: ["Grief", "Grim", "Rot", "Hollow", "Bleak", "Sorrow", "Gallows"],
    last: ["woe", "grave", "mourn", "fall", "bane"],
};

const DOOMED = {
    first: ["Dread", ""],
    last: ["doom", "murdered", "ruin"],
}

const GRIM_CHANCE = { harsh: 0.4, doomed: 0.7 };
export const MOST_NAME_LENGTH = 24;

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const stem = (word) => word.toLowerCase().replace(/(s|e|ed|ing)$/, "");

function half(types, quality, part) {
    if (Math.random() < (GRIM_CHANCE[quality] || 0)) return pick(GRIM[part]);
    const themed = types.flatMap(type => (POOLS[type] || POOLS.frontier)[part]);
    return Math.random() < 0.75 ? pick(themed) : pick(GENERIC[part]);
}

export function generateName(types, quality, avoid = "") {
    const taken = new Set(settlements().map(t => t.name.toLowerCase()));
    let name = "";
    for (let tries = 0; tries < 40; tries++) {
        const first = half(types, quality, "first");
        const last = half(types, quality, "last");
        if (stem(first).includes(stem(last)) || stem(last).includes(stem(first))) continue;
        name = first + last;
        if (!taken.has(name.toLowerCase()) && name !== avoid) return name;
    }
    return name || "Newstead";
}

export const cleanName = (typed, fallback) => (typed || "").replace(/\s+/g, " ").trim().slice(0, MOST_NAME_LENGTH) || fallback;
