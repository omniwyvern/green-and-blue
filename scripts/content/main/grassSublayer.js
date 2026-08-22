// grassSublayer.js
//
// The grass sublayer. It goes off of columns unlike a lot of other layers. Based around growth,
// which is gotten from grass spreading and sacrificing green core growth levels. You get bonuses
// based on your highest growth, and you can spend it to purchase grass upgrades.
// Some of the milestone bonuses are types of grass, which give different bonuses based on
// different growth speeds and stuff.

import { registerLayer } from "../../core/registry.js";
import { getLayerState } from "../../core/state.js";
import { addResource, getLevel } from "../../core/resources.js";
import { D } from "../../utils/decimal.js";
import { formatNumber, formatWhole } from "../../utils/format.js";
import {
    mapTiles, SEED, GROWING, MATURE, STAGE_NAMES,
    worldState, grassOn, grassTiles, growableTiles, growthRate, production, soakedBlue,
} from "./worldMap.js";
import { canSacrificeStage, sacrificeValue, sacrificeStage } from "./coresLayer.js";

const grassBought = () => !!getLayerState("cores").purchasedUpgrades.grass;
const grassState = () => getLayerState("grass");
const level = (id) => getLevel(grassState(), id);


export const GROWTH_RESOURCE = { name: "Growth", color: "#8ccf5e" };

export const growthTotal = () => D(grassState().resources.growth || 0);
export const growthPeak = () => D(grassState().growthPeak || 0).max(growthTotal()); // Highest growth reached.

// Stores the highest growth.
function notePeak() {
    const s = grassState();
    const now = growthTotal();
    if (now.gt(s.growthPeak || 0)) s.growthPeak = now;
}

const GROWTH_PER_SPREAD = 5; // Growth you get per grass tile spreading.
export const CORE_GROWTH_PER_GROWTH = 10; // Growth you get per 100 green core growth points sacrificed. 


// All growth gain goes through this. Google be coming in clutch for upgrade names.
// Tillering is the production of grass offshoots. Knowledge!
export const growthGain = (raw) =>
    D(raw).mul(fromMilestones("growth")).mul(1 + TILLERING_PER_LEVEL * level("tillering"));

export function earnGrowth(raw) {
    const s = grassState();
    s.resources.growth = growthTotal().add(growthGain(raw));
    notePeak();
}

const perSpread = () => GROWTH_PER_SPREAD * activeType().growth;

export const spreadValue = () => growthGain(perSpread());
export const earnSpreadGrowth = (tiles) => earnGrowth(perSpread() * tiles);

// Grass types. Different grasses give different outputs, growth, and grow at different speeds.
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

// Falls back rather than trusting the save: a grass can be selected and then, on a later load,
// not exist any more. Better to quietly grow meadow grass than to read modifiers off undefined.
export function activeTypeId() {
    const id = grassState().grassType;
    return GRASS_TYPES[id] && typeUnlocked(id) ? id : DEFAULT_TYPE;
}

export const activeType = () => GRASS_TYPES[activeTypeId()];

// The world grows one grass per evolution. Everything before the first seed is still a choice,
// and the seed is what settles it - the grass on the map is the grass, until an evolution
// clears the map and opens the question again.
export const grassSown = () => grassTiles(worldState()).length > 0;

export function setGrassType(typeId) {
    if (!GRASS_TYPES[typeId] || !typeUnlocked(typeId) || grassSown()) return false;
    grassState().grassType = typeId;
    return true;
}

export const GROWTH_MILESTONES = [
    { at: 200, title: "First Roots", effect: "Grass grows 25% faster.", speed: 1.25 },
    { at: 800, title: "Clover", effect: "A second grass to grow.", unlocks: "clover" },
    { at: 2000, title: "Runners", effect: "Everything gives 50% more Growth.", growth: 1.5 },
    { at: 5000, title: "Thick Sward", effect: "Grass produces 50% more Green Essence.", output: 1.5 },
    { at: 12000, title: "Ryegrass", effect: "A grass that covers ground.", unlocks: "ryegrass" },
    { at: 30000, title: "Rhizomes", effect: "Everything pays twice the Growth.", growth: 2 },
    { at: 75000, title: "Green Tide", effect: "Everything produces 30% more Green Essence.", green: 1.3 },
    { at: 190000, title: "Sedge", effect: "A grass that spreads in the wettest of conditions.", unlocks: "sedge" },
    { at: 480000, title: "Deep Sward", effect: "Grass produces three times the amount of Green Essence.", output: 3 },
    { at: 1200000, title: "Switchgrass", effect: "A grass worth four of any other", unlocks: "switchgrass" },
    { at: 3000000, title: "Verdance", effect: "All Green Essence production doubled", green: 2 },
];

export const milestoneReached = (milestone) => growthPeak().gte(milestone.at);
export const reachedMilestones = () => GROWTH_MILESTONES.filter(milestoneReached);
export const nextMilestone = () => GROWTH_MILESTONES.find(m => !milestoneReached(m)) || null;

// Milestones stack by multiplying, so earlier ones still boost later milestones instead of being replaced.
const fromMilestones = (key) =>
    reachedMilestones().reduce((total, milestone) => total * (milestone[key] || 1), 1);

// The milestone that hands over a grass, for saying what a locked one is waiting on.
export const milestoneUnlocking = (typeId) =>
    GROWTH_MILESTONES.find(m => m.unlocks === typeId) || null;

export const typeUnlocked = (typeId) => {
    const milestone = milestoneUnlocking(typeId);
    return !milestone || milestoneReached(milestone);
};


// Upgrade effects
const TILLERING_PER_LEVEL = 0.3;   // More Growth per tile taken.
const SEED_BANK_PER_LEVEL = 0.2;   // How grown a freshly spread tile arrives.
const TEMPER_PER_LEVEL = 0.15;     // How much of a grass's penalty is given back.
const FINGERS_PER_LEVEL = 0.4;     // More Green Essence from grass.

const temper = (value, levels) =>
    value >= 1 ? value : Math.min(1, value + (1 - value) * TEMPER_PER_LEVEL * levels);


export const grassSpeedMultiplier = () =>
    temper(activeType().speed, level("hardyStrains")) * fromMilestones("speed");

export const grassOutputMultiplier = () =>
    temper(activeType().output, level("hardyStrains")) * fromMilestones("output")
    * (1 + FINGERS_PER_LEVEL * level("greenFingers"));

export const greenMultiplier = () => fromMilestones("green");

// How grown a tile is when the grass first reaches it. worldMap adds this to what the cards give.
export const grassSeedStart = () => SEED_BANK_PER_LEVEL * level("seedBank");

// Grass' differences from plain meadow grass.
export function typeEffects(type) {
    const levels = level("hardyStrains");
    const out = [];
    const say = (value, tail) => { if (value !== 1) out.push(`x${round(value)} ${tail}`); };
    say(temper(type.output, levels), "Green Essence from grass");
    say(temper(type.speed, levels), "growth speed");
    say(type.growth, "Growth when it spreads");
    return out;
}

const round = (value) => Number(value.toFixed(2));

export const GRASS_RESOURCES = {
    greenEssence: { name: "Green Essence", color: "#3aa876", from: "cores" },
    blueEssence: { name: "Blue Essence", color: "#4a90d9", from: "cores" },
    growth: GROWTH_RESOURCE,
};

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
    // Splits the canvas: this scene down the left, the upgrade grid down the right.
    canvasClass: "grass-canvas",

    scene: {
        build(el) {
            el.className = "static-scene grass-scene";
            el.innerHTML = `
                <div class="grass-page flyout-inset">
                    <div class="grass-summary"></div>

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
            // Delegated, because the cards are rebuilt whenever a grass unlocks.
            el.querySelector(".grass-types").addEventListener("click", (e) => {
                const card = e.target.closest("[data-type]");
                if (card) setGrassType(card.dataset.type);
            });

            el.__types = null;
            el.__milestone = null;
        },

        update(el) {
            setText(el.querySelector(".grass-summary"), summary());
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
            description: "Every tile the grass takes for itself is worth +30% more Growth.",
            max: 4,
            cost: (s, lvl) => ({ growth: D(200).mul(D(4).pow(lvl)) }),
        },
        seedBank: {
            title: "Seed Bank",
            description: "Grass spreads onto a new tile starting +20% grown instead of as a bare seed.",
            max: 3,
            cost: (s, lvl) => ({ growth: D(400).mul(D(5).pow(lvl)) }),
        },
        greenFingers: {
            title: "Green Fingers",
            description: "Every grassy tile is worth 40% more Green Essence, whichever type it is.",
            max: 3,
            cost: (s, lvl) => ({ growth: D(600).mul(D(6).pow(lvl)) }),
        },
        hardyStrains: {
            title: "Hardy Strains",
            description: "Grasses give back some of whatever their species trades away.",
            max: 3,
            hidden: () => growthPeak().lt(800),
            cost: (s, lvl) => ({ growth: D(1200).mul(D(5).pow(lvl)) }),
        },
        richerSoil: {
            title: "Richer Soil",
            description: "Grass moves through its stages +10% faster, everywhere.",
            max: 10,
            cost: (s, lvl) => ({ greenEssence: D("1e7").mul(D(1.7).pow(lvl)) }),
        },
        greenerBlades: {
            title: "Greener Blades",
            description: "Every grassy tile produces +50% more Green Essence.",
            max: 25,
            cost: (s, lvl) => ({ greenEssence: D("1e7").mul(D(1.3).pow(lvl)) }),
        },
    },
};

// Where the grass on the map is up to.
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
        + ` Producing ${formatNumber(production(world))} Green Essence/s,`
        + (soakedBlue(world) > 0 ? ` ${formatNumber(soakedBlue(world))} Blue Essence/s off the wet ground,` : "")
        + ` a stage every ${seconds.toFixed(1)}s at best.`
        + (planted === open
            ? " Every tile it can reach is grassed over - claim more for it to spread into."
            : ` Each tile it takes is worth ${formatNumber(spreadValue())} Growth.`);
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

// One drawing for all of them, tinted by the card's own blade.
const GRASS_ART = `
    <svg class="grass-card-art" viewBox="0 0 40 40" aria-hidden="true">
        <path class="grass-blade" d="M20 31 C18.2 24 19.4 18 17.6 12"/>
        <path class="grass-blade" d="M20 31 C22 25 23.4 20 25.8 15"/>
        <path class="grass-blade" d="M20 31 C16.4 27 13.6 23 11.6 18.5"/>
        <path class="grass-blade" d="M20 31 C24 28 26.8 25 28.6 21"/>
    </svg>`;

// Only ever the one that's next, and nothing for if anything follows it.
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

    // Grass growing is on the World's tick, this one is just payout.
    onTick(dt, layer) {
        if (!grassBought()) return;
        const world = worldState();
        addResource(layer, "greenEssence", D(production(world)).mul(greenMultiplier()).mul(dt));

        // Whatever rain is still in the ground pays out in Blue on top of that.
        const blue = soakedBlue(world);
        if (blue > 0) addResource(layer, "blueEssence", D(blue).mul(dt));
        notePeak();
    },

    ...GRASS_VIEW,
});

function setText(el, text) {
    const value = String(text);
    if (el.textContent !== value) el.textContent = value;
}

function setWidth(el, fraction) {
    const width = `${(Math.max(0, Math.min(1, fraction)) * 100).toFixed(1)}%`;
    if (el.style.width !== width) el.style.width = width;
}
