// ecosystemSublayer.js
//
// Environment's tree of nodes. It's basically like the cores layer, but this one is for
// different terrain (types of tiles). Debating on renaming this to biomes but idk I'm lazy.
// When you unlock one on the cores layer, you start with the node your unlocked biome and
// the one you bought. There were 5 but you need 6 for a hexagon so now we got ice yay!

import { getLayerState } from "../../core/state.js";
import { hexToPixel, HEX_DIRECTIONS } from "../../utils/hex.js";

// Which of the cores nodes open them
const OPENED_BY = ["forest", "ocean", "marsh", "iceField", "reef", "mushroomGrove"];

const coreBought = (id) => !!getLayerState("cores").purchasedUpgrades[id];
const anyBiomeOpened = () => OPENED_BY.some(coreBought);

// This is just for positioning the nodes so they look like a proper hexagon
const RING = 170;
const STEP = 170;
// East, North East, North West, West, South West, South East (makes it easier on reading than numbers)
const [E, NE, NW, W, SW, SE] = [0, 1, 2, 3, 4, 5];

// Step 0 is the hexagon's face, further tiers of that tile type go outwards from it
function along(face, steps) {
    const at = hexToPixel(HEX_DIRECTIONS[face], RING);
    const length = Math.hypot(at.x, at.y);
    const scale = (length + STEP * steps) / length;
    return { x: Math.round(at.x * scale), y: Math.round(at.y * scale) };
}

// Gonna need changes later, but for now nodes here just start unlocked.
export function openBiome(...nodeIds) {
    const ecosystem = getLayerState("environment");
    for (const id of nodeIds) ecosystem.purchasedUpgrades[id] = 1;
}

const biome = (id, title, color, aura, face) => ({
    kind: "layer",
    title,
    color,
    aura,
    position: along(face, 0),
    description: `${title} is open. What grows out of it is bought from here.\n`,
    hidden: () => !coreBought(id),
});

export const ECOSYSTEM_VIEW = {
    name: "Ecosystem",
    color: "#6cc27a",
    canvasType: "drag",

    // Middle of the hexagon.
    defaultView: { x: 0, y: 0 },

    overlay: () => (anyBiomeOpened() ? null : "Nothing has taken hold yet..."),

    nodes: {
        // Clockwise, starting in the top left. Prefixed for readability and also two share a name with the biome.
        biomeForest:   biome("forest", "Forest", "#3d9455", "green", NW),
        biomeAquatic:  biome("ocean", "Aquatic", "#3f9ad4", "blue", NE),
        biomeWetlands: biome("marsh", "Wetlands", "#6f9e63", "green", E),
        biomeIce:      biome("iceField", "Ice", "#7fc4e2", "blue", SE),
        biomeReef:     biome("reef", "Reef", "#37b3c6", "blue", SW),
        biomeFungi:    biome("mushroomGrove", "Fungi", "#a06bc0", "green", W),


        // FOREST LAYER (it's not really a sublayer like the rest, methinks)
        // forest: {
        
        //}


        // AQUATIC SUBLAYERS
        pond: {
            kind: "sublayer",
            parent: "biomeAquatic",
            title: "Pond",
            color: "#2f8fb5",
            position: along(NE, 1),
            description: "Still water, and the first thing to live in it.\n",
            hidden: () => !coreBought("ocean"),
        },
        ocean: {
            kind: "sublayer",
            parent: "pond",
            title: "Ocean",
            color: "#3f9ad4",
            position: along(NE, 2),
            description: "The water opens out past what a bank can hold.\n",
            hidden: () => !coreBought("ocean"),
        },


        // WETLANDS SUBLAYERS
        // marsh: {}
        // swamp: {}


        // ICE SUBLAYERS
        // iceField: {}
        // glacier: {}


        // REEF SUBLAYERS
        // reef: {}
        // coralReef: {}


        // FUNGI SUBLAYERS
        // mushroomGrove: {}
        // fungalForest: {}

    },
};
