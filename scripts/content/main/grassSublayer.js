// grassSublayer.js
//
// The grass sublayer. It goes off of columns unlike a lot of other layers. Based around growth,
// which is gotten from grass spreading and sacrificing green core growth levels. You get bonuses
// based on your highest growth, and you can spend it to purchase grass upgrades.
// Some of the milestone bonuses are types of grass, which give different bonuses based on
// different growth speeds and stuff.

import { registerLayer } from "../../core/registry.js";
import { getLayerState } from "../../core/state.js";
import { getLevel, addResource } from "../../core/resources.js";
import { registerBoost } from "../../core/boosts.js";
import { D } from "../../utils/decimal.js";
import { formatNumber, formatWhole, formatPercent } from "../../utils/format.js";
import { setText, setWidth } from "../../utils/dom.js";
import { setRichText, upgradeDescription } from "../../render/richText.js";
import {
    mapTiles, SEED, GROWING, MATURE, STAGE_NAMES, ADJACENT_SHARE,
    worldState, grassOn, grassTiles, growableTiles, growthRate,
    grassGreenMultiplier, grassBlueMultiplier, grassBonuses,
    GROWTH_PER_LEVEL as SOIL_PER_LEVEL, OUTPUT_PER_LEVEL as BLADES_PER_LEVEL,
} from "./worldMap.js";
import { canSacrificeStage, sacrificeValue, sacrificeStage } from "./coresLayer.js";

const grassBought = () => !!getLayerState("cores").purchasedUpgrades.grass;
const grassState = () => getLayerState("grass");
const level = (id) => getLevel(grassState(), id);


export const growthTotal = () => D(grassState().resources.growth || 0);
export const growthPeak = () => D(grassState().growthPeak || 0).max(growthTotal()); // Highest growth reached

// Stores the highest growth
function notePeak() {
    const s = grassState();
    const now = growthTotal();
    if (now.gt(s.growthPeak || 0)) s.growthPeak = now;
}

const GROWTH_PER_SPREAD = 5; // Growth you get per grass tile spreading
export const CORE_GROWTH_PER_GROWTH = 10; // Growth you get per 100 green core growth points sacrificed.


// All growth gain goes through this. Google be coming in clutch for upgrade names.
// Tillering is the production of grass offshoots. Knowledge!
export const growthGain = (raw) =>
    D(raw).mul(fromMilestones("growth")).mul(1 + TILLERING_PER_LEVEL * level("tillering"));

export function earnGrowth(raw) {
    // Through the shared pool like everywhere else earns/spends, not a direct write
    addResource("growth", growthGain(raw));
    notePeak();
}

const perSpread = () => GROWTH_PER_SPREAD * activeType().growth;

export const spreadValue = () => growthGain(perSpread());
export const earnSpreadGrowth = (tiles) => earnGrowth(perSpread() * tiles);

// Grass types. Different grasses give different outputs, growth, and grow at different speeds
export const GRASS_TYPES = {
    meadow: {
        name: "Meadow Grass",
        color: "#6fcf7f",
        output: 1, speed: 1, growth: 1,
        blurb: "Ordinary grass, with nothing to say for itself. It has never let anyone down.",
    },
    clover: {
        name: "Clover",
        color: "#8fd46a",
        output: 1.6, speed: 0.5, growth: 1,
        blurb: "Fixes its own nitrogen and takes its time about everything else.",
    },
    ryegrass: {
        name: "Ryegrass",
        color: "#b6d94f",
        output: 0.55, speed: 2.2, growth: 1,
        blurb: "Coarse, thin, and in a rush. Covers ground faster than any other grass.",
    },
    sedge: {
        name: "Sedge",
        color: "#79c2a4",
        output: 0.5, speed: 0.9, growth: 4,
        blurb: "Barely a grass at all. Spends everything it makes on taking the next tile.",
    },
    switchgrass: {
        name: "Switchgrass",
        color: "#d6c94a",
        output: 4, speed: 0.3, growth: 1,
        blurb: "Roots three metres down. A tile of it is worth four of anything else, and it is in no rush whatsoever.",
    },
};

export const DEFAULT_TYPE = "meadow";

export function activeTypeId() {
    const id = grassState().grassType;
    return GRASS_TYPES[id] && typeUnlocked(id) ? id : DEFAULT_TYPE;
}

export const activeType = () => GRASS_TYPES[activeTypeId()];

export const grassSown = () => grassTiles(worldState()).length > 0;

export function setGrassType(typeId) {
    if (!GRASS_TYPES[typeId] || !typeUnlocked(typeId) || grassSown()) return false;
    grassState().grassType = typeId;
    return true;
}

export const GROWTH_MILESTONES = [
    { at: 200, title: "First Roots", effect: "Grass grows 25% faster.", speed: 1.25 },
    { at: 800, title: "Clover", effect: "A second grass to grow.", unlocks: "clover" },
    { at: 1500, title: "Runners", effect: "Everything gives 50% more Growth.", growth: 1.5 },
    { at: 2500, title: "Thick Sward", effect: "Every grassy tile is worth 50% more.", output: 1.5 },
    { at: 4000, title: "Ryegrass", effect: "A grass that covers ground.", unlocks: "ryegrass" },
    { at: 7000, title: "Rhizomes", effect: "Everything pays twice the Growth.", growth: 2 },
    { at: 10000, title: "Green Tide", effect: "Everything produces 30% more Green Essence.", green: 1.3 },
    { at: 15000, title: "Sedge", effect: "A grass that spreads in the wettest of conditions.", unlocks: "sedge" },
    { at: 25000, title: "Deep Sward", effect: "Every grassy tile is worth three times as much.", output: 3 },
    { at: 35000, title: "Switchgrass", effect: "A grass worth four of any other", unlocks: "switchgrass" },
    { at: 50000, title: "Verdance", effect: "All Green Essence production doubled", green: 2 },
];

export const milestoneReached = (milestone) => growthPeak().gte(milestone.at);
export const reachedMilestones = () => GROWTH_MILESTONES.filter(milestoneReached);
export const nextMilestone = () => GROWTH_MILESTONES.find(m => !milestoneReached(m)) || null;

// Milestones stack by multiplying, so earlier ones still boost later milestones instead of being replaced
const fromMilestones = (key) =>
    reachedMilestones().reduce((total, milestone) => total * (milestone[key] || 1), 1);

// The milestone that hands over a grass, for saying what a locked one is waiting on
export const milestoneUnlocking = (typeId) =>
    GROWTH_MILESTONES.find(m => m.unlocks === typeId) || null;

export const typeUnlocked = (typeId) => {
    const milestone = milestoneUnlocking(typeId);
    return !milestone || milestoneReached(milestone);
};


// Upgrade effects
const TILLERING_PER_LEVEL = 0.3;   // More Growth per tile taken
const SEED_BANK_PER_LEVEL = 0.2;   // How grown a freshly spread tile arrives
const TEMPER_PER_LEVEL = 0.15;     // How much of a grass's penalty is given back
const FINGERS_PER_LEVEL = 0.4;     // More Green Essence from grass

const temper = (value, levels) =>
    value >= 1 ? value : Math.min(1, value + (1 - value) * TEMPER_PER_LEVEL * levels);

// What the levels bought so far add up to. Nothing bought yet reads as nothing, so a fresh
// upgrade quotes a 0 rather than dressing itself up with its first level's worth
const soFar = (perLevel, levels) => `${round(100 * perLevel * levels)}%`;

// The (+x%) tail closing an upgrade description off, naming what one more level buys.
// Gone once the last level is held, the way the cost line stops quoting a price then too
const stepGain = (lvl, max, perLevel) => lvl >= max ? null : `+${soFar(perLevel, 1)}`;


export const grassSpeedMultiplier = () =>
    temper(activeType().speed, level("hardyStrains")) * fromMilestones("speed");

export const grassOutputMultiplier = () =>
    temper(activeType().output, level("hardyStrains")) * fromMilestones("output")
    * (1 + FINGERS_PER_LEVEL * level("greenFingers"));

// What the grass on the map is worth to everything that makes essence, milestones included
// Blue only comes off the tiles that are wet, so a dry world leaves it at 1
export const greenMultiplier = () => fromMilestones("green") * grassGreenMultiplier(worldState());
export const blueMultiplier = () => grassBlueMultiplier(worldState());

registerBoost("Grass", (resourceId) => resourceId === "greenEssence" ? greenMultiplier()
    : resourceId === "blueEssence" ? blueMultiplier() : 1);

// How grown a tile is when the grass first reaches it. worldMap adds this to what the cards give
export const grassSeedStart = () => SEED_BANK_PER_LEVEL * level("seedBank");

// Grass' differences from plain meadow grass.
export function typeEffects(type) {
    const levels = level("hardyStrains");
    const out = [];
    const say = (value, tail) => { if (value !== 1) out.push(`x${round(value)} ${tail}`); };
    say(temper(type.output, levels), "to what a tile of it is worth");
    say(temper(type.speed, levels), "growth speed");
    say(type.growth, "Growth when it spreads");
    return out;
}

const round = (value) => Number(value.toFixed(2));

export const GRASS_RESOURCES = ["greenEssence", "blueEssence", "growth"];

const stageCounts = (s) => {
    const counts = [0, 0, 0];
    for (const id of grassTiles(s)) counts[s.grass[id].stage]++;
    return counts;
};

// How long the fastest-growing tile is growing. Might remove later idk
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

                    <div class="growth-panel">
                        <div class="growth-head">
                            <span class="growth-amount"></span>
                            <span class="growth-unit">Growth</span>
                        </div>
                        <div class="growth-track"><div class="growth-fill"></div></div>
                        <div class="growth-best"></div>
                    </div>

                    <button class="grass-sacrifice" type="button">
                        <span class="sacrifice-title">Give up a green core growth stage</span>
                        <span class="sacrifice-detail"></span>
                    </button>

                    <div class="cards-heading">Grasses <span class="grass-sown"></span></div>
                    <div class="grass-types"></div>

                    <div class="cards-heading">Next milestone</div>
                    <div class="milestone-next"></div>

                    <div class="cards-heading">Earned</div>
                    <div class="milestone-earned"></div>
                </div>
            `;

            el.querySelector(".grass-sacrifice").addEventListener("click", () => sacrificeStage());
            // Delegated, because the cards are rebuilt whenever a grass unlocks
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
            updateGrowth(el);
            updateSacrifice(el);

            const active = activeTypeId();
            const sown = grassSown();
            const typeSignature = `${active}::${level("hardyStrains")}::${sown}`
                + `::${Object.keys(GRASS_TYPES).filter(typeUnlocked).join(",")}`;
            if (el.__types !== typeSignature) {
                el.__types = typeSignature;
                el.querySelector(".grass-types").innerHTML =
                    Object.keys(GRASS_TYPES).map(id => typeMarkup(id, active, sown)).join("");
                setText(el.querySelector(".grass-sown"), sown
                    ? "Sown. This world grows this one."
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
            title: "Tillering",
            description: (s, lvl) => upgradeDescription(
                `Every tile the grass takes for itself is worth +${soFar(TILLERING_PER_LEVEL, lvl)} more Growth.`,
                stepGain(lvl, 4, TILLERING_PER_LEVEL)),
            max: 4,
            cost: (s, lvl) => ({ growth: D(200).mul(D(3).pow(lvl)) }),
        },
        seedBank: {
            title: "Seed Bank",
            description: (s, lvl) => upgradeDescription(
                `Grass spreads onto a new tile starting +${soFar(SEED_BANK_PER_LEVEL, lvl)} grown`
                + ` instead of as a bare seed.`,
                stepGain(lvl, 3, SEED_BANK_PER_LEVEL)),
            max: 3,
            cost: (s, lvl) => ({ growth: D(400).mul(D(3).pow(lvl)) }),
        },
        greenFingers: {
            title: "Green Fingers",
            description: (s, lvl) => upgradeDescription(
                `Every grassy tile is worth ${soFar(FINGERS_PER_LEVEL, lvl)} more, whichever type it is.`,
                stepGain(lvl, 5, FINGERS_PER_LEVEL)),
            max: 5,
            cost: (s, lvl) => ({ growth: D(600).mul(D(4).pow(lvl)) }),
        },
        hardyStrains: {
            title: "Hardy Strains",
            description: (s, lvl) => upgradeDescription(
                `Grasses give back ${soFar(TEMPER_PER_LEVEL, lvl)} of whatever their species trades away.`,
                stepGain(lvl, 3, TEMPER_PER_LEVEL)),
            max: 3,
            hidden: () => growthPeak().lt(800),
            cost: (s, lvl) => ({ growth: D(1200).mul(D(3).pow(lvl)) }),
        },
        richerSoil: {
            title: "Richer Soil",
            description: (s, lvl) => upgradeDescription(
                `Grass moves through its stages +${soFar(SOIL_PER_LEVEL, lvl)} faster, everywhere.`,
                stepGain(lvl, 10, SOIL_PER_LEVEL)),
            max: 10,
            cost: (s, lvl) => ({ greenEssence: D("6e7").mul(D(1.75).pow(lvl)) }),
        },
        greenerBlades: {
            title: "Greener Blades",
            description: (s, lvl) => upgradeDescription(
                `Every grassy tile is worth +${soFar(BLADES_PER_LEVEL, lvl)} more, whichever type it is.`,
                stepGain(lvl, 10, BLADES_PER_LEVEL)),
            max: 10,
            cost: (s, lvl) => ({ greenEssence: D("1e8").mul(D(1.85).pow(lvl)) }),
        },
    },
};

// Where the grass on the map is up to
function summary() {
    const world = worldState();
    const planted = grassTiles(world).length;
    const open = growableTiles(world).length;
    if (planted === 0) return "Nothing planted yet.";

    const [seeds, growing, mature] = stageCounts(world);
    const seconds = fastestStageSeconds(world);
    return `${activeType().name} on ${planted} of ${open} open tiles`
        + ` - ${seeds} ${STAGE_NAMES[SEED].toLowerCase()},`
        + ` ${growing} ${STAGE_NAMES[GROWING].toLowerCase()},`
        + ` ${mature} ${STAGE_NAMES[MATURE].toLowerCase()}.`
        + ` A stage every ${seconds.toFixed(1)}s at best.`
        + (planted === open
            ? " Every tile it can reach is grassed over - claim more for it to spread into."
            : ` Each tile it takes is worth ${formatNumber(spreadValue())} Growth.`);
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
        `Every tile also hands ${Math.round(ADJACENT_SHARE * 100)}% of its own bonus to each`
        + ` neighbouring tile that produces, and those stack on each other.`);

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

    // Milestones multiply what the tiles add up to instead of adding to it, so they only show once
    // there are some, and when they do, the tile total goes in as well or else the two don't follow
    const fromGreen = fromMilestones("green");
    if (fromGreen > 1) {
        rows.push(totalRow("All tiles together", grassGreenMultiplier(s)));
        rows.push(totalRow("Growth milestones", fromGreen));
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


function updateGrowth(el) {
    setText(el.querySelector(".growth-amount"), formatNumber(growthTotal()));

    const next = nextMilestone();
    const peak = growthPeak();
    if (!next) {
        setWidth(el.querySelector(".growth-fill"), 1);
        setText(el.querySelector(".growth-best"), `Best ${formatWhole(peak)} - nothing left to reach.`);
        return;
    }

    const reached = reachedMilestones();
    const from = reached.length > 0 ? reached[reached.length - 1].at : 0;
    setWidth(el.querySelector(".growth-fill"), peak.sub(from).div(next.at - from).toNumber());
    setText(el.querySelector(".growth-best"),
        `Best ${formatWhole(peak)} of ${formatWhole(next.at)} - milestones go off the highest it has ever been.`);
}

function updateSacrifice(el) {
    const cores = getLayerState("cores");
    const able = canSacrificeStage(cores);

    el.querySelector(".grass-sacrifice").disabled = !able;
    setText(el.querySelector(".sacrifice-detail"), able
        ? `Stage ${cores.growthStage} down to ${cores.growthStage - 1}, for ${formatNumber(sacrificeValue(cores))} Growth.`
            + (cores.growth.gt(0) ? " Progress toward the next stage goes with it." : "")
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
        : `<li>Needs ${formatWhole(milestoneUnlocking(id).at)} Growth</li>`;

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
        <div class="milestone-row">
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
        <div class="milestone-row earned">
            <div class="milestone-facts">
                <div class="milestone-title">${milestone.title}</div>
                <div class="milestone-effect">${milestone.effect}</div>
            </div>
            <div class="milestone-at">${formatWhole(milestone.at)}</div>
        </div>`).join("");
}

registerLayer("grass", {
    categoryId: "main",
    group: "world",
    order: 2,
    startUnlocked: false, // The Grass node on the Cores tree opens it
    absorbedBy: "environment",

    resources: GRASS_RESOURCES,

    initialState: {
        grassType: DEFAULT_TYPE,
        growthPeak: D(0),
    },

    // Grass growing is on the World's tick
    onTick(dt, layer) {
        if (!grassBought()) return;
        notePeak();
    },

    ...GRASS_VIEW,
});
