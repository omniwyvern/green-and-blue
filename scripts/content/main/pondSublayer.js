// pondSublayer.js
//
// Water turbulence can be increased by clicking, but it naturally settles.
// Water can be calm, disturbed, or turbulent.
//
// Once Life is bought, the pond has a capacity which is taken up by algae and fish
//
// Algae grows passively, fish grow while the water is somewhat turbulent
// Fish eat algae and starve if there isn't enough, so hard-pushing turbulence won't work
//
// This file is really long because it has lots of constants that might need to be changed
// All things considered it isn't *that* complicated, there's just also a lot of art

import { registerLayer } from "../../core/registry.js";
import { getLayerState } from "../../core/state.js";
import { addResource, getLevel } from "../../core/resources.js";
import { boostResource } from "../../core/boosts.js";
import { D } from "../../utils/decimal.js";
import { formatNumber } from "../../utils/format.js";
import { setText, setWidth } from "../../utils/dom.js";
import { upgradeDescription } from "../../render/richText.js";
import { cardBonus, cardActive, unlockCard } from "./cards.js";
import { shoreGrassTiles, pondTiles } from "./worldMap.js";


const TURBULENCE_MAX = 100;
const SETTLE_PER_SECOND = 10;   // How fast the water returns to calm when left alone
const STIR_PER_CLICK = 5;     // Turbulence added per click, before upgrades
const STIR_PER_LEVEL = 2;      // Turbulence per level of Stronger Currents

const BASE_PRODUCTION = D(5);  // Blue Essence/sec in perfectly calm water
const TURBULENCE_BONUS = 7;    // Fully turbulent water produces (1 + this) times as much

const coreNode = (id) => !!getLayerState("cores").purchasedUpgrades[id];

// The (+x%) tail quoting what one more level buys, dropped once the upgrade sits at its cap
const nextStep = (s, id, max, gain) => getLevel(s, id) >= max ? null : gain;

const DISTURBED_AT = 33;
const TURBULENT_AT = 66;

// Animation speed and surface cycle pixels
const MAX_SPEEDUP = .9;            // How much faster the water moves at full turbulence
const SURFACE_PERIOD_MS = 18000;    // Time for each cycle based on surface sprites
const RAY_PERIOD_MS = 11000;        // Time for each cycle based on light ray sprites
const SURFACE_CYCLE_PX = 360;


const BASE_CAPACITY = 2;    // Starting pond capacity
export const PER_POND_TILE = 0.4;  // What one pond tile on the world map is worth to that capacity

const ALGAE_GROWTH = 0.04;
const ALGAE_PER_LEVEL = 0.25;

const FISH_GROWTH = 0.05;       // Fish per second in fully turbulent water, nothing in calm
const FISH_PER_LEVEL = 0.25;

// Two different things: how much algae a fish gets through in a second, and how much has to
// be standing there for the school to count as fed. The second one is a stock, not a rate
const FISH_APPETITE = 0.02;
const FOOD_PER_FISH = 0.1;
const STARVATION_PER_SECOND = 0.15;

// For the feeding frenzy and dormant spores upgrades
const BURST_SECONDS = 5;
const SPORES_GROWTH = 0.15;
const FRENZY_GROWTH = 0.105;
const BURST_COOLDOWN = 30;       // The wait at the first level, once the burst has finished
const COOLDOWN_PER_LEVEL = 3;   // !!! REMOVE THIS ONCE YOU FIGURE IT OUT !!!
const MIN_BURST_COOLDOWN = 15;


const ALGAE_CROWDING = 0.25; // Fraction of algae's growth that can push into occupied space
const FISH_CROWDING = 0.4;   // Same for fish. Higher, since the fish are the side being driven

const rateFor = (fraction, calm, rough) => calm + fraction * (rough - calm);

const GREEN_PER_ALGAE = D(150); // Green Essence/sec per unit of algae
const GREEN_PER_LEVEL = 0.5;
const BLUE_PER_FISH = 0.35;     // Each fish adds this much to the pond's Blue multiplier
const BLUE_FISH_PER_LEVEL = 0.15;

const sceneAnimations = new WeakMap();  // Animations are per scene element so they can be rebuilt without causing a stale handle

const CALM_BELOW = DISTURBED_AT / TURBULENCE_MAX;
const ROUGH_ABOVE = TURBULENT_AT / TURBULENCE_MAX;

const TIDE_SECONDS = 20;  // Tidal cycle card things (how long the cycle takes)
const tidalActive = () => cardActive("tidalCycle");


const worldRaining = () => {
    const world = getLayerState("world");
    return (world.weatherSeconds || 0) > 0 && (world.weatherKind || "rain") === "rain";
};
const rainwaterActive = () => cardBonus("rainwater") > 0 && worldRaining();

const BAND_BOOST_SECONDS = 8;
const bandOf = (s) => s.turbulence >= TURBULENT_AT ? 2 : s.turbulence >= DISTURBED_AT ? 1 : 0;
const bandBoost = (s) => (s.bandBoostLeft || 0) > 0 ? cardBonus("bandBoost") : 0;

// For that one card (I forgor it's name, been a while since I coded it)
const shoreBoost = () => (getLayerState("world").shoreBoostLeft || 0) > 0
    ? cardBonus("shoreSpawn") : 0;
const shoreExchange = () => cardBonus("shoreExchange") * shoreGrassTiles();

const stirPerClick = (s) => (STIR_PER_CLICK + STIR_PER_LEVEL * getLevel(s, "strongerCurrents"))
    * (1 + cardBonus("stirPower"));

// How rough the water is allowed to get
const turbulenceCeiling = () => TURBULENCE_MAX * (1 + cardBonus("turbulenceMax"));
const turbulenceFraction = (s) =>
    Math.max(0, Math.min(1 + cardBonus("turbulenceMax"), s.turbulence / TURBULENCE_MAX));

const freeSpace = (s) => Math.max(0, s.capacity - s.algae - s.fish);

// How many fish + algae can be drawn total. Little bit bigger than capacity so the pond doesn't look empty
const MAX_SPRITES = 14;
const spriteBudget = (capacity) => Math.min(MAX_SPRITES, Math.floor(capacity) + 1);

const pondSlots = (capacity) => Math.max(1, Math.min(MAX_SPRITES - 1, Math.floor(capacity)));

const shareOfSlots = (amount, living, slots) =>
    amount > 0 ? Math.max(1, Math.round(amount / living * slots)) : 0;

function spriteCounts(s) {
    const algae = Math.max(0, s.algae);
    const fish = Math.max(0, s.fish);
    const living = algae + fish;
    if (living <= 0 || s.capacity <= 0) return { algae: 0, fish: 0 };

    const budget = spriteBudget(s.capacity);
    const slots = pondSlots(s.capacity);
    const wantAlgae = shareOfSlots(algae, living, slots);
    const wantFish = shareOfSlots(fish, living, slots);
    if (wantAlgae + wantFish <= budget) return { algae: wantAlgae, fish: wantFish };

    // Only one of them is actually in the pond
    if (wantAlgae <= 0 || wantFish <= 0) {
        const only = Math.min(budget, wantAlgae + wantFish);
        return wantAlgae > 0 ? { algae: only, fish: 0 } : { algae: 0, fish: only };
    }
    // Not enough budget to show both, so the bigger population gets the pond
    if (budget < 2) return algae >= fish ? { algae: 1, fish: 0 } : { algae: 0, fish: 1 };

    // Past the budget the two of them share what's left by population, one of each guaranteed
    const extra = budget - 2;
    const algaeShare = algae / living * extra;
    const fishShare = extra - algaeShare;
    let toAlgae = Math.floor(algaeShare);
    let toFish = Math.floor(fishShare);
    if (toAlgae + toFish < extra) {
        if (algaeShare - toAlgae >= fishShare - toFish) toAlgae++;
        else toFish++;
    }
    return { algae: 1 + toAlgae, fish: 1 + toFish };
}


// Which upgrade owns each burst, and where its two timers live on the pond's state
const BURSTS = {
    spores: { upgrade: "dormantSpores", running: "algaeBurst", ready: "algaeBurstReady" },
    frenzy: { upgrade: "feedingFrenzy", running: "fishBurst", ready: "fishBurstReady" },
};

// Level 0 reads as level 1 so the upgrade can quote the cooldown it is about to buy
const burstCooldown = (s, key) => Math.max(MIN_BURST_COOLDOWN,
    BURST_COOLDOWN - COOLDOWN_PER_LEVEL * (Math.max(1, getLevel(s, BURSTS[key].upgrade)) - 1));

const sporesActive = (s) => (s.algaeBurst || 0) > 0;
const frenzyActive = (s) => (s.fishBurst || 0) > 0;

const sporesBonus = (s) => sporesActive(s) ? SPORES_GROWTH * s.capacity : 0;
const frenzyBonus = (s) => frenzyActive(s) ? FRENZY_GROWTH * s.capacity : 0;


const algaeGrowth = (s) => ALGAE_GROWTH * s.capacity
    * (sporesActive(s) ? 1 : Math.max(0, 1 - turbulenceFraction(s)))
    * (1 + ALGAE_PER_LEVEL * getLevel(s, "fertileWater") + cardBonus("algaeGrowth")
        + (turbulenceFraction(s) <= CALM_BELOW ? cardBonus("calmAlgae") : 0)
        + (worldRaining() ? cardBonus("rainAlgae") : 0)
        + shoreExchange())
    + sporesBonus(s);

function tickBursts(s, dt) {
    s.algaeBurst = Math.max(0, (s.algaeBurst || 0) - dt);
    s.algaeBurstReady = Math.max(0, (s.algaeBurstReady || 0) - dt);
    s.fishBurst = Math.max(0, (s.fishBurst || 0) - dt);
    s.fishBurstReady = Math.max(0, (s.fishBurstReady || 0) - dt);
}

// Every click on the water, whether or not anything happens
function registerStir(s) {
    if (!tidalActive()) s.turbulence = Math.min(turbulenceCeiling(), s.turbulence + stirPerClick(s));
}

function payMaelstrom(s, layer) {
    const seconds = cardBonus("maelstrom");
    if (seconds <= 0 || turbulenceFraction(s) < ROUGH_ABOVE) return;
    addResource("blueEssence", pondBlue(s).mul(seconds));
}

// Clicking the burst button activates it, clicking again stops it
function useBurst(s, key) {
    const burst = BURSTS[key];
    if (getLevel(s, burst.upgrade) === 0) return;

    if ((s[burst.running] || 0) > 0) {
        s[burst.running] = 0;
        s[burst.ready] = burstCooldown(s, key);
        return;
    }
    if ((s[burst.ready] || 0) > 0) return;

    s[burst.running] = BURST_SECONDS;
    s[burst.ready] = BURST_SECONDS + burstCooldown(s, key);
}
// Turbulence as the fish see it
const fishPeak = (s) => Math.max(0.3, 1 - 0.1 * getLevel(s, "hardyStock"));

// Bursts make growth ignore turbulence
const fishTurbulence = (s) => Math.min(turbulenceLimit(),
    Math.max(frenzyActive(s) ? 1 : 0, turbulenceFraction(s) / fishPeak(s)));
const turbulenceLimit = () => 1 + cardBonus("turbulenceMax");

const fishGrowth = (s) => FISH_GROWTH * fishTurbulence(s)
    * (1 + FISH_PER_LEVEL * getLevel(s, "spawningGrounds") + cardBonus("fishGrowth")
        + (turbulenceFraction(s) >= ROUGH_ABOVE ? cardBonus("roughFish") : 0)
        + shoreBoost())                                   // Living Shore
    + frenzyBonus(s);

const appetite = (s) => FISH_APPETITE * s.fish;
const foodWanted = (s) => FOOD_PER_FISH * s.fish;
const wellFed = (s) => foodWanted(s) <= 0 ? 1 : Math.min(1, s.algae / foodWanted(s));
const starvation = (s) => cardActive("noStarvation")
    ? 0 : s.fish * (1 - wellFed(s)) * STARVATION_PER_SECOND;


const algaeForBiomass = (s) => s.algae * (1 + 0.15 * getLevel(s, "nutrientDense"));
const fishForBiomass = (s) => s.fish * (1 + 0.15 * getLevel(s, "richRoe"));

function biomassEvening(s, evenness) {
    const margin = balanceTolerance(s) * .5;
    const shortfall = 1 - evenness;
    if (margin <= 0) return 0;
    if (shortfall <= 0) return 1;
    return Math.min(1, margin / shortfall);
}

// Produces the most biomass when algae and fish are equal, and falls away fast otherwise.
function biomassProduction(s) {
    const algae = algaeForBiomass(s);
    const fish = fishForBiomass(s);
    const living = algae + fish;
    if (living <= 0) return D(0);

    const low = Math.min(algae, fish);
    const high = Math.max(algae, fish);
    const evening = biomassEvening(s, 2 * low / living); // Wider margins upgrade

    const half = living / 2;
    const min = low + (half - low) * evening; 
    const max = high + (half - high) * evening; 
    const biomassExponent = 1.5 + cardBonus("biomassExponent")

    return D((Math.pow(max, biomassExponent) * Math.pow(min, biomassExponent)) * (1 + cardBonus("biomassOutput")));
}


// How even the pond's populations are
const evenness = (s) => {
    const living = s.algae + s.fish;
    return living <= 0 ? 0 : 2 * Math.min(s.algae, s.fish) / living;
};

// Mostly wide margins card stuff
const balanceTolerance = (s) => Math.min(0.5, 0.05 * getLevel(s, "wideMargins"));
const balanceFactor = (s) => Math.min(1, evenness(s) / (1 - balanceTolerance(s)));
const balanceMultiplier = (s) => 1 + (coreNode("pondSymbiosis") ? 1.5 : 0) * balanceFactor(s);

const greenProduction = (s) => GREEN_PER_ALGAE.mul(s.algae)
    .mul(1 + GREEN_PER_LEVEL * getLevel(s, "denseMats") + cardBonus("algaeGreen"));
const fishMultiplier = (s) => 1 + s.fish
    * (BLUE_PER_FISH + BLUE_FISH_PER_LEVEL * getLevel(s, "biggerSchools"))
    * (1 + cardBonus("fishBlue"));

// Turbulence as blue production sees it, which isn't the same as the one the creatures use
const productionPeak = (s) => Math.max(0.3,
    1 - 0.1 * getLevel(s, "sensitiveCurrents"));
const productionTurbulence = (s) => Math.min(turbulenceLimit(), turbulenceFraction(s) / productionPeak(s));

const turbulenceBonus = (s) => TURBULENCE_BONUS + 2 * getLevel(s, "stormChannels");

// How fast turbulence goes away
const settleRate = () => SETTLE_PER_SECOND
    * Math.max(.25, 1 - (coreNode("pondChoppy") ? 0.26 : 0))
    / (1 + cardBonus("settleResist"));

// Capacity is recomputed from the nodes every tick rather than added to on purchase
// Mainly because some cards influence it on a per-tick basis
function capacityFor(s) {
    const base = (BASE_CAPACITY + (coreNode("pondDeep") ? 1 : 0) + PER_POND_TILE * pondTiles())
        * (1 + cardBonus("pondCapacity")
            + (rainwaterActive() ? cardBonus("rainwater") : 0)
            + (worldRaining() ? cardBonus("rainCapacity") : 0));   // Dancing Waters
    return base;
}

// Deeper depths stuff
const algaeCeiling = (s) => s.capacity * (1 - Math.min(0.9, cardBonus("fishReserve")));

function production(s) {
    const fromTurbulence = 1 + productionTurbulence(s) * turbulenceBonus(s);
    const fromUpgrades = 1 + .25 * getLevel(s, "richerWaters");
    return BASE_PRODUCTION.mul(fromTurbulence).mul(fromUpgrades).mul(fishMultiplier(s))
        .mul(1 + cardBonus("pondOutput") + bandBoost(s));
}

// Algae bloom card stuff
const algaeFull = (s) => s.capacity > 0 && s.algae >= s.capacity - 0.001;
const bloomBonus = (s) => algaeFull(s) ? cardBonus("algaeFullGreen") : 0;

const oxygenShare = (s) => 0.05 * getLevel(s, "oxygenation");

// The pond's two essence rates as they're paid out
const pondGreen = (s) => greenProduction(s)
    .mul(1 + bloomBonus(s))
    .mul(balanceMultiplier(s))
    .mul(boostResource("greenEssence"));

const pondBlue = (s) => production(s)
    .mul(balanceMultiplier(s))
    .mul(boostResource("blueEssence"))
    .add(pondGreen(s).mul(oxygenShare(s)));

function waterState(s) {
    if (s.turbulence >= TURBULENT_AT) return "Turbulent";
    if (s.turbulence >= DISTURBED_AT) return "Disturbed";
    return "Calm";
}

const lifeBought = () => !!getLayerState("cores").purchasedUpgrades.life;

function tickPond(s, dt, layer) {
    tickBursts(s, dt);

    addResource("greenEssence", pondGreen(s).mul(dt));
    addResource("biomass", biomassProduction(s).mul(dt));

    let algaeGain = algaeGrowth(s) * dt;
    let fishGain = fishGrowth(s) * dt;

    const wanted = algaeGain + fishGain;
    if (wanted > 0) {
        const intoRoom = Math.min(wanted, freeSpace(s));
        const algaeShare = intoRoom * (algaeGain / wanted);
        const fishShare = intoRoom - algaeShare;
        s.algae += algaeShare;
        s.fish += fishShare;
        algaeGain -= algaeShare;
        fishGain -= fishShare;
    }

    // Total space taken is capped at capacity, since they push against each other they kinda cancel out a bit
    const push = fishGain - algaeGain;
    if (push > 0) {
        const spare = Math.max(0, s.algae - foodWanted(s));
        const taken = Math.min(push * FISH_CROWDING, spare);
        s.algae -= taken;
        s.fish += taken;
    } else if (push < 0) {
        const taken = Math.min(-push * ALGAE_CROWDING, s.fish);
        s.fish -= taken;
        s.algae += taken;
    }

    // Fish eating
    s.algae -= Math.min(s.algae, appetite(s) * dt);
    s.fish = Math.max(0, s.fish - starvation(s) * dt);

    // More deeper depths stuff
    s.algae = Math.min(s.algae, algaeCeiling(s));

    // A shrinking tide takes the populations in equal proportions
    const living = s.algae + s.fish;
    if (living > s.capacity && living > 0) {
        const keep = s.capacity / living;
        s.algae *= keep;
        s.fish *= keep;
    }
}


export const POND_RESOURCES = ["greenEssence", "blueEssence", "biomass"];

const showingPond = (layer) => layer.stateKey === "pond"
    || (!!layer.subLayers && getLayerState(layer.stateKey).activeSubLayer === "pond");

// Everything about how the pond looks
export const POND_VIEW = {
    name: "Pond",
    color: "#2f8fb5",
    canvasType: "static",

    scene: {
        build(el, s, layer) {
            el.className = "static-scene pond-scene";
            el.innerHTML = `
                <div class="pond-water">
                    <div class="pond-surface"></div>
                    <div class="pond-rays"></div>
                    <div class="pond-bed">${POND_FLOOR}</div>
                    <div class="pond-life">
                        <div class="pond-fish-layer"></div>
                        <div class="pond-algae-layer"></div>
                    </div>
                </div>
                <div class="pond-balance">
                    <div class="balance-bar">
                        <div class="balance-fill" data-kind="algae"></div>
                        <div class="balance-fill" data-kind="fish"></div>
                    </div>
                    <!-- One column per side, so each one's burst timer sits under the
                         figure it belongs to and the two read as two things rather than
                         as a list of four. -->
                    <div class="balance-columns">
                        <div class="balance-column" data-kind="algae">
                            <span class="balance-tag">${ALGAE_ICON}<span class="balance-percent"></span></span>
                            ${timerMarkup("spores", "Spores")}
                        </div>
                        <div class="balance-column" data-kind="fish">
                            <span class="balance-tag">${FISH_ICON}<span class="balance-percent"></span></span>
                            ${timerMarkup("frenzy", "Frenzy")}
                        </div>
                    </div>
                </div>
                <div class="pond-readout">
                    <div class="pond-state"></div>
                    <div class="pond-meter"><div class="pond-meter-fill"></div></div>
                    <div class="pond-rate"></div>
                    <div class="pond-rate pond-rate-second"></div>
                </div>
            `;
            // Makes sure that clicking in the drawer doesn't increase turbulence
            el.querySelector(".pond-water").addEventListener("pointerdown", () => {
                const state = getLayerState(layer.stateKey);
                registerStir(state);
                payMaelstrom(state, layer);
            });

            el.querySelector(".pond-balance").addEventListener("pointerdown", (e) => {
                const button = e.target.closest(".balance-timer");
                if (!button) return;
                e.stopPropagation();
                useBurst(getLayerState(layer.stateKey), button.dataset.key);
            });

            // Driven through the Web Animations API rather than CSS animations since it changes every frame
            sceneAnimations.set(el, {
                surface: el.querySelector(".pond-surface").animate(
                    [{ transform: "translateX(0px)" },
                     { transform: `translateX(-${SURFACE_CYCLE_PX}px)` }],
                    { duration: SURFACE_PERIOD_MS, iterations: Infinity }),
                rays: el.querySelector(".pond-rays").animate(
                    [{ transform: "skewX(-4deg) translateX(-14px)" },
                     { transform: "skewX(4deg) translateX(14px)" }],
                    { duration: RAY_PERIOD_MS, iterations: Infinity,
                      direction: "alternate", easing: "ease-in-out" }),
            });
        },

        update(el, s) {
            const fraction = turbulenceFraction(s);
            el.style.setProperty("--turbulence", fraction.toFixed(3));
            el.dataset.water = waterState(s).toLowerCase();

            const animations = sceneAnimations.get(el);
            if (animations) {
                const rate = 1 + fraction * MAX_SPEEDUP;
                animations.surface.playbackRate = rate;
                animations.rays.playbackRate = rate;
            }

            setText(el.querySelector(".pond-state"), waterState(s));
            el.querySelector(".pond-meter-fill").style.width = `${(fraction * 100).toFixed(1)}%`;

            const blueLine = `${formatNumber(pondBlue(s))} Blue Essence/s, `;
            // pondGreen, not greenProduction, the meter has to read what is actually paid out
            const essenceLine = `${formatNumber(pondGreen(s))} Green Essence/s,  ` + blueLine;
            const second = el.querySelector(".pond-rate-second");
            if (lifeBought()) {
                setText(el.querySelector(".pond-rate"), `${formatNumber(biomassProduction(s))} Biomass/s`);
                setText(second, essenceLine);
                second.style.display = "";
            } else {
                setText(el.querySelector(".pond-rate"), blueLine);
                second.style.display = "none";
            }

            updateBalance(el.querySelector(".pond-balance"), s);
            updateInhabitants(el, s);
        },
    },

    drawers: {
        upgrades: {
            label: "Upgrades",
            color: "#2f8fb5",
            upgrades: {
                strongerCurrents: {
                    title: "Stronger Currents",
                    description: (s) => upgradeDescription(
                        `Each click stirs the water up ${Math.round(100 * Math.max(0.4, 0.4 * getLevel(s, "strongerCurrents")))}% more.`,
                        nextStep(s, "strongerCurrents", 5, "+40%")),
                    max: 5,
                    cost: (s, level) => ({ blueEssence: D(300).mul(D(2).pow(level)) }),
                },
                richerWaters: {
                    title: "Richer Waters",
                    description: (s) => upgradeDescription(
                        `The pond passively produces ${Math.round(100 * Math.max(0.25, 0.25 * getLevel(s, "richerWaters")))}% more, at any turbulence.`,
                        nextStep(s, "richerWaters", 25, "+25%")),
                    max: 25,
                    cost: (s, level) => ({ blueEssence: D(400).mul(D(1.21).pow(level)) }),
                },
                stormChannels: {
                    title: "Storm Channels",
                    description: (s) => upgradeDescription(
                        `Rough water boosts Blue Essence production by ${Math.round(100 * Math.max(0.25, 0.25 * getLevel(s, "stormChannels")))}%.`,
                        nextStep(s, "stormChannels", 10, "+25%")),
                    max: 10,
                    cost: (s, level) => ({ blueEssence: D(1400).mul(D(1.45).pow(level)) }),
                },
                sensitiveCurrents: {
                    title: "Sensitive Currents",
                    description: (s) => upgradeDescription(
                        `The water gives its best at lower turbulence. Blue Essence gives peak production at ${Math.round(100 * Math.max(0.1, 0.1 * getLevel(s, "sensitiveCurrents")))}% less turbulence.`,
                        nextStep(s, "sensitiveCurrents", 5, "+10%")),
                    max: 5,
                    cost: (s, level) => ({ blueEssence: D(1800).mul(D(1.55).pow(level)) }),
                },
                wideMargins: {
                    title: "Wide Margins",
                    description: (s) => upgradeDescription(
                        `Widens what counts as balanced by ${Math.round(100 * Math.max(0.05, 0.05 * getLevel(s, "wideMargins")))}% for Blue Essence production, and half as much for Biomass production.`,
                        nextStep(s, "wideMargins", 8, "+5%")),
                    hidden: () => !coreNode("pondSymbiosis"),
                    max: 8,
                    cost: (s, level) => ({
                        greenEssence: D(60000).mul(D(2.1).pow(level)),
                        blueEssence: D(60000).mul(D(2.1).pow(level)),
                    }),
                },
            },
        },

        algae: {
            label: "Algae",
            color: "#3aa876",
            hidden: () => !lifeBought(),
            upgrades: {
                fertileWater: {
                    title: "Fertile Water",
                    description: (s) => upgradeDescription(
                        `Algae grows ${Math.round(100 * Math.max(ALGAE_PER_LEVEL, ALGAE_PER_LEVEL * getLevel(s, "fertileWater")))}% faster.`,
                        nextStep(s, "fertileWater", 10, "+25%")),
                    max: 10,
                    cost: (s, level) => ({ biomass: D(60).mul(D(1.3).pow(level)) }),
                },
                denseMats: {
                    title: "Dense Mats",
                    description: (s) => upgradeDescription(
                        `Algae produces ${Math.round(100 * Math.max(GREEN_PER_LEVEL, GREEN_PER_LEVEL * getLevel(s, "denseMats")))}% more Green Essence.`,
                        nextStep(s, "denseMats", 25, "+50%")),
                    max: 25,
                    cost: (s, level) => ({ biomass: D(45).mul(D(1.14).pow(level)) }),
                },
                nutrientDense: {
                    title: "Nutrient Dense",
                    description: (s) => upgradeDescription(
                        `Algae counts for ${Math.round(100 * Math.max(0.15, 0.15 * getLevel(s, "nutrientDense")))}% more than it is for biomass production, without taking up any more room.`,
                        nextStep(s, "nutrientDense", 15, "+15%")),
                    max: 15,
                    cost: (s, level) => ({ biomass: D(130).mul(D(1.2).pow(level)) }),
                },
                oxygenation: {
                    title: "Oxygenation",
                    description: (s) => upgradeDescription(
                        `Algae additionally produces Blue Essence equal to ${Math.round(100 * Math.max(0.05, oxygenShare(s)))}% of the Green Essence.`,
                        nextStep(s, "oxygenation", 5, "+5%")),
                    max: 5,
                    cost: (s, level) => ({ biomass: D(130).mul(D(1.26).pow(level)) }),
                },
                dormantSpores: {
                    title: "Dormant Spores",
                    description: (s) => upgradeDescription(
                        `Wake the spores from the pond bed by hand, greatly increasing growth for ${BURST_SECONDS} seconds or until stopped on a ${burstCooldown(s, "spores")} second cooldown.`,
                        nextStep(s, "dormantSpores", 6, "-3 seconds")),
                    max: 6,
                    cost: (s, level) => ({ biomass: D(260).mul(D(1.55).pow(level)) }),
                },
                unlockAlgaeBloom: {
                    title: "Chart the Bloom",
                    description: "Adds the Algae Bloom card to the evolution draw pool: while algae fills the pond completely, Green Essence production is boosted.",
                    hidden: () => !coreNode("evolution"),
                    cost: () => ({ biomass: D(1500) }),
                    onPurchase() { unlockCard("algaeBloom"); },
                },
            },
        },

        fish: {
            label: "Fish",
            color: "#4a90d9",
            hidden: () => !lifeBought(),
            upgrades: {
                spawningGrounds: {
                    title: "Spawning Grounds",
                    description: (s) => upgradeDescription(
                        `Still nothing at all in water that's perfectly still. Fish breed ${100 * Math.max(0.25, 0.25 * getLevel(s, "spawningGrounds"))}% faster in rough water.`,
                        nextStep(s, "spawningGrounds", 10, "+25%")),
                    max: 10,
                    cost: (s, level) => ({ biomass: D(70).mul(D(1.3).pow(level)) }),
                },
                biggerSchools: {
                    title: "Bigger Schools",
                    description: (s) => upgradeDescription(
                        `Each fish boosts the pond's Blue Essence production by ${Math.round(100 * Math.max(0.15, 0.15 * getLevel(s, "biggerSchools")))}%.`,
                        nextStep(s, "biggerSchools", 25, "+15%")),
                    max: 25,
                    cost: (s, level) => ({ biomass: D(48).mul(D(1.14).pow(level)) }),
                },
                richRoe: {
                    title: "Rich Roe",
                    description: (s) => upgradeDescription(
                        `Fish count for ${Math.round(100 * Math.max(0.15, 0.15 * getLevel(s, "richRoe")))}% more than they are for biomass production, without taking up any more room.`,
                        nextStep(s, "richRoe", 15, "+15%")),
                    max: 15,
                    cost: (s, level) => ({ biomass: D(130).mul(D(1.2).pow(level)) }),
                },
                hardyStock: {
                    title: "Hardy Stock",
                    description: (s) => upgradeDescription(
                        `Still nothing in water that's perfectly still. Fish breed at their best in ${Math.round(100 * Math.max(0.1, 0.1 * getLevel(s, "hardyStock")))}% calmer water than they used to need.`,
                        nextStep(s, "hardyStock", 3, "+10%")),
                    max: 3,
                    cost: (s, level) => ({ biomass: D(160).mul(D(1.4).pow(level)) }),
                },
                feedingFrenzy: {
                    title: "Feeding Frenzy",
                    description: (s) => upgradeDescription(
                        `The school breeds at its best even in still water. Send the school wild by hand, greatly increasing their growth for ${BURST_SECONDS} seconds or until stopped on a ${burstCooldown(s, "frenzy")} second cooldown.`,
                        nextStep(s, "feedingFrenzy", 6, "-3 seconds")),
                    max: 6,
                    cost: (s, level) => ({ biomass: D(260).mul(D(1.55).pow(level)) }),
                },
            },
        },
    },
};

registerLayer("pond", {
    categoryId: "main",
    group: "world",
    order: 1,
    startUnlocked: false,
    absorbedBy: "aquatic",

    resources: POND_RESOURCES,

    initialState: {
        turbulence: 0,
        capacity: BASE_CAPACITY,
        algae: 0,
        fish: 0,
        algaeBurst: 0,
        algaeBurstReady: 0,
        fishBurst: 0,
        fishBurstReady: 0,
        tideSeconds: 0,
    },

    onTick(dt, layer) {
        const s = getLayerState(layer.id);
        addResource("blueEssence", pondBlue(s).mul(dt));

        s.tideSeconds = ((s.tideSeconds || 0) + dt) % TIDE_SECONDS;

        // The combo timers run down whether or not the pond is visibile
        s.bandBoostLeft = Math.max(0, (s.bandBoostLeft || 0) - dt);
        const world = getLayerState("world");
        world.shoreBoostLeft = Math.max(0, (world.shoreBoostLeft || 0) - dt);

        s.capacity = capacityFor(s);

        if (tidalActive()) {
            const tide = (1 - Math.cos(2 * Math.PI * (s.tideSeconds || 0) / TIDE_SECONDS)) / 2;
            s.turbulence = tide * turbulenceCeiling();
        } else {
            s.turbulence = Math.max(0, s.turbulence - settleRate() * dt); // Settles the pond even if it's not on screen
            // Rainwater holds the water above still while it's raining up on the world
            if (rainwaterActive()) {
                s.turbulence = Math.max(s.turbulence, cardBonus("rainwater") * TURBULENCE_MAX);
            }
        }

        const band = bandOf(s);
        if (s.turbulenceBand === undefined) s.turbulenceBand = band;
        if (band !== s.turbulenceBand) {
            s.turbulenceBand = band;
            if (cardBonus("bandBoost") > 0) s.bandBoostLeft = BAND_BOOST_SECONDS;
        }

        if (lifeBought()) tickPond(s, dt, layer);
    },

    ...POND_VIEW,
});



// The pond floor is constant throughout loading, it doesn't rearrange every load
const POND_FLOOR = `
    <svg class="pond-floor" viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true">
        <path class="floor-far" d="M0 44 C 42 28, 78 50, 122 42 C 168 33, 208 58, 258 46
            C 308 34, 352 54, 400 42 L 400 120 L 0 120 Z"/>
        <path class="floor-near" d="M0 78 C 48 64, 92 86, 142 80 C 192 74, 224 94, 272 84
            C 322 73, 358 90, 400 80 L 400 120 L 0 120 Z"/>
        <ellipse class="floor-stone floor-stone-far" cx="150" cy="56" rx="13" ry="5"/>
        <ellipse class="floor-stone floor-stone-far" cx="300" cy="58" rx="9" ry="4"/>
        <ellipse class="floor-stone" cx="58" cy="88" rx="15" ry="7"/>
        <ellipse class="floor-stone" cx="94" cy="94" rx="9" ry="5"/>
        <ellipse class="floor-stone" cx="211" cy="92" rx="19" ry="8"/>
        <ellipse class="floor-stone" cx="246" cy="98" rx="11" ry="5"/>
        <ellipse class="floor-stone" cx="330" cy="90" rx="14" ry="6"/>
    </svg>`;

const ALGAE_ICON = `
    <svg class="life-icon life-icon-algae" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 15.5 C5.5 12 10.5 10 8 6.5 C6.6 4.6 8 2.5 8 2.5"/>
        <path d="M4.6 15.5 C3 13 6 11.8 4.9 9.2"/>
        <path d="M11.4 15.5 C13 13 10 11.8 11.1 9.2"/>
    </svg>`;

const FISH_ICON = `
    <svg class="life-icon life-icon-fish" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M1 8 L5.6 4.6 L5.6 11.4 Z"/>
        <path d="M4.6 8 C7 3.6 12.4 4.1 14.6 8 C12.4 11.9 7 12.4 4.6 8 Z"/>
        <circle cx="12.1" cy="7" r="0.85" class="life-icon-eye"/>
    </svg>`;

// Balance indicator, the percentage bar for fish/algae
const timerMarkup = (key, label) => `
    <button class="balance-timer" type="button" data-key="${key}" style="display: none">
        <div class="timer-fill"></div>
        <span class="timer-name">${label}</span>
        <span class="timer-state"></span>
    </button>
`;

const TIMER_HINTS = {
    running: "Click to cut it short.",
    cooling: "Still settling.",
    ready: "Click to set it off.",
};

function updateTimer(row, owned, remaining, cooldownLeft, cooldownSeconds) {
    if (!owned) {
        row.style.display = "none";
        return;
    }
    row.style.display = "";

    let state, text, fill;
    if (remaining > 0) {
        state = "running";
        text = `${remaining.toFixed(1)}s`;
        fill = remaining / BURST_SECONDS;
    } else if (cooldownLeft > 0) {
        state = "cooling";
        text = `${Math.ceil(cooldownLeft)}s`;
        fill = 1 - cooldownLeft / cooldownSeconds;
    } else {
        state = "ready";
        text = "Ready";
        fill = 1;
    }

    if (row.dataset.state !== state) {
        row.dataset.state = state;
        row.title = TIMER_HINTS[state];
    }
    setText(row.querySelector(".timer-state"), text);
    const width = `${Math.max(0, Math.min(1, fill)) * 100}%`;
    const bar = row.querySelector(".timer-fill");
    if (bar.style.width !== width) bar.style.width = width;
}

function updateBalance(host, s) {
    const living = s.algae + s.fish;
    if (!lifeBought() || living <= 0) {
        host.style.display = "none";
        return;
    }
    host.style.display = "";

    // Whole percentage points, which is all the precision the bar can show anyway
    const algaePercent = Math.round(s.algae / living * 100);
    const capacity = Math.max(living, s.capacity);
    const percents = host.querySelectorAll(".balance-percent");
    setText(percents[0], `${algaePercent}%`);
    setText(percents[1], `${100 - algaePercent}%`);

    const fills = host.querySelectorAll(".balance-fill");
    setWidth(fills[0], s.algae / capacity);
    setWidth(fills[1], s.fish / capacity);

    // Flashes the fish red while there's not enough algae to go around and they're dying off
    const starving = starvation(s) > 0;
    const fishTag = host.querySelector('[data-kind="fish"] .balance-tag');
    fishTag.toggleAttribute("data-starving", starving);
    if (starving) fishTag.title = "Not enough algae - the fish are starving.";
    else fishTag.removeAttribute("title");

    updateTimer(host.querySelector('[data-key="spores"]'), getLevel(s, "dormantSpores") > 0,
        s.algaeBurst || 0, s.algaeBurstReady || 0, burstCooldown(s, "spores"));
    updateTimer(host.querySelector('[data-key="frenzy"]'), getLevel(s, "feedingFrenzy") > 0,
        s.fishBurst || 0, s.fishBurstReady || 0, burstCooldown(s, "frenzy"));

    host.title = `${s.algae.toFixed(2)} algae and ${s.fish.toFixed(2)} fish, in a pond that holds ${Math.floor(s.capacity)}`;
}

// Algae frond animation stuff. Segments help them be properly wavy
const FROND_SEGMENTS = 4;
const FROND_WAVES = 4.2;    // Radians of sine along one frond
const FROND_ROOTED = 1.6;   // How much the base resists, higher value makes the bottom stiffer
const FROND_center = 20;

// "bias" is the frond's resting curve, keeps algae from being 3 copies of the same line + wave
function frondPath(phase, sway, bias) {
    const x = (t) => {
        const reach = Math.pow(t, FROND_ROOTED);
        return (FROND_center + (bias + Math.sin(phase + t * FROND_WAVES) * sway) * reach).toFixed(2);
    };
    const y = (t) => (100 - t * 98).toFixed(2);

    let d = `M ${FROND_center} 100`;
    for (let i = 1; i <= FROND_SEGMENTS; i++) {
        const from = (i - 1) / FROND_SEGMENTS;
        const to = i / FROND_SEGMENTS;
        const third = (to - from) / 3;
        d += ` C ${x(from + third)} ${y(from + third)}, ${x(to - third)} ${y(to - third)}, ${x(to)} ${y(to)}`;
    }
    return d;
}

// Full cycle of the animation, so it loops properly
function swayKeyframes(sway, bias) {
    return [0, 1, 2, 3, 4].map(i => ({ d: `path("${frondPath(i * Math.PI / 2, sway, bias)}")` }));
}

const sceneLife = new WeakMap(); 

// Elements are only added or removed when the sprite count changes
function updateInhabitants(el, s) {
    const alive = lifeBought();
    const algaeHost = el.querySelector(".pond-algae-layer");
    const fishHost = el.querySelector(".pond-fish-layer");

    const counts = alive ? spriteCounts(s) : { algae: 0, fish: 0 };
    const changed = syncCount(algaeHost, counts.algae, buildAlgae)
        | syncCount(fishHost, counts.fish, buildFish);

    // Re-collected only when something was added or removed
    if (changed || !sceneLife.has(el)) {
        sceneLife.set(el, {
            algae: motionAnimations(algaeHost),
            fish: motionAnimations(fishHost),
            rates: { algae: 0, fish: 0 },
        });
    }

    const life = sceneLife.get(el);
    const fraction = turbulenceFraction(s);
    setRate(life.algae, life.rates, "algae", rateFor(fraction, 0.5, 1.7));
    setRate(life.fish, life.rates, "fish", rateFor(fraction, 0.28, 2.6));
}



// Turbulence moves continuously, don't want to rewrite the rate every frame with tiny value changes
function setRate(animations, rates, key, rate) {
    if (Math.abs(rates[key] - rate) < 0.002) return;
    rates[key] = rate;
    for (const animation of animations) animation.playbackRate = rate;
}

const MOTION = "pond-motion";   // Animation.id, so the fades can be told apart from the rest
const FADE_IN_MS = 1100;
const FADE_OUT_MS = 800;

const motionAnimations = (host) =>
    host.getAnimations({ subtree: true }).filter(animation => animation.id === MOTION);

// Keyed by index, because a departing element is still in the DOM while it fades
function syncCount(host, count, build) {
    const existing = new Map();
    for (const el of host.children) existing.set(Number(el.dataset.index), el);

    let changed = 0;
    for (const [index, el] of existing) {
        if (index >= count && !el.dataset.leaving) { fadeOut(el); changed = 1; }
        else if (index < count && el.dataset.leaving) { fadeIn(el); changed = 1; }
    }

    for (let index = 0; index < count; index++) {
        if (existing.has(index)) continue;
        const el = build(index);
        el.dataset.index = index;
        host.appendChild(el);
        fadeIn(el);
        changed = 1;
    }
    return changed;
}

// Algae properly grows/fades depending on its amounts
const growTransform = (opacity) => opacity >= 1
    ? "none"
    : `translateY(${(8 * (1 - opacity)).toFixed(2)}%) scale(${(0.85 + 0.15 * opacity).toFixed(3)})`;

function fadeKeyframes(el, from, to) {
    if (!el.dataset.fadeGrow) return [{ opacity: from }, { opacity: to }];
    return [
        { opacity: from, transform: growTransform(from) },
        { opacity: to, transform: growTransform(to) },
    ];
}

// Fade in/out goes from where the element currently is, so it stops it blinking when it goes back and forth across whole numbers
function fadeFrom(el, fresh) {
    return el.__fade ? Number(getComputedStyle(el).opacity) : fresh;
}

function fadeIn(el) {
    delete el.dataset.leaving;
    const from = fadeFrom(el, 0);
    cancelFade(el);
    el.__fade = el.animate(fadeKeyframes(el, from, 1),
        { duration: Math.max(1, FADE_IN_MS * (1 - from)), easing: "ease-out" });
}

function fadeOut(el) {
    el.dataset.leaving = "1";
    const from = fadeFrom(el, 1);
    cancelFade(el);
    el.__fade = el.animate(fadeKeyframes(el, from, 0),
        { duration: Math.max(1, FADE_OUT_MS * from), easing: "ease-in", fill: "forwards" });
    // Only if it's still fading out, fadeIn cancels this animation, which triggers oncancel instead
    el.__fade.onfinish = () => { if (el.dataset.leaving) el.remove(); };
}

function cancelFade(el) {
    if (!el.__fade) return;
    el.__fade.onfinish = null;
    el.__fade.cancel();
    el.__fade = null;
}

// Algae position is based on the index instead of random, so they don't move when one fades.
// Each frond is a bit separate so they have different movement and position within the single algae thing
const FRONDS = [
    { sway: 17, bias: -7 },
    { sway: 14, bias: 2 },
    { sway: 11, bias: 9 },
];

const between = (low, high) => low + Math.random() * (high - low);

const ALGAE_FROM = 6, ALGAE_SPAN = 76;
function clumpLeft(index) {
    let fraction = 0;
    for (let n = index, place = 0.5; n > 0; n >>= 1, place /= 2) fraction += (n & 1) * place;
    return ALGAE_FROM + ALGAE_SPAN * fraction;
}

function buildAlgae(index) {
    const el = document.createElement("div");
    el.className = "pond-algae-clump";
    el.dataset.fadeGrow = "1"; // Works off of fadeKeyframes
    el.style.left = `${clumpLeft(index).toFixed(1)}%`;
    el.style.transformOrigin = "50% 100%"; // Grows up from the bottom

    // Algae size is rolled on fading in so they're a bit more varied
    el.style.setProperty("--clump-height", between(0.72, 1.34).toFixed(3));
    el.style.setProperty("--clump-scale", between(0.9, 1.15).toFixed(3));

    for (let i = 0; i < FRONDS.length; i++) {
        const frond = document.createElement("div");
        frond.className = "pond-algae-frond";
        frond.style.left = `${4 + i * 18}%`;
        
        // Makes sure that the fronds are different lengths
        frond.style.height = `${Math.max(52, 100 - i * 13 + between(-10, 10)).toFixed(1)}%`;
        frond.innerHTML = `<svg class="algae-frond" viewBox="0 0 40 100" preserveAspectRatio="none" aria-hidden="true">`
            + `<path /></svg>`;

        // Waves pass through the fronds so they move in roughly the same direction but delayed
        const sway = frond.querySelector("path").animate(swayKeyframes(FRONDS[i].sway, FRONDS[i].bias), {
            duration: 7000,
            iterations: Infinity,
            delay: -(index * 7000 * 0.31 + i * 7000 * 0.06),
        });
        sway.id = MOTION;
        el.appendChild(frond);
    }
    return el;
}

// Fish movement
function fishNoise(index, salt) {
    const x = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
    return x - Math.floor(x);
}

function swimKeyframes(index, leftward) {
    const n = (salt) => fishNoise(index, salt);
    const near = 3 + n(1) * 18;
    const far = 56 + n(2) * 30;
    const span = far - near;
    const out = near + span * (0.30 + n(3) * 0.28);  // The mid-points sit at different places back and forth
    const back = near + span * (0.34 + n(4) * 0.30);
    const lift = [0, -(10 + n(5) * 26), -8 + n(6) * 16, 6 + n(7) * 24, 0];

    // Splits the fish so they don't all swim the same direction
    const lanes = leftward ? [far, back, near, out, far] : [near, out, far, back, near];

    return lanes.map((left, i) => ({
        left: `${left.toFixed(1)}%`,
        transform: `translateY(${lift[i].toFixed(1)}px)`,
        ...(i < lanes.length - 1 ? { easing: "ease-in-out" } : {}),
    }));
}

function flipKeyframes(leftward) {
    const first = leftward ? -1 : 1;
    return [
        { transform: `scaleX(${first})` },
        { transform: `scaleX(${first})`, offset: 0.499 },
        { transform: `scaleX(${-first})`, offset: 0.5 },
        { transform: `scaleX(${-first})` },
    ];
}

const wiggleKeyframes = (degrees) => [
    { transform: `rotate(${-degrees}deg)`, easing: "ease-in-out" },
    { transform: `rotate(${degrees}deg)`, easing: "ease-in-out" },
    { transform: `rotate(${-degrees}deg)` },
];

function buildFish(index) {
    const n = (salt) => fishNoise(index, salt);
    const leftward = index % 2 === 1;

    const el = document.createElement("div");
    el.className = "pond-fish-swimmer";
    // Indexed lanes so a small school still spreads out, jittered for variety
    el.style.top = `${Math.min(72, Math.max(12, 18 + (index * 37) % 46 + (n(8) - 0.5) * 8)).toFixed(1)}%`;
    el.style.setProperty("--fish-scale", (0.78 + n(9) * 0.46).toFixed(2));
    el.innerHTML = `<div class="pond-fish-body">${FISH_ICON}</div>`;

    // Lap length varies per fish
    const duration = 15000 * (0.78 + n(10) * 0.55);
    const timing = { duration, iterations: Infinity, delay: -(n(11) * duration) };


    // 3 animations, since the fish turns at the end and wiggles throughout the whole movement.
    // Separating the animations makes them not fight for priority
    const wiggleMs = 1900 * (0.8 + n(12) * 0.5);
    const motion = [
        el.animate(swimKeyframes(index, leftward), timing),
        el.querySelector(".life-icon").animate(flipKeyframes(leftward), timing),
        el.querySelector(".pond-fish-body").animate(wiggleKeyframes(3 + n(13) * 2.5), {
            duration: wiggleMs,
            iterations: Infinity,
            delay: -(n(14) * wiggleMs),
        }),
    ];
    for (const animation of motion) animation.id = MOTION;

    return el;
}