// adaptationLayer.js
//
// First prestige layer: reset growing things for adaptation points, spent on cards

import { registerLayer } from "../../../core/registry.js";
import { getLayerState } from "../../../core/state.js";
import { addResource, canAfford, spend } from "../../../core/resources.js";
import { boostResource } from "../../../core/boosts.js";
import { D } from "../../../utils/decimal.js";
import { formatNumber, formatWhole } from "../../../utils/format.js";
import { setText, setDisplay } from "../../../utils/dom.js";
import { matureTiles, tileDiversity, tileKindCounts, countOf, WOODLAND_KINDS } from "../systems/worldMap.js";
import { cardBonus } from "../systems/cards.js";
import { passiveAdaptationRate } from "../systems/evolutionTree.js";
import { resetGrowingTrees } from "../systems/forestTrees.js";
import { addCharge } from "../sublayers/precipitationSublayer.js";

import {
    CARDS, MOST_SLOTS, slotCount, COPIES_TO_COMBINE, collection, cardEntry, cardName, cardArt, rarityOf, knownCard,
    comboStatus, rollDraw, collectCard, equipCard, unequipSlot, firstFreeSlot, equippedIds,
    BANNERS, BANNER_IDS, bannerArt, bannerUnlocked, unlockedBannerIds, newBannerIds, markBannersSeen,
    loadoutLocked, lockLoadout, releaseLoadout,
} from "../systems/cards.js";
import { coreNodeBought } from "../../../core/nodes.js";


//    !!! WHAT ADAPTING GIVES !!!

// 2 adaptation points given per mature grass, woodland tiles are 1/4 value
const POINTS_PER_ADAPT_TILE = D(2);

const DRAW_BASE_COST = D(5);
const DRAW_COST_SCALE = D(1.2);   // Per draw already taken on that banner

let armAdapt = false; // For when you reset but won't gain any points

// Clicking anywhere but the Adapt button disarms the zero-point confirmation
addEventListener("click", (e) => { if (!e.target.closest?.(".adapt-button")) armAdapt = false; });

const ADAPT_MINIMUM = 6;
const canAdapt = (gain) => gain.gte(ADAPT_MINIMUM) || coreNodeBought("environment");

// Diversity of tiles on the map are scaled exponentially, best when tiles have equal numbers
const DIVERSITY_SCALE = 0.3;
const DIVERSITY_POWER = 2.7;

export const diversityMultiplier = (s = getLayerState("world")) =>
    1 + DIVERSITY_SCALE * Math.pow(Math.max(0, tileDiversity(s) - 1), DIVERSITY_POWER);

// How evenly the tiles share the map, 1 being a perfectly even split between them
export const tileEvenness = (s = getLayerState("world")) => {
    const kinds = Object.keys(tileKindCounts(s)).length;
    return kinds > 0 ? tileDiversity(s) / kinds : 0;
};

// Pressed Leaves pays for how much grass the map was carrying when it was given up
const PRESSED_PER_TILE = 0.02;
const PRESSED_CEILING = 0.3;
const pressedLeaves = (s) => coreNodeBought("adaptPressedLeaves")
    ? Math.min(PRESSED_CEILING, PRESSED_PER_TILE * matureTiles(s).length) : 0;

// Grass gives 2 and woodland 0.5 (it survives adapting), multiplied by diversity
export const pointsOnAdapt = (s = getLayerState("world")) =>
    POINTS_PER_ADAPT_TILE
    .mul(matureTiles(s).length + 0.25 * countOf(WOODLAND_KINDS, s))
    .mul(diversityMultiplier())
    .mul(boostResource("adaptationPoints"))
    .mul(1 + pressedLeaves(s))
    .floor();

// How the map's diversity is described in words, rather than numbers
const MIXES = [
    { at: 0.95, name: "shared evenly" },
    { at: 0.8,  name: "well shared" },
    { at: 0.6,  name: "unevenly shared" },
    { at: 0.4,  name: "with one kind well ahead of the rest" },
    { at: 0,    name: "with one kind smothering the rest" },
];


//    !!! WHAT A DRAW COSTS !!!

// Each banner scales its price separately based on how many cards you've drawn from it
const bannerDraws = (s, banner = s.banner) => (s.bannerDraws || {})[banner] || 0;

// Costs are rounded to whole numbers
const costOf = (banner, draws) =>
    D(BANNERS[banner] ? BANNERS[banner].baseCost : DRAW_BASE_COST)
        .mul(DRAW_COST_SCALE.pow(draws)).mul(coreNodeBought("adaptHoardedSeeds") ? 0.9 : 1).ceil();

const drawCost = (s) => ({ adaptationPoints: costOf(s.banner, bannerDraws(s)) });

export const cardCut = (key) => 1 / (1 + cardBonus(key)); // Cards that give minuses sometimes divided by 0 without this


//    !!! WHAT ADAPTING RESETS !!!

const RESET_TERRAIN = new Set(["water", "snow", "pond"]);

// What's actually reset through adaptation
function adaptationReset() {
    // Resets pond things
    const pond = getLayerState("pond");
    pond.algae = 0;
    pond.fish = 0;
    pond.turbulence = 0;
    pond.algaeBurst = 0;
    pond.algaeBurstReady = 0;
    pond.fishBurst = 0;
    pond.fishBurstReady = 0;

    const world = getLayerState("world");

    world.grass = {};
    const pondsStay = coreNodeBought("envStanding");
    world.terrain = Object.fromEntries(Object.entries(world.terrain || {})
        .filter(([, kind]) => !RESET_TERRAIN.has(kind) || (pondsStay && kind === "pond")));

    // Resets precipitation and buildup
    world.moisture = {};
    world.snowpack = {};
    world.weatherSeconds = 0;
    world.weatherTotal = 0;
    world.weatherTile = null;
    world.weatherPower = 0;
    world.weatherSoak = 0;

    // State of precipitation layer cloud
    const cloud = getLayerState("precipitation");
    cloud.charge = 0;
    cloud.paidCharge = 0;
    cloud.stability = 1;
    if (coreNodeBought("rainHeld")) addCharge(1);

    world.selectedTile = null;
    world.transformFodder = [];

    resetGrowingTrees();
}

export function runAdaptation(gain = pointsOnAdapt()) {
    addResource("adaptationPoints", gain);
    adaptationReset();
    releaseLoadout();
}

function termsText() {
    const ground = coreNodeBought("environment");
    const trees = coreNodeBought("forest");
    const loses = `<b>Reset:</b> Algae and fish populations, grass`
        + (ground ? (coreNodeBought("envStanding") ? ", water, and snow" : ", water, snow, and ponds") : "")
        + (coreNodeBought("rainHeld") ? ". The cloud comes back full." : ", and the cloud's charge.")
        + (trees ? " Growing trees are set back two stages and lose their last two growth choices." : "");

    let hint = "Adaptation points scale with the number of mature grass tiles";
    if (trees) hint += " and woodland tiles. Grass gives more than woodland";
    if (ground) hint += ". Having more tile types multiplies it, more so when they're evenly mixed."
        + " Bare ground, snow and standing water don't count";
    return { loses, hint: hint + "." };
}


//    !!! THE LAYER !!!

registerLayer("adaptation", {
    categoryId: "main",
    group: "beyond",
    name: "Adaptation",
    color: "#b06ad0",
    order: 0,
    startUnlocked: false, // the Adaptation node on the Cores tree unlocks it

    resources: ["adaptationPoints"],

    initialState: {
        cards: {},               // { id: { level, copies } }
        equipped: new Array(MOST_SLOTS).fill(null),
        draw: null,
        draws: 0,                // Lifetime draws, across every banner
        unlockedCards: [],       // Locked cards that something has opened up
        banner: null,            // Which pool you're drawing from, null = picking one
        bannerDraws: {},         // Draws per banner, which is what prices the next one
        loadoutLocked: false,    // Equipped cards do nothing until locked in, and stay locked in for the adaptation
        seenBanners: null,       // Banners already looked at on the cards page, for the new banner mark
    },

    tabMark: (s) => newBannerIds(s).length > 0 ? "!" : null,

    subLayers: {
        adapt: {
            name: "Adapt",
            canvasType: "static",
            order: 0,

            scene: {
                build(el) {
                    el.className = "static-scene adaptation-scene";
                    el.innerHTML = `
                        <div class="adapt-panel">
                            <button class="adapt-button">
                                <span class="adapt-verb">Adapt</span>
                                <span class="adapt-gain"></span>
                            </button>
                            <div>
                                <div class="adapt-variety-line"></div>
                                <div class="adapt-note"></div>
                                <div class="adapt-passive"></div>
                            </div>
                            <div class="adapt-terms">
                                <div class="adapt-loses"></div>
                            </div>
                            <div class="adapt-variety">
                                <div class="adapt-variety-hint"></div>
                            </div>
                        </div>
                    `;
                    el.querySelector(".adapt-button").addEventListener("click", () => {
                        const gain = pointsOnAdapt();
                        if (!canAdapt(gain)) return;
                        if (!armAdapt && gain.eq(0)) {
                            armAdapt = true;
                            setText(el.querySelector(".adapt-gain"), "Are you sure? You will gain 0 adaptation points.");
                            return;
                        }
                        runAdaptation(gain);
                        armAdapt = false;
                    });
                },

                update(el) {
                    const world = getLayerState("world");
                    const gain = pointsOnAdapt();

                    const terms = termsText();
                    const loses = el.querySelector(".adapt-loses");
                    if (loses.__terms !== terms.loses) {
                        loses.__terms = terms.loses;
                        loses.innerHTML = terms.loses;
                        setText(el.querySelector(".adapt-variety-hint"), terms.hint);
                    }

                    // Rounds instead of having decimals
                    if (!armAdapt) setText(el.querySelector(".adapt-gain"), `+${formatNumber(gain, 0)}`);
                    el.querySelector(".adapt-button").classList.toggle("ready", canAdapt(gain));

                    const kinds = Object.keys(tileKindCounts(world)).length;
                    if (coreNodeBought("environment")) {
                        setText(el.querySelector(".adapt-variety-line"),
                            kinds <= 1
                                ? "One kind of ground, so nothing extra for variety."
                                : `${kinds} kinds of ground, ${MIXES.find(m => tileEvenness(world) >= m.at).name}`
                                    + `: x${formatNumber(diversityMultiplier(world), 2)}`);
                    }
                    // Once Evolution is open the world also adapts on its own
                    const passive = passiveAdaptationRate();
                    const passiveLine = el.querySelector(".adapt-passive");
                    setDisplay(passiveLine, passive.gt(0));
                    if (passive.gt(0)) {
                        setText(passiveLine, `Evolving on its own: +${formatNumber(passive, 2)}/s`);
                    }

                    setText(el.querySelector(".adapt-note"),
                        canAdapt(gain) ? "" : `Adapting needs at least ${ADAPT_MINIMUM} points.`);
                },
            },
        },

        cards: {
            name: "Cards",
            canvasType: "static",
            order: 1,
            tabMark: (s) => newBannerIds(s).length > 0 ? "!" : null,

            scene: {
                build(el) {
                    el.className = "static-scene cards-scene";
                    el.innerHTML = `
                        <div class="cards-page">
                            <div class="cards-stage">
                                <div class="cards-draw"></div>
                            </div>
                            <div class="cards-lower">
                                <div class="cards-section">
                                    <div class="cards-heading">Equipped <span class="cards-sub"></span></div>
                                    <div class="cards-slots"></div>
                                    <div class="cards-lockin"></div>
                                    <div class="cards-combos"></div>
                                </div>
                                <div class="cards-section">
                                    <div class="cards-heading">Collection</div>
                                    <div class="cards-collection"></div>
                                </div>
                            </div>
                        </div>
                    `;
                    // Not rebuilt every frame
                    el.__signature = null;
                    // What draw has already been dealt
                    el.__dealt = null;
                    // Which slot is waiting for a card
                    el.__selectedSlot = null;
                    cardsSceneEl = el;
                },

                update(el, s) {
                    markBannersSeen(s);

                    // Includes the open banners, so a newly unlocked layer's banner shows up right away
                    const signature = JSON.stringify([s.cards, s.equipped, s.draw, s.banner,
                                                      s.bannerDraws, s.unlockedCards, s.loadoutLocked,
                                                      slotCount(), unlockedBannerIds()]);
                    if (el.__signature !== signature) {
                        el.__signature = signature;
                        buildSlots(el, s);
                        buildLockIn(el, s);
                        buildCollection(el, s);
                        buildCombos(el, s);
                        buildStage(el, s);
                        el.__needsFit = true;
                    }

                    // Sizing the words to fit on the card
                    if (el.__needsFit) el.__needsFit = !fitCardText(el);

                    const button = el.querySelector(".draw-button");
                    if (button) button.classList.toggle("unaffordable", !canAfford(drawCost(s)));
                },
            },
        },
    },
});


//    !!! THE FACE OF A CARD !!!

// The face of a card: its art, name, level and what it does
function cardFace(id, entry, extra = "") {
    // Empty for an id not in the pool, e.g. a removed or changed card
    if (!knownCard(id)) return "";

    const card = CARDS[id];
    const rarity = rarityOf(id);
    const level = entry ? entry.level : 1;
    // data-fit names the body's contents, so a card already sized isn't measured again
    return `
        <div class="card-face rarity-${card.rarity} ${extra}"
             style="--card-color: ${card.color}; --rarity-color: ${rarity.color}">
            <div class="card-art">${cardArt(id)}</div>
            <div class="card-body" data-fit="${id}:${entry ? level : 0}">
                <div class="card-name">${entry ? cardName(id, level) : card.name}</div>
                <div class="card-effect">${effectText(id, level)}</div>
                <div class="card-text">${card.text}</div>
            </div>
            <div class="card-foot">
                <span class="card-rarity">${rarity.name}</span>
                ${entry && !CARDS[id].unique ? `<span class="card-copies" title="Copies toward the next level">${entry.copies}/${COPIES_TO_COMBINE}</span>` : ""}
            </div>
        </div>
    `;
}

// Sizes are stepped rather than smooth, so cards beside each other still match
const FIT_STEPS = [1, 0.92, 0.85, 0.78, 0.72];

// What size a given card was last time
const fitCache = new Map();

// Returns false if nothing could be measured
function fitCardText(root) {
    const bodies = root.querySelectorAll(".card-body");
    let measured = false;

    for (const body of bodies) {
        // Height of zero means the tab isn't showing
        if (body.clientHeight === 0) continue;
        measured = true;

        const key = `${body.dataset.fit}@${Math.round(body.clientWidth)}`;
        const known = fitCache.get(key);
        if (known !== undefined) {
            body.style.setProperty("--card-text-scale", known);
            continue;
        }

        // Goes down through the sizes until the content of the card fits
        let scale = FIT_STEPS[FIT_STEPS.length - 1];
        for (const step of FIT_STEPS) {
            body.style.setProperty("--card-text-scale", step);
            if (body.scrollHeight <= body.clientHeight) { scale = step; break; }
        }
        body.style.setProperty("--card-text-scale", scale);
        fitCache.set(key, scale);
    }

    return measured;
}


//    !!! WHAT EACH MOD IS CALLED !!!

// What each mod is called on a card; a "-" prefix marks one that's better smaller
const MOD_NAMES = {
    // Cores
    coreGrowth: "Green Core growth speed",
    greenProduction: "Green Essence production",
    chargeRate: "Blue Core charge speed",
    blueClick: "Blue Essence per click",
    fullChargeBonus: "full-charge click bonus",
    chargeCapacity: "charge capacity",
    growthNeeded: "-growth needed per stage",
    stageCap: "growth stage cap",

    // Pond
    pondOutput: "Pond output",
    algaeGrowth: "algae growth",
    fishGrowth: "fish growth",
    algaeGreen: "Green Essence from algae",
    fishBlue: "Blue Essence from fish",
    stirPower: "turbulence per click",
    settleResist: "-how fast water settles",
    turbulenceMax: "maximum turbulence",
    roughBlue: "pond Blue Essence at full turbulence",
    calmGreen: "pond Green Essence in still water",
    pondCapacity: "Pond capacity",
    biomassOutput: "Biomass production",
    biomassExponent: "Biomass exponent",
    algaeFullGreen: "Green Essence while the Pond is packed with algae",

    // Grass
    grassGrowth: "grass growth",
    grassOutput: "grass output",
    adjacencyBonus: "bonus per adjacent grassy tile",
    matureWait: "-wait before mature grass spreads",

    // Rain
    rainDuration: "how long weather lasts",
    rainBoost: "what a cloud is worth to the tile under it",
    rainCharge: "how fast the cloud gathers",
    rainCost: "-Blue Essence to fill the cloud",
    moistureRate: "how much weather leaves in the ground",
    rainSoak: "rain on ground with nothing growing on it",

    // Open Waters
    oceanOutput: "ocean output",
    oceanTickSpeed: "ocean tick speed",
    boostSpawn: "drifting boost spawn rate",
    learnedShoals: "-fish aspect cost",

    // The Forest
    treeGrowth: "tree growth",
    forestOutput: "everything the forest is worth",
    oldGrowthWorth: "what old growth is worth",
    livingWorth: "what a standing tree is worth",
    shortStand: "-how long a finished tree stands",

    // The Marsh
    marshOutput: "marsh zone output",
    marshSilt: "sediment settling out of flood water",
    marshTempo: "marsh cycle speed",
    marshRefill: "marsh water refill",
    marshSuccession: "community growth",
    marshSeep: "-seep between zones",

    // The Ice Field
    snowfall: "snowfall",
    iceOutput: "snowpack output",
    deepCold: "-how fast pressure bleeds off",
    snowDrift: "loose snow the field can hold",
    compaction: "snow moved down by each press",
    loadWorth: "bonus from snow lying on top",
};

// A leading "-" on the name marks a mod that reads better as a reduction
function modLine(key, value) {
    const name = MOD_NAMES[key] || key;
    const sign = name.startsWith("-") ? "-" : "+";
    return `${sign}${Math.round(value * 100)}% ${name.startsWith("-") ? name.slice(1) : name}`;
}

function effectText(id, level) {
    const card = CARDS[id];
    if (card.effect) return typeof card.effect === "function" ? card.effect() : card.effect;

    const flat = card.modsFlat || {};
    const keys = new Set([...Object.keys(card.mods || {}), ...Object.keys(flat)]);

    return [...keys].map(key =>
        modLine(key, (card.mods?.[key] || 0) * (1 + ((level-1)/3)) + (flat[key] || 0))).join(", ");
}


//    !!! THE STAGE !!!

// Top half of the page. Has banners to pick between, or the banner you picked + draw button / dealt cards
function buildStage(el, s) {
    const host = el.querySelector(".cards-draw");
    host.innerHTML = "";

    // A banner is only open while its layer is, so a closed one drops you back to the choice
    if (s.banner && !bannerUnlocked(s.banner)) s.banner = null;

    if (!s.banner && !s.draw) return buildBannerChoice(host, s);

    if (s.banner) {
        host.appendChild(backBar(s));
        host.appendChild(selectedBanner(s));
    }

    const body = document.createElement("div");
    body.className = "draw-body";
    host.appendChild(body);
    buildDraw(body, el, s);
}

// Back out to the banner choice
function backBar(s) {
    const bar = document.createElement("div");
    bar.className = "banner-bar";

    const back = document.createElement("button");
    back.className = "banner-back";
    back.innerHTML = `<span aria-hidden="true">&#8592;</span> All banners`;
    if (s.draw) {
        back.disabled = true;
        back.title = "Choose one of the cards first.";
    } else {
        back.addEventListener("click", () => { s.banner = null; });
    }

    bar.appendChild(back);
    return bar;
}

// The banner choices, laid out across the stage
function buildBannerChoice(host, s) {
    const wrap = document.createElement("div");
    wrap.className = "banner-choice";
    wrap.innerHTML = `<div class="cards-heading">Draw from</div>`;

    const grid = document.createElement("div");
    grid.className = "banner-grid";

    // A banner whose layer isn't open is left out so it doesn't give that layer away
    for (const id of BANNER_IDS) {
        if (!bannerUnlocked(id)) continue;
        const banner = BANNERS[id];
        const btn = document.createElement("button");
        btn.className = "banner-card";
        btn.style.setProperty("--banner-color", banner.color);
        btn.innerHTML = `
            <div class="banner-icon">${bannerArt(id)}</div>
            <div class="banner-info">
                <div class="banner-name">${banner.name}</div>
                <div class="banner-text">${banner.text}</div>
            </div>
            <div class="banner-price">${formatWhole(costOf(id, bannerDraws(s, id)))}</div>
        `;
        btn.addEventListener("click", () => { s.banner = id; });
        grid.appendChild(btn);
    }

    wrap.appendChild(grid);
    host.appendChild(wrap);
}

// The banner you're on, across the top of the stage
function selectedBanner(s) {
    const banner = BANNERS[s.banner];
    const current = document.createElement("div");
    current.className = "banner-current";
    current.style.setProperty("--banner-color", banner.color);
    current.innerHTML = `
        <div class="banner-icon">${bannerArt(s.banner)}</div>
        <div class="banner-info">
            <div class="banner-name">${banner.name}</div>
            <div class="banner-text">${banner.text}</div>
        </div>
    `;
    return current;
}

function buildDraw(host, el, s) {
    // Pending draw is held in the save so you don't lose the adaptation points without getting a card
    collection(s);
    const offered = (s.draw || []).filter(knownCard);
    if (s.draw && offered.length === 0) s.draw = null;

    if (s.draw) {
        const choices = document.createElement("div");
        choices.className = "draw-choices";
        choices.innerHTML = `<div class="cards-heading">Choose one</div>`;
        const row = document.createElement("div");
        const key = offered.join(",");
        row.className = el.__dealt === key ? "draw-row" : "draw-row dealing";
        el.__dealt = key;
        for (const id of offered) {
            const btn = document.createElement("button");
            btn.className = "draw-choice";
            btn.innerHTML = cardFace(id, null);
            btn.addEventListener("click", () => {
                collectCard(id, s);
                s.draw = null;
            });
            row.appendChild(btn);
        }
        choices.appendChild(row);
        host.appendChild(choices);
        return;
    }

    el.__dealt = null;   // The next draw deals itself out

    const cost = drawCost(s);
    const btn = document.createElement("button");
    btn.className = "draw-button";
    btn.innerHTML = `<span class="draw-verb">Draw</span>`
        + `<span class="draw-cost">${formatWhole(cost.adaptationPoints)} Adaptation</span>`;
    btn.addEventListener("click", () => {
        const rolled = rollDraw(s.banner);
        if (rolled.length === 0) return;
        if (!spend(drawCost(s))) return;

        s.draws = (s.draws || 0) + 1;
        if (!s.bannerDraws) s.bannerDraws = {};
        s.bannerDraws[s.banner] = bannerDraws(s) + 1;
        s.draw = rolled;
    });
    host.appendChild(btn);
}


//    !!! SLOTS AND THE LOADOUT !!!

// A picked slot waits for a card from the collection. Picking it again empties it
const selectedSlot = (el) => (el.__selectedSlot ?? null);

function selectSlot(el, s, slot) {
    el.__selectedSlot = slot;
    buildSlots(el, s);
    buildCollection(el, s);
    el.__needsFit = !fitCardText(el);
}

// The current cards page, so one listener follows rebuilds instead of each adding another
let cardsSceneEl = null;

// Clicking anywhere but a slot or a collection card lets go of the picked slot
addEventListener("click", (e) => {
    const el = cardsSceneEl;
    if (!el?.isConnected || selectedSlot(el) === null) return;
    if (e.target.closest?.(".card-slot, .collection-card")) return;
    selectSlot(el, getLayerState("adaptation"), null);
});

function buildSlots(el, s) {
    const host = el.querySelector(".cards-slots");
    host.innerHTML = "";
    collection(s);
    setText(el.querySelector(".cards-sub"), `${equippedIds(s).length}/${slotCount()}`);

    const locked = loadoutLocked(s);
    if (locked || selectedSlot(el) >= slotCount()) el.__selectedSlot = null;
    const picked = selectedSlot(el);

    for (let slot = 0; slot < slotCount(); slot++) {
        const stored = (s.equipped || [])[slot];
        const id = knownCard(stored) ? stored : null;
        const box = document.createElement("button");
        box.className = `card-slot${id ? " filled" : ""}${locked ? " locked" : ""}`
            + `${picked === slot ? " selected" : ""}`;
        box.innerHTML = id ? cardFace(id, cardEntry(id, s), "in-slot") : `<span class="slot-empty">${locked ? "Left empty" : "Empty"}</span>`;
        if (!locked) box.addEventListener("click", () => {
            if (selectedSlot(el) !== slot) return selectSlot(el, s, slot);
            if (id) unequipSlot(slot, s);
            selectSlot(el, s, null);
        });
        host.appendChild(box);
    }
}

// Equipped cards do nothing until locked in, and stay locked until the next adaptation
function buildLockIn(el, s) {
    const host = el.querySelector(".cards-lockin");
    host.innerHTML = "";

    if (loadoutLocked(s)) {
        host.className = "cards-lockin locked";
        host.innerHTML = `<span class="lockin-state">Locked in for this adaptation.</span>`
            + `<span class="lockin-note">Adapting is what frees them again.</span>`;
        return;
    }

    host.className = "cards-lockin";
    const equipped = equippedIds(s).length;

    const btn = document.createElement("button");
    btn.className = "lockin-button";
    btn.textContent = "Lock in for this adaptation";
    btn.disabled = equipped === 0;
    btn.addEventListener("click", () => lockLoadout(s));

    const note = document.createElement("span");
    note.className = "lockin-note";
    note.textContent = equipped === 0
        ? "Equip a card first. Cards do nothing until they are locked in."
        : "Swap them freely. They do nothing until they are locked in.";

    host.append(btn, note);
}

const levelOf = (id, s) => (cardEntry(id, s) || { level: 1 }).level;


//    !!! THE COLLECTION !!!

// The collection, split by banner and each is sorted by descending rarity
function buildCollection(el, s) {
    const host = el.querySelector(".cards-collection");
    host.innerHTML = "";

    const owned = Object.keys(collection(s));
    if (owned.length === 0) {
        host.innerHTML = `<div class="cards-empty">No cards yet. Draw one with Adaptation points.</div>`;
        return;
    }

    const sections = [...BANNER_IDS, null];
    for (const bannerId of sections) {
        const inSection = owned.filter(id => (BANNERS[CARDS[id].banner] ? CARDS[id].banner : null) === bannerId);
        if (inSection.length === 0) continue;

        // Rarest first, then the higher level, then by name
        inSection.sort((a, b) =>
            rarityOf(a).weight - rarityOf(b).weight
            || levelOf(b, s) - levelOf(a, s)
            || CARDS[a].name.localeCompare(CARDS[b].name));

        const banner = BANNERS[bannerId];
        const group = document.createElement("div");
        group.className = "collection-group";
        if (banner) group.style.setProperty("--banner-color", banner.color);
        const key = bannerId || "other";
        const collapsed = s.collapsedGroups || (s.collapsedGroups = {});
        group.classList.toggle("collapsed", !!collapsed[key]);
        group.innerHTML = `<button class="collection-group-name" type="button"><span class="collection-caret"></span>${banner ? banner.name : "Other"}
            <span class="collection-count">${inSection.length}</span></button>`;
        group.firstElementChild.addEventListener("click", () => {
            collapsed[key] = !collapsed[key];
            group.classList.toggle("collapsed", collapsed[key]);
        });

        const row = document.createElement("div");
        row.className = "collection-row";
        for (const id of inSection) row.appendChild(collectionCard(id, s, el));
        group.appendChild(row);
        host.appendChild(group);
    }
}

function collectionCard(id, s, el) {
    const equipped = (s.equipped || []).includes(id);
    const locked = loadoutLocked(s);
    const picked = selectedSlot(el);
    // The card sitting in the picked slot, which is the one a click takes back out
    const inPicked = picked !== null && (s.equipped || [])[picked] === id;
    // Whether clicking takes the card out rather than putting it in
    const removable = !locked && (inPicked || (equipped && picked === null));

    const btn = document.createElement("button");
    btn.className = `collection-card${equipped ? " equipped" : ""}${locked ? " locked" : ""}`
        + `${picked !== null && !locked ? " pickable" : ""}${inPicked ? " in-selected" : ""}`
        + `${removable ? " removable" : ""}`;
    btn.innerHTML = cardFace(id, cardEntry(id, s));
    btn.addEventListener("click", () => {
        if (locked) return;
        if (picked !== null) {
            if (inPicked) unequipSlot(picked, s);
            else equipCard(id, picked, s);
            return selectSlot(el, s, null);
        }
        // Clicking a card that's already in the loadout takes it back out
        if (equipped) return unequipSlot(s.equipped.indexOf(id), s);
        // Not equipped if slots are full
        equipCard(id, firstFreeSlot(s), s);
    });
    return btn;
}


//    !!! COMBOS !!!

// Combos. A combo that's folded into a larger combo is grayed out
function buildCombos(el, s) {
    const host = el.querySelector(".cards-combos");
    const status = comboStatus(s);

    host.innerHTML = status.map(({ combo, foldedInto }) => `
        <div class="combo-tag${majorCombo(combo) ? " major" : ""}${foldedInto ? " folded" : ""}${legendCombo(combo) ? " legend" : ""}"
             title="${combo.text}">
            <b>${combo.name}</b>
            <span class="combo-effect">${foldedInto
                ? `folded into ${foldedInto.name}`
                : comboEffect(combo)}</span>
        </div>
    `).join("");
}

const majorCombo = (combo) => combo.cards.length === 3;
const legendCombo = (combo) => combo.cards.length >= 4;

// Same as cards, if a specific effect is listed then it goes off that
const comboEffect = (combo) => combo.effect || Object.entries(combo.mods || {})
    .map(([key, value]) => modLine(key, value)).join(", ");
