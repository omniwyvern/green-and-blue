// grassSublayer.js
//
// Column-based grass page around Vitality, from spreading grass and sacrificed core stages

import { registerLayer } from "../../../core/registry.js";
import { getLayerState } from "../../../core/state.js";
import { addResource, levelsIn, stepNote } from "../../../core/resources.js";
import { registerBoost, boostResource } from "../../../core/boosts.js";
import { D } from "../../../utils/decimal.js";
import { formatNumber, formatWhole, formatPercent } from "../../../utils/format.js";
import { setText, setWidth } from "../../../utils/dom.js";
import { setRichText, upgradeDescription } from "../../../render/richText.js";
import {
    mapTiles, SEED, GROWING, MATURE, STAGE_NAMES, ADJACENT_SHARE,
    worldState, grassOn, grassTiles, growableTiles, growthRate, matureTiles,
    grassGreenMultiplier, grassBlueMultiplier, grassBonuses,
    GROWTH_PER_LEVEL as SOIL_PER_LEVEL, OUTPUT_PER_LEVEL as BLADES_PER_LEVEL,
} from "../systems/worldMap.js";
import { canSacrificeStage, sacrificeValue, sacrificeStage, sacrificeFatigue } from "../layers/coresLayer.js";
import { challengeDone } from "../systems/challenges.js";
import { coreNodeBought } from "../../../core/nodes.js";
import { extendUpgrade, traitBonus } from "../systems/evolutionTraits.js";

const grassState = () => getLayerState("grass");
const level = levelsIn("grass");


//    !!! VITALITY !!!

export const vitalityTotal = () => D(grassState().resources.vitality || 0);
export const vitalityPeak = () => D(grassState().vitalityPeak || 0).max(vitalityTotal());

function notePeak() {
    const s = grassState();
    const now = vitalityTotal();
    if (now.gt(s.vitalityPeak || 0)) s.vitalityPeak = now;
}

export const CORE_GROWTH_PER_VITALITY = 30; // Green core growth a sacrifice trades for one Vitality


// All growth gain goes through this (tillering is grass growing offshoots)
export const vitalityGain = (raw) =>
    D(raw).mul(fromMilestones("vitality")).mul(1 + TILLERING_PER_LEVEL * level("tillering"))
        .mul(boostResource("vitality"));

export function earnVitality(raw) {
    addResource("vitality", vitalityGain(raw));
    notePeak();
}


//    !!! WHAT GROWTH PAYS !!!

const RUNNERS_PER_LEVEL = 1;      // Deep Runners, more Vitality per spread
const TENDING_PER_LEVEL = 0.25;   // Tended Growth, what each stage grown pays as a share of a spread
const MEADOWS_PER_TILE = 0.04;   // Wild Meadows, ramping with how much of the map is grown
const MEADOWS_CEILING = 0.4;

const wildMeadows = () => coreNodeBought("wildMeadows")
    ? Math.min(MEADOWS_CEILING, MEADOWS_PER_TILE * matureTiles(worldState()).length) : 0;

const spreadWorth = () => (1 + RUNNERS_PER_LEVEL * level("deepRunners")) * (1 + wildMeadows());
const perSpread = () => 5 * activeType().vitality * spreadWorth();
const perStage = () => perSpread() * TENDING_PER_LEVEL * level("tendedGrowth");

export const stageValue = () => vitalityGain(perStage());
export function earnStageGrowth(stages) {
    if (stages > 0 && perStage() > 0) earnVitality(perStage() * stages);
}

export const spreadValue = () => vitalityGain(perSpread());
export const earnSpreadGrowth = (tiles) => earnVitality(perSpread() * tiles);


//    !!! THE GRASSES !!!

// Grass types. Different grasses give different outputs, vitality, and grow at different speeds
export const GRASS_TYPES = {
    meadow: {
        name: "Meadow Grass",
        color: "#6fcf7f",
        output: 1, speed: 1, vitality: 1,
        blurb: "Ordinary, reliable grass.",
    },
    clover: {
        name: "Clover",
        color: "#8fd46a",
        output: 1.6, speed: 0.5, vitality: 1,
        blurb: "Feeds its own soil, but grows slowly.",
    },
    ryegrass: {
        name: "Ryegrass",
        color: "#b6d94f",
        output: 0.55, speed: 2.2, vitality: 1,
        blurb: "Spreads faster than any other grass.",
    },
    sedge: {
        name: "Sedge",
        color: "#79c2a4",
        output: 0.5, speed: 0.9, vitality: 4,
        blurb: "Puts everything into spreading.",
    },
    switchgrass: {
        name: "Switchgrass",
        color: "#d6c94a",
        output: 4, speed: 0.3, vitality: 1,
        blurb: "Deep roots. Worth the most, but slow.",
    },
    fescue: {
        name: "Fescue",
        color: "#9fd8c8",
        output: 2, speed: 1.4, vitality: 1,
        blurb: "Grows fast, even in the cold.",
    },
};

export const DEFAULT_TYPE = "meadow";

export function activeTypeId() {
    const id = grassState().grassType;
    return GRASS_TYPES[id] && typeUnlocked(id) ? id : DEFAULT_TYPE;
}

export const activeType = () => GRASS_TYPES[activeTypeId()];

export const grassSown = () => grassTiles(worldState()).length > 0;

// Rotation, from the fallow challenge, lets you change all the grass in the world at any time
export const typeLocked = () => grassSown() && !challengeDone("fallow");

export function setGrassType(typeId) {
    if (!GRASS_TYPES[typeId] || !typeUnlocked(typeId) || typeLocked()) return false;
    grassState().grassType = typeId;
    return true;
}


//    !!! MILESTONES !!!

export const VITALITY_MILESTONES = [
    { at: 200, title: "First Roots", effect: "Grass grows 25% faster.", speed: 1.25 },
    { at: 800, title: "Clover", effect: "A second grass to grow.", unlocks: "clover" },
    { at: 1500, title: "Runners", effect: "Everything gives 50% more Vitality.", vitality: 1.5 },
    { at: 2500, title: "Thick Turf", effect: "Every grassy tile is worth 50% more.", output: 1.5 },
    { at: 4000, title: "Ryegrass", effect: "A grass that covers ground.", unlocks: "ryegrass" },
    { at: 7000, title: "Creeping Roots", effect: "Everything pays twice the Vitality.", vitality: 2 },
    { at: 10000, title: "Green Tide", effect: "Everything produces 30% more Green Essence.", green: 1.3 },
    { at: 15000, title: "Sedge", effect: "A grass that spreads in the wettest of conditions.", unlocks: "sedge" },
    { at: 25000, title: "Deep Turf", effect: "Every grassy tile is worth three times as much.", output: 3 },
    { at: 35000, title: "Switchgrass", effect: "A grass worth four of any other", unlocks: "switchgrass" },
    { at: 50000, title: "Verdance", effect: "All Green Essence production quintupled", green: 5 },
    { at: 70000, title: "Fescue", effect: "A grass that keeps going through the cold.", unlocks: "fescue" },

    // Placeholders past the previous end of the track
    { at: 100000, title: "Wellspring", special: "wellspring", effect: "The pond makes 100x Blue Essence. While it's full and balanced, all Blue"
        + " Essence and Biomass are multiplied by the fourth root of your Biomass." },
    { at: 120000, title: "Rich Turf", effect: "Every grassy tile is worth four times as much.", output: 4 },
    { at: 150000, title: "Meadow", effect: "Everything produces ten times the Blue Essence.", blue: 10 },
    { at: 250000, title: "Grassland", effect: "Everything produces twelve times the Green Essence.", green: 12 },
    { at: 500000, title: "Prairie", effect: "Grass grows twice as fast.", speed: 2 },
    { at: 1000000, title: "Steppe", effect: "Everything produces fifteen times the Blue Essence.", blue: 15 },
    { at: 2000000, title: "Savanna", effect: "Every grassy tile is worth five times as much.", output: 5 },

    // Stretches Evolution traits open up
    { at: 1e10, band: 1, title: "Tallgrass", effect: "Everything pays three times the Vitality.", vitality: 3 },
    { at: 5e10, band: 1, title: "Wild Meadow", effect: "Everything produces ten times the Green Essence.", green: 10 },
    { at: 3e11, band: 1, title: "Grass Sea", effect: "Every grassy tile is worth four times as much.", output: 4 },
    { at: 2e12, band: 1, title: "Pampas", effect: "Everything produces ten times the Blue Essence.", blue: 10 },
    { at: 1e13, band: 1, title: "Rolling Plains", effect: "Everything pays five times the Vitality.", vitality: 5 },
    { at: 1e14, band: 1, title: "Endless Green", effect: "Grass grows three times as fast.", speed: 3 },
    { at: 1e15, band: 2, title: "Root Mat", effect: "Everything pays ten times the Vitality.", vitality: 10 },
    { at: 1e16, band: 2, title: "Old Sward", effect: "Every grassy tile is worth eight times as much.", output: 8 },
    { at: 1e17, band: 2, title: "Green World", effect: "Everything produces ten times the Green Essence.", green: 10 },
    { at: 1e18, band: 2, title: "Blue Horizon", effect: "Everything produces ten times the Blue Essence.", blue: 10 },
    { at: 1e20, band: 2, title: "Living Carpet", effect: "Everything pays ten times the Vitality.", vitality: 10 },
    { at: 1e22, band: 2, title: "Ever-Meadow", effect: "Everything produces ten times the Blue and Green Essence.", green: 10, blue: 10 },
];

const milestoneOpen = (milestone) => !milestone.band || traitBonus("milestones") >= milestone.band;
export const milestoneReached = (milestone) => milestoneOpen(milestone) && vitalityPeak().gte(milestone.at);
export const reachedMilestones = () => VITALITY_MILESTONES.filter(milestoneReached);
export const specialMilestone = (key) =>
    VITALITY_MILESTONES.some(m => m.special === key && milestoneReached(m));
export const nextMilestone = () => VITALITY_MILESTONES.find(m => milestoneOpen(m) && !milestoneReached(m)) || null;

const fromMilestones = (key) =>
    reachedMilestones().reduce((total, milestone) => total * (milestone[key] || 1), 1);

// The milestone that hands over a grass, for saying what a locked one is waiting on
export const milestoneUnlocking = (typeId) =>
    VITALITY_MILESTONES.find(m => m.unlocks === typeId) || null;

export const typeUnlocked = (typeId) => {
    const milestone = milestoneUnlocking(typeId);
    return !milestone || milestoneReached(milestone);
};

// What a locked grass is waiting on
const lockNote = (typeId) => `Needs ${formatWhole(milestoneUnlocking(typeId).at)} Vitality`;


//    !!! WHAT THE UPGRADES DO !!!

const TILLERING_PER_LEVEL = 0.3;   // More Vitality per tile taken
const SEED_BANK_PER_LEVEL = 0.2;   // How grown a freshly spread tile arrives
const TEMPER_PER_LEVEL = 0.15;     // How much of a grass's penalty is given back
const FINGERS_PER_LEVEL = 0.4;     // More Green Essence from grass

const temper = (value, levels) =>
    value >= 1 ? value : Math.min(1, value + (1 - value) * TEMPER_PER_LEVEL * levels);

const soFar = (perLevel, levels) => `${round(100 * perLevel * levels)}%`;

const stepGain = (lvl, max, perLevel) => stepNote(lvl, max, `+${soFar(perLevel, 1)}`);


export const grassSpeedMultiplier = () =>
    temper(activeType().speed, level("hardyStrains")) * fromMilestones("speed");

export const grassOutputMultiplier = () =>
    temper(activeType().output, level("hardyStrains")) * fromMilestones("output")
    * (1 + FINGERS_PER_LEVEL * level("greenFingers"));

export const greenMultiplier = () => fromMilestones("green") * grassGreenMultiplier(worldState());
export const blueMultiplier = () => fromMilestones("blue") * grassBlueMultiplier(worldState());

registerBoost("Grass", (resourceId) => resourceId === "greenEssence" ? greenMultiplier()
    : resourceId === "blueEssence" ? blueMultiplier() : 1);

// How grown a tile is when the grass first reaches it. worldMap adds this to what the cards give
export const grassSeedStart = () => SEED_BANK_PER_LEVEL * level("seedBank");


// Grass' differences from the default meadow grass
export function typeEffects(type) {
    const levels = level("hardyStrains");
    const out = [];
    const say = (value, tail) => { if (value !== 1) out.push(`x${round(value)} ${tail}`); };
    say(temper(type.output, levels), "to what a tile of it is worth");
    say(temper(type.speed, levels), "growth speed");
    say(type.vitality, "Vitality when it spreads");
    return out;
}

const round = (value) => Number(value.toFixed(2));


//    !!! THE PAGE !!!

export const GRASS_RESOURCES = ["greenEssence", "blueEssence", "vitality"];

const stageCounts = (s) => {
    const counts = [0, 0, 0];
    for (const id of grassTiles(s)) counts[s.grass[id].stage]++;
    return counts;
};

// How long the fastest-growing tile has been growing; not very useful, might remove
function fastestStageSeconds(s) {
    let best = 0;
    for (const tile of mapTiles()) {
        if (!grassOn(s, tile.id)) continue;
        best = Math.max(best, growthRate(s, tile));
    }
    return best > 0 ? 1 / best : 0;
}

export const GRASS_VIEW = {
    name: "Grass",
    color: "#5aa84f",
    canvasType: "static",
    // Splits the canvas into two columns
    canvasClass: "grass-canvas",

    scene: {
        build(el) {
            el.className = "static-scene grass-scene";
            el.innerHTML = `
                <div class="grass-page flyout-inset">
                    <div class="grass-summary"></div>

                    <div class="yield-panel">
                        <div class="yield-stat yield-green">
                            <span class="yield-value"></span>
                            <span class="yield-label">to all Green Essence</span>
                        </div>
                        <div class="yield-stat yield-blue">
                            <span class="yield-value"></span>
                            <span class="yield-label">to all Blue Essence</span>
                        </div>
                    </div>
                    <div class="yield-share"></div>
                    <div class="yield-breakdown"></div>

                    <div class="vitality-panel">
                        <div class="vitality-head">
                            <span class="vitality-amount"></span>
                            <span class="vitality-unit">Vitality</span>
                        </div>
                        <div class="vitality-track"><div class="vitality-fill"></div></div>
                        <div class="vitality-best"></div>
                        <div class="milestone-next"></div>
                    </div>

                    <button class="grass-sacrifice" type="button">
                        <span class="sacrifice-title">Give up a green core growth stage</span>
                        <span class="sacrifice-detail"></span>
                    </button>

                    <div class="cards-heading">Grasses <span class="grass-sown"></span></div>
                    <div class="grass-types"></div>

                    <div class="cards-heading">Earned</div>
                    <div class="milestone-earned"></div>
                </div>
            `;

            el.querySelector(".grass-sacrifice").addEventListener("click", () => sacrificeStage());
            el.querySelector(".grass-types").addEventListener("click", (e) => {
                const card = e.target.closest("[data-type]");
                if (card) setGrassType(card.dataset.type);
            });

            el.__types = null;
            el.__milestone = null;
        },

        update(el) {
            setText(el.querySelector(".grass-summary"), summary());
            updateYield(el);
            updateVitality(el);
            updateSacrifice(el);

            const active = activeTypeId();
            const sown = typeLocked();
            const typeSignature = `${active}::${level("hardyStrains")}::${sown}`
                + `::${Object.keys(GRASS_TYPES).filter(typeUnlocked).join(",")}`;
            if (el.__types !== typeSignature) {
                el.__types = typeSignature;
                el.querySelector(".grass-types").innerHTML =
                    Object.keys(GRASS_TYPES).map(id => typeMarkup(id, active, sown)).join("");
                setText(el.querySelector(".grass-sown"), sown
                    ? "Sown. This world grows this one."
                    : challengeDone("fallow")
                        ? "Free to change whenever you like. The map turns over with it."
                        : "Free to change until the first seed goes in.");
            }

            const next = nextMilestone();
            const earned = reachedMilestones();
            const milestoneSignature = `${next ? next.title : "done"}::${earned.length}`;
            if (el.__milestone !== milestoneSignature) {
                el.__milestone = milestoneSignature;
                el.querySelector(".milestone-next").innerHTML = nextMilestoneMarkup(next);
                el.querySelector(".milestone-earned").innerHTML = earnedMarkup(earned);
            }
        },
    },

    upgrades: {
        tillering: {
            title: "Fresh Shoots",
            description: (s, lvl) => upgradeDescription(
                `All sources of Vitality are worth +${soFar(TILLERING_PER_LEVEL, lvl)} more.`,
                stepGain(lvl, 4, TILLERING_PER_LEVEL)),
            max: 4,
            cost: (s, lvl) => ({ vitality: D(60).mul(D(2.2).pow(lvl)) }),
        },
        seedBank: {
            title: "Seed Bank",
            description: (s, lvl) => upgradeDescription(
                `Grass spreads onto a new tile starting +${soFar(SEED_BANK_PER_LEVEL, lvl)} grown`
                + ` instead of as a bare seed.`,
                stepGain(lvl, 3, SEED_BANK_PER_LEVEL)),
            max: 3,
            cost: (s, lvl) => ({ vitality: D(300).mul(D(4.5).pow(lvl)) }),
        },
        greenFingers: {
            title: "Green Fingers",
            description: (s, lvl) => upgradeDescription(
                `Every grassy tile is worth ${soFar(FINGERS_PER_LEVEL, lvl)} more, whichever type it is.`,
                stepGain(lvl, 5, FINGERS_PER_LEVEL)),
            max: 5,
            cost: (s, lvl) => ({ vitality: D(250).mul(D(3).pow(lvl)) }),
        },
        hardyStrains: {
            title: "Hardy Strains",
            description: (s, lvl) => upgradeDescription(
                `Grasses give back ${soFar(TEMPER_PER_LEVEL, lvl)} of whatever their species trades away.`,
                stepGain(lvl, 3, TEMPER_PER_LEVEL)),
            max: 3,
            hidden: () => vitalityPeak().lt(800),
            cost: (s, lvl) => ({ vitality: D(1200).mul(D(3).pow(lvl)) }),
        },
        deepRunners: {
            title: "Deep Runners",
            description: (s, lvl) => upgradeDescription(
                `Grass taking a new tile pays +${soFar(RUNNERS_PER_LEVEL, lvl)} more Vitality.`,
                stepGain(lvl, 5, RUNNERS_PER_LEVEL)),
            max: 5,
            cost: (s, lvl) => ({ vitality: D(400).mul(D(3.5).pow(lvl)) }),
        },
        tendedGrowth: {
            title: "Tended Growth",
            description: (s, lvl) => upgradeDescription(
                `Every time a grassy tile grows a stage, it pays ${soFar(TENDING_PER_LEVEL, lvl)} of what spreading does in Vitality.`,
                stepGain(lvl, 4, TENDING_PER_LEVEL)),
            max: 4,
            hidden: () => vitalityPeak().lt(800),
            cost: (s, lvl) => ({ vitality: D(800).mul(D(4).pow(lvl)) }),
        },
        richerSoil: {
            title: "Living Soil",
            description: (s, lvl) => upgradeDescription(
                `Grass grows +${soFar(SOIL_PER_LEVEL, lvl)} faster, everywhere.`,
                stepGain(lvl, 10, SOIL_PER_LEVEL)),
            max: 10,
            cost: (s, lvl) => ({ greenEssence: D("3e7").mul(D(2.5).pow(lvl)) }),
        },
        greenerBlades: extendUpgrade("greenerBlades", {
            title: "Greener Blades",
            description: (s, lvl) => upgradeDescription(
                `Every grassy tile is worth +${soFar(BLADES_PER_LEVEL, lvl)} more, whichever type it is.`,
                stepGain(lvl, 10, BLADES_PER_LEVEL)),
            max: 10,
            cost: (s, lvl) => ({ greenEssence: D("2e7").mul(D(1.6).pow(lvl)) }),
        }, (over) => ({ greenEssence: D("1e38").mul(D(1000).pow(over)) })),
    },
};


//    !!! READING THE PAGE !!!

// Where the grass on the map is up to
function summary() {
    const world = worldState();
    const planted = grassTiles(world).length;
    const open = growableTiles(world).length;
    if (planted === 0) return "Nothing planted yet.";

    const [seeds, growing, mature] = stageCounts(world);
    const seconds = fastestStageSeconds(world);
    return `${activeType().name} on ${planted} of ${open} open tiles`
        + `: ${seeds} ${STAGE_NAMES[SEED].toLowerCase()},`
        + ` ${growing} ${STAGE_NAMES[GROWING].toLowerCase()},`
        + ` ${mature} ${STAGE_NAMES[MATURE].toLowerCase()}.`
        + (planted === open
            ? " Every tile it can reach is grassed over, so claim more for it to spread into."
            : ` Each tile it takes is worth ${formatNumber(spreadValue())} Vitality.`)
        + (perStage() > 0 ? ` Each stage a tile grows pays ${formatNumber(stageValue())}.` : "");
}

// The two multipliers the grass is handing the rest of the game, and where they came from
function updateYield(el) {
    const world = worldState();
    const green = greenMultiplier();
    const blue = blueMultiplier();

    setText(el.querySelector(".yield-green .yield-value"), `x${formatNumber(green)}`);
    setText(el.querySelector(".yield-blue .yield-value"), `x${formatNumber(blue)}`);
    // Nothing is wet, so the Blue half is sitting at 1 and says why rather than looking broken
    el.querySelector(".yield-blue").classList.toggle("idle", blue <= 1);
    setRichText(el.querySelector(".yield-blue .yield-label"), blue > 1
        ? "to all Blue Essence" : "Blue needs wet grass");

    setText(el.querySelector(".yield-share"),
        `Every tile gives ${Math.round(ADJACENT_SHARE * 100)}% of its bonus to `
        + ` neighboring tiles.`);

    const breakdown = breakdownMarkup(world);
    const target = el.querySelector(".yield-breakdown");
    if (target.__markup !== breakdown) {
        target.__markup = breakdown;
        target.innerHTML = breakdown;
    }
}

// One row per stage on the map, plus whatever is wet, so it's clear which tiles are carrying it
function breakdownMarkup(s) {
    const tiles = grassTiles(s);
    if (tiles.length === 0) {
        return `<div class="cards-empty">Nothing planted, so nothing is multiplied.</div>`;
    }

    const bonuses = grassBonuses(s);
    const byStage = [[], [], []];
    for (const id of tiles) byStage[s.grass[id].stage].push(bonuses.green(id));

    const rows = [];
    for (let stage = MATURE; stage >= SEED; stage--) {
        if (byStage[stage].length > 0) rows.push(yieldRow(STAGE_NAMES[stage], byStage[stage], "green"));
    }

    const wet = tiles.map(id => bonuses.blue(id)).filter(bonus => bonus > 0);
    if (wet.length > 0) rows.push(yieldRow("Wet ground", wet, "blue"));

    const fromGreen = fromMilestones("green");
    if (fromGreen > 1) {
        rows.push(totalRow("All tiles together", grassGreenMultiplier(s)));
        rows.push(totalRow("Vitality milestones", fromGreen));
    }

    return rows.join("");
}

function totalRow(name, multiplier) {
    return `
        <div class="yield-row green summed">
            <span class="yield-row-name">${name}</span>
            <span class="yield-row-total">x${formatNumber(multiplier)}</span>
        </div>`;
}

function yieldRow(name, bonuses, tone) {
    const total = bonuses.reduce((sum, bonus) => sum + bonus, 0);
    const each = total / bonuses.length;
    const even = bonuses.every(bonus => Math.abs(bonus - each) < 1e-9);

    return `
        <div class="yield-row ${tone}">
            <span class="yield-row-name">${name}</span>
            <span class="yield-row-count">${bonuses.length} tile${bonuses.length === 1 ? "" : "s"}</span>
            <span class="yield-row-each">${even ? "" : "avg "}+${formatPercent(each)} each</span>
            <span class="yield-row-total">+${formatPercent(total)}</span>
        </div>`;
}


function updateVitality(el) {
    setText(el.querySelector(".vitality-amount"), formatNumber(vitalityTotal()));

    const next = nextMilestone();
    const peak = vitalityPeak();
    if (!next) {
        setWidth(el.querySelector(".vitality-fill"), 1);
        setText(el.querySelector(".vitality-best"), `Best ${formatWhole(peak)}, nothing left to reach.`);
        return;
    }

    const reached = reachedMilestones();
    const from = reached.length > 0 ? reached[reached.length - 1].at : 0;
    setWidth(el.querySelector(".vitality-fill"), peak.sub(from).div(next.at - from).toNumber());
    setText(el.querySelector(".vitality-best"),
        `Highest Vitality: ${formatWhole(peak)} of ${formatWhole(next.at)}`);
}

function updateSacrifice(el) {
    const cores = getLayerState("cores");
    const able = canSacrificeStage(cores);

    el.querySelector(".grass-sacrifice").disabled = !able;
    setText(el.querySelector(".sacrifice-detail"), able
        ? `Stage ${cores.growthStage} down to ${cores.growthStage - 1}, for ${formatNumber(sacrificeValue(cores))} Vitality.`
            + (cores.growth.gt(0) ? " Progress toward the next stage goes with it." : "")
            + (sacrificeFatigue(cores) >= 0.05 ? ` Recent sacrifices: worth ${formatPercent(1 / (1 + sacrificeFatigue(cores)))}, recovering over time.` : "")
        : "The core is down to its first stage. Nothing left to give.");
}

function typeMarkup(id, activeId, sown) {
    const type = GRASS_TYPES[id];
    const unlocked = typeUnlocked(id);
    const active = id === activeId;
    const state = !unlocked ? "locked" : active ? "active" : sown ? "sown" : "";

    const effects = typeEffects(type);
    const body = unlocked
        ? (effects.length > 0
            ? effects.map(line => `<li>${line}</li>`).join("")
            : `<li>Nothing either way</li>`)
        : `<li>${lockNote(id)}</li>`;

    return `
        <div class="grass-card ${state}" ${unlocked && !sown ? `data-type="${id}"` : ""} style="--blade: ${type.color}">
            <div class="grass-card-head">
                ${GRASS_ART}
                <span class="grass-card-name">${unlocked ? type.name : "???"}</span>
            </div>
            <ul class="grass-card-effects">${body}</ul>
            <div class="grass-card-blurb">${unlocked ? type.blurb : "Some other green thing, still out of reach."}</div>
        </div>`;
}

// One drawing for all of them, tinted by the card's own blade
const GRASS_ART = `
    <svg class="grass-card-art" viewBox="0 0 40 40" aria-hidden="true">
        <path class="grass-blade" d="M20 31 C18.2 24 19.4 18 17.6 12"/>
        <path class="grass-blade" d="M20 31 C22 25 23.4 20 25.8 15"/>
        <path class="grass-blade" d="M20 31 C16.4 27 13.6 23 11.6 18.5"/>
        <path class="grass-blade" d="M20 31 C24 28 26.8 25 28.6 21"/>
    </svg>`;

// Only ever the one that's next, and nothing for if anything follows it
function nextMilestoneMarkup(milestone) {
    if (!milestone) {
        return `<div class="milestone-row"><div class="milestone-facts">
            <div class="milestone-title">Nothing ahead</div>
            <div class="milestone-effect">The grass has nothing further to reach for.</div>
        </div></div>`;
    }
    return `
        <div class="milestone-row${milestone.special ? " special" : ""}">
            <div class="milestone-facts">
                <div class="milestone-title">${milestone.title}</div>
                <div class="milestone-effect">${milestone.effect}</div>
            </div>
        </div>`;
}

function earnedMarkup(earned) {
    if (earned.length === 0) {
        return `<div class="cards-empty">Nothing reached yet.</div>`;
    }
    return earned.map(milestone => `
        <div class="milestone-row earned${milestone.special ? " special" : ""}">
            <div class="milestone-facts">
                <div class="milestone-title">${milestone.title}</div>
                <div class="milestone-effect">${milestone.effect}</div>
            </div>
            <div class="milestone-at">${formatWhole(milestone.at)}</div>
        </div>`).join("");
}


//    !!! THE LAYER !!!

registerLayer("grass", {
    categoryId: "main",
    group: "world",
    order: 2,
    startUnlocked: false, // The Grass node on the Cores tree opens it
    absorbedBy: "environment",

    resources: GRASS_RESOURCES,

    initialState: {
        grassType: DEFAULT_TYPE,
        vitalityPeak: D(0),
    },

    // Grass growing is on the World's tick
    onTick(dt, layer) {
        if (!coreNodeBought("grass")) return;
        notePeak();
    },

    ...GRASS_VIEW,
});
