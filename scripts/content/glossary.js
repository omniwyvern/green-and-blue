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
    body: "What Adaptation Points turn into for each pressure: 25 points per potential, times"
        + " that pressure's modifier. Each pressure has its own meter with a cap, and Evolution"
        + " traits are bought by draining the meters they need.",
});
