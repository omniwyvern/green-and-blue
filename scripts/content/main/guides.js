// guides.js
//
// Explanation popup for when you unlock a new layer. core/guides.js is what actually
// runs the stuff, this is just where the guides are stored.

import { registerGuide } from "../../core/guides.js";
import { getLayerState } from "../../core/state.js";

const unlockBought = (id) => !!getLayerState("cores").purchasedUpgrades[id];

registerGuide("cores-intro", {
    layer: "cores",
    title: "The Cores",
    body: `
        <p> stuff here </p>
    `,
});

registerGuide("world-intro", {
    layer: "world",
    title: "The World",
    when: () => !unlockBought("land"),
    body: `
        <p> The world has begun growing... </p>
    `,
});

registerGuide("world-map", {
    layer: "world",
    title: "The Map",
    order: 1,
    when: () => unlockBought("land"),
    body: `
        <p> The world has expanded! Unlock tiles with Green Essence. Something might be able to use these tiles... </p>
    `,
});

registerGuide("world-rain", {
    layer: "world",
    title: "Rain",
    order: 2,
    when: () => unlockBought("rain"),
    body: `
        <p> Clouds rain down upon the land, accelerating plant growth! Select the rain interaction \n</p>`
        + `icon from the drawer in the top right, then click the raincloud to spend blue essence and build up rain.`
        + `Once the meter is full, select a tile and click the raincloud to activate a downpour, speeding plant growth!`
    ,
});

registerGuide("world-transform", {
    layer: "world",
    title: "Changing the Ground",
    order: 3,
    when: () => unlockBought("environment"),
    body: `
        <p> stuff here </p>
    `,
});

registerGuide("environment-intro", {
    layer: "environment",
    title: "The Environment",
    body: `
        <p> stuff here </p>
    `,
});

registerGuide("pond-intro", {
    layer: "pond",
    title: "The Pond",
    body: `
        <p> stuff here </p>
    `,
});

registerGuide("pond-life", {
    layer: "pond",
    title: "Algae and Fish",
    order: 1,
    when: () => unlockBought("life"),
    body: `
        <p> stuff here </p>
    `,
});

registerGuide("grass-intro", {
    layer: "grass",
    title: "Grass",
    body: `
        <p> stuff here </p>
    `,
});

registerGuide("rain-intro", {
    layer: "precipitation",
    title: "Precipitation",
    body: `
        <p> stuff here </p>
    `,
});

registerGuide("evolution-intro", {
    layer: "evolution",
    title: "Evolution",
    body: `
        <p> stuff here </p>
    `,
});

registerGuide("evolution-cards", {
    layer: "evolution",
    subLayer: "cards",
    title: "Cards",
    order: 1,
    body: `
        <p> stuff here </p>
    `,
});
