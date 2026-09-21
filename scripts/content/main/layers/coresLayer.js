// coresLayer.js
//
// The Green Core, the Blue Core, and the tree growing out of them

import { registerLayer } from "../../../core/registry.js";
import { getLayerState, unlockLayer, layerUnlocked } from "../../../core/state.js";
import { D } from "../../../utils/decimal.js";
import { formatNumber } from "../../../utils/format.js";
import {
    claimedTiles, matureTiles, worldState, countOf,
    AQUATIC_KINDS, WOODLAND_KINDS, WETLANDS_KINDS, REEF_KINDS, ICE_KINDS, FUNGUS_KINDS,
} from "../systems/worldMap.js";
import { cardBonus, cardActive, unlockCard } from "../systems/cards.js";
import { traitBonus, TRAIT_IDS, traitDef, traitOwned, ownedCount, capOf, PAST_CAP } from "../systems/evolutionTraits.js";
import { openBiome } from "../sublayers/ecosystemSublayer.js";
import { vitalityGain, earnVitality, CORE_GROWTH_PER_VITALITY } from "../sublayers/grassSublayer.js";
import { addResource, onSpend, registerCostGroup, getLevel } from "../../../core/resources.js";
import { nodeBuyable } from "../../../core/nodes.js";
import { boostResource } from "../../../core/boosts.js";
import { challengeDone } from "../systems/challenges.js";
import { cardCut } from "./adaptationLayer.js";
import { layers } from "../../../core/registry.js";


// Green Core: what each growth stage is worth before modifiers, from stage 1
const STAGE_PRODUCTION = [1, 2, 4, 8, 16, 64, 250, 500, 1000, 2500, 5000, 10000].map(D);

// Growth stage cap is calculated at the end, so that if it's modified too much it still works
const LAST_STAGE_STEP = STAGE_PRODUCTION[11].div(STAGE_PRODUCTION[10]);

function stageBase(stage) {
    const index = Math.max(1, Math.round(Number(stage))) - 1;
    const last = STAGE_PRODUCTION.length - 1;
    return index <= last ? STAGE_PRODUCTION[index]
        : STAGE_PRODUCTION[last].mul(LAST_STAGE_STEP.pow(index - last));
}

const GROWTH_BASE = D(50);   // Growth needed to grow from stage 0
const GROWTH_SCALE = D(3); // Multiplier for how much the next stage costs
const STAGE_CAP = D(4);   // The starting growth stage cap

// Blue Core
const CHARGE_SECONDS = 5;   // Baseline time to fill the charge meter
const BLUE_BASE = D(4);     // Essence given for clicking with full charge before the 2x full charge bonus
const FULL_BONUS = D(2);    // Essence mult for full charge click

const CONSEC_SPEED_PER = 0.01; // For resonance unlock, give +1% speed per consecutive full-charge click
const CONSEC_SPEED_CAP = 0.25; // Makes sure it doesn't go over +25% speed
const CONSEC_MAXED_AT = CONSEC_SPEED_CAP / CONSEC_SPEED_PER; // Number of consec clicks to hit cap
const CONSEC_WINDOW_SECONDS = 3; // Time before consec. chain ending while sitting at full charge
const COMBO_GROWTH_PER = 0.05; // Grassy Core, green growth speed per consecutive full-charge click
const COMBO_GROWTH_CAP = 1;    // Grassy Core can't push green growth past +100%


// Card things

const OVERGROWTH_CAP = 2; // Overgrowth card. Green prod. increases up to +200%, reset when you spend green
const overgrowthBonus = (s) => Math.min(OVERGROWTH_CAP, cardBonus("overgrowth") * (s.idleSeconds || 0));
onSpend((resourceId) => {
    if (resourceId === "greenEssence") getLayerState("cores").idleSeconds = 0;
});

// The consecutive full-charge count, which a save can be holding as a Decimal
const comboCount = (s) => Number(s.consecFullActivations) || 0;

// Whether the combo is worth showing at all, since nothing unlocks it until one of these is bought.
const comboMatters = (s) => s.consecSpeedBonus > 0 || Number(s.consecBonus) > 0
    || s.comboGrowthBonus > 0;

// How long before the combo breaks, only advancing while at 100% charge
const comboLeft = (s) => {
    if (!comboMatters(s) || comboCount(s) < 1) return 0;
    if (!isFullCharge(s)) return 1;
    const seconds = Number(s.consecWindow) || CONSEC_WINDOW_SECONDS;
    return Math.max(0, 1 - (Number(s.consecCounter) || 0) / seconds);
};

// Grassy Core. Blue's consecutive full-charge combo speeds up the Green Core's growth
const comboGrowth = (s) => Math.min(COMBO_GROWTH_CAP,
    (s.comboGrowthBonus || 0) * comboCount(s));

// Feedback loop card. Blue core consecutive full-charge clicks increase green prod
const feedbackBonus = (s) => cardBonus("feedbackLoop") * comboCount(s);

// I might have implemented this one wrong idk.
const PRESSURE_CAP = 2; // Pressure valve card. Full meter converts over-cap charge to green mult, spent when clicked
const valveBonus = (s) => cardActive("controlledOverflow")  // Controlled Overflow makes it not spend, just checks it
    ? Math.min(PRESSURE_CAP, cardBonus("pressureValve") * Math.max(0, s.charge - chargeCap()))
    : Math.min(PRESSURE_CAP, s.valveBonus || 0);


// How much charge the meter holds. Increased by a few cards and things
const chargeCap = () => 1 + cardBonus("chargeCapacity");

const stageCost = (stage) => GROWTH_BASE.mul(GROWTH_SCALE.pow(stage - 1)); // Growth stage cost, so sacrifice can ask
const growthNeeded = (s) => stageCost(s.growthStage).mul(cardCut("growthNeeded"));

// This makes sure the stage cap is always a whole number after boosts are applied
function stageCap(s) {
    const bonus = cardBonus("stageCap");
    if (bonus <= 0) return Number(s.growthStageCap);
    return Number(s.growthStageCap) + Math.max(1, Math.round(Number(s.growthStageCap) * bonus));
}

// How fast the Green Core's meter fills. Rotation, from the Fallow challenge, doubles it
const coreGrowthRate = (s) =>
    s.growthRateMult.mul(1 + cardBonus("coreGrowth")).mul(challengeDone("fallow") ? 2 : 1).mul(1 + traitBonus("growth"))
        .mul(1 + comboGrowth(s));

// Pricing and checks for grass sacrificing Green Core growth stages
export const canSacrificeStage = (s) => s.growthStage > 1;

// Each sacrifice in quick succession is worth less, so regrowing and sacrificing late can't run away
const FATIGUE_SECONDS = 120;
export const sacrificeFatigue = (s) => s.sacrificeFatigue || 0;
const sacrificeRaw = (s) => stageCost(s.growthStage - 1).div(CORE_GROWTH_PER_VITALITY).div(1 + sacrificeFatigue(s));

export const sacrificeValue = (s) => vitalityGain(sacrificeRaw(s));

export function sacrificeStage() {
    const s = getLayerState("cores");
    if (!canSacrificeStage(s)) return false;

    earnVitality(sacrificeRaw(s));
    s.sacrificeFatigue = sacrificeFatigue(s) + 1;
    s.growthStage--;
    s.growth = D(0);
    return true;
}

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

// Cards can increase charge cap so everything just uses this to see if charge is full
const isFullCharge = (s) => s.charge >= chargeCap() - 1e-9;

const owned = (s, id) => !!s.purchasedUpgrades[id];

const BIOME_NODES = ["ocean", "forest"];

// The node kinds that open something new, which keep the cores tab lit while one can be bought
const ATTENTION_KINDS = new Set(["major", "layer", "sublayer"]);

// How many biomes have been opened, which is what the later nodes gate on
const biomesOwned = (s) => BIOME_NODES.filter(id => owned(s, id)).length;

// Each biome shows ??? until the one before it in BIOME_NODES is owned
const afterPreviousBiome = (id) => (s) => {
    const index = BIOME_NODES.indexOf(id);
    return index <= 0 || owned(s, BIOME_NODES[index - 1]);
};
const BIOME_HINT = () => "Open the previous biome first...";

// Share of every upgrade level in one sub-layer that has been bought
function upgradeShare(layerId, subKey) {
    const sub = layers[layerId]?.subLayers?.[subKey];
    if (!sub) return 1;
    const s = getLayerState(sub.stateKey);
    let have = 0, total = 0;
    for (const [id, def] of Object.entries(sub.upgrades || {})) {
        const max = def.max || 1;
        total += max;
        have += Math.min(max, getLevel(s, id));
    }
    return total ? have / total : 1;
}

const share = (name, layerId, subKey, need) => ({
    text: `${Math.round(need * 100)}% of the ${name} upgrades bought`,
    met: () => upgradeShare(layerId, subKey) >= need - 1e-9,
});

const TILE_FAMILIES = [
    ["water", AQUATIC_KINDS], ["woodland", WOODLAND_KINDS], ["wetland", WETLANDS_KINDS],
    ["reef", REEF_KINDS], ["ice", ICE_KINDS], ["fungus", FUNGUS_KINDS],
];

// What the Evolution node waits for
const EVOLUTION_NEEDS = [
    { text: "Beat Ice Age", met: () => challengeDone("iceAge") },
    ...TILE_FAMILIES.map(([name, kinds]) => ({
        text: `A ${name} tile on the map`,
        met: () => countOf(kinds, worldState()) > 0,
    })),
    share("Pond", "aquatic", "pond", 0.75),
    { text: "5 old growth trees", met: () => (getLayerState("woodland").oldGrowth || []).length >= 5 },
    share("Marsh", "wetlands", "marsh", 0.6),
    share("Ice Field", "ice", "iceField", 0.6),
    { text: "3 species settled on the reef at once", met: () => !!getLayerState("reef").reefUnlocks?.kelp },
    share("Reef", "reef", "reef", 0.4),
    { text: "20 mushrooms fruited in the grove", met: () => (getLayerState("fungi").groveFruited || 0) >= 20 },
];

const LATE_CHALLENGES = ["deepFreeze", "redTide", "blight", "stagnation", "saltFlats", "overgrowth"];

const kindOwned = (kind) => TRAIT_IDS.filter(id => traitDef(id).kind === kind && traitOwned(id)).length;

const levelOf = (layerId, id) => getLevel(getLayerState(layerId), id);

const deepestRegion = () => Math.max(0, ...Object.values(getLayerState("aquatic").oceanRegions || {})
    .map(region => Number(region.upgrades?.deepen) || 0));

const pastCap = (text, id, have, over) => ({
    text: `${text} ${over} levels past its old cap`,
    met: () => have() >= PAST_CAP[id].cap + over && capOf(id) > PAST_CAP[id].cap,
});

// What the Humanity node waits for
const HUMANITY_NEEDS = [
    { text: "110 traits evolved", met: () => ownedCount() >= 110 },
    { text: "2 capstone traits", met: () => kindOwned("capstone") >= 2 },
    { text: "Deep Freeze, Red Tide, Blight, Stagnation, Salt Flats and Choked Out survived", met: () => LATE_CHALLENGES.every(challengeDone) },
    pastCap("Deepen in one ocean region", "deepen", deepestRegion, 10),
    pastCap("Richer Waters", "richerWaters", () => levelOf("pond", "richerWaters"), 10),
    pastCap("Varied Life", "keystone", () => levelOf("wetlands", "keystone"), 8),
    pastCap("Greener Blades", "greenerBlades", () => levelOf("grass", "greenerBlades"), 6),
    { text: "1e18 peak Vitality", met: () => D(getLayerState("grass").vitalityPeak || 0).gte(1e18) },
];

const missingHint = (lead, needs) => `${lead} Still missing:\n`
    + needs.filter(need => !need.met()).map(need => `- ${need.text}`).join("\n");

// Shortens cost text when both essences cost the same amount
registerCostGroup({
    ids: ["greenEssence", "blueEssence"],
    name: "G&B Essence",
    short: "G&B",
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
        greenEssence: {},
        blueEssence: {},
        biomass: { hidden: (s) => !owned(s, "life") }, // Hidden until you have some
        adaptationPoints: { hidden: (s) => !owned(s, "adaptation") },
    },

    initialState: {
        growth: D(0),                 // Progress toward the next growth stage
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

        consecFullActivations: D(0),   // How many consecutive times the meter was spent completely full
        consecCounter: D(0),
        consecBonus: D(0),
        consecSpeedBonus: 0,
        consecWindow: CONSEC_WINDOW_SECONDS,
        comboGrowthBonus: 0,           // Green growth per consecutive click, for the Grassy Core

        sacrificeFatigue: 0,
        idleSeconds: 0,   // Time since Green was last spent, for the overgrowth card
        valveBonus: 0,    // Green multiplier banked by a full meter, for the pressure valve card
    },

    onTick(dt, layer) {
        const s = getLayerState(layer.id);

        // Through the shared pool, so rate tracking sees it like every other producer
        addResource("greenEssence", greenProduction(s).mul(dt));

        s.idleSeconds = (s.idleSeconds || 0) + dt;
        if (s.sacrificeFatigue) s.sacrificeFatigue = s.sacrificeFatigue < 0.01 ? 0 : s.sacrificeFatigue * Math.exp(-dt / FATIGUE_SECONDS);

        // "while" so a big dt can go through several stages at once
        s.growth = s.growthStage < stageCap(s) ? s.growth.add(coreGrowthRate(s).mul(dt)) : D(0);
        while (s.growth.gte(growthNeeded(s))) {
            s.growth = s.growth.sub(growthNeeded(s));
            s.growthStage++;
        }

        // Not built the same way as growth rate, but changing it would break balance
        s.chargeRate = (1 / s.chargeTime)
            * (1 + Math.min(CONSEC_SPEED_CAP, s.consecSpeedBonus * comboCount(s)))
            * (1 + cardBonus("chargeRate"));
        const cap = chargeCap();
        const before = s.charge;
        s.charge = s.charge + s.chargeRate * dt;

        if (s.charge >= cap) {
            // Overflow card makes it keep filling up past the cap.
            const overflow = cardBonus("chargeOverflow");
            s.charge = overflow > 0 ? Math.max(cap, before) + (s.charge - Math.max(cap, before)) * overflow : cap;

            // Pressure valve banks what a full meter is still charging, unless Controlled Overflow reads it instead
            if (cardBonus("pressureValve") > 0 && !cardActive("controlledOverflow")) {
                s.valveBonus = Math.min(PRESSURE_CAP,
                    (s.valveBonus || 0) + cardBonus("pressureValve") * s.chargeRate * dt);
            }

            s.consecCounter = Number(s.consecCounter) + dt;
            if (s.consecCounter > s.consecWindow) {
                s.consecFullActivations = 0;
                s.consecCounter = 0;
            }
        }
    },

    // The cores tab stays lit while a node that opens something can be bought
    stickyAttention: true,
    attention: (s, layer) => Object.keys(layer.nodes)
        .filter(id => ATTENTION_KINDS.has(layer.nodes[id].kind) && nodeBuyable(layer, id, s)),

    // Positions are relative to the middle of the canvas
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
            detail: (s) => `${formatNumber(greenProduction(s))} GE/s\n`,
            tooltip: (s) => (s.growthStage < stageCap(s)
            ? `${formatNumber(greenProduction(s))} GE/s at stage ${s.growthStage}\n\n`
                + `${formatNumber((growthNeeded(s).sub(s.growth)).div(coreGrowthRate(s)))}s until next stage`
            : `${formatNumber(greenProduction(s))} GE/s at stage ${s.growthStage}\n\n`
                + `Cannot grow more [CAPPED] `)
            + (comboGrowth(s) > 0
                ? `\n\n+${formatNumber(comboGrowth(s) * 100)}% growth speed from the Blue Core's combo`
                    + `${comboGrowth(s) >= COMBO_GROWTH_CAP ? " [MAX]" : ""}`
                : ``)
            // Changed display to core growth for clarity, because grass layer has "growth" now
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
            description: "Increases Green Essence production by 40%.",
            cost: () => ({ greenEssence: D(80) }),
            onPurchase(s) { s.baseProductionMult = s.baseProductionMult.mul(1.4); },
        },
        greenRoots: {
            kind: "unlock",
            parent: "greenGrow",
            title: "Spreading Roots",
            color: "#22b47c",
            position: { x: -600, y: -75 },
            description: "Increases Green Essence production by 10% per growth stage.",
            cost: () => ({ greenEssence: D(200) }),
            onPurchase(s) { s.stageProdMult = s.stageProdMult.add(.1); },
        },
        greenCanopy: {
            kind: "unlock",
            parent: "greenSoil",
            title: "Treetops",
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

        // Hidden until World is bought so they don't give away the branch toward Life
        greenBloom: {
            kind: "unlock",
            parent: "greenCanopy",
            title: "Bloom",
            color: "#22b47c",
            position: { x: -800, y: 125 },
            description: "Increases Green Essence production by another 40%.",
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
            // How long the combo has left, as the core's own color draining off the top
            combo: comboLeft,
            // Combo counter, it isn't shown until you have an unlock that needs it
            badge: (s) => {
                if (!comboMatters(s)) return null;
                const combo = comboCount(s);
                if (combo < 1) return null;
                return { text: `${combo}`, full: combo >= CONSEC_MAXED_AT };
            },
            tooltip: (s) => `+${formatNumber(D(blueBase(s)).mul(s.fullChargeBonus).mul(1 + cardBonus("fullChargeBonus")))} BE at 100% charge\n\n`
                + `+${formatNumber(s.chargeRate * 100)}% charge/s`,
            onClick(s) {
                addResource("blueEssence", clickValue(s));
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
                s.consecSpeedBonus = 0.01;
                unlockCard("feedbackLoop"); // This card relies on consecutive clicks, so you should need at least one consecutive click unlock
            },
        },
        blueRipples: {
            kind: "unlock",
            parents: ["blueResonance", "blueReservoir", "blueOverloaded"],
            title: "Ripples",
            color: "#2f92ee",
            position: { x: 525, y: 250 },
            description: "Each full-charge click within 3 seconds of filling adds +0.5 to the next click.",
            hidden: (s) => !owned(s, "blueResonance"),
            cost: () => ({ blueEssence: D(1250) }),
            onPurchase(s) { s.consecBonus = D(.5); },
        },
        blueTides: {
            kind: "unlock",
            parents: ["blueResonance", "blueReservoir", "blueRipples"],
            title: "Tides",
            color: "#2f92ee",
            position: { x: 525, y: 370 },
            description: "The Blue Core's click combo lasts 8 seconds instead of 3.",
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
            position: { x: 220, y: 400 },
            description: "Water gathers in the low ground.\n",
            cost: () => ({ greenEssence: D(10000), blueEssence: D(10000) }),
            onPurchase() { unlockLayer("pond"); },
        },

        // A few pond upgrades live here so the tree has more nodes
        pondDeep: {
            kind: "unlock",
            parent: "pond",
            title: "Deeper Basin",
            color: "#2f92ee",
            position: { x: 380, y: 500 },
            description: "Digs the pond out. Room for more fish or algae.",
            hidden: (s) => !owned(s, "life"),
            cost: () => ({ greenEssence: D(5e5), blueEssence: D(7.5e5) }),
        },
        pondChoppy: {
            kind: "unlock",
            parent: "pondDeep",
            title: "Choppier Waves",
            color: "#2f92ee",
            position: { x: 380, y: 630 },
            description: "Turbulence drains away about 25% slower.",
            cost: () => ({ blueEssence: D(1e6) }),
        },
        pondGrowth: {
            kind: "unlock",
            parent: "pondDeep",
            title: "Growth Room",
            color: "#0ae8ce",
            position: { x: 540, y: 500 },
            description: "Raises the Green Core's stage cap by 1.",
            cost: () => ({ greenEssence: D(5e5) }),
            onPurchase(s) { s.growthStageCap = D(s.growthStageCap).add(1); },
        },
        pondSymbiosis: {
            kind: "unlock",
            parent: "pondGrowth",
            title: "Symbiosis",
            color: "#0ae8ce",
            position: { x: 700, y: 500 },
            description: "The pond produces more the closer its algae and fish are in number,"
                + " up to 2.5x as much when they're even.",
            hidden: (s) => !owned(s, "life"),
            cost: () => ({ greenEssence: D(2e6), blueEssence: D(2e6), biomass: D(2500) }),
        },
        pondClear: {
            kind: "unlock",
            parent: "pondSymbiosis",
            title: "Clear Shallows",
            color: "#0ae8ce",
            position: { x: 860, y: 500 },
            description: "Pond algae gives 5x as much Green Essence.",
            hidden: (s) => !owned(s, "life"),
            cost: () => ({ greenEssence: D(5e8), biomass: D(2e6) }),
        },

        pondSlack: {
            kind: "unlock",
            parent: "pondClear",
            title: "Dead Calm",
            color: "#0ae8ce",
            position: { x: 1010, y: 430 },
            description: "When the pond settles back to Calm, the water goes still for 10 seconds."
                + " Nothing in the pond grows or eats during that time.",
            hidden: (s) => !owned(s, "life"),
            cost: () => ({ greenEssence: D(2e9), biomass: D(8e6) }),
        },
        pondShoals: {
            kind: "unlock",
            parent: "pondClear",
            title: "Shoals",
            color: "#2f92ee",
            position: { x: 1010, y: 570 },
            description: "Fish are worth 10x as much to pond output.",
            prereq: (s) => owned(s, "environment"),
            hint: () => "Buy Environment first...",
            cost: () => ({ blueEssence: D(1e10), biomass: D(4e7) }),
        },
        pondWatershed: {
            kind: "unlock",
            parent: "pondClear",
            title: "Watershed",
            color: "#2f92ee",
            position: { x: 860, y: 640 },
            description: "Each pond tile on the map makes the pond worth 60% more, up to six tiles.",
            prereq: (s) => owned(s, "ocean"),
            hint: () => "Buy Ocean first...",
            cost: () => ({ greenEssence: D(1e15), blueEssence: D(1e15), biomass: D(1e7) }),
        },

        //  Center of the tree. Entries go in order of unlock
        world: {
            kind: "major",
            parents: ["greenCore", "blueCore"],
            title: "World",
            split: true,
            aura: "life",
            position: { x: 0, y: 200 },
            description: "Green and Blue combine for the first time. Something has started growing...\n\n"
                        + "Increases the Green Core's stage cap by 1.",
            cost: () => ({ greenEssence: D(100), blueEssence: D(100) }),
            onPurchase(s) {
                unlockLayer("world");
                s.growthStageCap = D(s.growthStageCap).add(1);
            },
        },

        life: {
            kind: "major",
            parents: ["pond"],
            title: "Life",
            aura: "life",
            split: true,
            position: { x: 0, y: 520 },
            description: "Green and blue together. What new wonders can come of this?\n",
            cost: () => ({ greenEssence: D(5e4), blueEssence: D(2e5) }),
        },

        land: {
            kind: "layer",
            parents: ["world"],
            title: "Land",
            color: "#22b47c",
            aura: "green",
            position: { x: -220, y: 380 },
            description: "Ground for things to grow on. The world is expanding...\n",
            prereq: (s) => owned(s, "life"),
            cost: () => ({ greenEssence: D(1e7), blueEssence: D(1e7), biomass: D(2e4) }),
        },

        grass: {
            kind: "sublayer",
            parents: ["land", "life"],
            title: "Grass",
            color: "#22b47c",
            aura: "green",
            position: { x: -220, y: 700 },
            description: "Green things can take root. Sow the first life on land.\n",
            hint: () => "There isn't enough space in the world...",
            prereq: (s) => owned(s, "land") && claimedTiles(getLayerState("world")).length > 2,
            cost: () => ({ greenEssence: D(3e7), biomass: D(25000) }),
            onPurchase() { unlockLayer("grass"); },
        },
        grassyCore: {
            kind: "unlock",
            parent: "grass",
            title: "Grassy Core",
            color: "#22b47c",
            position: { x: -420, y: 620 },
            description: "Each full-charge click in a row on the Blue Core speeds up the Green Core"
                + " by 5%, up to +100%.",
            cost: () => ({ greenEssence: D(1e9) }),
            onPurchase(s) { s.comboGrowthBonus = COMBO_GROWTH_PER; },
        },
        wildMeadows: {
            kind: "unlock",
            parent: "grass",
            title: "Wild Meadows",
            color: "#22b47c",
            position: { x: -420, y: 780 },
            description: "Spreading grass pays 4% more Vitality for each mature grass tile, up to +40%.",
            cost: () => ({ greenEssence: D(1e11), vitality: D(2000) }),
        },
        grassCreepingStems: {
            kind: "unlock",
            parent: "wildMeadows",
            title: "Creeping Stems",
            color: "#22b47c",
            position: { x: -600, y: 820 },
            description: "Grass grows 20% faster on tiles already touching mature grass.",
            cost: () => ({ greenEssence: D(5e12), vitality: D(1.5e4) }),
        },
        grassSodLayer: {
            kind: "unlock",
            parent: "grassyCore",
            title: "Sod Layer",
            color: "#22b47c",
            position: { x: -600, y: 580 },
            description: "Grass tiles are worth 20% more.",
            cost: () => ({ greenEssence: D(2e12), vitality: D(8000) }),
        },


        rain: {
            kind: "sublayer",
            parent: "pond",
            title: "Precipitation",
            color: "#2f92ee",
            aura: "blue",
            position: { x: 220, y: 700 },
            description: "Control the weather.\n",
            hint: () => "More life must flourish...",
            prereq: (s) => owned(s, "grass") && matureTiles(getLayerState("world")).length > 6,
            cost: () => ({ blueEssence: D(3e6) }),
            onPurchase() { unlockLayer("precipitation"); },
        },
        rainSoak: {
            kind: "unlock",
            parent: "rain",
            title: "Soaking Rain",
            color: "#2f92ee",
            position: { x: 400, y: 770 },
            description: "Adds Soaking Rain to the precipitation upgrades, letting the middle intensity fill ground past 90%.",
            prereq: (s) => owned(s, "environment"),
            hint: () => "The rain has to reach deeper ground first...",
            cost: () => ({ blueEssence: D(8e10) }),
        },
        rainHeld: {
            kind: "unlock",
            parent: "rain",
            title: "Held Storm",
            color: "#2f92ee",
            position: { x: 360, y: 880 },
            description: "The cloud keeps its charge through adaptation. Every adaptation starts with a full cloud.",
            hidden: (s) => !owned(s, "adaptation"),
            prereq: (s) => owned(s, "adaptation"),
            cost: () => ({ blueEssence: D(3e10), adaptationPoints: D(120) }),
        },
        rainRisingAir: {
            kind: "unlock",
            parent: "rainSoak",
            title: "Rising Air",
            color: "#2f92ee",
            position: { x: 570, y: 770 },
            description: "The cloud charges 35% faster while it is under half full.",
            cost: () => ({ blueEssence: D(1.5e13) }),
        },

        adaptation: {
            kind: "major",
            parents: ["grass", "life", "rain"],
            title: "Adaptation",
            split: true,
            aura: "life",
            position: { x: 0, y: 860 },
            description: "Everything that grew can grow again, better.\n",
            prereq: (s) => owned(s, "life") && owned(s, "rain") && matureTiles(getLayerState("world")).length >= 7,
            hint: () => "Cover the world in green, and soak it with blue...",
            cost: () => ({ greenEssence: D(1e10), blueEssence: D(2e10) }),
            onPurchase(s) {
                unlockLayer("adaptation");
                s.growthStageCap = D(s.growthStageCap).add(1);
            },
        },
        adaptPressedLeaves: {
            kind: "unlock",
            parent: "adaptation",
            title: "Pressed Leaves",
            color: "#08c3aa",
            position: { x: -220, y: 920 },
            description: "Adapting gives 2% more Adaptation Points for each mature grass tile, up to +30%.",
            cost: () => ({ greenEssence: D(3e10), adaptationPoints: D(200) }),
        },
        adaptHoardedSeeds: {
            kind: "unlock",
            parent: "adaptPressedLeaves",
            title: "Hoarded Seeds",
            color: "#08c3aa",
            position: { x: -400, y: 960 },
            description: "Drawing cards costs 10% less Adaptation Points.",
            cost: () => ({ greenEssence: D(3e11), adaptationPoints: D(300) }),
        },

        environment: {
            kind: "major",
            parent: "adaptation",
            title: "Environment",
            split: true,
            aura: "life",
            position: { x: 0, y: 1080 },
            description: "Rain soaks into the land, and tiles can be transformed into new terrain.",
            prereq: (s) => owned(s, "adaptation"),  // Make it need like X number of cards or smthn
            hint: () => `Adapt a few more times first...`,
            cost: () => ({ greenEssence: D(2e10), blueEssence: D(5e10), adaptationPoints: D(300) }),
            onPurchase() { unlockLayer("environment"); },
        },

        envStanding: {
            kind: "unlock",
            parent: "environment",
            title: "Standing Ground",
            color: "#08c3aa",
            position: { x: 220, y: 1160 },
            description: "Ponds on the map are deep enough to last. They stay through adaptation.",
            cost: () => ({ greenEssence: D(3e11), blueEssence: D(3e11) }),
        },
        envGroundwater: {
            kind: "unlock",
            parent: "environment",
            title: "Groundwater",
            color: "#08c3aa",
            position: { x: 220, y: 1030 },
            description: "Ground more than half soaked dries 25% slower.",
            cost: () => ({ blueEssence: D(3e12) }),
        },
        envTopsoil: {
            kind: "unlock",
            parent: "envStanding",
            title: "Topsoil",
            color: "#08c3aa",
            position: { x: 400, y: 1160 },
            description: "Every tile on the map produces 5% more for each kind of terrain on the map, up to +40%.",
            cost: () => ({ greenEssence: D(5e13), blueEssence: D(5e13) }),
        },

        ocean: {
            kind: "layer",
            parent: "environment",
            title: "Ocean",
            color: "#3f9ad4",
            aura: "blue",
            position: { x: 180, y: 1320 },
            description: "Open water past the pond, where schools of fish ride the currents.\n",
            cost: () => ({ greenEssence: D(1e11), blueEssence: D(2.5e11) }),
            onPurchase() {
                unlockLayer("aquatic"); // Absorbs pond into the aquatic layer
                openBiome("biomeAquatic", "pond", "ocean");
            },
        },
        oceanWarmCurrents: {
            kind: "unlock",
            parent: "ocean",
            title: "Warm Currents",
            color: "#3f9ad4",
            position: { x: 370, y: 1320 },
            description: "The ocean ticks 8% faster.",
            cost: () => ({ blueEssence: D(2e13), biomass: D(1e7) }),
        },
        oceanRichShallows: {
            kind: "unlock",
            parent: "oceanWarmCurrents",
            title: "Rich Shallows",
            color: "#3f9ad4",
            position: { x: 540, y: 1320 },
            description: "Every school in the ocean produces 25% more.",
            cost: () => ({ blueEssence: D(3e14), biomass: D(5e7) }),
        },


        // !!! TEMPORARY NODE, for testing the terrains' layers/sublayers !!!
        forest: {
            kind: "layer",
            parent: "environment",
            title: "Forest",
            color: "#3d9455",
            aura: "green",
            position: { x: -180, y: 1320 },
            description: "Trees take root and grow into a forest.\n",
            prereq: afterPreviousBiome("forest"),
            hint: BIOME_HINT,
            cost: () => ({ greenEssence: D(1e15) }),
            onPurchase() {
                unlockLayer("woodland");
                openBiome("biomeWoodlands", "forest");
            },
        },
        forestSeedfall: {
            kind: "unlock",
            parent: "forest",
            title: "Seedfall",
            color: "#3d9455",
            position: { x: -370, y: 1320 },
            description: "Trees grow 35% faster until they are halfway grown.",
            cost: () => ({ greenEssence: D(3e19) }),
        },
        forestGrowthRings: {
            kind: "unlock",
            parent: "forestSeedfall",
            title: "Growth Rings",
            color: "#3d9455",
            position: { x: -540, y: 1320 },
            description: "Old growth is worth 5% more for each old-growth tree, up to +50%.",
            cost: () => ({ greenEssence: D(1e22), biomass: D(1e9) }),
        },

        challenges: {
            kind: "layer",
            parents: ["forest", "ocean"],
            title: "Ecology",
            color: "#00eba8",
            aura: "life",
            position: { x: 0, y: 1560 },
            description: "Challenges: give things up on purpose, reach the goal anyway, and keep a reward.\n",
            prereq: (s) => biomesOwned(s) >= 2,
            hint: () => "Open two biomes first...",
            cost: () => ({ greenEssence: D(1e22), blueEssence: D(1e20) }),
            onPurchase() { unlockLayer("challenges"); },
        },
        ecoBogMat: {
            kind: "unlock",
            parent: "challenges",
            title: "Bog Mat",
            color: "#00eba8",
            position: { x: -200, y: 1660 },
            description: "The marsh's plants produce 30% more.",
            prereq: (s) => owned(s, "challenges") && layerUnlocked("wetlands"),
            hint: () => "The wetlands have to be opened first...",
            cost: () => ({ greenEssence: D(3e29), blueEssence: D(3e26) }),
        },
        ecoFrostHeave: {
            kind: "unlock",
            parent: "challenges",
            title: "Frost Heave",
            color: "#00eba8",
            position: { x: 200, y: 1660 },
            description: "Everything the ice field yields is 30% more.",
            prereq: (s) => owned(s, "challenges") && layerUnlocked("ice"),
            hint: () => "The ice has to be opened first...",
            cost: () => ({ greenEssence: D(1e31), blueEssence: D(3e29) }),
        },

        evolution: {
            kind: "layer",
            parent: "challenges",
            title: "Evolution",
            color: "#7fd06a",
            aura: "life",
            position: { x: 0, y: 1800 },
            description: "Adaptation Points come in on their own. Spend them on traits that respond"
                + " to the world's pressures.",
            prereq: (s) => owned(s, "challenges") && EVOLUTION_NEEDS.every(need => need.met()),
            hint: () => missingHint("Not ready yet.", EVOLUTION_NEEDS),
            cost: () => ({ greenEssence: D(1e26), blueEssence: D(1e26), adaptationPoints: D(500) }),
            onPurchase() { unlockLayer("evolution"); },
        },

        humanity: {
            kind: "layer",
            parent: "evolution",
            title: "Humanity",
            color: "#d9a066",
            aura: "life",
            position: { x: 0, y: 2050 },
            description: "Something in the world has started to change it on purpose.",
            prereq: (s) => owned(s, "evolution") && HUMANITY_NEEDS.every(need => need.met()),
            hint: () => missingHint("The world has not evolved far enough yet.", HUMANITY_NEEDS),
            cost: () => ({ greenEssence: D(1e62), blueEssence: D(1e65), adaptationPoints: D(2e5) }),
        },
    },
});
