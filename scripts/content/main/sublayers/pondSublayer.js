// pondSublayer.js
//
// Click to stir the water; algae grow on their own, fish grow in rough water and eat algae

import { registerLayer } from "../../../core/registry.js";
import { getLayerState } from "../../../core/state.js";
import { addResource, getLevel, getResource, nextStep } from "../../../core/resources.js";
import { boostResource, registerBoost } from "../../../core/boosts.js";
import { D } from "../../../utils/decimal.js";
import { formatNumber } from "../../../utils/format.js";
import { setText, setWidth, setDisplay } from "../../../utils/dom.js";
import { upgradeDescription } from "../../../render/richText.js";
import { cardBonus, cardActive, unlockCard } from "../systems/cards.js";
import { traitBonus, traitHas, extendUpgrade, pastCapGain } from "../systems/evolutionTraits.js";
import {
    shoreGrassTiles, worldState, claimedTiles, tileKind, adjacentOfKind, countOf,
} from "../systems/worldMap.js";
import { openRegionCount } from "./oceanSublayer.js";
import { challengeMod, challengeBlocks, challengeDone } from "../systems/challenges.js";
import { clamp, clamp01, seededRandom } from "../../../utils/math.js";
import { coreNodeBought } from "../../../core/nodes.js";
import { specialMilestone } from "./grassSublayer.js";


const BASE_PRODUCTION = D(5);  // Blue Essence/sec in perfectly calm water
const TURBULENCE_BONUS = 7;    // Fully turbulent water produces (1 + this) times as much


const DISTURBED_AT = 33;
const TURBULENT_AT = 66;

// Animation speed and surface cycle pixels
const MAX_SPEEDUP = .9;            // How much faster the water moves at full turbulence
const SURFACE_PERIOD_MS = 18000;    // Time for each cycle based on surface sprites
const RAY_PERIOD_MS = 11000;        // Time for each cycle based on light ray sprites
const SURFACE_CYCLE_REM = 22.5;


const BASE_CAPACITY = 2;    // Starting pond capacity
export const PER_POND_TILE = 0.4;  // What one pond tile on the world map is worth to that capacity


// Ponds boost Blue Essence but crowd each other, so a lone pond is worth more
export const PER_POND_BLUE = 0.15;
const POND_CROWDING = 0.6;   // How hard each neighboring pond cuts into what one is worth
const SETTLED_WATER_BLUE = 3;   // What Settled Water, from Still Water, makes a pond tile worth

export const perPondBlue = () =>
    PER_POND_BLUE * (challengeDone("stillWater") ? SETTLED_WATER_BLUE : 1);

// What one pond tile adds, as the fraction it puts on top of the multiplier
export const pondBlueShare = (s, id) =>
    perPondBlue() / (1 + POND_CROWDING * adjacentOfKind(s, id, "pond"));

export function pondBlueBonus(s = worldState()) {
    let total = 0;
    for (const id of claimedTiles(s)) {
        if (tileKind(s, id) === "pond") total += pondBlueShare(s, id);
    }
    return total;
}

export const pondBlueMultiplier = (s = worldState()) => 1 + pondBlueBonus(s);

registerBoost("Ponds", (resourceId) =>
    resourceId === "blueEssence" ? pondBlueMultiplier() : 1);

// Rain is worth more to the pond than it is anywhere else, and a cloud over the water most of all
const WATERSHED_PER_TILE = 1.6;
const WATERSHED_MAX_TILES = 6;
const SHOALS_FISH = 10;


// Every other pond dug on the map feeds this one, up to a point
const watershed = () => coreNodeBought("pondWatershed")
    ? Math.pow(WATERSHED_PER_TILE, Math.min(countOf("pond"), WATERSHED_MAX_TILES))
    : 1;

const BUDDING_PER_REGION = 0.5;
const BUDDING_POWER = 1.35;
const BUDDING_EXPONENT = 0.25;
const BUDDING_BASE = 100;      // Puts the pond in the same range as the ocean it feeds off

const oceanReach = () => {
    if (!coreNodeBought("ocean")) return 0;
    return BUDDING_PER_REGION * openRegionCount(getLayerState("aquatic"));
};

const buddingScale = () => Math.pow(1 + oceanReach(), BUDDING_POWER);

const pondScale = () => buddingScale() * watershed();

// Rides on total Biomass rather than pond size, so a well-kept pond keeps paying forever
export function buddingMultiplier() {
    const s = getLayerState("pond");
    if (!specialMilestone("wellspring") || !coreNodeBought("life") || !(s.capacity > 0)) return D(1);
    const stock = Math.min(1, (s.algae + s.fish) / s.capacity);
    const quality = stock * balanceFactor(s);
    const biomass = getResource("biomass");
    if (quality <= 0 || biomass.lte(1)) return D(1);
    return biomass.pow(BUDDING_EXPONENT * quality);
}

registerBoost("Wellspring", (resourceId) =>
    resourceId === "blueEssence" || resourceId === "biomass" ? buddingMultiplier() : 1);

const ALGAE_GROWTH = 0.04;
const ALGAE_PER_LEVEL = 0.25;

const FISH_GROWTH = 0.05;       // Fish per second in fully turbulent water, nothing in calm
const FISH_PER_LEVEL = 0.25;

// How much algae a fish eats per second, and how much has to be standing for the school to count as fed
const FISH_APPETITE = 0.02;
const FOOD_PER_FISH = 0.1;
const STARVATION_PER_SECOND = 0.15;

// For the feeding frenzy and dormant spores upgrades
const BURST_SECONDS = 5;
const burstSeconds = () => BURST_SECONDS + traitBonus("burstLength");
const SPORES_GROWTH = 0.15;
const FRENZY_GROWTH = 0.105;
const BURST_COOLDOWN = 30;       // The wait at the first level, once the burst has finished
const COOLDOWN_PER_LEVEL = 3;   // !!! REMOVE THIS ONCE YOU FIGURE IT OUT !!!
const MIN_BURST_COOLDOWN = 15;


const ALGAE_CROWDING = 0.25; // Fraction of algae's growth that can push into occupied space
const FISH_CROWDING = 0.4;   // Same for fish. Higher, since the fish are the side being driven

const NICHE_PER_LEVEL = 0.15;
const crowdingKept = (s) => 1 - NICHE_PER_LEVEL * getLevel(s, "distinctNiches");

// Vigorous Algae and Prime Stock, which make each one count for more everywhere
const POTENCY_PER_LEVEL = 0.1;
const algaePotency = (s) => 1 + POTENCY_PER_LEVEL * getLevel(s, "vigorousAlgae");
const fishPotency = (s) => 1 + POTENCY_PER_LEVEL * getLevel(s, "primeStock");

const rateFor = (fraction, calm, rough) => calm + fraction * (rough - calm);

const GREEN_PER_ALGAE = D(150); // Green Essence/sec per unit of algae
const GREEN_PER_LEVEL = 0.5;
const BLUE_PER_FISH = 0.35;     // Each fish adds this much to the pond's Blue multiplier
const BLUE_FISH_PER_LEVEL = 0.15;

const sceneAnimations = new WeakMap();  // Animations are per scene element so they can be rebuilt without causing a stale handle

const ROUGH_ABOVE = .66;

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

const stirPerClick = (s) => (5 + 2 * getLevel(s, "strongerCurrents"))
    * (1 + cardBonus("stirPower"));

// How rough the water is allowed to get
const turbulenceCeiling = () => 100 * (1 + cardBonus("turbulenceMax"));
const turbulenceFraction = (s) =>
    clamp(s.turbulence / 100, 0, 1 + cardBonus("turbulenceMax"));

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

// Level 0 reads as level 1 so the game never runs a burst the upgrade hasn't bought
const burstCooldown = (s, key) => (1 - traitBonus("burstCooldown")) * Math.max(MIN_BURST_COOLDOWN,
    BURST_COOLDOWN - COOLDOWN_PER_LEVEL * (Math.max(1, getLevel(s, BURSTS[key].upgrade)) - 1));

// What descriptions quote: the current values, so an unbought burst quotes the plain cooldown
const shownCooldown = (s, key) => (1 - traitBonus("burstCooldown")) * Math.max(MIN_BURST_COOLDOWN,
    BURST_COOLDOWN + COOLDOWN_PER_LEVEL - COOLDOWN_PER_LEVEL * getLevel(s, BURSTS[key].upgrade));

const sporesActive = (s) => (s.algaeBurst || 0) > 0;
const frenzyActive = (s) => (s.fishBurst || 0) > 0;

// Dead Calm: neither population moves for a while after the water calms, except through a hand-set burst
const SLACK_SECONDS = 10;
const slackActive = (s) => (s.slackLeft || 0) > 0;
const populationsHeld = (s) => slackActive(s) && !sporesActive(s) && !frenzyActive(s);

const sporesBonus = (s) => sporesActive(s) ? SPORES_GROWTH * s.capacity : 0;
const frenzyBonus = (s) => frenzyActive(s) ? FRENZY_GROWTH * s.capacity : 0;


// Settled Water deepens the pond itself, which is room both the algae and the fish can use
const SETTLED_PER_LEVEL = 0.5;
const settledDepth = (s) => SETTLED_PER_LEVEL * getLevel(s, "settledWater");

const algaeGrowth = (s) => ALGAE_GROWTH * s.capacity * challengeMod("algaeGrowth")
    * (sporesActive(s) ? 1 : 1 - turbulenceFraction(s))
    * (1 + ALGAE_PER_LEVEL * getLevel(s, "fertileWater") + cardBonus("algaeGrowth")
        + (worldRaining() ? cardBonus("rainAlgae") : 0)
        + shoreExchange())
    * (1 + traitBonus("growth"))
    + sporesBonus(s);

function tickBursts(s, dt) {
    s.algaeBurst = Math.max(0, (s.algaeBurst || 0) - dt);
    s.algaeBurstReady = Math.max(0, (s.algaeBurstReady || 0) - dt);
    s.fishBurst = Math.max(0, (s.fishBurst || 0) - dt);
    s.fishBurstReady = Math.max(0, (s.fishBurstReady || 0) - dt);
}

// Every click on the water, whether or not anything happens
function registerStir(s) {
    if (challengeBlocks("stir")) return;
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

    s[burst.running] = burstSeconds();
    s[burst.ready] = burstSeconds() + burstCooldown(s, key);
}
// Turbulence as the fish see it
const fishPeak = (s) => Math.max(0.3, 1 - 0.1 * getLevel(s, "hardyStock"));

// Bursts make growth ignore turbulence
const fishTurbulence = (s) => Math.min(turbulenceLimit(),
    Math.max(frenzyActive(s) ? 1 : 0, turbulenceFraction(s) / fishPeak(s)));
const turbulenceLimit = () => 1 + cardBonus("turbulenceMax");

const fishGrowth = (s) => FISH_GROWTH * fishTurbulence(s)
    * (1 + FISH_PER_LEVEL * getLevel(s, "spawningGrounds") + cardBonus("fishGrowth")
        + shoreBoost())                                   // Living Shore
    * (1 + traitBonus("growth") + traitBonus("fishGrowth"))
    + frenzyBonus(s);

const appetite = (s) => FISH_APPETITE * s.fish;
const foodWanted = (s) => FOOD_PER_FISH * s.fish;
const wellFed = (s) => foodWanted(s) <= 0 ? 1 : Math.min(1, s.algae / foodWanted(s));
const starvation = (s) => s.fish * (1 - wellFed(s)) * STARVATION_PER_SECOND * (1 - traitBonus("starvation"));


const algaeForBiomass = (s) => s.algae * algaePotency(s) * (1 + 0.15 * getLevel(s, "nutrientDense"));
const fishForBiomass = (s) => s.fish * fishPotency(s) * (1 + 0.15 * getLevel(s, "richRoe"));

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

    return D((Math.pow(max, biomassExponent) * Math.pow(min, biomassExponent)) * (1 + cardBonus("biomassOutput")))
        .mul(1 + traitBonus("pondBiomass"))
        .mul(boostResource("biomass"))
        .mul(pondScale())
        .mul(challengeMod("pondOutput"));
}


// How even the pond's populations are
const evenness = (s) => {
    const living = s.algae + s.fish;
    return living <= 0 ? 0 : 2 * Math.min(s.algae, s.fish) / living;
};

// Mostly wide margins card stuff
const balanceTolerance = (s) => Math.min(0.5, 0.05 * getLevel(s, "wideMargins"));
const balanceFactor = (s) => cardActive("roughBalance") && turbulenceFraction(s) >= ROUGH_ABOVE
    ? 1 : Math.min(1, evenness(s) / (1 - balanceTolerance(s)));
const balanceMultiplier = (s) => 1 + (coreNodeBought("pondSymbiosis") ? 1.5 : 0) * balanceFactor(s);

const greenProduction = (s) => GREEN_PER_ALGAE.mul(s.algae * algaePotency(s))
    .mul(1 + GREEN_PER_LEVEL * getLevel(s, "denseMats") + cardBonus("algaeGreen"))
    .mul(coreNodeBought("pondClear") ? 5 : 1)
    .mul(challengeMod("algaeOutput"));
const fishMultiplier = (s) => 1 + s.fish * fishPotency(s)
    * (BLUE_PER_FISH + BLUE_FISH_PER_LEVEL * getLevel(s, "biggerSchools"))
    * (1 + cardBonus("fishBlue"))
    * (coreNodeBought("pondShoals") ? SHOALS_FISH : 1);

// Turbulence as blue production sees it, which isn't the same as the one the creatures use
const productionPeak = (s) => Math.max(0.3,
    1 - 0.1 * getLevel(s, "sensitiveCurrents"));
const productionTurbulence = (s) => Math.min(turbulenceLimit(), turbulenceFraction(s) / productionPeak(s));

const turbulenceBonus = (s) => TURBULENCE_BONUS + 2 * getLevel(s, "stormChannels");

// How fast turbulence goes away
const settleRate = () =>
    10 * Math.max(.25, 1 - (coreNodeBought("pondChoppy") ? 0.26 : 0))
    / (1 + cardBonus("settleResist"));

// Capacity is recomputed every tick rather than added on purchase, since some cards change it per tick
function capacityFor(s) {
    const base = (BASE_CAPACITY + (coreNodeBought("pondDeep") ? 1 : 0) + PER_POND_TILE * countOf("pond")
        + settledDepth(s))
        * (1 + cardBonus("pondCapacity") + traitBonus("pondCapacity")
            + (rainwaterActive() ? cardBonus("rainwater") : 0)
            + (worldRaining() ? cardBonus("rainCapacity") : 0));   // Dancing Waters
    return base;
}

// Deeper depths stuff
const algaeCeiling = (s) => s.capacity * (1 - Math.min(0.9, cardBonus("fishReserve")));

function production(s) {
    const fromTurbulence = 1 + productionTurbulence(s) * turbulenceBonus(s);
    const fromUpgrades = (1 + .25 * Math.min(25, getLevel(s, "richerWaters"))) * pastCapGain("richerWaters", getLevel(s, "richerWaters"));
    return BASE_PRODUCTION.mul(fromTurbulence).mul(fromUpgrades).mul(fishMultiplier(s))
        .mul(1 + cardBonus("pondOutput") + bandBoost(s))
        .mul(1 + cardBonus("roughBlue") * Math.min(1, turbulenceFraction(s)))
        .mul(1 + traitBonus("pondOutput") + (bandOf(s) === 2 ? traitBonus("roughWater") : 0))
        .mul(specialMilestone("wellspring") ? BUDDING_BASE : 1);
}

// Algae bloom card; under Fast Breeders, fish held at the floor count as algae
const algaeFull = (s) => s.capacity > 0 && s.algae + (teemingFloored(s, s.fish) ? s.fish : 0) >= s.capacity - 0.001;
const teemingFloored = (s, amount) => traitHas("fastBreeders") && amount <= TEEMING_FLOOR * s.capacity + 0.001;
const bloomBonus = (s) => algaeFull(s) ? cardBonus("algaeFullGreen") : 0;

const oxygenShare = (s) => 0.05 * getLevel(s, "oxygenation");

// Green turned Blue carries the challenge's Blue scaling instead of its Green one
const oxygenBlue = (s) => challengeMod("greenEssence") > 0
    ? pondGreen(s).mul(oxygenShare(s) * challengeMod("blueEssence") / challengeMod("greenEssence"))
    : D(0);

// The pond's two essence rates as they're paid out
const pondGreen = (s) => greenProduction(s)
    .mul(1 + bloomBonus(s))
    .mul(1 + cardBonus("calmGreen") * Math.max(0, 1 - turbulenceFraction(s)))
    .mul(1 + traitBonus("pondGreen"))
    .mul(balanceMultiplier(s))
    .mul(pondScale())
    .mul(challengeMod("pondOutput"))
    .mul(boostResource("greenEssence"));

const pondBlue = (s) => production(s)
    .mul(balanceMultiplier(s))
    .mul(pondScale())
    .mul(challengeMod("pondOutput"))
    .mul(boostResource("blueEssence"))
    .add(oxygenBlue(s));

function waterState(s) {
    if (s.turbulence >= TURBULENT_AT) return "Turbulent";
    if (s.turbulence >= DISTURBED_AT) return "Disturbed";
    return "Calm";
}


const TEEMING_FLOOR = 0.2;

function tickPond(s, dt, layer) {
    tickBursts(s, dt);

    addResource("greenEssence", pondGreen(s).mul(dt));
    addResource("biomass", biomassProduction(s).mul(dt));

    if (!populationsHeld(s)) movePopulations(s, dt);

    // Fast Breeders
    if (traitHas("fastBreeders")) {
        const floor = TEEMING_FLOOR * s.capacity;
        s.algae = Math.max(s.algae, floor);
        s.fish = Math.max(s.fish, floor);
    }

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

// Growing, crowding, eating and starving
function movePopulations(s, dt) {
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
        const taken = Math.min(push * FISH_CROWDING * crowdingKept(s), spare);
        s.algae -= taken;
        s.fish += taken;
    } else if (push < 0) {
        const taken = Math.min(-push * ALGAE_CROWDING * crowdingKept(s), s.fish);
        s.fish -= taken;
        s.algae += taken;
    }

    // Fish eating
    s.algae -= Math.min(s.algae, appetite(s) * dt);
    s.fish = Math.max(0, s.fish - starvation(s) * dt);
}


export const POND_RESOURCES = ["greenEssence", "blueEssence", "biomass"];

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
                <!-- One wrapper so narrow screens can stack both readouts -->
                <div class="pond-hud">
                <div class="pond-balance">
                    <div class="balance-bar">
                        <div class="balance-fill" data-kind="algae"></div>
                        <div class="balance-fill" data-kind="fish"></div>
                    </div>
                    <!-- One column per side, with each burst timer under its figure -->
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
                    <div class="pond-rate pond-budding"></div>
                </div>
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
                     { transform: `translateX(-${SURFACE_CYCLE_REM}rem)` }],
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
                if (Math.abs(rate - (animations.rate || 1)) > 0.01) {
                    animations.rate = rate;
                    animations.surface.updatePlaybackRate(rate);
                    animations.rays.updatePlaybackRate(rate);
                }
            }

            setText(el.querySelector(".pond-state"), populationsHeld(s)
                ? `${waterState(s)}, still for ${Math.ceil(s.slackLeft)}s` : waterState(s));
            el.querySelector(".pond-meter-fill").style.width = `${(fraction * 100).toFixed(1)}%`;

            const blueLine = `${formatNumber(pondBlue(s))} Blue Essence/s `;
            // pondGreen, not greenProduction, the meter has to read what is actually paid out
            const essenceLine = `${formatNumber(pondGreen(s))} Green Essence/s,  ` + blueLine;
            const second = el.querySelector(".pond-rate-second");
            if (coreNodeBought("life")) {
                setText(el.querySelector(".pond-rate"), `${formatNumber(biomassProduction(s))} Biomass/s`);
                setText(second, essenceLine);
            } else {
                setText(el.querySelector(".pond-rate"), blueLine);
            }
            setDisplay(second, coreNodeBought("life"));

            const budding = el.querySelector(".pond-budding");
            const boost = buddingMultiplier();
            setDisplay(budding, boost.gt(1));
            if (boost.gt(1)) setText(budding, `Wellspring: ${formatNumber(boost)}x Blue Essence and Biomass everywhere`);

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
                        `Each click stirs up water the ${Math.round(100 * 0.4 * getLevel(s, "strongerCurrents"))}% more.`,
                        nextStep(s, "strongerCurrents", 5, "+40%")),
                    max: 5,
                    cost: (s, level) => ({ blueEssence: D(300).mul(D(2.5).pow(level)) }),
                },
                richerWaters: extendUpgrade("richerWaters", {
                    title: "Richer Waters",
                    description: (s) => upgradeDescription(
                        `The pond passively produces ${Math.round(100 * 0.25 * Math.min(25, getLevel(s, "richerWaters")))}% more, at any turbulence.`,
                        nextStep(s, "richerWaters", 25, "+25%")),
                    max: 25,
                    cost: (s, level) => ({ blueEssence: D(50).mul(D(1.35).pow(level)) }),
                }, (over) => ({ blueEssence: D(1e44).mul(D(10).pow(over)) })),
                stormChannels: {
                    title: "Storm Channels",
                    description: (s) => upgradeDescription(
                        `Rough water boosts Blue Essence production by ${Math.round(100 * 0.25 * getLevel(s, "stormChannels"))}%.`,
                        nextStep(s, "stormChannels", 12, "+25%")),
                    max: 10,
                    cost: (s, level) => ({ blueEssence: D(1500).mul(D(1.7).pow(level)) }),
                },
                sensitiveCurrents: {
                    title: "Sensitive Currents",
                    description: (s) => upgradeDescription(
                        `The water gives its best at lower turbulence. Blue Essence gives peak production at ${Math.round(100 * 0.1 * getLevel(s, "sensitiveCurrents"))}% less turbulence.`,
                        nextStep(s, "sensitiveCurrents", 5, "+10%")),
                    max: 5,
                    cost: (s, level) => ({ blueEssence: D(2500).mul(D(2.2).pow(level)) }),
                },
                distinctNiches: {
                    title: "Distinct Niches",
                    description: (s) => upgradeDescription(
                        `Algae and fish keep to their own parts of the pond, growing into each other's space ${Math.round(100 * NICHE_PER_LEVEL * getLevel(s, "distinctNiches"))}% less once it's full.`,
                        nextStep(s, "distinctNiches", 5, "+15%")),
                    hidden: () => !coreNodeBought("life"),
                    max: 5,
                    cost: (s, level) => ({ biomass: D(200).mul(D(1.8).pow(level)) }),
                },
                wideMargins: {
                    title: "Wide Margins",
                    description: (s) => upgradeDescription(
                        `Widens what counts as balanced by ${Math.round(100 * 0.05 * getLevel(s, "wideMargins"))}% for Blue Essence production, and half as much for Biomass production.`,
                        nextStep(s, "wideMargins", 8, "+5%")),
                    hidden: () => !coreNodeBought("pondSymbiosis"),
                    max: 8,
                    cost: (s, level) => ({
                        greenEssence: D(2e5).mul(D(2.6).pow(level)),
                        blueEssence: D(2e5).mul(D(2.6).pow(level)),
                    }),
                },
            },
        },

        algae: {
            label: "Algae",
            color: "#3aa876",
            hidden: () => !coreNodeBought("life"),
            upgrades: {
                fertileWater: {
                    title: "Fertile Water",
                    description: (s) => upgradeDescription(
                        `Algae grows ${Math.round(100 * ALGAE_PER_LEVEL * getLevel(s, "fertileWater"))}% faster.`,
                        nextStep(s, "fertileWater", 10, "+25%")),
                    max: 10,
                    cost: (s, level) => ({ biomass: D(60).mul(D(1.3).pow(level)) }),
                },
                denseMats: {
                    title: "Dense Mats",
                    description: (s) => upgradeDescription(
                        `Algae produces ${Math.round(100 * GREEN_PER_LEVEL * getLevel(s, "denseMats"))}% more Green Essence.`,
                        nextStep(s, "denseMats", 25, "+50%")),
                    max: 25,
                    cost: (s, level) => ({ biomass: D(25).mul(D(1.32).pow(level)) }),
                },
                nutrientDense: {
                    title: "Nutrient Dense",
                    description: (s) => upgradeDescription(
                        `Algae counts for ${Math.round(100 * 0.15 * getLevel(s, "nutrientDense"))}% more than it is for Biomass production, without taking up any more room.`,
                        nextStep(s, "nutrientDense", 15, "+15%")),
                    max: 15,
                    cost: (s, level) => ({ biomass: D(130).mul(D(1.25).pow(level)) }),
                },
                oxygenation: {
                    title: "Oxygenation",
                    description: (s) => upgradeDescription(
                        `Algae additionally produces Blue Essence equal to ${Math.round(100 * oxygenShare(s))}% of the Green Essence.`,
                        nextStep(s, "oxygenation", 5, "+5%")),
                    max: 5,
                    cost: (s, level) => ({ biomass: D(130).mul(D(1.26).pow(level)) }),
                },
                dormantSpores: {
                    title: "Dormant Spores",
                    description: (s) => upgradeDescription(
                        `Wake the spores from the pond bed by hand, greatly increasing growth for ${burstSeconds()} seconds or until stopped on a ${shownCooldown(s, "spores")} second cooldown.`,
                        nextStep(s, "dormantSpores", 6, "-3")),
                    max: 6,
                    cost: (s, level) => ({ biomass: D(260).mul(D(1.55).pow(level)) }),
                },
                unlockAlgaeBloom: {
                    title: "Chart the Bloom",
                    description: "Adds the Algae Bloom card to the draw pool. It boosts Green Essence while the pond is full of algae.",
                    hidden: () => !coreNodeBought("adaptation"),
                    cost: () => ({ biomass: D(1500) }),
                    onPurchase() { unlockCard("algaeBloom"); },
                },
                vigorousAlgae: {
                    title: "Vigorous Algae",
                    description: (s) => upgradeDescription(
                        `Each unit of algae counts for ${Math.round(100 * POTENCY_PER_LEVEL * getLevel(s, "vigorousAlgae"))}% more, for both Green Essence and Biomass.`,
                        nextStep(s, "vigorousAlgae", 10, "+10%")),
                    hidden: (s) => getLevel(s, "dormantSpores") === 0,
                    max: 10,
                    cost: (s, level) => ({ biomass: D(900).mul(D(1.45).pow(level)) }),
                },
            },
        },

        fish: {
            label: "Fish",
            color: "#4a90d9",
            hidden: () => !coreNodeBought("life"),
            upgrades: {
                spawningGrounds: {
                    title: "Spawning Grounds",
                    description: (s) => upgradeDescription(
                        `Fish breed ${100 * 0.25 * getLevel(s, "spawningGrounds")}% faster in rough water.`,
                        nextStep(s, "spawningGrounds", 10, "+25%")),
                    max: 10,
                    cost: (s, level) => ({ biomass: D(70).mul(D(1.3).pow(level)) }),
                },
                biggerSchools: {
                    title: "Bigger Schools",
                    description: (s) => upgradeDescription(
                        `Each fish boosts the pond's Blue Essence production by ${Math.round(100 * 0.15 * getLevel(s, "biggerSchools"))}%.`,
                        nextStep(s, "biggerSchools", 10, "+15%")),
                    max: 10,
                    cost: (s, level) => ({ biomass: D(60).mul(D(1.3).pow(level)) }),
                },
                richRoe: {
                    title: "Rich Roe",
                    description: (s) => upgradeDescription(
                        `Fish count for ${Math.round(100 * 0.15 * getLevel(s, "richRoe"))}% more than they are for Biomass production.`,
                        nextStep(s, "richRoe", 15, "+15%")),
                    max: 15,
                    cost: (s, level) => ({ biomass: D(130).mul(D(1.25).pow(level)) }),
                },
                hardyStock: {
                    title: "Hardy Stock",
                    description: (s) => upgradeDescription(
                        `Fish breed at their best in ${Math.round(100 * 0.1 * getLevel(s, "hardyStock"))}% calmer water than they used to need.`,
                        nextStep(s, "hardyStock", 3, "+10%")),
                    max: 3,
                    cost: (s, level) => ({ biomass: D(160).mul(D(1.4).pow(level)) }),
                },
                feedingFrenzy: {
                    title: "Feeding Frenzy",
                    description: (s) => upgradeDescription(
                        `Send the school wild, greatly increasing their growth for ${burstSeconds()} seconds or until stopped on a ${shownCooldown(s, "frenzy")} second cooldown.`,
                        nextStep(s, "feedingFrenzy", 6, "-3")),
                    max: 6,
                    cost: (s, level) => ({ biomass: D(260).mul(D(1.55).pow(level)) }),
                },
                primeStock: {
                    title: "Prime Stock",
                    description: (s) => upgradeDescription(
                        `Each fish counts for ${Math.round(100 * POTENCY_PER_LEVEL * getLevel(s, "primeStock"))}% more, for both Blue Essence and Biomass.`,
                        nextStep(s, "primeStock", 10, "+10%")),
                    hidden: (s) => getLevel(s, "feedingFrenzy") === 0,
                    max: 10,
                    cost: (s, level) => ({ biomass: D(900).mul(D(1.45).pow(level)) }),
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
        slackLeft: 0,
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
                s.turbulence = Math.max(s.turbulence, cardBonus("rainwater") * 100);
            }
        }

        s.slackLeft = Math.max(0, (s.slackLeft || 0) - dt);

        const band = bandOf(s);
        if (s.turbulenceBand === undefined) s.turbulenceBand = band;
        if (band !== s.turbulenceBand) {
            // Settling back to Calm starts the hold, stirring it back up ends it early
            if (band === 0 && coreNodeBought("pondSlack")) s.slackLeft = SLACK_SECONDS;
            else if (band > 0) s.slackLeft = 0;
            s.turbulenceBand = band;
            if (cardBonus("bandBoost") > 0) s.bandBoostLeft = BAND_BOOST_SECONDS;
        }

        if (coreNodeBought("life")) tickPond(s, dt, layer);
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
    setDisplay(row, owned);
    if (!owned) return;

    let state, text, fill;
    if (remaining > 0) {
        state = "running";
        text = `${remaining.toFixed(1)}s`;
        fill = remaining / burstSeconds();
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
    setWidth(row.querySelector(".timer-fill"), fill);
}

function updateBalance(host, s) {
    const living = s.algae + s.fish;
    const shown = coreNodeBought("life") && living > 0;
    setDisplay(host, shown);
    if (!shown) return;

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
    if (starving) fishTag.title = "Not enough algae, so the fish are starving.";
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
    const alive = coreNodeBought("life");
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

// Fades from the current opacity so it doesn't blink around whole numbers
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

// Algae are placed by index so they don't move when one fades, and each frond moves on its own
const FRONDS = [
    { sway: 17, bias: -7 },
    { sway: 14, bias: 2 },
    { sway: 11, bias: 9 },
];

const between = (low, high) => low + Math.random() * (high - low);

// The clump is centered on this spot, so the span leaves room for half of one at either end
const ALGAE_FROM = 13, ALGAE_SPAN = 74;
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
function swimKeyframes(index, leftward) {
    const n = (salt) => seededRandom(index, salt);
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
    const n = (salt) => seededRandom(index, salt);
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


    // 3 separate animations (move, turn, wiggle) so they don't fight for priority
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