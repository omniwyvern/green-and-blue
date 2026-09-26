// glossary.js
//
// The terms the info button lists; core/guides.js registers them

import { registerTerm } from "../core/guides.js";
import { layerUnlocked } from "../core/state.js";

const anyUnlocked = (...layerIds) => layerIds.some(layerUnlocked);

const listOf = (...names) => names.length <= 2
    ? names.join(" and ")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

// The pond opens first and the ocean comes with the Aquatic layer that absorbs it
const biomassSources = () => listOf(
    ...(layerUnlocked("pond") ? ["the Pond"] : []),
    ...(layerUnlocked("aquatic") ? ["the Ocean"] : []),
);

registerTerm("greenEssence", {
    resource: "greenEssence",
    order: 0,
    body: "One of the two main resources, made by most layers. Almost everything costs it.",
});

registerTerm("blueEssence", {
    resource: "blueEssence",
    order: 1,
    body: "One of the two main resources, made by most layers. Some things cost it along with"
        + " Green Essence.",
});

registerTerm("biomass", {
    resource: "biomass",
    order: 2,
    when: () => anyUnlocked("pond", "aquatic"),
    body: () => `Made by ${biomassSources()}. Multiplies all Green and Blue Essence production.`,
});

registerTerm("vitality", {
    resource: "vitality",
    order: 3,
    when: () => layerUnlocked("grass"),
    body: "Gained when grass spreads or by giving up a Green Core growth stage. Spent on some"
        + " upgrades, and the most you've ever had unlocks milestones.",
});

registerTerm("adaptationPoints", {
    resource: "adaptationPoints",
    order: 4,
    when: () => layerUnlocked("adaptation"),
    body: "Gained by adapting, which resets what has grown for points based on mature tiles."
        + " Spent on card draws.",
});

registerTerm("environmentalPressure", {
    term: "Environmental Pressure",
    short: "Pressure",
    order: 5,
    when: () => layerUnlocked("evolution"),
    body: "How hard the terrain pushes on what lives there. There are six, one per terrain"
        + " family, and more advanced tiles add more. It sets how well Adaptation Points convert"
        + " into that potential, from 0 with none of that terrain up to 6 with lots of it.",
});

registerTerm("evolutionaryPotential", {
    term: "Evolutionary Potential",
    short: "Potential",
    order: 6,
    when: () => layerUnlocked("evolution"),
    body: "What Adaptation Points turn into for each pressure: 25 earned points per potential, times"
        + " that pressure's modifier, and a quarter of that for banked points. Each pressure has its"
        + " own meter with a cap, and Evolution"
        + " traits are bought by draining the meters they need.",
});

registerTerm("population", {
    term: "Population",
    order: 7,
    when: () => layerUnlocked("settlement"),
    body: "How big a settlement is. Each point of population stands for many people, and each one works a"
        + " job or a project. It grows slowly on spare food, stops at the settlement's shelter, and shrinks"
        + " when the food store runs empty.",
});

registerTerm("food", {
    resource: "food",
    order: 8,
    when: () => layerUnlocked("settlement"),
    body: "Gathered and hunted. Each population eats 0.1 a second. Only what's left over feeds growth,"
        + " and the land only has room for so many gatherers and hunters: a real surplus is hard to come by.",
});

registerTerm("water", {
    term: "Water",
    order: 9,
    when: () => layerUnlocked("settlement"),
    body: "Each population drinks 0.1 a second. Springs and wet land supply a little, Water Carriers bring"
        + " the rest, and what's spare is stored. When the store runs dry, everyone works worse and growth"
        + " all but stops.",
});

registerTerm("shelter", {
    term: "Shelter",
    order: 10,
    when: () => layerUnlocked("settlement"),
    body: "How much population a settlement has room for. Building shelter raises it, up to what stone-age"
        + " know-how can hold together.",
});

registerTerm("materials", {
    term: "Materials",
    order: 11,
    when: () => layerUnlocked("settlement"),
    body: "Sticks, stone, bone and hide. People at home pick a little up, more where there's wood around,"
        + " and expeditions bring back far more. Every expedition needs some to set out. A settlement can only"
        + " store so much, more with some projects, discoveries and innovations.",
});

registerTerm("expedition", {
    term: "Expedition",
    order: 12,
    when: () => layerUnlocked("settlement"),
    body: "A group sent out from a settlement along a route on the world map and back again. They carry"
        + " back food and materials from the land they cross, and learn discoveries that land teaches,"
        + " whatever kind of settlement they came from.",
});
