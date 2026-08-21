// coreLayer.js

// This layer is for the green core and blue core nodes, which serve as the primary element and starting point of the game.
// Green is passive growth that advances through growth stages that generate progressively more green essence
// Blue is active growth, a charge meter fills up over time. If you click when fully charged, it gives more blue essence + a permanent bonus
// Upgrade trees branch outwards, but converge for combination unlocks like Life.

import { registerLayer } from "../../core/registry.js";
import { getLayerState } from "../../core/state.js";
import { D } from "../../utils/decimal.js";
import { formatNumber } from "../../utils/format.js";
import { claimedTiles, matureTiles } from "./worldMap.js";
import { cardBonus, cardActive, unlockCard } from "./cards.js";
import { biomassMultiplier, BIOMASS_RESOURCE } from "./pondSublayer.js";
import { openBiome } from "./ecosystemSublayer.js";
import { getResource, onSpend, registerCostGroup } from "../../core/resources.js";
import { nodeBuyable } from "../../core/nodes.js";

// How much of the map has to be grown over before the world is ready to start again.
const EVOLUTION_TILES = 7;

// Green Core
// Growth stages gives (late start by 1) fibonacci sequence: 1/s, 2/s, 3, 5, 8, 13, 21, 34, 55, 89, 144...
const GREEN_START = D(1);
const GROWTH_BASE = D(50);   // growth needed to grow from stage 0
const GROWTH_SCALE = D(3); // multiplier for how much the next stage costs
const STAGE_CAP = D(4);   // the initial growth stage cap

// Blue Core
// Charge fills up over 5 seconds, double production + permanent bonus if clicked when full vs. otherwise
// Baseline gives 8 essence
const CHARGE_SECONDS = 5;   // Baseline time to fill the charge meter
const BLUE_BASE = D(4);     // Essence given for clicking with full charge before the 2x full charge bonus
const FULL_BONUS = D(2);    // Essence mult for full charge click


// For the Resonance unlock. Consecutive full-charge clicks are counted, and give +1% speed to a cap of 25%.
const CONSEC_SPEED_PER = 0.01;
const CONSEC_SPEED_CAP = 0.25;
const CONSEC_MAXED_AT = CONSEC_SPEED_CAP / CONSEC_SPEED_PER;

// How long the meter can sit full before the consecutive chain is over.
const CONSEC_WINDOW_SECONDS = 3.25;


// This is here because some of the cards that give minuses cause lots of problems (dividing by zero) without it
const cardCut = (key) => 1 / (1 + cardBonus(key));

// Overgrowth card. Green production increases when left alone, reset when you spend green.
const OVERGROWTH_CAP = 2;                 // +200% cap so it doesn't get out of hand
const overgrowthBonus = (s) => Math.min(OVERGROWTH_CAP, cardBonus("overgrowth") * (s.idleSeconds || 0));

// Feedback loop card. Blue core's consecutive full-charge clicks increase green core production.
const feedbackBonus = (s) => cardBonus("feedbackLoop") * (Number(s.consecFullActivations) || 0);

// Pressure valve card. Full meter converts over-cap charge to a green multiplier, spent when clicked
// Controlled Overflow changes what the valve is just reading it
const PRESSURE_CAP = 2;
const valveBonus = (s) => cardActive("controlledOverflow")
    ? Math.min(PRESSURE_CAP, cardBonus("pressureValve") * Math.max(0, s.charge - chargeCap()))
    : Math.min(PRESSURE_CAP, s.valveBonus || 0);

// How much charge the meter holds. Increased by a few cards and things.
const chargeCap = () => 1 + cardBonus("chargeCapacity");

const growthNeeded = (s) => GROWTH_BASE.mul(GROWTH_SCALE.pow((s.growthStage-1))).mul(cardCut("growthNeeded"));

// Some stuff increases the growth stage cap by a percentage, this makes sure it rounds properly since no half growth stage
function stageCap(s) {
    const bonus = cardBonus("stageCap");
    if (bonus <= 0) return Number(s.growthStageCap);
    return Number(s.growthStageCap) + Math.max(1, Math.round(Number(s.growthStageCap) * bonus));
}

// For the overgrowth card, there's a thing above about it.
onSpend((resourceId) => {
    if (resourceId === "greenEssence") getLayerState("cores").idleSeconds = 0;
});

// Biomass multiplier applies to essence wherever it's produced, and card mult is summed up before being counted
const greenProduction = (s) => s.greenProdCurr.mul(s.baseProductionMult)
    .mul(s.stageProdMult.mul(s.growthStage).add(1)).mul(biomassMultiplier())
    .mul(1 + cardBonus("greenProduction") + overgrowthBonus(s) + feedbackBonus(s) + valveBonus(s));

const blueBase = (s) => BLUE_BASE.add(s.baseBonus);

function clickValue(s) {
    const value = blueBase(s).mul(s.charge).mul(1 + cardBonus("blueClick"));
    if (isFullCharge(s)) {
        return value.mul(D(s.fullChargeBonus).mul(1 + cardBonus("fullChargeBonus")))
            .add(D(s.consecFullActivations).mul(s.consecBonus));
    }
    return value
}

// Cards can increase charge cap so everything just uses this to see if charge is full
const isFullCharge = (s) => s.charge >= chargeCap() - 1e-9;

const owned = (s, id) => !!s.purchasedUpgrades[id];

// Some upgrades gost both essences, so this shortens it when they're the same amount
registerCostGroup({
    ids: ["greenEssence", "blueEssence"],
    name: "G&B Essence",
    color: "#429ca7",
});

registerLayer("cores", {
    categoryId: "main",
    group: "origin",
    name: "Cores",
    color: "#08c3aa",
    canvasType: "drag",
    order: 0,

    resources: {
        greenEssence: { name: "Green Essence", color: "#3aa876" },
        blueEssence: { name: "Blue Essence", color: "#4a90d9" },
        biomass: { ...BIOMASS_RESOURCE, from: "pond", hidden: (s) => !owned(s, "life") }, // Hidden until you have some
    },

    initialState: {
        growth: D(0),                 // Progress toward the next growth stage
        growthStage: 1,
        growthRateMult: D(1),
        growthStageCap: STAGE_CAP,
        
        baseProductionMult: D(1),
        greenProdPrev: GREEN_START,   // For the green production math
        greenProdCurr: GREEN_START,
        stageProdMult: D(0),

        charge: 0,
        chargeTime: CHARGE_SECONDS,
        baseBonus: 0,
        
        fullChargeBonus: FULL_BONUS, 
        startingFullCharge: 0,

        consecFullActivations: D(0),   // How many consecutive times the meter was spent completely full
        consecCounter: D(0),
        consecBonus: D(0),
        consecSpeedBonus: 0,

        idleSeconds: 0,   // Time since Green was last spent, for the overgrowth card
        valveBonus: 0,    // Green multiplier banked by a full meter, for the pressure valve card
    },

    onTick(dt, layer) {
        const s = getLayerState(layer.id);

        // Gives green essence before advancing stages, so the tick's time is credited at the rate during it.
        s.resources.greenEssence = s.resources.greenEssence.add(greenProduction(s).mul(dt));

        // For overgrowth card. Counts idle time whether or not the card is equipped.
        s.idleSeconds = (s.idleSeconds || 0) + dt;

        // "while" rather than "if" so if dt is really big, it can go through several stages at once if needed
        // Only adds growth if the growth stage isn't at its cap, otherwise sets it to 0 (multiply by 0 instead of other thing because of previous errors).
        s.growthStage < stageCap(s) ? s.growth = s.growth.add(s.growthRateMult.mul(1 + cardBonus("coreGrowth")).mul(dt)) : s.growth = D(0);
        while (s.growth.gte(growthNeeded(s))) {
            s.growth = s.growth.sub(growthNeeded(s));
            s.growthStage++;
            [s.greenProdPrev, s.greenProdCurr] = [s.greenProdCurr, s.greenProdCurr.add(s.greenProdPrev)];
        }

        // Blue charge refills, and is modified by ripple charge
        // Not the same logic as growth rate because I'm stupid (but don't want to break it)
        const chargeRate = (1 / s.chargeTime)
            * (1 + Math.min(CONSEC_SPEED_CAP, s.consecSpeedBonus * Number(s.consecFullActivations)))
            * (1 + cardBonus("chargeRate"));
        s.charge = s.charge + chargeRate * dt;

        const cap = chargeCap();
        if (s.charge >= cap) {
            // Overflow card makes it keep filling up past the cap
            const overflow = cardBonus("chargeOverflow");
            s.charge = overflow > 0 ? cap + (s.charge - cap) * overflow : cap;

            // Pressure valve card banks a what a full meter is still charging.
            // Skipped under Controlled Overflow, which reads the charge instead of banking it
            if (cardBonus("pressureValve") > 0 && !cardActive("controlledOverflow")) {
                s.valveBonus = Math.min(PRESSURE_CAP,
                    (s.valveBonus || 0) + cardBonus("pressureValve") * chargeRate * dt);
            }

            s.consecCounter = Number(s.consecCounter) + dt;
            if (s.consecCounter > CONSEC_WINDOW_SECONDS) {
                s.consecFullActivations = 0
                s.consecCounter = 0;
            }
        }
       return s.charge
    },

    // If a major node is visible, prerequisites are met, and you can afford it, the cores tab flashes
    attention: (s, layer) => Object.keys(layer.nodes)
        .filter(id => layer.nodes[id].kind === "major" && nodeBuyable(layer, id, s)),

    // Positions are based on (0, 0) where that's the middle of the canvas.
    // Starting view is a little bit lower to account for the world node text box.
    nodes: {
        // GREEN
        greenCore: {
            kind: "core",
            title: "Green Core",
            color: "#22b47c",
            position: { x: -200, y: 0 },
            description: "Grows on its own. Filling the growth meter advances a stage, and each stage raises Green Essence production.",
            meter: (s) => s.growth.div(growthNeeded(s)).toNumber(),
            value: (s) => s.growthStage < stageCap(s) ? `Stage ${s.growthStage}` : `Stage ${s.growthStage} [CAPPED]`,
            detail: (s) => `${formatNumber(greenProduction(s))}/s\n` + ``,
            tooltip: (s) => `Grows on its own. Filling the growth meter advances a stage.\n`
                + `Producing ${formatNumber(greenProduction(s))} Green Essence/s at stage ${s.growthStage}.\n`
                + `Next stage: ${formatNumber(s.growth)} / ${formatNumber(growthNeeded(s))} growth.`,
        },
        greenGrow: {
            kind: "unlock",
            parent: "greenCore",
            title: "Quick Growth",
            color: "#22b47c",
            position: { x: -400, y: -100 },
            description: "Increases growth speed by +25%.",
            cost: () => ({ greenEssence: D(100) }),
            onPurchase(s) { s.growthRateMult = s.growthRateMult.add(.25); },
        },
        greenGrower: {
            kind: "unlock",
            parent: "greenGrow",
            title: "Quicker Growth",
            color: "#22b47c",
            position: { x: -525, y: -175 },
            description: "Increases growth speed multiplier by another +25%.",
            cost: () => ({ greenEssence: D(150) }),
            onPurchase(s) { s.growthRateMult = s.growthRateMult.add(.25); },
        },
        greenGrowest: {
            kind: "unlock",
            parent: "greenGrower",
            title: "Quickest Growth",
            color: "#22b47c",
            position: { x: -675, y: -225 },
            description: "Increases growth speed multiplier by +50%.",
            cost: () => ({ greenEssence: D(250) }),
            onPurchase(s) { s.growthRateMult = s.growthRateMult.add(.5); },
        },
        greenSoil: {
            kind: "unlock",
            parent: "greenCore",
            title: "Richer Soil",
            color: "#22b47c",
            position: { x: -400, y: 100 },
            description: "Increases green essence production by 40%.",
            cost: () => ({ greenEssence: D(80) }),
            onPurchase(s) { s.baseProductionMult = s.baseProductionMult.mul(1.4); },
        },
        greenRoots: {
            kind: "unlock",
            parent: "greenGrow",
            title: "Spreading Roots",
            color: "#22b47c",
            position: { x: -600, y: -75 },
            description: "Increases green production by 10% per growth stage.",
            cost: () => ({ greenEssence: D(200) }),
            onPurchase(s) { s.stageProdMult = s.stageProdMult.add(.1); },
        },
        greenCanopy: {
            kind: "unlock",
            parent: "greenSoil",
            title: "Canopy",
            color: "#22b47c",
            position: { x: -550, y: 50 },
            description: "Increases Green Essence production by another 40%.",
            cost: () => ({ greenEssence: D(400) }),
            onPurchase(s) { s.baseProductionMult = s.baseProductionMult.mul(1.4); },
        },
        greenMoss: {
            kind: "unlock",
            parent: "greenCanopy",
            title: "Mossbed",
            color: "#22b47c",
            position: { x: -750, y: 0 },
            description: "Doubles growth generation.",
            cost: () => ({ greenEssence: D(1200) }),
            onPurchase(s) { s.growthRateMult = s.growthRateMult.mul(2); },
        },

        // Revealed only once the Pond is running - these are the start of the branch that
        // grows toward Life, and showing them early would give away that there's more.
        greenBloom: {
            kind: "unlock",
            parent: "greenCanopy",
            title: "Bloom",
            color: "#22b47c",
            position: { x: -800, y: 125 },
            description: "Increases green essence production by another 40%.",
            hidden: (s) => !owned(s, "world"),
            cost: () => ({ greenEssence: D(3000) }),
            onPurchase(s) { s.baseProductionMult = s.baseProductionMult.mul(1.4); },
        },
        greenThicket: {
            kind: "unlock",
            parent: "greenSoil",
            title: "Thicket",
            color: "#22b47c",
            position: { x: -650, y: 200 },
            description: "Doubles growth generation.",
            hidden: (s) => !owned(s, "world"),
            cost: () => ({ greenEssence: D(8000) }),
            onPurchase(s) { s.growthRateMult = s.growthRateMult.mul(3); },
        },



        // ---------------- Blue: branches right and down ----------------
        blueCore: {
            kind: "core",
            title: "Blue Core",
            color: "#2f92ee",
            position: { x: 200, y: 0 },
            description: "Charges on its own. Click to spend the meter for Blue Essence.",
            meter: (s) => Math.min(1, s.charge / chargeCap()),
            value: (s) => `${Math.floor(s.charge * 100)}%`,
            detail: (s) => `+${formatNumber(clickValue(s))}`,
            // Combo counter, it isn't shown until you have an unlock that needs it.
            badge: (s) => {
                if (!(s.consecSpeedBonus > 0 || Number(s.consecBonus) > 0)) return null;
                const combo = Number(s.consecFullActivations) || 0;
                return combo < 1 ? null : { text: `${combo}`, full: combo >= CONSEC_MAXED_AT };
            },
            tooltip: (s) => `Click to spend the meter for Blue Essence - the fuller it is, the more you get,\n`
                + `and a completely full meter pays double.\n`
                + `Activating now: +${formatNumber(clickValue(s))} Blue Essence.\n`,
                //+ `Consecutive full activations: ${s.consecFullActivations} (+${formatNumber(s.consecFullActivations.mul(CONSEC_CLICK_BONUS))} to base payout).`,
            onClick(s) {
                s.resources.blueEssence = s.resources.blueEssence.add(clickValue(s));
                const full = isFullCharge(s);
                if (!full) {  // If charge isn't full, reset consecutive clicks + their timer, and charge
                    s.consecFullActivations = 0;
                    s.consecCounter = 0;
                    s.charge = 0;
                } else {
                    s.consecFullActivations++;  // For the resonance upgrade
                    s.charge = s.startingFullCharge; // For the reservoir upgrade
                    s.consecCounter = 0;  // Resets the window for it to be counted as a consecutive click
                }
                // Clicks remove all the pressure valve card's bonus
                s.valveBonus = 0;
            },
        },
        blueQuick: {
            kind: "unlock",
            parent: "blueCore",
            title: "Quick Current",
            color: "#2f92ee",
            position: { x: 400, y: 0 },
            description: "Increases the blue core's charge speed by +10%.",
            cost: () => ({ blueEssence: D(50) }),
            onPurchase(s) { s.chargeTime = 4.5; },
        },
        blueQuicker: {
            kind: "unlock",
            parent: "blueQuick",
            title: "Quicker Current",
            color: "#2f92ee",
            position: { x: 525, y: 0 },
            description: "Adds 15% more charge speed to the blue core.",
            cost: () => ({ blueEssence: D(100) }),
            onPurchase(s) { s.chargeTime = 4; },
        },
        blueQuickest: {
            kind: "unlock",
            parent: "blueQuicker",
            title: "Quickest Current",
            color: "#2f92ee",
            position: { x: 650, y: 0 },
            description: "Adds 25% more charge speed to the blue core.",
            cost: () => ({ blueEssence: D(500) }),
            onPurchase(s) { s.chargeTime = 3; },
        },
        blueOverflow: {
            kind: "unlock",
            parent: "blueCore",
            title: "Overflowing Current",
            color: "#2f92ee",
            position: { x: 400, y: 125 },
            description: "Increases the full-charge bonus from 2x to 3x.",
            cost: () => ({ blueEssence: D(150) }),
            onPurchase(s) { s.fullChargeBonus = s.fullChargeBonus.add(1); },
        },
        blueOverloaded: {
            kind: "unlock",
            parent: "blueOverflow",
            title: "Overloaded Current",
            color: "#2f92ee",
            position: { x: 525, y: 125 },
            description: "Increases the full-charge bonus from 3x to 4x.",
            cost: () => ({ blueEssence: D(250) }),
            onPurchase(s) { s.fullChargeBonus = s.fullChargeBonus.add(1); },
        },
        blueDeeper: {
            kind: "unlock",
            parent: "blueCore",
            title: "Deeper Waters",
            color: "#2f92ee",
            position: { x: 400, y: -125 },
            description: "Increases base click production from 4 to 6.",
            cost: () => ({ blueEssence: D(100) }),
            onPurchase(s) { s.baseBonus = 2; },
        },
        blueDeepest: {
            kind: "unlock",
            parent: "blueDeeper",
            title: "Deepest Waters",
            color: "#2f92ee",
            position: { x: 525, y: -125 },
            description: "Increases base click production from 6 to 8.",
            cost: () => ({ blueEssence: D(200) }),
            onPurchase(s) { s.baseBonus = 4; },
        },
        blueReservoir: {
            kind: "unlock",
            parent: "blueOverflow",
            title: "Reservoir",
            color: "#2f92ee",
            position: { x: 400, y: 250 },
            description: "Retain 25% charge after a full-charge click.",
            cost: () => ({ blueEssence: D(500) }),
            onPurchase(s) { s.startingFullCharge = .25; },
        },
        blueResonance: {
            kind: "unlock",
            parents: ["blueOverloaded", "blueQuickest"],
            title: "Resonance",
            color: "#2f92ee",
            position: { x: 650, y: 250 },
            description: "Consecutive full-charge clicks increase charge speed by 1%, maxing out at 25%.",
            hidden: (s) => !owned(s, "blueQuickest"),
            cost: () => ({ blueEssence: D(750) }),
            onPurchase(s) { 
                s.consecSpeedBonus = CONSEC_SPEED_PER;
                unlockCard("feedbackLoop"); // This card relies on consecutive clicks, so you should need at least one consecutive click unlock
            },
        },
        blueRipples: {
            kind: "unlock",
            parents: ["blueResonance", "blueReservoir", "blueOverloaded"],
            title: "Ripples",
            color: "#2f92ee",
            position: { x: 525, y: 250 },
            description: "Each consecutive full-charge click within a few seconds of hitting full charge adds +.5 production to the next ones.",
            hidden: (s) => !owned(s, "blueResonance"),
            cost: () => ({ blueEssence: D(1250) }),
            onPurchase(s) { s.consecBonus = D(.5); },
        },       

        pond: {
            kind: "layer",
            parents: ["world", "blueReservoir"],
            title: "Pond",
            color: "#2f92ee",
            aura: "blue",
            position: { x: 200, y: 250 },
            description: "Water gathers in the low ground.\n",
            cost: () => ({ greenEssence: D(2000), blueEssence: D(2000) }),
            onPurchase() { getLayerState("pond").unlocked = true; },
        },

        // There's a few pond upgrades here instead of the pond tab because I felt like the tree should have more nodes
        pondDeep: {
            kind: "unlock",
            parent: "pond",
            title: "Deeper Basin",
            color: "#2f92ee",
            position: { x: 300, y: 350 },
            description: "Digs the pond out. Room for more fish or algae.",
            hidden: (s) => !owned(s, "life"),
            cost: () => ({ greenEssence: D(15000), blueEssence: D(15000) }),
        },
        pondChoppy: {
            kind: "unlock",
            parent: "pondDeep",
            title: "Choppier Waves",
            color: "#2f92ee",
            position: { x: 400, y: 350},
            description: "Turbulence drains away about a quarter slower.",
            cost: () => ({ blueEssence: D(30000) }),
        },
        pondGrowth: {
            kind: "unlock",
            parent: "pondDeep",
            title: "Growth Room",
            color: "#0ae8ce",
            position: { x: 300, y: 450 },
            description: "Raises the Green Core's stage cap by 1.",
            cost: () => ({ greenEssence: D(30000) }),
            onPurchase(s) { s.growthStageCap = D(s.growthStageCap).add(1); },
        },
        pondSymbiosis: {
            kind: "unlock",
            parent: "pondGrowth",
            title: "Symbiosis",
            color: "#0ae8ce",
            position: { x: 400, y: 525 },
            description: "The pond produces more the closer its algae and fish are in number,"
                + " up to two and a half times as much when they're even.",
            hidden: (s) => !owned(s, "life"),
            // Gated behind Life, so it's paid for in what a living pond makes.
            cost: () => ({ greenEssence: D(3e5), blueEssence: D(3e5), biomass: D(3000) }),
        },



        //  GREEN AND BLUE 
        //  Center of the tree. Entries go in order of unlock
        world: {
            kind: "major",
            parents: ["greenCore", "blueCore"],
            title: "World",
            split: true,
            aura: "life",
            position: { x: 0, y: 150 },
            description: "Green and blue combine for the first time. Something has started growing...\n",
            cost: () => ({ greenEssence: D(100), blueEssence: D(100) }),
            onPurchase(s) {
                getLayerState("world").unlocked = true;
                s.growthStageCap = D(s.growthStageCap).add(1);
            },
        },

        life: {
            kind: "major",
            parents: ["pond"],
            title: "Life",
            aura: "life",
            split: true,
            position: { x: 0, y: 375 },
            description: "Green and blue together. What new wonders can come of this?\n",
            cost: () => ({ greenEssence: D(10000), blueEssence: D(10000) }),
            onPurchase(s) {
                s.growthStageCap = D(s.growthStageCap.add(1));
            },
        },

        land: {
            kind: "layer",
            parents: ["world"],
            title: "Land",
            color: "#22b47c",
            aura: "green",
            position: { x: -200, y: 250 },
            description: "Ground for things to grow on. The world is expanding...\n",
            prereq: (s) => owned(s, "life"),
            cost: () => ({ greenEssence: D(5e6), blueEssence: D(5e6), biomass: D(10000) }),
        },

        grass: {
            kind: "sublayer",
            parents: ["land", "life"],
            title: "Grass",
            color: "#22b47c",
            aura: "green",
            position: { x: -200, y: 500 },
            description: "Green things can take root. Sow the first life on land.\n",
            hint: () => "There isn't enough space in the world...",
            prereq: (s) => owned(s, "land") && claimedTiles(getLayerState("world")).length > 2,
            cost: () => ({ greenEssence: D(1.5e6), biomass: D(10000) }),
            onPurchase() { getLayerState("grass").unlocked = true; },
        },

        rain: {
            kind: "sublayer",
            parent: "pond",
            title: "Rain",
            color: "#2f92ee",
            aura: "blue",
            position: { x: 200, y: 500 },
            description: "Weather worth clicking at.\n",
            hint: () => "More life must flourish...",
            prereq: (s) => owned(s, "grass") && matureTiles(getLayerState("world")).length > 2,
            cost: () => ({ blueEssence: D(1.5e6) }),
            onPurchase() { getLayerState("precipitation").unlocked = true; },
        },

        evolution: {
            kind: "layer",
            parents: ["grass", "life", "rain"],
            title: "Evolution",
            split: true,
            aura: "life",
            position: { x: 0, y: 600 },
            description: "Everything that grew can grow again, better.\n",
            prereq: (s) => owned(s, "life") && owned(s, "rain") && matureTiles(getLayerState("world")).length >= EVOLUTION_TILES,
            hint: () => "Cover the world in green...",
            cost: () => ({ greenEssence: D(1e7), blueEssence: D(1e7) }),
            onPurchase() { getLayerState("evolution").unlocked = true; },
        },

        environment: {
            kind: "layer",
            parents: ["grass", "rain"],
            title: "Environment",
            split: true,
            aura: "life",
            position: { x: 0, y: 750},
            description: "Green and blue stop taking turns on the land. Rain soaks into it, and what's"
                + " grown on it can be traded up for something larger.\n",
            prereq: (s) => owned(s, "grass") && owned(s, "rain"),  // Make it need like X number of cards or smthn
            hint: () => `The rain has to land somewhere...`,
            cost: () => ({ greenEssence: D(3e7), blueEssence: D(3e7)}), // Also make this cost evolution points later
            onPurchase() { getLayerState("environment").unlocked = true},
        },

        // !!! TEMPORARY NODES !!!
        // don't worry about these right now, they're for testing the terrains' layers/sublayers
        forest: {
            kind: "layer",
            parent: "environment",
            title: "Forest",
            color: "#3d9455",
            aura: "green",
            position: { x: -500, y: 1100 },
            description: "give a good description here\n",
            cost: () => ({ greenEssence: D(1e8) }),
            onPurchase() {
                getLayerState("forest").unlocked = true;
                openBiome("biomeForest");
            },
        },

        ocean: {
            kind: "layer",
            parent: "environment",
            title: "Ocean",
            color: "#3f9ad4",
            aura: "blue",
            position: { x: -300, y: 1100 },
            description: "give a good description here\n",
            cost: () => ({ blueEssence: D(1.5e8) }),
            onPurchase() {
                getLayerState("aquatic").unlocked = true;
                // Pond gets absorbed. This biome is the only one that starts with two (pond, ocean) on unlock
                openBiome("biomeAquatic", "pond", "ocean");
            },
        },

        marsh: {
            kind: "layer",
            parent: "environment",
            title: "Marsh",
            color: "#6f9e63",
            aura: "green",
            position: { x: -100, y: 1100 },
            description: "give a good description here\n",
            cost: () => ({ greenEssence: D(2e8), blueEssence: D(2e8) }),
            onPurchase() {
                getLayerState("wetlands").unlocked = true;
                openBiome("biomeWetlands");
            },
        },

        iceField: {
            kind: "layer",
            parent: "environment",
            title: "Ice Field",
            color: "#7fc4e2",
            aura: "blue",
            position: { x: 100, y: 1100 },
            description: "give a good description here\n",
            cost: () => ({ blueEssence: D(3e8) }),
            onPurchase() {
                getLayerState("ice").unlocked = true;
                openBiome("biomeIce");
            },
        },

        reef: {
            kind: "layer",
            parent: "environment",
            title: "Reef",
            color: "#37b3c6",
            aura: "blue",
            position: { x: 300, y: 1100 },
            description: "give a good description here \n",
            cost: () => ({ greenEssence: D(4e8), blueEssence: D(4e8) }),
            onPurchase() {
                getLayerState("reef").unlocked = true;
                openBiome("biomeReef");
            },
        },

        mushroomGrove: {
            kind: "layer",
            parent: "environment",
            title: "Mushroom Grove",
            color: "#a06bc0",
            aura: "green",
            position: { x: 500, y: 1100 },
            description: "give a good description here \n",
            cost: () => ({ greenEssence: D(6e8) }),
            onPurchase() {
                getLayerState("fungi").unlocked = true;
                openBiome("biomeFungi");
            },
        },
    },
});
