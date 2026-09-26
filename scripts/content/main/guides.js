// guides.js
//
// Popups for newly unlocked layers; core/guides.js runs them

import { registerGuide } from "../../core/guides.js";
import { coreNodeBought } from "../../core/nodes.js";


registerGuide("cores-intro", {
    layer: "cores",
    title: "The Cores",
    body: `
        <p>You start with two cores: the Green Core and the Blue Core.</p>
        <p>The Green Core makes Green Essence. It grows on its own, and makes more at each growth stage.</p>
        <p>The Blue Core makes Blue Essence when you click it. It builds charge over time, and a
        full-charge click gives double.</p>
        <p>\nThis game isn't done! Later layers still need balancing.</p>
    `,
});

registerGuide("world-intro", {
    layer: "world",
    title: "The World",
    when: () => !coreNodeBought("land"),
    body: `
        <p>The world has started to grow...</p>
    `,
});

registerGuide("world-map", {
    layer: "world",
    title: "The Map",
    order: 1,
    when: () => coreNodeBought("land"),
    body: `
        <p>The world has grown! Unlock tiles with Green Essence. With enough room, something
        might find a use for them...</p>
    `,
});

registerGuide("world-rain", {
    layer: "world",
    title: "Rain",
    order: 2,
    when: () => coreNodeBought("rain"),
    body: `
        <p>Clouds are forming. Fill and release them on the Precipitation layer in the sidebar.
        The cloud in the corner shows how much stability the cloud has, and clicking it takes you to the Precipitation layer.</p>
        <p>Clicking on the small button above the cloud makes the rain begin falling. </p>
        <p>Rain falls on the tile selected here, so pick one first. While it rains, grass
        grows better and produces more.</p>
    `,
});

registerGuide("world-transform", {
    layer: "world",
    title: "Changing the Ground",
    order: 3,
    when: () => coreNodeBought("environment"),
    body: `
        <p>Tiles can now be turned into new kinds of terrain.</p>
        <p>To transform a tile, pick the interaction in the top right, select the main tile,
        then select any fodder tiles.</p>
        <p>Recipes and hints are in the Terrain sublayer. Hints only show the main tile.</p>
    `,
});

registerGuide("environment-intro", {
    layer: "environment",
    title: "The Environment",
    body: `
        <p>The world is more than just grass now.</p>
        <p>The Ecosystem tree is where you pick the world's direction. Buying a node on the Cores
        opens a face of the tree, and its upgrades are bought here.</p>
        <p>Grass and Precipitation now live under this layer, next to Terrain.</p>
        <p>This is a lie because the Ecosystem tree doesn't really do anything right now. Teehee.</p>
    `,
});

registerGuide("pond-intro", {
    layer: "pond",
    title: "The Pond",
    body: `
        <p>The pond makes Blue Essence on its own. Click it to stir up the water; Turbulence
        boosts Blue Essence and settles down over time.</p>
        <p>Something may move in soon...</p>
    `,
});

registerGuide("pond-life", {
    layer: "pond",
    title: "Algae and Fish",
    order: 1,
    when: () => coreNodeBought("life"),
    body: `
        <p>Life has appeared in the pond! Algae and fish live in the water now.</p>
        <p>Algae makes Green Essence and grows when the water is calm.</p>
        <p>Fish boost the pond's Blue Essence and only multiply when the water is rough. Fish eat
        algae, so too many fish will wipe out the algae and then starve.</p>
        <p>Together they make Biomass, which boosts both Green and Blue Essence. The closer the two
        populations are, the more you get, so aim for 50/50 on the top bar.</p>
    `,
});

registerGuide("ocean-intro", {
    layer: "aquatic",
    subLayer: "ocean",
    title: "The Ocean",
    body: `
        <p>The ocean is a network of regions. Each region has one current leading out of it, and
        you choose where it goes. Schools of fish follow the currents.</p>
        <p>The ocean ticks once a minute. Each tick, every school pays out for its region, moves
        along the current, and picks up any boost waiting in the new region. Boosts wait until a
        school collects them, then last a few ticks.</p>
        <p>After each tick, a current leading out of a few regions will change. Make sure to 
        correct the currents to flow where you want them to.</p>
        <p>Regions can be upgraded one at a time, so where your schools spend their time matters.
        Ocean tiles on the map add regions and speed up the ticks, but only your largest connected
        body of ocean counts, and coastline cuts into the bonus.</p>
    `,
});

registerGuide("grass-intro", {
    layer: "grass",
    title: "Grass",
    body: `
        <p>Plant your first grass on the world map. It grows through stages, and once mature it
        spreads to a nearby tile and starts over.</p>
        <p>Grass multiplies all your Green Essence, and each grass tile gives its neighbors a
        tenth of that boost. Rain on grass does the same for Blue Essence while the ground stays
        wet. Wetter ground means a bigger boost.</p>
        <p>Vitality upgrades grass, among other things. You get it by giving up Green Core growth levels or when
        grass spreads. You get bonuses based on the most Vitality you've ever had, and you can
        also spend it on upgrades.</p>
    `,
});

registerGuide("rain-intro", {
    layer: "precipitation",
    title: "Precipitation",
    body: `
        <p>Hold the bar to charge the cloud. The band rises while you hold and falls when you let
        go. Charge only builds while the band covers the mark, and the mark moves up as the charge
        does, so it gets harder as you go.</p>
        <p>Holding drains Stability, which comes back when you let go. If it runs out, the cloud
        bursts early and only drops part of what it held.</p>
        <p>Heavier rain gives the tile much more, but leaves much more water behind. Wet ground
        gets very little from the next cloud.</p>
    `,
});

registerGuide("adaptation-intro", {
    layer: "adaptation",
    title: "Adaptation",
    body: `
        <p>Adapting resets everything that grows, but the world remembers its shape. The terrain
        stays, except for water, snow, and ponds. The Cores and their upgrades stay too.</p>
        <p>Mature grass gives the most points. The more kinds of tile you have, and the more even
        their numbers, the bigger the multiplier. It grows fast, so a varied map beats a big one.</p>
        <p>Adaptation Points are mostly spent on cards.</p>
    `,
});

registerGuide("adaptation-cards", {
    layer: "adaptation",
    subLayer: "cards",
    title: "Cards",
    order: 1,
    body: `
        <p>Spend Adaptation Points on draws. Each draw shows three cards and you keep one. Each
        banner covers one layer and has its own prices, so drawing a lot from one doesn't make
        the others cost more.</p>
        <p>Three copies of a card merge into one of the next level, which adds 30% to its effect.</p>
        <p>Cards only work once they're equipped and your loadout is locked. It stays locked
        until you adapt again.</p>
        <p>Some cards give a bonus combo when equipped together.</p>
    `,
});

registerGuide("forest-intro", {
    layer: "woodland",
    title: "The Forest",
    body: `
        <p>Trees grow in slots on the ground. More woodland tiles on the map means more slots.</p>
        <p>A tree grows on its own and stops at each stage to let you pick one of two ways to grow.
        Each choice shifts its Height, Branches, and Roots, and most trade speed or final value for
        stats.</p>
        <p>A tree's final stats decide what kind of tree it becomes, and each kind helps the whole
        forest in a different way. A finished tree stands for a while, then becomes old growth.
        Old growth is permanent, and it sets what every woodland tile on the map produces.</p>
        <p>Ponds and grass next to woodland make trees grow faster.</p>
    `,
});

registerGuide("challenges-intro", {
    layer: "challenges",
    title: "Ecology",
    body: `
        <p>You can run one challenge at a time. Each one resets some progress, adds restrictions,
        and usually boosts something.</p>
        <p>Finishing a challenge doesn't reset anything. It gives you a permanent boost and unlocks
        something on another layer. Leaving early resets again and gives you nothing.</p>
    `,
});

registerGuide("evolution-intro", {
    layer: "evolution",
    title: "Evolution",
    body: `
        <p>You now earn Adaptation Points over time, without adapting.</p>
        <p>Each of the six terrain families puts environmental pressure on what lives there. The
        meters at the bottom hold potential for each pressure. Tap the button under a meter to pour
        the Adaptation Points you earn into it, and tap it again to bank them instead. Whatever a meter
        can't hold is banked.</p>
        <p>25 earned Adaptation Points make one potential, adjusted by that pressure. Holding the button
        also turns banked points into potential, but at a quarter of the rate.</p>
        <p>Each pressure has its own trait tree, which you click the pressure's meter to open. Some traits need more
        than one kind of potential. Hover a trait to see which meters it uses, and hold it to fill
        it from them.</p>
        <p>A new generation of traits opens once you own enough from the one before. A meter always has
        room for the priciest trait that's open, plus spare room that doubles with each generation.</p>
        <p>Each branch ends in a capstone with a special effect. Get all three capstones in a tree
        to open its apex trait.</p>
    `,
});

registerGuide("marsh-intro", {
    layer: "wetlands",
    subLayer: "marsh",
    title: "The Marsh",
    body: `
        <p>The marsh is split into zones. Each zone cycles through the same stages: dry, saturated,
        flooded, receding, and dry again. What it pays depends on the stage: Vitality when dry,
        Biomass when saturated, Blue Essence and silt when flooded, and the fastest growth while
        receding.</p>
        <p>Zones leak into each other, so if left alone they all end up in the same stage, which
        pays the least. Each extra stage running at the same time multiplies everything the marsh
        makes.</p>
        <p>Stored water is how you control it, and there's never much. A full meter floods the whole
        marsh once, or one zone with most of the meter left over, and it refills slowly. Releasing
        water raises the whole marsh, which pushes zones into sync. Sluice gates let you raise a
        single zone to pull them apart again, but you can only afford one at a time.</p>
        <p>Each plant community wants a certain average wetness: wet meadow on drier ground, sedge
        in the middle, and reeds in standing water. If a zone is kept outside that range, something
        better suited takes over. This is based on how the zone is kept over a long time, not a
        single cycle. Keep a zone steady long enough and it matures: tussock fen on the dry side,
        cattail marsh on the wet side, and fen carr at the end of both.</p>
        <p>Nothing deeper can grow until there's silt underneath. Silt only settles out of standing
        water that plants are slowing down, so reeds are worth keeping even though they pay less.</p>
    `,
});

registerGuide("ice-field-intro", {
    layer: "ice",
    subLayer: "iceField",
    title: "The Ice Field",
    body: `
        <p>Snow piles up on the field even when you're away. The drift only holds so much. Wind
        blows away anything over the limit, plus a little off the top, so unused snow is wasted.</p>
        <p>All you do here is press. Each press compacts the pack and then shovels on fresh snow.
        Nothing happens between presses.</p>
        <p>What a press works on depends on the pressure meter. Each step has its own window:
        Fresh to Packed needs very little, Packed to Dense needs more, and Dense to Firn and Firn to
        Ice need more still. The windows don't overlap, so only one step is worked at a time.</p>
        <p>A press works the step in its window at full strength, and the step above it at a
        quarter. Anything higher is left alone, so you'll need to drop back to the lower windows
        to let the upper layers catch up.</p>
        <p>Compacting loses snow. Only a fifth of each step makes it to the next layer, and that
        adds up, so one Ice takes hundreds of Fresh Snow.</p>
        <p>Pressing harder uses more snow from the drift. Above about three-fifths of the gauge, it
        also knocks Fresh Snow off the top of the pack.</p>
        <p>Pressure drains on its own, faster the higher it is. Low windows are easy to hold, but
        the Ice window near the top takes steady clicking. Go past the last window and the pack
        breaks: you lose some of it, your streak resets, and it works slower until it settles.</p>
        <p>Purity is the multiplier. It measures how much of the pack has been turned into more
        than snow, so a small, refined pack earns more than a big, unworked one.</p>
    `,
});

registerGuide("reef-intro", {
    layer: "reef",
    subLayer: "reef",
    title: "The Reef",
    body: `
        <p>The reef is a stretch of seabed with a few sites marked out, and more open over time.
        Click an empty site to place a piece: small, medium, or large rocks, and kelp later on.
        Drag or scroll sideways once the reef gets wider than the screen. Click a piece to replace,
        remove, or modify it. You get back everything it cost, so rearranging is free.</p>
        <p>Modifying a rock gives it traits: Crevice, Sheltered, Exposed, and Algae. Small rocks
        hold one, medium two, and large three. Algae costs Green Essence and the rest cost Blue.
        A rock can't be both Sheltered and Exposed.</p>
        <p>Each species you unlock in the Ocean comes to the reef wanting certain habitat, like
        "2 small crevices" or "1 medium sheltered rock". Sizes have to match, and each trait on a
        rock can only meet one need. The book in the corner lists every fish, what it wants, and
        how close you are.</p>
        <p>A species with all its needs met is settled, and settled fish make reef tiles worth more.
        Each fish also has its own boost that grows the longer it stays settled, and resets if it
        doesn't.</p>
        <p>Sometimes a species has an event and wants extra for a while. Meet the extra needs and
        its event boost turns on until you stop or the event ends. Keep an event going long enough
        and it counts as answered. Answering events unlocks more of the reef: new pieces, new traits,
        and room for more events at once.</p>
    `,
});
