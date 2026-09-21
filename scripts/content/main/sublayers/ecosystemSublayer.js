// ecosystemSublayer.js
//
// The Environment tree for biomes; each face opens with its unlock, then tier by tier

import { getLayerState } from "../../../core/state.js";
import { nodeBought } from "../../../core/nodes.js";
import { hexToPixel, HEX_DIRECTIONS } from "../../../utils/hex.js";

export const biomeOpen = (nodeId) => nodeBought("environment", nodeId);

// The six faces of the hexagon, so the canvas knows whether anything is on it yet
const BIOME_FACES = ["biomeWoodlands", "biomeAquatic", "biomeWetlands", "biomeIce", "biomeReef", "biomeFungi"];
const anyBiomeOpened = () => BIOME_FACES.some(biomeOpen);

// This is just for positioning the nodes so they look like a proper hexagon
const RING = 170;
const STEP = 170;
const [E, NE, NW, W, SW, SE] = [0, 1, 2, 3, 4, 5]; // Cardinal directions, makes it more readable

// Step 0 is the hexagon's face, further tiers of that tile type go outwards from it
function along(face, steps) {
    const at = hexToPixel(HEX_DIRECTIONS[face], RING);
    const length = Math.hypot(at.x, at.y);
    const scale = (length + STEP * steps) / length;
    return { x: Math.round(at.x * scale), y: Math.round(at.y * scale) };
}

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
    hidden: () => !biomeOpen(id),
});

// One tier past the face of the hexagon
const tier = (id, parent, title, color, face, steps, description) => ({
    kind: "sublayer",
    parent,
    title,
    color,
    position: along(face, steps),
    description,
    hidden: () => !biomeOpen(id),
});

export const ECOSYSTEM_VIEW = {
    name: "Ecosystem",
    color: "#6cc27a",
    canvasType: "drag",

    // Middle of the hexagon
    defaultView: { x: 0, y: 0 },

    overlay: () => (anyBiomeOpened() ? null : "Nothing has taken hold yet..."),

    nodes: {
        // Clockwise, starting in the top left
        biomeWoodlands: biome("biomeWoodlands", "Forest", "#3d9455", "green", NW),
        biomeAquatic:   biome("biomeAquatic", "Aquatic", "#3f9ad4", "blue", NE),
        biomeWetlands:  biome("biomeWetlands", "Wetlands", "#6f9e63", "green", E),
        biomeIce:       biome("biomeIce", "Ice", "#7fc4e2", "blue", SE),
        biomeReef:      biome("biomeReef", "Reef", "#37b3c6", "blue", SW),
        biomeFungi:     biome("biomeFungi", "Fungi", "#a06bc0", "green", W),

        // !!! WOODLAND SUBLAYERS !!!

        forest: tier("forest", "biomeWoodlands", "Forest", "#3d9455", NW, 1,
            "description here\n"),
        denseForest: tier("denseForest", "biomeWoodlands", "Dense Forest", "#0f621c", NW, 2,
            "description here as well\n"),

        // Aquatic is the only biome that opens two tiers at once, since the pond already exists
        pond: tier("pond", "biomeAquatic", "Pond", "#2f8fb5", NE, 1,
            "Still water, and the first thing to live in it.\n"),
        ocean: tier("ocean", "pond", "Ocean", "#3f9ad4", NE, 2,
            "Open water, past the pond.\n"),

        // WETLANDS SUBLAYERS
        marsh: tier("marsh", "biomeWetlands", "Marsh", "#6f9e63", E, 1,
            "Water that never settles. The marsh cycles between dry ground and flood."),
        swamp: tier("swamp", "marsh", "Swamp", "#436939", E, 2,
            "swamp description here"),

        // ICE SUBLAYERS
        iceField: tier("iceField", "biomeIce", "Ice Field", "#8fd0e8", SE, 1,
            "Snow that never melts. Press it hard enough and it turns to ice."),
        glacier: tier("glacier", "iceField", "Glacier", "#6aa8cc", SE, 2,
            "glacier description here"),

        // REEF SUBLAYERS
        reef: tier("reef", "biomeReef", "Reef", "#3fc0d0", SW, 1,
            "reef description here"),
        coralReef: tier("coralReef", "reef", "Coral Reef", "#e0736f", SW, 2,
            "coral reef description here"),

        // FUNGI SUBLAYERS
        mushroomGrove: tier("mushroomGrove", "biomeFungi", "Mushroom Grove", "#c4544c", W, 1,
            "mushroom grove description here"),
        fungalForest: tier("fungalForest", "mushroomGrove", "Fungal Forest", "#a06bc0", W, 2,
            "fungal forest description here"),
    },
};
