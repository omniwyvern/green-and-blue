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
        <p> The very beginning. You start with two cores: The Green Core, and the Blue Core.\n\n</p>`
        + `<p>The Green Core produces Green Essence. It grows on its own, and increases production as it grows to higher growth stages.\n\n</p>`
        + `<p>The Blue Core produces Blue Essence. It builds up charge, which increases the Blue Essence gained by clicking it. `
        + `A full-charge click gives double the Blue Essence.</p>`
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
        <p>Clouds gather over the world now. Filling one and letting it go are both done on the
        Precipitation page, over in the sidebar - the cloud in the corner here only says how full
        it is, and clicking it takes you there.</p>
        <p>The tile it falls on is the one selected here, so pick that first. Rain temporarily improves
        whatever is growing under it, and adds to what the tile produces while it falls.</p>
    `,
});

registerGuide("world-transform", {
    layer: "world",
    title: "Changing the Ground",
    order: 3,
    when: () => unlockBought("environment"),
    body: `
        <p> Transforming tiles! this is the end of the actual coded/balanced stuff. Transforming </p>
        <p> tiles is just "select a main tile then adjacent fodder tiles to make a new type of tile."</p>
        <p> Different tiles do different things, and you only get the main component of a tile's recipe.</p>
    `,
});

registerGuide("environment-intro", {
    layer: "environment",
    title: "The Environment",
    body: `
        <p> Storage for some of the things! this part isn't really that balanced and also past where the coded stuff is </p>
    `,
});

registerGuide("pond-intro", {
    layer: "pond",
    title: "The Pond",
    body: `
        <p> The pond passively produces Blue Essence. You can click to increase the water's turbulence, 
        which passively decreases over time. High turbulence increases Blue Essence production.</p>
        <p>Something may inhabit this space soon... </p>
    `,
});

registerGuide("pond-life", {
    layer: "pond",
    title: "Algae and Fish",
    order: 1,
    when: () => unlockBought("life"),
    body: `
        <p> Life has sprung up in the pond! Algae and fish both inhabit the water now. </p>
        <p> Algae passively produces Green Essence, and grows in low turbulence. </p>
        <p> Fish increase the Blue Essence production of the pond, and only grow in numbers in high turbulence.
         Fish eat algae, so too many of them will destroy your algae population and starve the fish.</p>
        <p> These two organisms make biomass, which boosts both Green and Blue Essence. More biomass is produced
        based on how close the populations are in number; getting the top bar to 50%/50% gives you the most. </p>
    `,
});

registerGuide("ocean-intro", {
    layer: "aquatic",
    subLayer: "ocean",
    title: "The Ocean",
    body: `
        <p>The open water spreads across the world. Regions of it are joined by currents, with every region having
        one current flowing to another region, indicated with an arrow.</p>
        <p>Once a minute, the whole ocean activates. On that tick, every school of fish produces resources from
        where it stands, then rides its current to the next region and picks up whatever boost
        was drifting there. A boost sits on a region until something swims through it, and lasts
        the school a couple of ticks after that.</p>
        <p>Only one school can be in a region at one time. If two would arrive in the same one, a warning sits
        on it beforehand and only one of them makes the trip.</p>
        <p>Clicking a region alternates between its own page and the page of the school standing
        on it, so the same spot on the map gets you back and forth between the two. Redirect the
        current lays every place that region is allowed to send its water out on the map in gold,
        and clicking one of those paths sets it. Clicking the open water clears the selection and
        shows what the next tick is worth altogether.</p>
        <p>Regions are improved with Blue Essence. A school's own skills are grown with Evolution
        Points instead, the same points the cards are drawn with, so putting levels into a fish
        means not drawing. Where a skill boosts a resource it boosts every source of it you have,
        not only the water.</p>
        <p>Schools are not bought from in here. They arrive from elsewhere in the world, and swim
        into whatever open region will take them.</p>
        <p>This map is only here while the world has ocean on it. The first ocean opens the five
        regions it starts with, and every ocean after that opens one more, as well as making
        everything the schools produce worth a little more. Ponds are the other way to spend the
        same water, and feed the pond's own capacity instead.</p>
    `,
});

registerGuide("grass-intro", {
    layer: "grass",
    title: "Grass",
    body: `
        <p> Grass grows across the world. Seed the first grass with both essences on the world map, and it will grow through maturity stages.
        Once it reaches maturity, it will spread to a nearby tile and return to the seed stage. Grass doesn't produce Green Essence itself - every tile of it multiplies all the Green Essence you make, and hands a tenth of that again to each producing tile it neighbours, stacking per tile of grass. Rain on grass does the same for Blue Essence for as long as the ground stays wet. </p>
        <p> Grass is improved through Growth, which is acquired through either sacrificing Green Core growth levels, or by grass spreading to
        other tiles. You get bonuses based on your highest reached value of growth, however you can also spend it on upgrades. Some of the bonuses
        are new types of grass, which have different stats. </p>
    `,
});

registerGuide("rain-intro", {
    layer: "precipitation",
    title: "Precipitation",
    body: `
        <p>Hold the bar to charge the cloud. The band rises while you hold it and falls when you
        do not, and charge only builds while the band is covering the mark, which sits at
        whatever the charge already is, so it climbs away from you as you fill it.</p>
        <p>Stability drains while you hold down, and comes back when you stop. Run it
        out and the cloud tears itself open early, giving a fraction of what it was holding.</p>
        <p>A heavier intensity is worth far more to the tile but leaves far more water behind,
        and ground that is already wet takes very little from the next cloud. So the same tile
        can be drizzled on over and over, or drowned and turned into something else.</p>
    `,
});

registerGuide("evolution-intro", {
    layer: "evolution",
    title: "Evolution",
    body: `
        <p> Don't worry too much about this. You can draw some cards but there are too many </p>
        <p> and many are out of date. Some still work though.</p>
        <p> Evolution resets living things for evolution points, which you can spend on drawing cards. Honestly,
        this is mainly useful for resetting grass so that you can let it spread for growth again. </p>
        <p> Also for some of a later thing's unlocks. But don't worry too much about that til' this is reworked. </p>
    `,
});

registerGuide("evolution-cards", {
    layer: "evolution",
    subLayer: "cards",
    title: "Cards",
    order: 1,
    body: `
        <p> These cards modify various things. But I have too many and their cost scales bad </p>
        <p> teehee </p>
    `,
});
