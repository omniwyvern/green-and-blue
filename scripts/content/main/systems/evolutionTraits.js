// evolutionTraits.js
//
// Every Evolution trait, one tree per pressure

import { getLayerState } from "../../../core/state.js";
import { registerBoost } from "../../../core/boosts.js";
import { formatNumber } from "../../../utils/format.js";

export const evolutionState = () => getLayerState("evolution");
export const evolutionOpen = () => !!evolutionState().unlocked;


//    !!! THE TREES !!!

// Ocean is tier 2, so tidal potential is cheaper and its costs are higher
const COST_SCALE = { tidal: 3 };

// Later generations ask for far more than meter room grows, so the top of a tree takes focus
const GENERATION_SCALE = [1, 1.5, 3, 5, 8];

// Adaptation points per second each point of drift pours into every felt meter
export const DRIFT_PER_SECOND = 1;
const driftText = (v) => { const n = +(v * DRIFT_PER_SECOND).toFixed(2); return `${n} Adaptation Point${n === 1 ? "" : "s"} a second`; };

// Fields: x lane, requires, kind (capstone/apex), mods, scaled, effect; a generation opens at "needs"
export const TREES = {
    tidal: {
        name: "Tidal Traits",
        branches: [
            { name: "Open Sea", x: 1 },
            { name: "Shoreline", x: 4.5 },
            { name: "Drifters", x: 8 },
        ],
        generations: [
            {
                needs: 0,
                traits: {
                    gills: {
                        title: "Gills", x: 1,
                        text: "No more holding your breath.",
                        mods: { oceanOutput: 2 },
                        cost: { tidal: 50 },
                    },
                    streamlined: {
                        title: "Streamlined", x: 0, requires: ["gills"],
                        text: "Go with the current, not against it.",
                        mods: { oceanTickSpeed: 0.15 },
                        cost: { tidal: 110 },
                    },
                    rippleSense: {
                        title: "Ripple Sense", x: 2, requires: ["gills"],
                        text: "Feel every ripple in the dark.",
                        mods: { shoalKin: 0.05 },
                        cost: { tidal: 140 },
                    },
                    filterFeeding: {
                        title: "Filter Feeding", x: 4.5,
                        text: "Enough water can be a meal.",
                        mods: { pondOutput: 2 },
                        cost: { tidal: 50 },
                    },
                    countlessEggs: {
                        title: "Countless Eggs", x: 3.5, requires: ["filterFeeding"],
                        text: "At least some of them will make it.",
                        mods: { fishGrowth: 0.25 },
                        cost: { tidal: 110 },
                    },
                    driftFeeding: {
                        title: "Drift Feeding", x: 5.5, requires: ["filterFeeding"],
                        text: "Let the food come to you.",
                        mods: { pondGreen: 3 },
                        cost: { tidal: 140 },
                    },
                    tidalClock: {
                        title: "Tidal Clock", x: 8,
                        text: "Twice a day, every day.",
                        mods: { blueEssence: 3 },
                        cost: { tidal: 50 },
                    },
                    ebbAndFlow: {
                        title: "Give and Take", x: 7, requires: ["tidalClock"],
                        text: "What goes out comes back in.",
                        mods: { tidalCost: 0.1 },
                        cost: { tidal: 110 },
                    },
                    ripCurrent: {
                        title: "Rip Current", x: 9, requires: ["tidalClock"],
                        text: "Fast water, fast travel.",
                        mods: { burstLength: 2 },
                        cost: { tidal: 140 },
                    },
                },
            },
            {
                needs: 3,
                traits: {
                    schooling: {
                        title: "Schooling", x: 0, requires: ["streamlined"],
                        text: "A thousand fish turning as one.",
                        mods: { boostSlots: 1 },
                        cost: { tidal: 450 },
                    },
                    safetyInNumbers: {
                        title: "Safety in Numbers", x: 2, requires: ["rippleSense"],
                        text: "Stick together.",
                        mods: { boostHeld: 0.1 },
                        cost: { tidal: 500 },
                    },
                    migration: {
                        title: "Migration", x: 1, requires: ["schooling", "safetyInNumbers"],
                        text: "Follow the water wherever it goes.",
                        mods: { oceanOutput: 4, tidalCapacity: 25, oceanLevels: 5 },
                        cost: { tidal: 1200, frigid: 400 },
                    },
                    upwelling: {
                        title: "Fed From Below", x: 2.75, requires: ["safetyInNumbers", "spawningGrounds"],
                        text: "Cold water brings food up from below.",
                        mods: { boostKeep: 0.1 },
                        cost: { tidal: 600, saline: 400 },
                    },
                    spawningGrounds: {
                        title: "Homing Instinct", x: 3.5, requires: ["countlessEggs"],
                        text: "The same place, every year.",
                        mods: { pondBiomass: 0.4 },
                        cost: { tidal: 450 },
                    },
                    algaeGrazing: {
                        title: "Algae Grazing", x: 5.5, requires: ["driftFeeding"],
                        text: "The shallows are thick with algae.",
                        mods: { starvation: 0.3 },
                        cost: { tidal: 500 },
                    },
                    tidalFlats: {
                        title: "Mud Flats", x: 4.5, requires: ["spawningGrounds", "algaeGrazing"],
                        text: "Underwater half the day, full of life all day.",
                        mods: { pondOutput: 4, pondBiomass: 0.2, pondLevels: 5 },
                        cost: { tidal: 1200, stagnant: 400 },
                    },
                    brackishTolerance: {
                        title: "Brackish Tolerance", x: 6.25, requires: ["algaeGrazing", "springTide"],
                        text: "Fresh or salt, it doesn't matter.",
                        mods: { marshRefill: 0.2, tidalCapacity: 25 },
                        cost: { tidal: 600, stagnant: 400 },
                    },
                    springTide: {
                        title: "Spring Tide", x: 7, requires: ["ebbAndFlow"],
                        text: "The sun and moon pull together.",
                        mods: { tidalCapacity: 50 },
                        cost: { tidal: 450 },
                    },
                    slackTide: {
                        title: "Slack Tide", x: 9, requires: ["ripCurrent"],
                        text: "The pause between tides.",
                        mods: { drift: 1 },
                        cost: { tidal: 500 },
                    },
                    waveRiding: {
                        title: "Wave Riding", x: 8, requires: ["springTide", "slackTide"],
                        text: "Ride the waves down the coast.",
                        scaled: { blueEssence: 1.08 }, per: "pressure",
                        cost: { tidal: 1200, saline: 400 },
                    },
                },
            },
            {
                needs: 4,
                traits: {
                    deepDiving: {
                        title: "Deep Diving", x: 0, requires: ["migration"],
                        text: "Down into the dark and back up.",
                        mods: { deepOcean: 5 },
                        cost: { tidal: 2500, saline: 800 },
                    },
                    farRoaming: {
                        title: "Far Roaming", x: 2, requires: ["migration"],
                        text: "Traveling out across the open sea.",
                        scaled: { oceanOutput: 1.04 }, per: "pressure",
                        cost: { tidal: 2800, saline: 800 },
                    },
                    tirelessSwimmers: {
                        title: "Tireless Swimmers", x: 1, kind: "capstone", requires: ["deepDiving", "farRoaming"],
                        text: "Long journeys without rest become possible.",
                        mods: { oceanOutput: 5, oceanLevels: 5 },
                        effect: "Every fourth ocean tick pays out twice and doesn't wear down any boosts, x5 to what ocean schools produce, and Deepen and Nutrient Bed go 5 levels past their cap.",
                        cost: { tidal: 6000, saline: 2000, frigid: 2000 },
                    },
                    stormSwimmers: {
                        title: "Storm Swimmers", x: 3.5, requires: ["tidalFlats"],
                        text: "Storms don't slow them down.",
                        mods: { roughWater: 0.5 },
                        cost: { tidal: 2500, stagnant: 800 },
                    },
                    wideAppetite: {
                        title: "Wide Appetite", x: 5.5, requires: ["tidalFlats"],
                        text: "Anything can be food.",
                        mods: { burstCooldown: 0.2, biomass: 0.2 },
                        cost: { tidal: 2800, stagnant: 800 },
                    },
                    fastBreeders: {
                        title: "Fast Breeders", x: 4.5, kind: "capstone", requires: ["stormSwimmers", "wideAppetite"],
                        text: "More fish than water.",
                        mods: { pondOutput: 5, pondLevels: 10 },
                        effect: "Algae and fish never fall below a fifth of the pond's room each, a pond with one of them held at that floor counts as full of the other, x5 pond output, and Richer Waters goes 10 levels past its cap.",
                        cost: { tidal: 6000, stagnant: 2000, canopy: 2000 },
                    },
                    upstreamSwimming: {
                        title: "Upstream Swimming", x: 7, requires: ["waveRiding"],
                        text: "Against the flow.",
                        mods: { oceanTickSpeed: 0.2 },
                        cost: { tidal: 2500, saline: 800 },
                    },
                    shimmeringScales: {
                        title: "Shimmering Scales", x: 9, requires: ["waveRiding"],
                        text: "Catch the light.",
                        mods: { blueEssence: 8, tidalCapacity: 25 },
                        cost: { tidal: 2800, frigid: 800 },
                    },
                    moonPull: {
                        title: "Pull of the Moon", x: 8, kind: "capstone", requires: ["upstreamSwimming", "shimmeringScales"],
                        text: "The whole ocean pulled toward the moon.",
                        mods: { overflow: 0.25, capacity: 25 },
                        effect: "Converting into a full meter spills a quarter of it into the two meters beside it, and +20 room on every pressure meter.",
                        cost: { tidal: 6000, saline: 2000, stagnant: 2000 },
                    },
                },
            },
            {
                needs: 3,
                traits: {
                    leviathan: {
                        title: "Leviathan", x: 4.5, kind: "apex", requires: ["tirelessSwimmers", "fastBreeders", "moonPull"],
                        text: "So big the sea moves around it.",
                        scaled: { blueEssence: 1.1 }, per: "pressure",
                        effect: "Every ocean tick, schools holding no boost are handed one at random, x1.1 Blue Essence for every point of Tidal pressure, and Deepen and Nutrient Bed go 10 levels past their cap.",
                        mods: { oceanLevels: 10 },
                        cost: { tidal: 14000, saline: 4000, frigid: 4000 },
                    },
                },
            },
        ],
    },

    canopy: {
        name: "Canopy Traits",
        branches: [
            { name: "Trunks", x: 1 },
            { name: "Forest Floor", x: 4.5 },
            { name: "Crowns", x: 8 },
        ],
        generations: [
            {
                needs: 0,
                traits: {
                    hardenedCore: {
                        title: "Hardened Core", x: 1,
                        text: "A solid core holds the tree up.",
                        mods: { treeGrowth: 0.2 },
                        cost: { canopy: 50 },
                    },
                    risingSap: {
                        title: "Rising Sap", x: 0, requires: ["hardenedCore"],
                        text: "Sap flows to the top.",
                        mods: { forestOutput: 0.2 },
                        cost: { canopy: 110 },
                    },
                    wingedSeeds: {
                        title: "Winged Seeds", x: 2, requires: ["hardenedCore"],
                        text: "First into the clearing.",
                        mods: { standSeconds: 0.2 },
                        cost: { canopy: 140 },
                    },
                    climbingStems: {
                        title: "Climbing Stems", x: 4.5,
                        text: "Always climbing, always growing.",
                        mods: { vitality: 0.2 },
                        cost: { canopy: 50 },
                    },
                    shadeTolerance: {
                        title: "Shade Tolerance", x: 3.5, requires: ["climbingStems"],
                        text: "Getting by with very little light.",
                        mods: { grassGrowth: 0.2 },
                        cost: { canopy: 110 },
                    },
                    longRoots: {
                        title: "Long Roots", x: 5.5, requires: ["climbingStems"],
                        text: "Deep roots never run dry.",
                        mods: { canopyCapacity: 25 },
                        cost: { canopy: 140 },
                    },
                    wideLeaves: {
                        title: "Wide Leaves", x: 8,
                        text: "The more leaf, the more light.",
                        mods: { greenEssence: 3 },
                        cost: { canopy: 50 },
                    },
                    lightChasing: {
                        title: "Light Chasing", x: 7, requires: ["wideLeaves"],
                        text: "Lean toward the light.",
                        mods: { greenEssence: 5 },
                        cost: { canopy: 110 },
                    },
                    spacedBranches: {
                        title: "Spaced Branches", x: 9, requires: ["wideLeaves"],
                        text: "Room for light to fall through.",
                        mods: { shelter: 0.3 },
                        cost: { canopy: 140 },
                    },
                },
            },
            {
                needs: 3,
                traits: {
                    straightTrunks: {
                        title: "Straight Trunks", x: 0, requires: ["risingSap"],
                        text: "Straight up, nothing wasted.",
                        mods: { forestOutput: 0.3 },
                        cost: { canopy: 450 },
                    },
                    slowAging: {
                        title: "Slow Aging", x: 2, requires: ["wingedSeeds"],
                        text: "One ring at a time.",
                        mods: { oldGrowthWorth: 0.3 },
                        cost: { canopy: 500 },
                    },
                    longLifespan: {
                        title: "Long Lifespan", x: 1, requires: ["straightTrunks", "slowAging"],
                        text: "Older than anything else here.",
                        mods: { oldGrowthWorth: 0.3, forestOutput: 0.2 },
                        cost: { canopy: 1200, decay: 400 },
                    },
                    sheddingLeaves: {
                        title: "Shedding Leaves", x: 2.75, requires: ["slowAging", "rootingStems"],
                        text: "Fallen leaves feed new growth.",
                        mods: { matureGrass: 0.2 },
                        cost: { canopy: 600, decay: 400 },
                    },
                    rootingStems: {
                        title: "Rooting Stems", x: 3.5, requires: ["shadeTolerance"],
                        text: "Roots wherever it lands.",
                        mods: { grassNeighbor: 0.3 },
                        cost: { canopy: 450 },
                    },
                    groundcover: {
                        title: "Groundcover", x: 5.5, requires: ["longRoots"],
                        text: "Low plants hold the soil together.",
                        mods: { vitality: 0.3, milestones: 1 },
                        cost: { canopy: 500 },
                    },
                    fastColonizing: {
                        title: "Fast Colonizing", x: 4.5, requires: ["rootingStems", "groundcover"],
                        text: "Quick to fill any gap.",
                        mods: { grassGrowth: 0.3, vitality: 0.2 },
                        cost: { canopy: 1200, stagnant: 400 },
                    },
                    snowCatching: {
                        title: "Snow Catching", x: 6.25, requires: ["groundcover", "manyLeaves"],
                        text: "Trees stop the blowing snow.",
                        mods: { snowfall: 0.2, greenEssence: 3 },
                        cost: { canopy: 600, frigid: 400 },
                    },
                    manyLeaves: {
                        title: "Many Leaves", x: 7, requires: ["lightChasing"],
                        text: "Enough leaves to cover a field.",
                        mods: { greenEssence: 8, grassLevels: 5 },
                        cost: { canopy: 450 },
                    },
                    sunTracking: {
                        title: "Sun Tracking", x: 9, requires: ["spacedBranches"],
                        text: "Always facing the sun.",
                        scaled: { greenEssence: 1.05 }, per: "owned",
                        cost: { canopy: 500 },
                    },
                    growthSpurts: {
                        title: "Growth Spurts", x: 8, requires: ["manyLeaves", "sunTracking"],
                        text: "A race to fill the gap.",
                        scaled: { forestOutput: 0.02 }, per: "pressure",
                        cost: { canopy: 1200, decay: 400 },
                    },
                },
            },
            {
                needs: 4,
                traits: {
                    giantStature: {
                        title: "Giant Stature", x: 0, requires: ["longLifespan"],
                        text: "Taller than the rest.",
                        mods: { canopyCapacity: 50 },
                        cost: { canopy: 2500, frigid: 800 },
                    },
                    growingTogether: {
                        title: "Growing Together", x: 2, requires: ["longLifespan"],
                        text: "One falls, the next rises.",
                        mods: { treeSlots: 1 },
                        cost: { canopy: 2800, decay: 800 },
                    },
                    manyWaysUp: {
                        title: "Many Ways Up", x: 1, kind: "capstone", requires: ["giantStature", "growingTogether"],
                        text: "There's always another way up.",
                        effect: "Every growth choice also grows the tree a tenth of the way to full height.",
                        cost: { canopy: 6000, decay: 2000, stagnant: 2000 },
                    },
                    longLivedSeeds: {
                        title: "Long-Lived Seeds", x: 3.5, requires: ["fastColonizing"],
                        text: "Seeds that will wait for years.",
                        mods: { rainStrength: 0.3 },
                        cost: { canopy: 2500, frigid: 800 },
                    },
                    wovenRoots: {
                        title: "Woven Roots", x: 5.5, requires: ["fastColonizing"],
                        text: "Roots anchor the ground in place.",
                        scaled: { vitality: 0.03 }, per: "owned",
                        mods: { milestones: 1 },
                        cost: { canopy: 2800, decay: 800 },
                    },
                    carpetOfGreen: {
                        title: "Carpet of Green", x: 4.5, kind: "capstone", requires: ["longLivedSeeds", "wovenRoots"],
                        text: "Green as far as you can see.",
                        effect: "Mature grass is worth 1% more for every other fully grown tile on the map, up to +50%.",
                        cost: { canopy: 6000, stagnant: 2000, frigid: 2000 },
                    },
                    airPlants: {
                        title: "Air Plants", x: 7, requires: ["growthSpurts"],
                        text: "Living up in the branches.",
                        mods: { canopyCost: 0.15 },
                        cost: { canopy: 2500, tidal: 800 },
                    },
                    evergreen: {
                        title: "Evergreen", x: 9, requires: ["growthSpurts"],
                        text: "Green year-round, even through winter.",
                        mods: { canopyCapacity: 50 },
                        cost: { canopy: 2800, frigid: 800 },
                    },
                    cathedralCanopy: {
                        title: "Cathedral Canopy", x: 8, kind: "capstone", requires: ["airPlants", "evergreen"],
                        text: "A canopy with its own weather.",
                        mods: { greenEssence: 8, grassLevels: 5 },
                        scaled: { greenEssence: 2 }, per: "standing",
                        effect: "x2 Green Essence for every tree standing fully grown, and x8 Green Essence, and Greener Blades goes 5 levels past its cap.",
                        cost: { canopy: 6000, frigid: 2000, tidal: 2000 },
                    },
                },
            },
            {
                needs: 3,
                traits: {
                    everlastingForest: {
                        title: "Everlasting Forest", x: 4.5, kind: "apex", requires: ["manyWaysUp", "carpetOfGreen", "cathedralCanopy"],
                        text: "The forest grows and always will grow.",
                        mods: { growth: 0.2 },
                        scaled: { greenEssence: 1.05 }, per: "pressure",
                        effect: "Every new tree starts a quarter of the way grown, x1.05 Green Essence for every point of Canopy pressure, and +20% growth speed on every layer.",
                        cost: { canopy: 14000, decay: 4000, stagnant: 4000 },
                    },
                },
            },
            {
                needs: 1,
                traits: {
                    opposableThumbs: {
                        title: "Opposable Thumbs", x: 4.5, kind: "apex", requires: ["everlastingForest"],
                        text: "Made for branches, good for anything.",
                        scaled: { greenEssence: 1.05, blueEssence: 1.05, biomass: 0.02, vitality: 0.02, adaptationPoints: 0.02 },
                        per: "evolved",
                        effect: "x1.05 Green Essence and Blue Essence, and +2% Biomass, Vitality and Adaptation Points, for every trait evolved, in every tree.",
                        cost: { canopy: 12000, tidal: 8000, stagnant: 8000, saline: 8000, frigid: 8000, decay: 8000 },
                    },
                },
            },
        ],
    },

    stagnant: {
        name: "Stagnant Traits",
        branches: [
            { name: "Floodplain", x: 1 },
            { name: "Bog", x: 4.5 },
            { name: "Muck", x: 8 },
        ],
        generations: [
            {
                needs: 0,
                traits: {
                    floodReadiness: {
                        title: "Flood Readiness", x: 1,
                        text: "Ready for when the water comes.",
                        mods: { marshTempo: 0.15 },
                        cost: { stagnant: 50 },
                    },
                    rainCatching: {
                        title: "Rain Catching", x: 0, requires: ["floodReadiness"],
                        text: "Every hollow fills with rain.",
                        mods: { rainStrength: 0.2 },
                        cost: { stagnant: 110 },
                    },
                    waterHoarding: {
                        title: "Water Hoarding", x: 2, requires: ["floodReadiness"],
                        text: "Keep the water close.",
                        mods: { marshWater: 0.2 },
                        cost: { stagnant: 140 },
                    },
                    hollowStems: {
                        title: "Hollow Stems", x: 4.5,
                        text: "Air down to the roots.",
                        mods: { marshSuccession: 0.2 },
                        cost: { stagnant: 50 },
                    },
                    spongyLeaves: {
                        title: "Spongy Leaves", x: 3.5, requires: ["hollowStems"],
                        text: "Soaks up water like a sponge.",
                        mods: { rainDuration: 0.2 },
                        cost: { stagnant: 110 },
                    },
                    airRoots: {
                        title: "Air Roots", x: 5.5, requires: ["hollowStems"],
                        text: "Roots that breathe above the mud.",
                        mods: { adaptationPoints: 0.15 },
                        cost: { stagnant: 140 },
                    },
                    bottomFeeding: {
                        title: "Bottom Feeding", x: 8,
                        text: "Plenty to eat at the bottom.",
                        mods: { biomass: 0.2 },
                        cost: { stagnant: 50 },
                    },
                    floatingSeeds: {
                        title: "Floating Seeds", x: 7, requires: ["bottomFeeding"],
                        text: "Seeds go where the water goes.",
                        mods: { marshNeighbor: 0.2 },
                        cost: { stagnant: 110 },
                    },
                    wetSkin: {
                        title: "Wet Skin", x: 9, requires: ["bottomFeeding"],
                        text: "Damp is enough.",
                        mods: { stagnantCapacity: 25 },
                        cost: { stagnant: 140 },
                    },
                },
            },
            {
                needs: 3,
                traits: {
                    deepWading: {
                        title: "Deep Wading", x: 0, requires: ["rainCatching"],
                        text: "Wade in deep.",
                        mods: { marshOutput: 4, marshLevels: 5 },
                        cost: { stagnant: 450 },
                    },
                    siltBuilding: {
                        title: "Silt Building", x: 2, requires: ["waterHoarding"],
                        text: "Every flood leaves silt behind.",
                        mods: { marshSilt: 0.3 },
                        cost: { stagnant: 500 },
                    },
                    seasonalLife: {
                        title: "Seasonal Life", x: 1, requires: ["deepWading", "siltBuilding"],
                        text: "Half field, half lake.",
                        mods: { floodCost: 0.2, marshOutput: 2 },
                        cost: { stagnant: 1200, tidal: 400 },
                    },
                    stiffStems: {
                        title: "Stiff Stems", x: 2.75, requires: ["siltBuilding", "tangledStems"],
                        text: "A wall of stems slows the water.",
                        mods: { dieback: 0.3 },
                        cost: { stagnant: 600, tidal: 400 },
                    },
                    tangledStems: {
                        title: "Tangled Stems", x: 3.5, requires: ["spongyLeaves"],
                        text: "Slow water drops its silt.",
                        mods: { siltHold: 0.3 },
                        cost: { stagnant: 450 },
                    },
                    raisedClumps: {
                        title: "Raised Clumps", x: 5.5, requires: ["airRoots"],
                        text: "Clumps of ground become little dry islands.",
                        mods: { marshSuccession: 0.3 },
                        cost: { stagnant: 500 },
                    },
                    rotResistance: {
                        title: "Rot Resistance", x: 4.5, requires: ["tangledStems", "raisedClumps"],
                        text: "Everything susceptible to rot died out long ago.",
                        mods: { stagnantCapacity: 50 },
                        cost: { stagnant: 1200, decay: 400 },
                    },
                    floodHardy: {
                        title: "Flood Hardy", x: 6.25, requires: ["raisedClumps", "burrowing"],
                        text: "Better for every flood.",
                        mods: { blueEssence: 5, biomass: 0.3 },
                        cost: { stagnant: 600, tidal: 400 },
                    },
                    burrowing: {
                        title: "Burrowing", x: 7, requires: ["floatingSeeds"],
                        text: "Mud full of life.",
                        mods: { biomass: 0.4 },
                        cost: { stagnant: 450 },
                    },
                    slowDrying: {
                        title: "Slow Drying", x: 9, requires: ["wetSkin"],
                        text: "The damp stays put.",
                        mods: { rainDuration: 0.3 },
                        cost: { stagnant: 500 },
                    },
                    breathHolding: {
                        title: "Breath Holding", x: 8, requires: ["burrowing", "slowDrying"],
                        text: "Who needs air when you're deep in the wet ground?",
                        scaled: { biomass: 0.02 }, per: "pressure",
                        cost: { stagnant: 1200, decay: 400 },
                    },
                },
            },
            {
                needs: 4,
                traits: {
                    floodGrasses: {
                        title: "Flood Grasses", x: 0, requires: ["seasonalLife"],
                        text: "Grass that loves wet feet.",
                        mods: { marshRefill: 0.3, vitality: 0.2 },
                        cost: { stagnant: 2500, canopy: 800 },
                    },
                    poolBreeding: {
                        title: "Pool Breeding", x: 2, requires: ["seasonalLife"],
                        text: "Pools full of life.",
                        scaled: { marshOutput: 1.04 }, per: "pressure",
                        cost: { stagnant: 2800, tidal: 800 },
                    },
                    mudBuilders: {
                        title: "Mud Builders", x: 1, kind: "capstone", requires: ["floodGrasses", "poolBreeding"],
                        text: "The marsh keeps its silt.",
                        mods: { marshSilt: 0.5, marshOutput: 2.5, marshLevels: 5 },
                        effect: "Each marsh zone produces up to 50% more the more silt it holds, 50% more silt settles in flooded zones, x2.5 marsh output, and Varied Life goes 5 levels past its cap.",
                        cost: { stagnant: 6000, tidal: 2000, decay: 2000 },
                    },
                    insectTraps: {
                        title: "Insect Traps", x: 3.5, requires: ["rotResistance"],
                        text: "Getting their food in ways previously unknown to plants.",
                        mods: { adaptationPoints: 0.3 },
                        cost: { stagnant: 2500, decay: 800 },
                    },
                    cottonTufts: {
                        title: "Cotton Tufts", x: 5.5, requires: ["rotResistance"],
                        text: "White tufts across the bog.",
                        mods: { vitality: 0.5 },
                        cost: { stagnant: 2800, canopy: 800 },
                    },
                    floatingRoots: {
                        title: "Floating Roots", x: 4.5, kind: "capstone", requires: ["insectTraps", "cottonTufts"],
                        text: "Floating roots ride out any water level.",
                        mods: { marshSuccession: 0.5 },
                        effect: "Marsh communities die back half as fast, a zone with nothing left to grow into produces 50% more, and communities grow 50% faster.",
                        cost: { stagnant: 6000, decay: 2000, frigid: 2000 },
                    },
                    swarming: {
                        title: "Swarming", x: 7, requires: ["breathHolding"],
                        text: "Swarms over every pool.",
                        scaled: { marshRefill: 0.03 }, per: "owned",
                        cost: { stagnant: 2500, tidal: 800 },
                    },
                    heatLoving: {
                        title: "Heat Loving", x: 9, requires: ["breathHolding"],
                        text: "Warm and still.",
                        mods: { stagnantCost: 0.15 },
                        cost: { stagnant: 2800, canopy: 800 },
                    },
                    stormBreeders: {
                        title: "Storm Breeders", x: 8, kind: "capstone", requires: ["swarming", "heatLoving"],
                        text: "The rain moves on.",
                        mods: { biomass: 0.5, marshWater: 0.2 },
                        effect: "While weather is falling anywhere on the map, the marsh's stored water refills three times as fast, +50% Biomass, and the marsh stores 20% more water.",
                        cost: { stagnant: 6000, tidal: 2000, canopy: 2000 },
                    },
                },
            },
            {
                needs: 3,
                traits: {
                    primordialSoup: {
                        title: "Primordial Soup", x: 4.5, kind: "apex", requires: ["mudBuilders", "floatingRoots", "stormBreeders"],
                        text: "Where life began.",
                        mods: { pressure: 1, marshLevels: 5 },
                        scaled: { marshOutput: 1.04, biomass: 0.02 }, per: "pressure",
                        effect: "x1.04 marsh output and +2% Biomass for every point of Stagnant pressure, every pressure converts as if it were 1 stronger, and Varied Life goes 5 levels past its cap.",
                        cost: { stagnant: 14000, tidal: 4000, decay: 4000 },
                    },
                },
            },
        ],
    },

    saline: {
        name: "Saline Traits",
        branches: [
            { name: "Reef Builders", x: 1 },
            { name: "Salt Balance", x: 4.5 },
            { name: "Living Light", x: 8 },
        ],
        generations: [
            {
                needs: 0,
                traits: {
                    reefBuilding: {
                        title: "Reef Building", x: 1,
                        text: "Built on the last generation.",
                        mods: { reefOutput: 2.5 },
                        cost: { saline: 50 },
                    },
                    tidePools: {
                        title: "Tide Pools", x: 0, requires: ["reefBuilding"],
                        text: "Wait for the tide.",
                        mods: { reefEvents: 0.25 },
                        cost: { saline: 110 },
                    },
                    cleanerFish: {
                        title: "Cleaner Fish", x: 2, requires: ["reefBuilding"],
                        text: "Both fish win.",
                        mods: { reefKinship: 0.2 },
                        cost: { saline: 140 },
                    },
                    saltGlands: {
                        title: "Salt Glands", x: 4.5,
                        text: "Push the salt back out.",
                        mods: { conversion: 0.15 },
                        cost: { saline: 50 },
                    },
                    calcifiedShells: {
                        title: "Calcified Shells", x: 3.5, requires: ["saltGlands"],
                        text: "A hard shell protects from anything.",
                        mods: { capacity: 50 },
                        cost: { saline: 110 },
                    },
                    saltPumping: {
                        title: "Salt Pumping", x: 5.5, requires: ["saltGlands"],
                        text: "Actively pump the salt out.",
                        mods: { haste: 0.25 },
                        cost: { saline: 140 },
                    },
                    transparentBodies: {
                        title: "Transparent Bodies", x: 8,
                        text: "Easy to hide, easy to live.",
                        mods: { blueEssence: 3 },
                        cost: { saline: 50 },
                    },
                    bioluminescence: {
                        title: "Bioluminescence", x: 7, requires: ["transparentBodies"],
                        text: "Glowing waves wash across the shores.",
                        mods: { blueEssence: 4 },
                        cost: { saline: 110 },
                    },
                    sprayTolerance: {
                        title: "Spray Tolerance", x: 9, requires: ["transparentBodies"],
                        text: "Salt spray doesn't hurt.",
                        mods: { salineCost: 0.1 },
                        cost: { saline: 140 },
                    },
                },
            },
            {
                needs: 3,
                traits: {
                    branchingSkeletons: {
                        title: "Branching Skeletons", x: 0, requires: ["tidePools"],
                        text: "Branching coral.",
                        mods: { reefOutput: 5 },
                        cost: { saline: 450 },
                    },
                    sunlightSharing: {
                        title: "Sunlight Sharing", x: 2, requires: ["cleanerFish"],
                        text: "Share the light.",
                        mods: { settledSpeed: 0.3 },
                        cost: { saline: 500 },
                    },
                    livingWalls: {
                        title: "Living Walls", x: 1, requires: ["branchingSkeletons", "sunlightSharing"],
                        text: "Rock and stone become living things.",
                        mods: { reefNeighbor: 0.3, reefOutput: 2 },
                        cost: { saline: 1200, tidal: 400 },
                    },
                    hardenedShells: {
                        title: "Hardened Shells", x: 2.75, requires: ["sunlightSharing", "crustedSkin"],
                        text: "Salt turned to stone.",
                        mods: { capacity: 25, salineCapacity: 25 },
                        cost: { saline: 600, tidal: 400 },
                    },
                    crustedSkin: {
                        title: "Crusted Skin", x: 3.5, requires: ["calcifiedShells"],
                        text: "Crusted in salt.",
                        mods: { capacity: 50 },
                        cost: { saline: 450 },
                    },
                    saltSweating: {
                        title: "Salt Sweating", x: 5.5, requires: ["saltPumping"],
                        text: "Sweat out the salt.",
                        mods: { conversion: 0.25 },
                        cost: { saline: 500 },
                    },
                    innerBalance: {
                        title: "Inner Balance", x: 4.5, requires: ["crustedSkin", "saltSweating"],
                        text: "Steady inside.",
                        mods: { capacityMult: 0.2 },
                        cost: { saline: 1200, frigid: 400 },
                    },
                    brineChannels: {
                        title: "Brine Channels", x: 6.25, requires: ["saltSweating", "tallFronds"],
                        text: "Salt helps the ice pack colder and tighter.",
                        mods: { settle: 0.3, conversion: 0.1 },
                        cost: { saline: 600, frigid: 400 },
                    },
                    tallFronds: {
                        title: "Tall Fronds", x: 7, requires: ["bioluminescence"],
                        text: "A forest held up by water.",
                        mods: { blueEssence: 8 },
                        cost: { saline: 450 },
                    },
                    depthSense: {
                        title: "Depth Sense", x: 9, requires: ["sprayTolerance"],
                        text: "Find where the food collects.",
                        mods: { deepOcean: 2.5 },
                        cost: { saline: 500 },
                    },
                    seagrassGrazing: {
                        title: "Seagrass Grazing", x: 8, requires: ["tallFronds", "depthSense"],
                        text: "A field on the seabed.",
                        mods: { pondGreen: 2.5, salineCapacity: 25 },
                        cost: { saline: 1200, tidal: 400 },
                    },
                },
            },
            {
                needs: 4,
                traits: {
                    nightSpawning: {
                        title: "Night Spawning", x: 0, requires: ["livingWalls"],
                        text: "One night a year, all at once.",
                        mods: { eventGap: 0.3 },
                        cost: { saline: 2500, tidal: 800 },
                    },
                    ringBuilding: {
                        title: "Ring Building", x: 2, requires: ["livingWalls"],
                        text: "The reef outlasted the island.",
                        scaled: { reefOutput: 1.04 }, per: "pressure",
                        cost: { saline: 2800, tidal: 800 },
                    },
                    countlessKinds: {
                        title: "Countless Kinds", x: 1, kind: "capstone", requires: ["nightSpawning", "ringBuilding"],
                        text: "Every type of coral.",
                        mods: { reefKinship: 0.5 },
                        scaled: { reefOutput: 1.06 }, per: "owned",
                        effect: "Reef tiles produce x1.06 Blue Essence for every Saline trait evolved, and reef fish boosts are 50% stronger.",
                        cost: { saline: 6000, tidal: 2000, stagnant: 2000 },
                    },
                    brineShrimp: {
                        title: "Brine Shrimp", x: 3.5, requires: ["innerBalance"],
                        text: "Too salty for anything else.",
                        mods: { salineCapacity: 50 },
                        cost: { saline: 2500, stagnant: 800 },
                    },
                    droughtHardy: {
                        title: "Drought Hardy", x: 5.5, requires: ["innerBalance"],
                        text: "Survives the dry-out.",
                        mods: { pressure: 1 },
                        cost: { saline: 2800, frigid: 800 },
                    },
                    equilibrium: {
                        title: "Equilibrium", x: 4.5, kind: "capstone", requires: ["brineShrimp", "droughtHardy"],
                        text: "Nothing gained, nothing lost.",
                        mods: { lineage: 1, capacityMult: 0.2 },
                        effect: "Every generation in every tree needs one fewer trait to open, and every pressure meter holds 20% more.",
                        cost: { saline: 6000, frigid: 2000, decay: 2000 },
                    },
                    pearlMaking: {
                        title: "Pearl Making", x: 7, requires: ["seagrassGrazing"],
                        text: "Irritating grit turns into shining pearls.",
                        mods: { salineCost: 0.15 },
                        cost: { saline: 2500, stagnant: 800 },
                    },
                    duskRising: {
                        title: "Dusk Rising", x: 9, requires: ["seagrassGrazing"],
                        text: "Everything rises at dusk.",
                        scaled: { oceanOutput: 1.06 }, per: "owned",
                        cost: { saline: 2800, tidal: 800 },
                    },
                    seaOfLight: {
                        title: "Sea of Light", x: 8, kind: "capstone", requires: ["pearlMaking", "duskRising"],
                        text: "The whole sea glows.",
                        scaled: { blueEssence: 1.05 }, per: "evolved",
                        effect: "x1.05 Blue Essence for every trait evolved, in every tree.",
                        cost: { saline: 6000, tidal: 2000, canopy: 2000 },
                    },
                },
            },
            {
                needs: 3,
                traits: {
                    livingStone: {
                        title: "Living Stone", x: 4.5, kind: "apex", requires: ["countlessKinds", "equilibrium", "seaOfLight"],
                        text: "Millions of tiny builders create a huge reef.",
                        mods: { conversion: 1, capacityMult: 0.4 },
                        scaled: { reefOutput: 1.08 }, per: "pressure",
                        cost: { saline: 14000, tidal: 4000, frigid: 4000 },
                    },
                },
            },
        ],
    },

    frigid: {
        name: "Frigid Traits",
        branches: [
            { name: "Ice Pack", x: 1 },
            { name: "Deep Sleep", x: 4.5 },
            { name: "Thaw", x: 8 },
        ],
        generations: [
            {
                needs: 0,
                traits: {
                    antifreeze: {
                        title: "Antifreeze", x: 1,
                        text: "Sap that never freezes.",
                        mods: { iceOutput: 2.5 },
                        cost: { frigid: 50 },
                    },
                    snowBurrowing: {
                        title: "Snow Burrowing", x: 0, requires: ["antifreeze"],
                        text: "The snow stays.",
                        mods: { snowfall: 0.2 },
                        cost: { frigid: 110 },
                    },
                    thickFur: {
                        title: "Thick Fur", x: 2, requires: ["antifreeze"],
                        text: "Warm under the fur.",
                        mods: { compaction: 0.2 },
                        cost: { frigid: 140 },
                    },
                    hibernation: {
                        title: "Hibernation", x: 4.5,
                        text: "Sleep through the worst of it.",
                        mods: { passive: 0.25 },
                        cost: { frigid: 50 },
                    },
                    dormancy: {
                        title: "Dormancy", x: 3.5, requires: ["hibernation"],
                        text: "Going beyond sleep to wait it out.",
                        mods: { adaptationPoints: 0.15 },
                        cost: { frigid: 110 },
                    },
                    slowHearts: {
                        title: "Slow Hearts", x: 5.5, requires: ["hibernation"],
                        text: "Make every beat count.",
                        mods: { conversion: 0.15 },
                        cost: { frigid: 140 },
                    },
                    winterSeeds: {
                        title: "Winter Seeds", x: 8,
                        text: "Seeds that need a winter.",
                        mods: { frigidCapacity: 50 },
                        cost: { frigid: 50 },
                    },
                    earlyWaking: {
                        title: "Early Waking", x: 7, requires: ["winterSeeds"],
                        text: "Up at the first thaw.",
                        mods: { pondOutput: 2.5, marshRefill: 0.2 },
                        cost: { frigid: 110 },
                    },
                    overwintering: {
                        title: "Overwintering", x: 9, requires: ["winterSeeds"],
                        text: "A head start on spring.",
                        mods: { greenEssence: 3 },
                        cost: { frigid: 140 },
                    },
                },
            },
            {
                needs: 3,
                traits: {
                    iceLoving: {
                        title: "Ice Loving", x: 0, requires: ["snowBurrowing"],
                        text: "Every winter pressing down.",
                        mods: { pressStrength: 0.2 },
                        cost: { frigid: 450 },
                    },
                    freezeTolerance: {
                        title: "Freeze Tolerance", x: 2, requires: ["thickFur"],
                        text: "Well-adjusted to the cold.",
                        mods: { compaction: 0.3 },
                        cost: { frigid: 500 },
                    },
                    iceDwelling: {
                        title: "Ice Dwelling", x: 1, requires: ["iceLoving", "freezeTolerance"],
                        text: "Living in the ice.",
                        mods: { iceOutput: 6, compaction: 0.25 },
                        cost: { frigid: 1200, saline: 400 },
                    },
                    snowDens: {
                        title: "Snow Dens", x: 2.75, requires: ["freezeTolerance", "slowedBreathing"],
                        text: "Warm inside the drift.",
                        mods: { looseDepth: 0.3, frigidCapacity: 25 },
                        cost: { frigid: 600, saline: 400 },
                    },
                    slowedBreathing: {
                        title: "Slowed Breathing", x: 3.5, requires: ["dormancy"],
                        text: "Barely breathing.",
                        mods: { passive: 0.5 },
                        cost: { frigid: 450 },
                    },
                    frostProofCells: {
                        title: "Frost-Proof Cells", x: 5.5, requires: ["slowHearts"],
                        text: "Ice can't get in.",
                        mods: { frigidCost: 0.15 },
                        cost: { frigid: 500 },
                    },
                    longSleep: {
                        title: "Long Sleep", x: 4.5, requires: ["slowedBreathing", "frostProofCells"],
                        text: "Wake up somewhere new.",
                        scaled: { passive: 0.03 }, per: "pressure",
                        cost: { frigid: 1200, decay: 400 },
                    },
                    frostHardiness: {
                        title: "Frost Hardiness", x: 6.25, requires: ["frostProofCells", "frostSplitting"],
                        text: "Bounces back from frost.",
                        mods: { greenEssence: 3, passive: 0.2 },
                        cost: { frigid: 600, canopy: 400 },
                    },
                    frostSplitting: {
                        title: "Frost Splitting", x: 7, requires: ["earlyWaking"],
                        text: "Frost cracks the ground open.",
                        mods: { grassGrowth: 0.3 },
                        cost: { frigid: 450 },
                    },
                    meltDrinking: {
                        title: "Melt Drinking", x: 9, requires: ["overwintering"],
                        text: "Drink the meltwater.",
                        mods: { pondCapacity: 0.2 },
                        cost: { frigid: 500 },
                    },
                    springRush: {
                        title: "Spring Rush", x: 8, requires: ["frostSplitting", "meltDrinking"],
                        text: "All the melt at once.",
                        mods: { growth: 0.1 },
                        cost: { frigid: 1200, canopy: 400 },
                    },
                },
            },
            {
                needs: 4,
                traits: {
                    whiteCoats: {
                        title: "White Coats", x: 0, requires: ["iceDwelling"],
                        text: "Blend into the snow, hide within plain sight.",
                        mods: { snowfall: 0.4 },
                        cost: { frigid: 2500, saline: 800 },
                    },
                    windproof: {
                        title: "Windproof", x: 2, requires: ["iceDwelling"],
                        text: "The wind can't get through.",
                        mods: { scour: 0.5 },
                        cost: { frigid: 2800, canopy: 800 },
                    },
                    eternalIce: {
                        title: "Eternal Ice", x: 1, kind: "capstone", requires: ["whiteCoats", "windproof"],
                        text: "Nothing shifts. Nothing moves.",
                        effect: "Wind never scours away loose snow, and ice field output rises 2% for every collapse the pack has come through, up to +50%.",
                        cost: { frigid: 6000, saline: 2000, tidal: 2000 },
                    },
                    halfSleep: {
                        title: "Half Sleep", x: 3.5, requires: ["longSleep"],
                        text: "Half awake, half asleep.",
                        mods: { adaptationPoints: 0.4 },
                        cost: { frigid: 2500, decay: 800 },
                    },
                    foodCaching: {
                        title: "Food Caching", x: 5.5, requires: ["longSleep"],
                        text: "Save it for later.",
                        mods: { drift: 1 },
                        cost: { frigid: 2800, saline: 800 },
                    },
                    suspendedAnimation: {
                        title: "Suspended Animation", x: 4.5, kind: "capstone", requires: ["halfSleep", "foodCaching"],
                        text: "Frozen solid, fine by spring.",
                        mods: { drift: 2, passive: 1 },
                        effect: `Every meter with pressure behind it takes in ${driftText(2)} on its own, and +100% Adaptation Points earned while idle.`,
                        cost: { frigid: 6000, decay: 2000, stagnant: 2000 },
                    },
                    shortLives: {
                        title: "Short Lives", x: 7, requires: ["springRush"],
                        text: "Live fast, die young.",
                        mods: { frigidCapacity: 50 },
                        cost: { frigid: 2500, tidal: 800 },
                    },
                    coldBlooded: {
                        title: "Cold Blooded", x: 9, requires: ["springRush"],
                        text: "Cold is no problem.",
                        mods: { collapseKeep: 0.2 },
                        cost: { frigid: 2800, tidal: 800 },
                    },
                    springAwakening: {
                        title: "Spring Awakening", x: 8, kind: "capstone", requires: ["shortLives", "coldBlooded"],
                        text: "Everything wakes at once.",
                        mods: { growth: 0.2 },
                        effect: "Seedlings next to fully grown grass grow 50% faster, and +20% growth speed on every layer.",
                        cost: { frigid: 6000, canopy: 2000, stagnant: 2000 },
                    },
                },
            },
            {
                needs: 3,
                traits: {
                    mastersOfTheCold: {
                        title: "Masters of the Cold", x: 4.5, kind: "apex", requires: ["eternalIce", "suspendedAnimation", "springAwakening"],
                        text: "Built for the truly frigid.",
                        scaled: { iceOutput: 1.08, passive: 0.05 }, per: "pressure",
                        cost: { frigid: 14000, saline: 4000, canopy: 4000 },
                    },
                },
            },
        ],
    },

    decay: {
        name: "Decay Traits",
        branches: [
            { name: "Mushrooms", x: 1 },
            { name: "Underground", x: 4.5 },
            { name: "Recycling", x: 8 },
        ],
        generations: [
            {
                needs: 0,
                traits: {
                    sporeMaking: {
                        title: "Spore Making", x: 1,
                        text: "Caps hold spores up to the wind.",
                        mods: { spores: 0.25 },
                        cost: { decay: 50 },
                    },
                    litterFeeding: {
                        title: "Litter Feeding", x: 0, requires: ["sporeMaking"],
                        text: "Fallen leaves become food.",
                        mods: { groveGrowth: 0.2 },
                        cost: { decay: 110 },
                    },
                    pores: {
                        title: "Pores", x: 2, requires: ["sporeMaking"],
                        text: "More room for spores.",
                        mods: { fruitReturn: 0.2 },
                        cost: { decay: 140 },
                    },
                    rootThreads: {
                        title: "Root Threads", x: 4.5,
                        text: "Threads connecting every root.",
                        mods: { decayCapacity: 25 },
                        cost: { decay: 50 },
                    },
                    woodRotting: {
                        title: "Wood Rotting", x: 3.5, requires: ["rootThreads"],
                        text: "Fallen trees feed new life.",
                        mods: { sapShare: 0.2 },
                        cost: { decay: 110 },
                    },
                    leafEating: {
                        title: "Leaf Eating", x: 5.5, requires: ["rootThreads"],
                        text: "Old leaves, new growth.",
                        mods: { plantCost: 0.2 },
                        cost: { decay: 140 },
                    },
                    rotFeeding: {
                        title: "Rot Feeding", x: 8,
                        text: "Nothing goes to waste.",
                        mods: { passive: 0.2 },
                        cost: { decay: 50 },
                    },
                    sporeClouds: {
                        title: "Spore Clouds", x: 7, requires: ["rotFeeding"],
                        text: "Spores everywhere.",
                        mods: { fruitLength: 10 },
                        cost: { decay: 110 },
                    },
                    scavenging: {
                        title: "Scavenging", x: 9, requires: ["rotFeeding"],
                        text: "Free food.",
                        mods: { refund: 0.05 },
                        cost: { decay: 140 },
                    },
                },
            },
            {
                needs: 3,
                traits: {
                    rainFruiting: {
                        title: "Rain Fruiting", x: 0, requires: ["litterFeeding"],
                        text: "Up after the rain.",
                        mods: { fruitPotency: 0.3 },
                        cost: { decay: 450 },
                    },
                    fairyRings: {
                        title: "Fairy Rings", x: 2, requires: ["pores"],
                        text: "A ring that grows every year.",
                        mods: { groveGrowth: 0.4 },
                        cost: { decay: 500 },
                    },
                    overnightFruiting: {
                        title: "Overnight Fruiting", x: 1, requires: ["rainFruiting", "fairyRings"],
                        text: "Up overnight.",
                        mods: { fruitStack: 1, spores: 0.3 },
                        cost: { decay: 1200, stagnant: 400 },
                    },
                    logSprouting: {
                        title: "Log Sprouting", x: 3.5, requires: ["woodRotting"],
                        text: "Grow directly in the rotted wood.",
                        mods: { oldGrowthWorth: 0.2, decayCapacity: 25 },
                        cost: { decay: 450 },
                    },
                    soilBuilding: {
                        title: "Soil Building", x: 5.5, requires: ["leafEating"],
                        text: "Rich, dark soil.",
                        mods: { grassGrowth: 0.2 },
                        cost: { decay: 500 },
                    },
                    rootSignals: {
                        title: "Root Signals", x: 4.5, requires: ["logSprouting", "soilBuilding"],
                        text: "The forest talks underground.",
                        mods: { oldGrowthWorth: 0.3, forestOutput: 0.2 },
                        cost: { decay: 1200, canopy: 400 },
                    },
                    composting: {
                        title: "Composting", x: 6.25, requires: ["soilBuilding", "detritusEating"],
                        text: "Warm even in winter.",
                        mods: { biomass: 0.2, refund: 0.05 },
                        cost: { decay: 600, stagnant: 400 },
                    },
                    detritusEating: {
                        title: "Detritus Eating", x: 7, requires: ["sporeClouds"],
                        text: "The marsh grows from what sinks.",
                        mods: { decayCost: 0.15 },
                        cost: { decay: 450, stagnant: 200 },
                    },
                    carrionEating: {
                        title: "Carrion Eating", x: 9, requires: ["scavenging"],
                        text: "Nothing is left unused.",
                        mods: { refund: 0.1 },
                        cost: { decay: 500 },
                    },
                    breakingDown: {
                        title: "Breaking Down", x: 8, requires: ["detritusEating", "carrionEating"],
                        text: "Small things doing big work.",
                        scaled: { adaptationPoints: 0.02 }, per: "pressure",
                        cost: { decay: 1200, stagnant: 400 },
                    },
                },
            },
            {
                needs: 4,
                traits: {
                    puffingSpores: {
                        title: "Puffing Spores", x: 0, requires: ["overnightFruiting"],
                        text: "A puff of spores.",
                        scaled: { spores: 0.03 }, per: "pressure",
                        cost: { decay: 2500, stagnant: 800 },
                    },
                    glowingRot: {
                        title: "Glowing Rot", x: 2, requires: ["overnightFruiting"],
                        text: "Glowing in the dark.",
                        mods: { fruitPotency: 0.5 },
                        cost: { decay: 2800, canopy: 800 },
                    },
                    giantFungus: {
                        title: "Giant Fungus", x: 1, kind: "capstone", requires: ["puffingSpores", "glowingRot"],
                        text: "Huge, and mostly underground.",
                        mods: { fruitPotency: 0.5 },
                        scaled: { spores: 0.05 }, per: "owned",
                        effect: "+5% Spores for every Decay trait evolved, and mushroom fruiting boosts are 50% stronger.",
                        cost: { decay: 6000, stagnant: 2000, canopy: 2000 },
                    },
                    rootGrafting: {
                        title: "Root Grafting", x: 3.5, requires: ["rootSignals"],
                        text: "Growths that share.",
                        mods: { forestShare: 0.3 },
                        cost: { decay: 2500, canopy: 800 },
                    },
                    soilFeeding: {
                        title: "Soil Feeding", x: 5.5, requires: ["rootSignals"],
                        text: "Anything grows here.",
                        mods: { decayCapacity: 50 },
                        cost: { decay: 2800, canopy: 800 },
                    },
                    hiddenNetwork: {
                        title: "Hidden Network", x: 4.5, kind: "capstone", requires: ["rootGrafting", "soilFeeding"],
                        text: "Every part counts, even those that are unseen.",
                        mods: { forestOutput: 0.5 },
                        effect: "Old growth is worth 10% more for every tree still growing, multiplied on top of everything else, and forest bonuses are 50% stronger.",
                        cost: { decay: 6000, canopy: 2000, frigid: 2000 },
                    },
                    rotEnzymes: {
                        title: "Rot Enzymes", x: 7, requires: ["breakingDown"],
                        text: "Living off the long-dead.",
                        mods: { conversion: 0.3 },
                        cost: { decay: 2500, stagnant: 800 },
                    },
                    buriedStores: {
                        title: "Buried Stores", x: 9, requires: ["breakingDown"],
                        text: "More life below than above.",
                        mods: { capacity: 50 },
                        cost: { decay: 2800, tidal: 800 },
                    },
                    nothingWasted: {
                        title: "Full Cycle", x: 8, kind: "capstone", requires: ["rotEnzymes", "buriedStores"],
                        text: "Everything gets used.",
                        mods: { refund: 0.25, adaptationPoints: 0.5 },
                        effect: "Finishing a trait gives back 25% of what it cost into the meters it came from, and +50% Adaptation Points.",
                        cost: { decay: 6000, stagnant: 2000, tidal: 2000 },
                    },
                },
            },
            {
                needs: 3,
                traits: {
                    greatRot: {
                        title: "The Great Rot", x: 4.5, kind: "apex", requires: ["giantFungus", "hiddenNetwork", "nothingWasted"],
                        text: "What doesn't grow, dies. And what dies grows the fungus.",
                        mods: { cost: 0.2 },
                        scaled: { spores: 0.1 }, per: "pressure",
                        cost: { decay: 14000, canopy: 4000, stagnant: 4000 },
                    },
                },
            },
        ],
    },
};


//    !!! WRITING AN EFFECT OUT !!!

const pct = (value) => `${+(value * 100).toFixed(1)}%`;
const times = (value) => `x${+value.toFixed(2)}`;

// Essence and what multiplies: each trait is its own multiplier, and a scaled one applies again per step
const MULTIPLIED = new Set(["greenEssence", "blueEssence", "oceanOutput", "pondOutput", "pondGreen", "iceOutput", "marshOutput", "reefOutput", "deepOcean"]);
const PRESSURE_NAMES = { tidal: "Tidal", canopy: "Canopy", stagnant: "Stagnant", saline: "Saline", frigid: "Frigid", decay: "Decay" };

const EFFECT_TEXT = {
    greenEssence: v => `${times(v)} Green Essence`,
    blueEssence: v => `${times(v)} Blue Essence`,
    biomass: v => `+${pct(v)} Biomass`,
    vitality: v => `+${pct(v)} Vitality`,
    adaptationPoints: v => `+${pct(v)} Adaptation Points`,
    spores: v => `+${pct(v)} Spores`,
    growth: v => `+${pct(v)} growth speed on every layer`,
    oceanOutput: v => `${times(v)} to what ocean schools produce`,
    oceanTickSpeed: v => `Ocean schools pay out ${pct(v)} more often`,
    pondOutput: v => `${times(v)} pond output`,
    marshOutput: v => `${times(v)} marsh output`,
    marshRefill: v => `The marsh's stored water refills ${pct(v)} faster`,
    marshSuccession: v => `Marsh communities grow ${pct(v)} faster`,
    marshSilt: v => `${pct(v)} more silt settles in flooded marsh zones`,
    marshTempo: v => `The marsh's wet and dry cycle runs ${pct(v)} faster`,
    rainDuration: v => `Weather lasts ${pct(v)} longer`,
    treeGrowth: v => `Trees grow ${pct(v)} faster`,
    grassGrowth: v => `Grass grows ${pct(v)} faster`,
    groveGrowth: v => `Mushrooms grow ${pct(v)} faster`,
    forestOutput: v => `Forest bonuses are ${pct(v)} stronger`,
    oldGrowthWorth: v => `Old growth is worth ${pct(v)} more`,
    fruitPotency: v => `Mushroom fruiting boosts are ${pct(v)} stronger`,
    snowfall: v => `+${pct(v)} snowfall on the ice field`,
    compaction: v => `Snow compacts ${pct(v)} faster on the ice field`,
    iceOutput: v => `${times(v)} ice field output`,
    reefOutput: v => `Reef tiles produce ${times(v)} Blue Essence`,
    reefEvents: v => `Reef events last ${pct(v)} longer`,
    reefKinship: v => `Reef fish boosts are ${pct(v)} stronger`,

    conversion: v => `+${pct(v)} conversion rate on every pressure`,
    capacity: v => `+${v} room on every pressure meter`,
    capacityMult: v => `Every pressure meter holds ${pct(v)} more`,
    passive: v => `+${pct(v)} Adaptation Points earned while idle`,
    haste: v => `Holding converts and drains ${pct(v)} faster`,
    drift: v => `Every meter with pressure behind it takes in ${driftText(v)} on its own, while you have them`,
    refund: v => `Finishing a trait gives back ${pct(v)} of what it cost`,
    pressure: v => `Every pressure converts as if it were ${v} stronger`,
    lineage: v => `Every generation needs ${v} fewer trait${v === 1 ? "" : "s"} to open`,
    overflow: v => `Converting into a full meter spills ${pct(v)} of it into the two beside it`,
    pondBiomass: v => `The pond makes ${pct(v)} more Biomass`,
    pondGreen: v => `The pond makes ${times(v)} Green Essence`,
    roughWater: v => `+${pct(v)} pond output while the water is Turbulent`,
    shoalKin: v => `Ocean schools produce ${pct(v)} more for every school next to them`,
    boostHeld: v => `Ocean schools produce ${pct(v)} more for every boost they hold`,
    cost: v => `Every trait costs ${pct(v)} less`,
    oceanLevels: v => `Deepen and Nutrient Bed go ${v} levels past their cap`,
    pondLevels: v => `Richer Waters goes ${v} levels past its cap`,
    grassLevels: v => `Greener Blades goes ${v} levels past its cap`,
    marshLevels: v => `Varied Life goes ${v} levels past its cap`,
    milestones: () => `The next stretch of Vitality milestones opens`,
    fishGrowth: v => `Fish breed ${pct(v)} faster in the pond`,
    starvation: v => `Hungry fish starve ${pct(v)} slower`,
    pondCapacity: v => `The pond holds ${pct(v)} more`,
    burstLength: v => `Pond bursts last ${v} seconds longer`,
    burstCooldown: v => `Pond bursts come back ${pct(v)} sooner`,
    boostSlots: v => `Ocean schools can carry ${v} more boost${v === 1 ? "" : "s"}`,
    boostKeep: v => `+${pct(v)} chance a school leaves the boost it picked up for the next one`,
    deepOcean: v => `Deep ocean tiles produce ${times(v)}`,
    treeSlots: v => `Room for ${v} more growing tree${v === 1 ? "" : "s"}`,
    standSeconds: v => `Fully grown trees turn into old growth ${pct(v)} sooner`,
    forestShare: v => `Forest tiles get ${pct(v)} more from the forest beside them`,
    shelter: v => `Trees get ${pct(v)} more from the grass and ponds beside the forest`,
    grassNeighbor: v => `Grass gets ${pct(v)} more from the grass beside it`,
    matureGrass: v => `Fully grown grass is worth ${pct(v)} more`,
    rainStrength: v => `Weather is ${pct(v)} stronger`,
    marshWater: v => `The marsh stores ${pct(v)} more water`,
    floodCost: v => `Flooding the marsh costs ${pct(v)} less water`,
    dieback: v => `Marsh communities in the wrong water die back ${pct(v)} slower`,
    siltHold: v => `Marsh zones lose silt ${pct(v)} slower`,
    marshNeighbor: v => `The marsh boosts the tiles beside it ${pct(v)} more`,
    looseDepth: v => `The ice field holds ${pct(v)} more loose snow`,
    scour: v => `Wind scours away ${pct(v)} less loose snow`,
    pressStrength: v => `Pressing the ice field packs ${pct(v)} harder`,
    settle: v => `The ice field settles ${pct(v)} faster after a collapse`,
    collapseKeep: v => `Collapses lose ${pct(v)} less of the ice pack`,
    eventGap: v => `Reef events come ${pct(v)} more often`,
    settledSpeed: v => `Settled reef bonuses build up ${pct(v)} faster`,
    reefNeighbor: v => `Reefs boost the ocean beside them ${pct(v)} more`,
    fruitLength: v => `Fruiting boosts last ${v} seconds longer`,
    fruitStack: v => `Fruiting boosts stack ${v} more time${v === 1 ? "" : "s"}`,
    fruitReturn: v => `Fruiting a mushroom gives back ${pct(v)} more Spores`,
    sapShare: v => `Growing mushrooms eat ${pct(v)} less Biomass`,
    plantCost: v => `Mushrooms cost ${pct(v)} less to plant`,
    ...Object.fromEntries(Object.entries(PRESSURE_NAMES).map(([id, name]) =>
        [`${id}Cost`, v => `Traits cost ${pct(v)} less ${name} potential`])),
    ...Object.fromEntries(Object.entries(PRESSURE_NAMES).map(([id, name]) =>
        [`${id}Capacity`, v => `+${v} room on the ${name} meter`])),
};

const PER_TEXT = {
    pressure: (treeId) => `for every point of ${PRESSURE_NAMES[treeId]} pressure`,
    owned: (treeId) => `for every ${PRESSURE_NAMES[treeId]} trait evolved`,
    evolved: () => `for every trait evolved`,
    standing: () => `for every tree standing fully grown`,
};

const lowerFirst = (part) => part[0] === "+" || /^x\d/.test(part) ? part : part[0].toLowerCase() + part.slice(1);

function writeEffect(def, treeId) {
    const parts = [
        ...Object.entries(def.mods || {}),
    ].map(([key, value]) => EFFECT_TEXT[key] ? EFFECT_TEXT[key](value) : `${key} ${value}`);
    for (const [key, value] of Object.entries(def.scaled || {})) {
        parts.push(`${EFFECT_TEXT[key](value)} ${PER_TEXT[def.per](treeId)}`);
    }
    const joined = parts.map((part, index) => index ? lowerFirst(part) : part);
    const last = joined.pop();
    return (joined.length ? `${joined.join(", ")}${joined.length > 1 ? "," : ""} and ${last}` : last) + ".";
}


//    !!! FINDING A TRAIT !!!

// Flat id -> where the trait sits and its scaled cost, plus each tree's ids in layout order
const TRAIT_INDEX = {};
const TREE_TRAITS = {};
const TREE_ROWS = {};
for (const treeId in TREES) {
    TREE_TRAITS[treeId] = [];
    let baseRow = 0;
    const genBase = [];
    TREES[treeId].generations.forEach((generation, index) => {
        const ids = Object.keys(generation.traits);
        const depth = {};
        const depthOf = (id) => {
            if (depth[id] !== undefined) return depth[id];
            const sameGen = (generation.traits[id].requires || []).filter(parentId => generation.traits[parentId]);
            return (depth[id] = sameGen.length ? 1 + Math.max(...sameGen.map(depthOf)) : 0);
        };
        genBase.push(baseRow);
        for (const id of ids) {
            const def = generation.traits[id];
            if (!def.effect) def.effect = writeEffect(def, treeId);
            const cost = {};
            for (const pressureId in def.cost) cost[pressureId] = def.cost[pressureId] * (COST_SCALE[pressureId] || 1) * GENERATION_SCALE[index];
            TRAIT_INDEX[id] = { id, def, tree: treeId, generation: index, row: baseRow + depthOf(id), x: def.x, cost };
            TREE_TRAITS[treeId].push(id);
        }
        baseRow += 1 + Math.max(...ids.map(depthOf));
    });
    TREE_ROWS[treeId] = { rows: baseRow, genBase };
}

export const TRAIT_IDS = Object.keys(TRAIT_INDEX);
export const traitEntry = (id) => TRAIT_INDEX[id] || null;
export const traitDef = (id) => TRAIT_INDEX[id]?.def || null;
export const traitsIn = (treeId) => TREE_TRAITS[treeId] || [];
export const traitsInGeneration = (treeId, index) => Object.keys(TREES[treeId].generations[index].traits);
export const treeRows = (treeId) => TREE_ROWS[treeId];

export const traitParents = (id) => TRAIT_INDEX[id]?.def.requires || [];

export const treeLinks = (treeId) => traitsIn(treeId).flatMap(id => traitParents(id).map(parentId => [parentId, id]));

export const traitOwned = (id, s = evolutionState()) => !!(s.owned || {})[id];


//    !!! WHAT THE OWNED TRAITS ADD UP TO !!!

// Totals rebuild only when the owned set changes; scaled ones are read fresh
const SCALES = {
    owned: (treeId, totals) => totals.ownedIn[treeId] || 0,
    evolved: (treeId, totals) => totals.evolved,
};
export const registerScale = (name, read) => { SCALES[name] = read; };

let cached = null;

function ownedTotals(s) {
    const owned = s.owned || {};
    const count = Object.keys(owned).length;
    if (cached && cached.s === s && cached.owned === owned && cached.count === count) return cached;

    const totals = { s, owned, count, mods: {}, scaled: {}, ownedIn: {}, evolved: 0 };
    for (const id in owned) {
        const entry = TRAIT_INDEX[id];
        if (!owned[id] || !entry) continue;
        totals.evolved++;
        totals.ownedIn[entry.tree] = (totals.ownedIn[entry.tree] || 0) + 1;
        for (const key in entry.def.mods) {
            const value = entry.def.mods[key];
            totals.mods[key] = MULTIPLIED.has(key) ? (totals.mods[key] ?? 1) * value : (totals.mods[key] || 0) + value;
        }
        for (const key in entry.def.scaled) {
            (totals.scaled[key] = totals.scaled[key] || []).push({ value: entry.def.scaled[key], per: entry.def.per, tree: entry.tree });
        }
    }
    return (cached = totals);
}

const SCALE_SECONDS = 0.25;
const scaleCache = new Map();

function scaleOf(per, treeId, totals) {
    if (per !== "pressure") return SCALES[per] ? SCALES[per](treeId, totals) : 0;
    const now = performance.now() / 1000;
    const hit = scaleCache.get(treeId);
    if (hit && now - hit.at < SCALE_SECONDS) return hit.value;
    const value = SCALES.pressure ? SCALES.pressure(treeId) : 0;
    scaleCache.set(treeId, { at: now, value });
    return value;
}

export const ownedCount = (s = evolutionState()) => ownedTotals(s).evolved;

// What the owned traits add up to for one key, whether or not the layer is open
export function evolutionMod(key, s = evolutionState()) {
    const totals = ownedTotals(s);
    if (MULTIPLIED.has(key)) {
        let total = totals.mods[key] ?? 1;
        for (const part of totals.scaled[key] || []) total *= Math.pow(part.value, scaleOf(part.per, part.tree, totals));
        return total - 1;
    }
    let total = totals.mods[key] || 0;
    for (const part of totals.scaled[key] || []) total += part.value * scaleOf(part.per, part.tree, totals);
    return total;
}

// A bonus on top of 1 for other layers (multiplied keys return product minus 1)
export const traitBonus = (key) => evolutionOpen() ? evolutionMod(key) : 0;

// For the one-off effects the capstones and apex traits carry
export const traitHas = (id) => evolutionOpen() && traitOwned(id);


//    !!! PUSHING AN UPGRADE PAST ITS CAP !!!

// Upgrades traits can push past their cap; each level past it multiplies by gain, at a price of its own
export const PAST_CAP = {
    richerWaters: { key: "pondLevels", cap: 25, gain: 10 },
    greenerBlades: { key: "grassLevels", cap: 10, gain: 3 },
    keystone: { key: "marshLevels", cap: 8, gain: 10 },
    deepen: { key: "oceanLevels", cap: 20, gain: 10 },
    bed: { key: "oceanLevels", cap: 15, gain: 6 },
};

const CHALLENGE_LEVELS = {
    deepFreeze: { oceanLevels: 5 },
    blight: { grassLevels: 3 },
    redTide: { oceanLevels: 5, pondLevels: 5 },
    stagnation: { marshLevels: 5 },
    saltFlats: { pondLevels: 5, marshLevels: 3 },
    overgrowth: { grassLevels: 5 },
};

const challengeLevels = (key) => {
    const done = getLayerState("challenges")?.completed || {};
    return Object.keys(CHALLENGE_LEVELS).reduce((total, id) => total + (done[id] ? CHALLENGE_LEVELS[id][key] || 0 : 0), 0);
};

export const capOf = (id) => PAST_CAP[id].cap + Math.round(traitBonus(PAST_CAP[id].key)) + challengeLevels(PAST_CAP[id].key);
export const pastCapGain = (id, level) => Math.pow(PAST_CAP[id].gain, Math.max(0, level - PAST_CAP[id].cap));
export const pastCapNote = (id, level) => capOf(id) > PAST_CAP[id].cap
    ? ` Past level ${PAST_CAP[id].cap}, every level multiplies it by ${PAST_CAP[id].gain} (x${formatNumber(pastCapGain(id, level))} now).`
    : "";

export function extendUpgrade(id, def, pastCost) {
    const { cap } = PAST_CAP[id];
    const cost = def.cost;
    const text = def.description;
    Object.defineProperty(def, "max", { get: () => capOf(id), enumerable: true });
    def.cost = (s, level) => level < cap ? cost(s, level) : pastCost(level - cap);
    def.description = (s, level) => (typeof text === "function" ? text(s, level) : text) + pastCapNote(id, level);
    return def;
}


//    !!! WHAT A TRAIT COSTS !!!

const MOST_OFF = 0.75;

export function traitCost(id, s = evolutionState()) {
    const entry = TRAIT_INDEX[id];
    if (!entry) return {};
    const cost = {};
    for (const pressureId in entry.cost) {
        const off = Math.min(MOST_OFF, evolutionMod("cost", s) + evolutionMod(`${pressureId}Cost`, s));
        cost[pressureId] = Math.ceil(entry.cost[pressureId] * (1 - off));
    }
    return cost;
}

registerBoost("Evolution", (resourceId) => 1 + traitBonus(resourceId));
