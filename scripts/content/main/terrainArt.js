// terrainArt.js
//
// All the art for different tiles. World puts it on a tile, environment layer puts it in transformation recipes.
// Every tile is one <svg> on a 0 0 40 40 box, sized by whatever it's used in, and colored from stylesheet

import { TERRAIN } from "./worldMap.js";

const svg = (kind, contents) =>
    `<svg class="tile-terrain terrain-art-${kind}" viewBox="0 0 40 40" aria-hidden="true">${contents}</svg>`;

// Water ripple for most water
const ripple = (x, y, width) =>
    `<path class="terrain-ripple" d="M${x} ${y} q${width / 4} -2 ${width / 2} 0 t${width / 2} 0"/>`;

// Single tree for forest
const tree = (x, y, scale) => `
    <g class="terrain-tree" transform="translate(${x} ${y}) scale(${scale})">
        <rect class="terrain-trunk" x="-1.4" y="-3" width="2.8" height="6" rx="1"/>
        <path class="terrain-canopy" d="M0 -22 L7 -11 L-7 -11 Z"/>
        <path class="terrain-canopy" d="M0 -16 L8.5 -4 L-8.5 -4 Z"/>
        <path class="terrain-canopy" d="M0 -10 L10 3 L-10 3 Z"/>
    </g>`;

// Crest (for open water, i.e. ocean tiles)
const crest = (x, y, width, height) =>
    `<path class="terrain-crest" d="M${x} ${y} L${x + width / 2} ${y - height} L${x + width} ${y} Z"/>`;

// Sedges are the funny round grass guys in marshes and stuff.
const sedge = (x, y, scale) => `
    <g class="terrain-sedge" transform="translate(${x} ${y}) scale(${scale})">
        <path d="M0 0 C-1 -4 -2 -6 -4.2 -9"/>
        <path d="M0 0 C0 -4 0 -7 0.4 -10.6"/>
        <path d="M0 0 C1.4 -4 2.6 -6 4.4 -8.6"/>
    </g>`;

// Dead tree for the swamp
const deadTree = (x, y, scale) => `
    <g class="terrain-deadwood" transform="translate(${x} ${y}) scale(${scale})">
        <path d="M0 0 C-0.7 -6 0.9 -10 0 -16.5"/>
        <path d="M0.3 -11 C2.5 -12.2 4 -13.6 5.6 -16.6"/>
        <path d="M0 -13.6 C-2 -15 -3.4 -15.9 -5.6 -17.2"/>
        <path d="M0.2 -7 C-1.8 -8 -2.9 -9 -4.2 -10.6"/>
    </g>`;


const sway = (x) => `class="terrain-sway" style="animation-delay: -${(x * 0.41).toFixed(2)}s"`;

// Coral, like the funny tree-looking kind (several colors)
const coralBranch = (x, y, scale, variant) => `
    <g transform="translate(${x} ${y}) scale(${scale})">
        <g ${sway(x)}>
            <g class="terrain-coral terrain-coral-${variant}">
                <path d="M0 0 L0 -5.5"/>
                <path d="M0 -5.5 L-4 -10.5 M-4 -10.5 L-6.4 -13.6 M-4 -10.5 L-2.2 -14.2"/>
                <path d="M0 -5.5 L4 -10 M4 -10 L6.2 -13.4 M4 -10 L2.4 -13.8"/>
            </g>
        </g>
    </g>`;

// Coral fan, the round guys in reefs
const coralFan = (x, y, scale) => `
    <g transform="translate(${x} ${y}) scale(${scale})">
        <g ${sway(x)}>
            <path class="terrain-fan-blade" d="M0 0 C-8.5 -3.5 -8.5 -12.5 0 -15.5 C8.5 -12.5 8.5 -3.5 0 0 Z"/>
            <path class="terrain-fan-rib" d="M0 -1.5 L0 -13.5 M-3.2 -3.5 L-4.8 -11 M3.2 -3.5 L4.8 -11"/>
        </g>
    </g>`;

// Coral googling be coming in handy (brain coral is the lumpy dome).
const brainCoral = (x, y, scale) => `
    <g class="terrain-brain" transform="translate(${x} ${y}) scale(${scale})">
        <path class="terrain-brain-body" d="M-6.4 0 a6.4 5.4 0 0 1 12.8 0 Z"/>
        <path class="terrain-brain-line" d="M-4.6 -1.7 q2.3 -1.9 4.6 0 t4.6 0"/>
        <path class="terrain-brain-line" d="M-3.4 -4 q1.7 -1.7 3.4 0 t3.4 0"/>
    </g>`;

// Table coral, the plate on a stalk.
const tableCoral = (x, y, scale) => `
    <g class="terrain-table" transform="translate(${x} ${y}) scale(${scale})">
        <rect class="terrain-table-stem" x="-1.2" y="-6.4" width="2.4" height="6.8" rx="1"/>
        <ellipse class="terrain-table-top" cx="0" cy="-6.8" rx="7" ry="2.3"/>
    </g>`;

// Sea itself is one drawing for the whole reef tree.
const SURFACE = `
    <g class="terrain-surface">
        ${ripple(4, 9, 15)}
        ${ripple(21, 14, 15)}
    </g>`;

// The floor that the reefs are built off of.
// I can't get it to properly cover the bottom of the screen so it cuts off a bit above it
const SEABED = (top) => `
    <path class="terrain-rock" d="M0 40 L0 ${top + 4} C6 ${top + 1.5} 13 ${top} 20 ${top}
        C27 ${top} 34 ${top + 1.5} 40 ${top + 4} L40 40 Z"/>`;

// Single mushroom
const mushroom = (x, y, scale) => `
    <g class="terrain-mushroom" transform="translate(${x} ${y}) scale(${scale})">
        <rect class="terrain-stalk" x="-1.7" y="-6.5" width="3.4" height="7" rx="1.5"/>
        <path class="terrain-cap" d="M-7.2 -6 a7.2 5.8 0 0 1 14.4 0 Z"/>
        <circle class="terrain-spot" cx="-3.2" cy="-8.2" r="1.2"/>
        <circle class="terrain-spot" cx="1.4" cy="-9.6" r="1"/>
        <circle class="terrain-spot" cx="4.2" cy="-7.4" r="0.9"/>
    </g>`;

// Beeg mushroom for the fungal forest.
const tallCap = (x, y, scale) => `
    <g class="terrain-tallcap" transform="translate(${x} ${y}) scale(${scale})">
        <rect class="terrain-stalk" x="-1.6" y="-17" width="3.2" height="17.5" rx="1.5"/>
        <path class="terrain-cap" d="M-8.6 -16.4 a8.6 5.6 0 0 1 17.2 0 Z"/>
        <path class="terrain-gill" d="M-7 -16.2 L7 -16.2"/>
    </g>`;

export const TERRAIN_ART = {
    // Bare ground, this is only needed to show it for recipes.
    bare: svg("bare", `
        <ellipse class="terrain-soil" cx="20" cy="26" rx="13" ry="4.5"/>
        <path class="terrain-clod" d="M12 25 q3 -3 6 -0.5"/>
        <path class="terrain-clod" d="M23 26 q3 -3 6 -0.5"/>`),

    // Water tile, just a component of other tiles really.
    water: svg("water", `
        <ellipse class="terrain-pool" cx="20" cy="23" rx="12" ry="7"/>
        ${ripple(13, 21, 14)}
        ${ripple(12, 26, 16)}`),

    // Pond. it has reeds and a little outline so it's NOT the water tile I promise.
    pond: svg("pond", `
        <ellipse class="terrain-bank" cx="20" cy="23" rx="16" ry="10"/>
        <ellipse class="terrain-pool" cx="20" cy="23" rx="12.5" ry="7.2"/>
        ${ripple(12, 20, 15)}
        ${ripple(11, 26, 17)}
        <path class="terrain-reed" d="M32 24 C32 19 31 17 30.5 13.5"/>
        <path class="terrain-reed" d="M34.5 25 C35 21 35 19 35.5 16"/>`),

    // Snow, it's like the water tile. Just used as a component.
    snow: svg("snow", `
        <path class="terrain-snow" d="M2 31 C6 25.5 12 24 18 25.6 C23 27 27 24.6 32 25.2 C35.4 25.6 37 27.6 38 31 Z"/>
        <path class="terrain-snow-lit" d="M7 28.6 C10.5 26 14.5 25.8 18 27 C22 28.4 26 27 30 27.4 C31.6 27.6 32.6 28.2 33.4 29.2 Z"/>
        <circle class="terrain-flake" cx="10" cy="13" r="1.2"/>
        <circle class="terrain-flake" cx="20.5" cy="9" r="1"/>
        <circle class="terrain-flake" cx="29.5" cy="14" r="1.1"/>
        <circle class="terrain-flake" cx="24" cy="17.5" r="0.8"/>`),

    // Ocean (the tile background is the tile, so these are just choppy water crest thingies)
    ocean: svg("ocean", `
        ${crest(5, 13, 9, 4.5)}
        ${crest(21, 11, 10, 5)}
        ${crest(11, 21, 10, 5)}
        ${crest(27, 21, 8, 4)}
        ${crest(3, 30, 9, 4.5)}
        ${crest(18, 31, 10, 5)}
        ${crest(31, 31, 6.5, 3.2)}`),

    // Deep ocean has a lot of elements because it makes it look more distinct
    "deep-ocean": svg("deep-ocean", `
        <ellipse class="terrain-deep" cx="20" cy="20" rx="18" ry="18"/>
        <ellipse class="terrain-deep" cx="20" cy="20.3" rx="14.5" ry="14.2"/>
        <ellipse class="terrain-deep" cx="20" cy="20.6" rx="11" ry="10.8"/>
        <ellipse class="terrain-deep" cx="20" cy="21" rx="7.5" ry="7.2"/>
        <ellipse class="terrain-deep terrain-deep-core" cx="20" cy="21.3" rx="4.5" ry="4.2"/>
        ${crest(17, 8, 8, 4)}
        ${crest(3, 12, 8, 4)}
        ${crest(29, 13, 8, 4)}
        ${crest(7, 24, 8, 4)}
        ${crest(24, 27, 8, 4)}
        ${crest(6, 32, 7, 3.4)}
        ${crest(26, 33.5, 7, 3.4)}
        <circle class="terrain-glint" cx="15.5" cy="17" r="0.9"/>
        <circle class="terrain-glint" cx="25" cy="26" r="0.75"/>
        <circle class="terrain-glint" cx="22.5" cy="14" r="0.6"/>
        <circle class="terrain-glint" cx="13" cy="25.5" r="0.7"/>
        <circle class="terrain-glint" cx="27" cy="19.5" r="0.55"/>
        <circle class="terrain-glint" cx="18" cy="29" r="0.65"/>`),

    // Reef, it's just shallow rocks on the surface with weeds
    reef: svg("reef", `
        <path class="terrain-rock" d="M1 38 C3 26 8 18.5 13.5 17 C19 18.5 22.5 26 24 38 Z"/>
        <path class="terrain-rock terrain-rock-far" d="M21 38 C23 28 27 23 31.5 22 C35.5 23.5 38.5 30 39 38 Z"/>
        <path class="terrain-weed" d="M10 30 C8 25.5 10 22 8.6 17.5"/>
        <path class="terrain-weed" d="M15 31 C17.4 26.5 16 23.5 17.4 19"/>
        <path class="terrain-weed" d="M30.5 31 C29 27 30.4 24.5 29.6 21"/>
        <path class="terrain-weed" d="M34 32 C35.6 29 34.8 27 35.6 24.5"/>
        ${SURFACE}`),

    // Coral reef, same as the reef but (surprisingly!) there's coral now. No variety to make great reef distinct.
    "coral-reef": svg("coral-reef", `
        ${SEABED(28)}
        ${coralBranch(10.5, 33.5, 1.05, "a")}
        ${coralBranch(21, 31, 0.92, "a")}
        ${coralBranch(30.5, 33, 1, "a")}
        ${SURFACE}`),

    // Great reef, it has tons of variety of coral.
    "great-reef": svg("great-reef", `
        ${SEABED(24.5)}
        <path class="terrain-weed" d="M4 34 C2.6 30 4 27.5 3 24"/>
        <path class="terrain-weed" d="M36.5 34 C37.9 30.5 36.5 28 37.5 24.5"/>
        ${tableCoral(27.5, 29.5, 0.85)}
        ${coralFan(6.5, 34.5, 0.72)}
        ${coralBranch(13, 30, 0.92, "a")}
        ${brainCoral(20.5, 28, 0.95)}
        ${coralBranch(34, 34.5, 0.8, "b")}
        ${coralBranch(23.5, 34, 0.72, "c")}
        ${SURFACE}`),

    // Marsh, it's pools with some sedges.
    marsh: svg("marsh", `
        <ellipse class="terrain-murk" cx="14.5" cy="27" rx="11" ry="5"/>
        <ellipse class="terrain-murk" cx="29" cy="20.5" rx="7" ry="3.4"/>
        ${ripple(8.5, 26, 12)}
        ${sedge(8, 24.5, 1.05)}
        ${sedge(21, 29.5, 1.25)}
        ${sedge(31.5, 17.5, 0.95)}
        ${sedge(25, 14, 0.85)}`),

    // Swamp, it has dead trees and lily pads cause it's deeper than a marsh.
    swamp: svg("swamp", `
        <ellipse class="terrain-murk" cx="20" cy="22" rx="20" ry="13"/>
        ${ripple(7, 30, 14)}
        <ellipse class="terrain-lily" cx="9" cy="24" rx="4.4" ry="2"/>
        <ellipse class="terrain-lily" cx="29" cy="30" rx="3.6" ry="1.7"/>
        ${deadTree(13, 19, 1)}
        ${deadTree(29, 23, 0.84)}
        ${sedge(34.5, 26, 0.9)}`),

    // Mangrove, so it has trees in the water (they are mangrove trees).
    mangrove: svg("mangrove", `
        <ellipse class="terrain-murk" cx="20" cy="28" rx="19" ry="8"/>
        <g class="terrain-tide">
            ${ripple(7, 30, 11)}
            ${ripple(21, 25, 11)}
        </g>
        <g class="terrain-root">
            <path d="M20 25 C15 27 11.5 29.5 9.5 34"/>
            <path d="M20 25 C17.5 28 16.5 30.5 16 34.5"/>
            <path d="M20 25 C22.5 28 23.5 30.5 24 34.5"/>
            <path d="M20 25 C25 27 28.5 29 30.5 33.5"/>
        </g>
        <rect class="terrain-trunk" x="18.7" y="11" width="2.6" height="15" rx="1.2"/>
        <g class="terrain-crown">
            <circle class="terrain-leaf" cx="10.5" cy="13.5" r="5.6"/>
            <circle class="terrain-leaf" cx="29.5" cy="13" r="5.2"/>
            <circle class="terrain-leaf" cx="20" cy="9.5" r="7.4"/>
        </g>`),

    // Forest, it's just a few trees.
    forest: svg("forest", `
        <ellipse class="terrain-soil" cx="20" cy="30" rx="16" ry="3.4"/>
        ${tree(10, 28, 0.95)}
        ${tree(30, 29, 0.86)}
        ${tree(20, 31, 1.22)}`),

    // Dense forest, it's like forest but get this it's denser (there are more trees).
    "dense-forest": svg("dense-forest", `
        <ellipse class="terrain-soil" cx="20" cy="33" rx="17.5" ry="3.2"/>
        <g class="terrain-back">
            ${tree(5.5, 20, 0.62)}
            ${tree(15, 19, 0.57)}
            ${tree(25, 19, 0.6)}
            ${tree(34.5, 21, 0.64)}
        </g>
        ${tree(9, 32, 0.92)}
        ${tree(31, 32, 0.87)}
        ${tree(20, 34, 1.14)}`),

    // Ancient forest because nothing shows old tree more than Big Tree.
    "ancient-forest": svg("ancient-forest", `
        <ellipse class="terrain-soil" cx="20" cy="35" rx="17" ry="3"/>
        <g class="terrain-back">
            ${tree(4.5, 34.5, 0.44)}
            ${tree(10.5, 35.5, 0.34)}
            ${tree(29.5, 35.5, 0.36)}
            ${tree(35.5, 34.5, 0.46)}
        </g>
        <path class="terrain-bole" d="M15.6 35 C15.4 27 17 22.5 17.4 17 L22.6 17 C23 22.5 24.6 27 24.4 35 Z"/>
        <path class="terrain-bough" d="M20 22 C15 20 12 17.5 9.5 13.5"/>
        <path class="terrain-bough" d="M20 21 C25 19.5 28 17 30.5 13"/>
        <ellipse class="terrain-elder-leaf" cx="10.5" cy="16" rx="8" ry="5.2"/>
        <ellipse class="terrain-elder-leaf" cx="29.5" cy="15.5" rx="7.4" ry="4.8"/>
        <ellipse class="terrain-elder-leaf terrain-elder-crown" cx="20" cy="11.5" rx="15" ry="8.6"/>
        <circle class="terrain-mote" cx="9" cy="26" r="1.2"/>
        <circle class="terrain-mote" cx="31.5" cy="28" r="0.95"/>
        <circle class="terrain-mote" cx="25" cy="30.5" r="0.8"/>
        <circle class="terrain-mote" cx="14.5" cy="31" r="0.9"/>
        <circle class="terrain-mote" cx="34" cy="22" r="0.75"/>
        <circle class="terrain-mote" cx="6" cy="31.5" r="0.7"/>
        <circle class="terrain-mote" cx="27.5" cy="24" r="1.05"/>
        <circle class="terrain-mote" cx="12" cy="21.5" r="0.65"/>`),

    // Ice field, it's some ice fragmenty plate things. 
    "ice-field": svg("ice-field", `
        <path class="terrain-ice" d="M2 12 L16 7.5 L22 16.5 L8.5 21.5 Z"/>
        <path class="terrain-ice" d="M17.5 6.5 L32.5 9.5 L34.5 19.5 L23.5 16.5 Z"/>
        <path class="terrain-ice" d="M5.5 24 L20 18.5 L24 29 L10 33.5 Z"/>
        <path class="terrain-ice" d="M25.5 18.5 L37 21.5 L36 33 L25 30 Z"/>
        <path class="terrain-ice-lit" d="M4 13 L15 9.6 L18.4 14.8 L8.6 18.4 Z"/>
        <path class="terrain-ice-lit" d="M7.6 25 L18.4 20.6 L20.8 26 L10.8 29.8 Z"/>`),

    // Glacier, it's a big ol ice block.
    glacier: svg("glacier", `
        <path class="terrain-ice" d="M8.5 40 L10.5 18.5 L14 12.5 L20 7.5 L26.5 13 L29.5 19 L31.5 40 Z"/>
        <path class="terrain-ice-dark" d="M20.3 7.7 L26.5 13 L29.5 19 L31.5 40 L20.9 40 Z"/>
        <path class="terrain-ice-lit" d="M14 12.5 L20 7.5 L20.6 22.5 L12.2 26 L10.8 17.5 Z"/>
        <path class="terrain-crack" d="M20 8.5 L20.6 22.5 L20.8 40"/>
        <path class="terrain-crack" d="M12.2 26 L20.6 22.5"/>
        <path class="terrain-crack" d="M25 16 L24.5 40"/>
        <path class="terrain-crack" d="M11 30 L12.5 40"/>
        <path class="terrain-crack" d="M28.5 24.5 L29.5 40"/>`),

    // Ice cap, it's the special ice tile. It's got funny animate aurora and snowfall.
    "ice-cap": svg("ice-cap", `
        <path class="terrain-aurora" d="M-12 12 C-4 5 4 15 12 10 C20 5 28 15 36 10 C44 5 48 9 52 7"/>
        <path class="terrain-aurora terrain-aurora-far" d="M-12 18 C-4 11 4 21 12 16 C20 11 28 21 36 16 C44 11 48 15 52 13"/>
        <circle class="terrain-airsnow" cx="7.5" cy="5.5" r="0.95"/>
        <circle class="terrain-airsnow" cx="31.5" cy="4" r="0.8"/>
        <circle class="terrain-airsnow" cx="20.5" cy="2.5" r="0.7"/>
        <circle class="terrain-airsnow" cx="13" cy="11" r="0.75"/>
        <circle class="terrain-airsnow" cx="27" cy="13" r="0.85"/>
        <circle class="terrain-airsnow" cx="36" cy="10" r="0.65"/>
        <path class="terrain-ice" d="M0 40 L0 25.5 L7 19 L13.5 24.5 L20 7.5 L27.5 18 L34 14 L40 21.5 L40 40 Z"/>
        <path class="terrain-ice-dark" d="M20.3 7.7 L27.5 18 L34 14 L40 21.5 L40 40 L21.2 40 Z"/>
        <path class="terrain-ice-lit" d="M13.5 24.5 L20 7.5 L20.6 40 L11.2 40 Z"/>
        <path class="terrain-cap-ridge" d="M20 8 L20.6 40 M13.5 24.5 L11.2 40 M27.5 18 L29.8 40 M7 19 L4.6 40 M34 14 L35.4 40"/>`),

    // Mushroom grove, it sure is a bunch of mushrooms. Also some spores for flavor.
    "mushroom-grove": svg("mushroom-grove", `
        <ellipse class="terrain-soil" cx="20" cy="31" rx="15" ry="3.4"/>
        ${mushroom(11, 30, 1)}
        ${mushroom(29, 29, 0.86)}
        ${mushroom(20, 32.5, 1.35)}
        <circle class="terrain-spore" cx="15.5" cy="9" r="1"/>
        <circle class="terrain-spore" cx="25" cy="12" r="0.85"/>
        <circle class="terrain-spore" cx="31" cy="7.5" r="0.7"/>`),

    // Fungal forest, same as the grove but also big guys.
    "fungal-forest": svg("fungal-forest", `
        <ellipse class="terrain-soil" cx="20" cy="35" rx="16" ry="3.2"/>
        ${tallCap(9, 34.5, 0.95)}
        ${tallCap(30.5, 35, 0.85)}
        ${tallCap(20, 36.5, 1.25)}
        ${mushroom(15, 36.5, 0.45)}
        ${mushroom(26, 37, 0.4)}
        <circle class="terrain-spore" cx="13" cy="8.5" r="1"/>
        <circle class="terrain-spore" cx="27" cy="6.5" r="0.85"/>
        <circle class="terrain-spore" cx="34" cy="11" r="0.7"/>`),

    // Mycelial network, it's the special fungus tile. Kinda hard to make but big network thing
    // that pulses feels like it's good enough. 
    "mycelial-network": svg("mycelial-network", `
        <g class="terrain-hypha">
            <path d="M1 30 C8 27 12 21 20 20 C28 19 32 13 39 11"/>
            <path d="M2 12 C9 15 13 21 20 20 C27 19 31 26 38 29"/>
            <path d="M20 20 L19 35 M20 20 L21 5"/>
            <path d="M12 22.5 L7.5 35 M28 17 L33 4"/>
            <path d="M12 22.5 L5 18.5 M28 17 L35 21.5"/>
        </g>
        <circle class="terrain-node" cx="20" cy="20" r="2.5"/>
        <circle class="terrain-node" cx="12" cy="22.5" r="1.6"/>
        <circle class="terrain-node" cx="28" cy="17" r="1.6"/>
        <circle class="terrain-node terrain-node-far" cx="7.5" cy="35" r="1"/>
        <circle class="terrain-node terrain-node-far" cx="33" cy="4" r="1"/>
        <circle class="terrain-node terrain-node-far" cx="35" cy="21.5" r="0.9"/>
        ${mushroom(15.5, 11, 0.3)}
        ${mushroom(30.5, 12.5, 0.32)}
        ${mushroom(7, 15.5, 0.34)}
        ${mushroom(25, 23.5, 0.4)}
        ${mushroom(9.5, 26.5, 0.46)}
        ${mushroom(34, 27.5, 0.42)}
        ${mushroom(14, 34, 0.56)}
        ${mushroom(23.5, 32.5, 0.5)}
        ${mushroom(29.5, 37, 0.58)}`),
};

// Grass is grown and not *really* terrain I guess. but this is the icon for recipes and such since it has 3 stages normally.
export const GRASS_ICON = `
    <svg class="tile-terrain terrain-art-grass" viewBox="0 0 40 40" aria-hidden="true">
        <ellipse class="grass-soil" cx="20" cy="31" rx="12" ry="3.4"/>
        <path class="grass-blade" d="M20 31 C18.2 24 19.4 18 17.6 12"/>
        <path class="grass-blade" d="M20 31 C22 25 23.4 20 25.8 15"/>
        <path class="grass-blade" d="M20 31 C16.4 27 13.6 23 11.6 18.5"/>
        <path class="grass-blade" d="M20 31 C24 28 26.8 25 28.6 21"/>
    </svg>`;

// One drawing per kind of tile (for tiles, recipes, and the preview window).
export function kindArt(kind) {
    if (kind === "grass") return GRASS_ICON;
    return TERRAIN_ART[kind] || TERRAIN_ART.bare;
}
// This just gives the tile color and an icon. it's "chip" instead of "tile" because it makes it a bit easier
// since the art isn't the actual tile, it's just drawn on it.
export const kindChip = (kind, extra = "") => `
    <div class="transform-chip ${extra}">
        <div class="transform-chip-art" style="--ground: var(--ground-${kind})">${kindArt(kind)}</div>
        <div class="transform-chip-name">${TERRAIN[kind].name}</div>
    </div>`;
