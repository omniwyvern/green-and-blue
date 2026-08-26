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
import { BIOMASS_RESOURCE } from "./pondSublayer.js";
import { openBiome } from "./ecosystemSublayer.js";
import { growthGain, earnGrowth, CORE_GROWTH_PER_GROWTH } from "./grassSublayer.js";
import { getResource, onSpend, registerCostGroup } from "../../core/resources.js";
import { nodeBuyable } from "../../core/nodes.js";
import { boostResource } from "../../core/boosts.js";

// How much of the map has to be grown over before the world is ready to start again.
const EVOLUTION_TILES = 7;

// Green Core
// What a growth stage is worth on its own, indexed from stage 1.
const STAGE_PRODUCTION = [1, 2, 4, 8, 16, 64, 250, 500, 1000, 2500, 5000, 10000].map(D);

// The default cap is 7 I think. Cards can push past it, so past the end it
// keeps climbing at the rate the last step sets rather than flattening out.
const LAST_STAGE_STEP = STAGE_PRODUCTION[11].div(STAGE_PRODUCTION[10]);

function stageBase(stage) {
    const index = Math.max(1, Math.round(Number(stage))) - 1;
    const last = STAGE_PRODUCTION.length - 1;
    return index <= last ? STAGE_PRODUCTION[index]
        : STAGE_PRODUCTION[last].mul(LAST_STAGE_STEP.pow(index - last));
}

const GROWTH_BASE = D(50);   // growth needed to grow from stage 0
const GROWTH_SCALE = D(3); // multiplier for how much the next stage costs
const STAGE_CAP = D(4);   // the initial growth stage cap

// Blue Core
// Charge fills up over 5 seconds, double production + permanent bonus if clicked when full vs. otherwise
// Baseline gives 8 essence
const CHARGE_SECONDS = 5;   // Baseline time to fill the charge meter
const BLUE_BASE = D(4);     // Essence given for clicking with full charge before the 2x full charge bonus
const FULL_BONUS = D(2);    // Essence mult for full charge click

const CONSEC_SPEED_PER = 0.01; // For resonance unlock, give +1% speed per consecutive full-charge click.
const CONSEC_SPEED_CAP = 0.25; // The resonance unlock's speed cap. Requires 25 consec. clicks for it.
const CONSEC_MAXED_AT = CONSEC_SPEED_CAP / CONSEC_SPEED_PER;
const CONSEC_WINDOW_SECONDS = 3; // Time before consec. chain ending while sitting at full charge.


// Card things.
const cardCut = (key) => 1 / (1 + cardBonus(key)); // Cards that give minuses sometimes divided by 0 without this

const OVERGROWTH_CAP = 2; // Overgrowth card. Green prod. increases up to +200%, reset when you spend green
const overgrowthBonus = (s) => Math.min(OVERGROWTH_CAP, cardBonus("overgrowth") * (s.idleSeconds || 0));
onSpend((resourceId) => {
    if (resourceId === "greenEssence") getLayerState("cores").idleSeconds = 0;
});

// Feedback loop card. Blue core consecutive full-charge clicks increase green prod.
const feedbackBonus = (s) => cardBonus("feedbackLoop") * (Number(s.consecFullActivations) || 0); 

// I might have implemented this one wrong idk.
const PRESSURE_CAP = 2; // Pressure valve card. Full meter converts over-cap charge to green mult, spent when clicked.
const valveBonus = (s) => cardActive("controlledOverflow")  // Controlled Overflow makes it not spend, just checks it.
    ? Math.min(PRESSURE_CAP, cardBonus("pressureValve") * Math.max(0, s.charge - chargeCap()))
    : Math.min(PRESSURE_CAP, s.valveBonus || 0);


// How much charge the meter holds. Increased by a few cards and things.
const chargeCap = () => 1 + cardBonus("chargeCapacity");

const stageCost = (stage) => GROWTH_BASE.mul(GROWTH_SCALE.pow(stage - 1)); // Growth stage cost, so sacrifice can ask.
const growthNeeded = (s) => stageCost(s.growthStage).mul(cardCut("growthNeeded"));

// This makes sure the stage cap is always a whole number after boosts are applied.
function stageCap(s) {
    const bonus = cardBonus("stageCap");
    if (bonus <= 0) return Number(s.growthStageCap);
    return Number(s.growthStageCap) + Math.max(1, Math.round(Number(s.growthStageCap) * bonus));
}

// Grass sublayer can sacrifice green core growth stages for growth, these make sure the sacrifice
// gives proper points, reduces it to the right stage, and that you actually can sacrifice them.
export const canSacrificeStage = (s) => s.growthStage > 1;

export const sacrificeValue = (s) =>
    growthGain(stageCost(s.growthStage - 1).div(CORE_GROWTH_PER_GROWTH));

export function sacrificeStage() {
    const s = getLayerState("cores");
    if (!canSacrificeStage(s)) return false;

    earnGrowth(stageCost(s.growthStage - 1).div(CORE_GROWTH_PER_GROWTH));
    s.growthStage--;
    // Progress toward the next stage goes with the stage. Left banked, the tick below spends
    // it to buy the stage straight back on the same frame, so the sacrifice costs nothing and
    // can be repeated at the same price until the bank runs dry.
    s.growth = D(0);
    return true;
}


// boostResource() is for everything related to Green Essence: biomass, grass, the ocean.
// The card bonuses here are the core's own, so they stay the core's own and are summed first.
const greenProduction = (s) => stageBase(s.growthStage).mul(s.baseProductionMult)
    .mul(s.stageProdMult.mul(s.growthStage).add(1)).mul(boostResource("greenEssence"))
    .mul(1 + cardBonus("greenProduction") + overgrowthBonus(s) + feedbackBonus(s) + valveBonus(s));

    
const blueBase = (s) => BLUE_BASE.add(s.baseBonus);

function clickValue(s) {
    const value = blueBase(s).mul(s.charge).mul(1 + cardBonus("blueClick"));
    const full = isFullCharge(s)
        ? value.mul(D(s.fullChargeBonus).mul(1 + cardBonus("fullChargeBonus")))
            .add(D(s.consecFullActivations).mul(s.consecBonus))
        : value;
    return full.mul(boostResource("blueEssence"));
}

// Cards can increase charge cap so everything just uses this to see if charge is full.
const isFullCharge = (s) => s.charge >= chargeCap() - 1e-9;

const owned = (s, id) => !!s.purchasedUpgrades[id];

// Some upgrades gost both essences, so this shortens the text when they're the same amount.
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
        biomass: { ...BIOMASS_RESOURCE, from: "pond", hidden: (s) => !owned(s, "life") }, // Hidden until you have some.
        evolutionPoints: {name: "Evolution Points", from: "evolution", color: "#b06ad0", hidden: (s) => !owned(s, "evolution")}
    },

    initialState: {
        growth: D(0),                 // Progress toward the next growth stage.
        growthStage: 1,
        growthRateMult: D(1),
        growthStageCap: STAGE_CAP,
        
        baseProductionMult: D(1),
        stageProdMult: D(0),

        charge: 0,
        chargeTime: CHARGE_SECONDS,
        chargeRate: 0,
        baseBonus: 0,
        
        fullChargeBonus: FULL_BONUS, 
        startingFullCharge: 0,

        consecFullActivations: D(0),   // How many consecutive times the meter was spent completely full.
        consecCounter: D(0),
        consecBonus: D(0),
        consecSpeedBonus: 0,
        consecWindow: CONSEC_WINDOW_SECONDS,

        idleSeconds: 0,   // Time since Green was last spent, for the overgrowth card.
        valveBonus: 0,    // Green multiplier banked by a full meter, for the pressure valve card.
    },

    onTick(dt, layer) {
        const s = getLayerState(layer.id);

        s.resources.greenEssence = s.resources.greenEssence.add(greenProduction(s).mul(dt));

        s.idleSeconds = (s.idleSeconds || 0) + dt;

        // "while" rather than "if" so if dt is really big, it can go through several stages at once if needed.
        // Only adds growth if the growth stage isn't at its cap, otherwise sets it to 0
        s.growthStage < stageCap(s) ? s.growth = s.growth.add(s.growthRateMult.mul(1 + cardBonus("coreGrowth")).mul(dt)): s.growth = D(0);
        while (s.growth.gte(growthNeeded(s))) {
            s.growth = s.growth.sub(growthNeeded(s));
            s.growthStage++;
        }

        // Blue charge refills, and is modified by ripple charge.
        // Not consistent with the same logic as growth rate because I'm stupid (but don't want to break it).
        s.chargeRate = (1 / s.chargeTime)
            * (1 + Math.min(CONSEC_SPEED_CAP, s.consecSpeedBonus * Number(s.consecFullActivations)))
            * (1 + cardBonus("chargeRate"));
        s.charge = s.charge + s.chargeRate * dt;

        const cap = chargeCap();
        if (s.charge >= cap) {
            // Overflow card makes it keep filling up past the cap.
            const overflow = cardBonus("chargeOverflow");
            s.charge = overflow > 0 ? cap + (s.charge - cap) * overflow : cap;

            // Pressure valve card banks a what a full meter is still charging.
            // Skipped under Controlled Overflow, which reads the charge instead of banking it.
            if (cardBonus("pressureValve") > 0 && !cardActive("controlledOverflow")) {
                s.valveBonus = Math.min(PRESSURE_CAP,
                    (s.valveBonus || 0) + cardBonus("pressureValve") * chargeRate * dt);
            }

            s.consecCounter = Number(s.consecCounter) + dt;
            if (s.consecCounter > s.consecWindow) {
                s.consecFullActivations = 0
                s.consecCounter = 0;
            }
        }
       return s.charge
    },

    // If a major node is visible, prerequisites are met, and you can afford it, the cores tab flashes.
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
            description: "Grows on its own, increasing production as it advances stages.\n",
            meter: (s) => s.growth.div(growthNeeded(s)).toNumber(),
            value: (s) => s.growthStage < stageCap(s) ? `Stage ${s.growthStage}` : `Stage ${s.growthStage} [CAPPED]`,
            detail: (s) => `${formatNumber(greenProduction(s))} GE/s\n` + ``,
            tooltip: (s) => s.growthStage < stageCap(s) 
            ? `${formatNumber(greenProduction(s))} GE/s at stage ${s.growthStage}\n\n`
                + `${formatNumber((growthNeeded(s).sub(s.growth)).div(s.growthRateMult.mul(1 + cardBonus("coreGrowth"))))}s until next stage` 
            : `${formatNumber(greenProduction(s))} GE/s at stage ${s.growthStage}\n\n`
                + `Cannot grow more [CAPPED] `
            // Changed display to core growth for clarity, because grass layer has "growth" now.
        },
        greenGrow: {
            kind: "unlock",
            parent: "greenCore",
            title: "Quick Growth",
            color: "#22b47c",
            position: { x: -400, y: -100 },
            description: "Increases the Green Core's growth speed by 25%.",
            cost: () => ({ greenEssence: D(100) }),
            onPurchase(s) { s.growthRateMult = s.growthRateMult.add(.25); },
        },
        greenGrower: {
            kind: "unlock",
            parent: "greenGrow",
            title: "Quicker Growth",
            color: "#22b47c",
            position: { x: -525, y: -175 },
            description: "Adds 25% to the growth speed multiplier.",
            cost: () => ({ greenEssence: D(150) }),
            onPurchase(s) { s.growthRateMult = s.growthRateMult.add(.25); },
        },
        greenGrowest: {
            kind: "unlock",
            parent: "greenGrower",
            title: "Quickest Growth",
            color: "#22b47c",
            position: { x: -675, y: -225 },
            description: "Adds 50% to the growth speed multiplier.",
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
            onPurchase(s) { s.growthRateMult = s.growthRateMult.mul(2); },
        },


        blueCore: {
            kind: "core",
            title: "Blue Core",
            color: "#2f92ee",
            position: { x: 200, y: 0 },
            description: "Charges on its own. Click to spend the meter for Blue Essence.",
            meter: (s) => Math.min(1, s.charge / chargeCap()),
            value: (s) => `${Math.floor(s.charge * 100)}%`,
            detail: (s) => `+${formatNumber(clickValue(s))} BE`,
            // Combo counter, it isn't shown until you have an unlock that needs it.
            badge: (s) => {
                if (!(s.consecSpeedBonus > 0 || Number(s.consecBonus) > 0)) return null;
                const combo = Number(s.consecFullActivations) || 0;
                if (combo < 1) return null;
                
                const part = isFullCharge(s) ? 1 - (Number(s.consecCounter) || 0) / window : 1;
                return { text: `${combo}`, full: combo >= CONSEC_MAXED_AT, part };
            },
            tooltip: (s) => `+${formatNumber(D(blueBase(s)).mul(s.fullChargeBonus).mul(1 + cardBonus("fullChargeBonus")))} BE at 100% charge\n\n`
                + `+${formatNumber(s.chargeRate * 100)}% charge/s`,

                //.mul(D(s.fullChargeBonus).mul(1 + cardBonus("fullChargeBonus")))

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
            description: "Increases the Blue Core's charge speed by 10%.",
            cost: () => ({ blueEssence: D(50) }),
            onPurchase(s) { s.chargeTime = 4.545; },
        },
        blueQuicker: {
            kind: "unlock",
            parent: "blueQuick",
            title: "Quicker Current",
            color: "#2f92ee",
            position: { x: 525, y: 0 },
            description: "Adds 15% to the charge speed multiplier.",
            cost: () => ({ blueEssence: D(100) }),
            onPurchase(s) { s.chargeTime = 4; },
        },
        blueQuickest: {
            kind: "unlock",
            parent: "blueQuicker",
            title: "Quickest Current",
            color: "#2f92ee",
            position: { x: 650, y: 0 },
            description: "Adds 25% more to the charge speed multiplier.",
            cost: () => ({ blueEssence: D(500) }),
            onPurchase(s) { s.chargeTime = 3.333; },
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
        blueDeep: {
            kind: "unlock",
            parent: "blueCore",
            title: "Deep Waters",
            color: "#2f92ee",
            position: { x: 400, y: -125 },
            description: "Increases base click production from 4 to 6.",
            cost: () => ({ blueEssence: D(100) }),
            onPurchase(s) { s.baseBonus = 2; },
        },
        blueDeeper: {
            kind: "unlock",
            parent: "blueDeep",
            title: "Deeper Waters",
            color: "#2f92ee",
            position: { x: 525, y: -125 },
            description: "Increases base click production from 6 to 8.",
            cost: () => ({ blueEssence: D(200) }),
            onPurchase(s) { s.baseBonus = 4; },
        },
        blueDeepest: {
            kind: "unlock",
            parent: "blueDeeper",
            title: "Deepest Waters",
            color: "#2f92ee",
            position: { x: 650, y: -125 },
            description: "Increases base click production from 8 to 16.",
            cost: () => ({ blueEssence: D(100000) }),
            onPurchase(s) { s.baseBonus = 12; },
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
            description: "Each consecutive full-charge click within 3 seconds of hitting full charge adds +.5 production to the next ones.",
            hidden: (s) => !owned(s, "blueResonance"),
            cost: () => ({ blueEssence: D(1250) }),
            onPurchase(s) { s.consecBonus = D(.5); },
        },       
        blueTides: {
            kind: "unlock",
            parents: ["blueResonance", "blueReservoir", "blueRipples"],
            title: "Tides",
            color: "#2f92ee",
            position: { x: 525, y: 350 },
            description: "The Blue Core loses its consecutive full-charge click combo after 8 seconds instead of 3.",
            hidden: (s) => !owned(s, "blueResonance"),
            cost: () => ({ blueEssence: D("1e6") }),
            onPurchase(s) { s.consecWindow = 8; },
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
            cost: () => ({ greenEssence: D(3e5), blueEssence: D(3e5), biomass: D(1500) }),
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
            description: "Green and Blue combine for the first time. Something has started growing...\n\n"
                        + "Increases the Green Core's stage cap by 1.",
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
            cost: () => ({ greenEssence: D(1e6), blueEssence: D(1e6), biomass: D(10000) }),
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
            cost: () => ({ greenEssence: D(2e6), biomass: D(10000) }),
            onPurchase() { getLayerState("grass").unlocked = true; },
        },
        /*
        grassyCore: {
            kind: "unlock",
            parent: "grass",
            title: "Grassy Core",
            color: "#22b47c",
            position: {x: 300, y: 450},
            description: "Grass begins to sprout on the Green Core, each growing the other.",
            cost: () => ({ greenEssence: D(1e9)}),
            onPurchase() {  },
        },
        smthn: {
            increase core growth based on blue core combo
        }
       
        */
       

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
            cost: () => ({ blueEssence: D(3e6) }),
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
            hint: () => "Cover the world in green, and soak it with blue...",
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
            prereq: (s) => owned(s, "evolution"),  // Make it need like X number of cards or smthn
            hint: () => `The world must hold on to the rewards of multiple evolutions...`,
            cost: () => ({ greenEssence: D(1e8), blueEssence: D(1e8), evolutionPoints: D(25) }), // Also make this cost evolution points later
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
            cost: () => ({ greenEssence: D(1e20) }),
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
            cost: () => ({ blueEssence: D(1e10) }),
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
            cost: () => ({ greenEssence: D(1e20), blueEssence: D(1e20) }),
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
            cost: () => ({ blueEssence: D(1e20) }),
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
            cost: () => ({ greenEssence: D(1e20), blueEssence: D(1e20) }),
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
            cost: () => ({ greenEssence: D(1e20) }),
            onPurchase() {
                getLayerState("fungi").unlocked = true;
                openBiome("biomeFungi");
            },
        },
    },
});
