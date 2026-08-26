// oceanArt.js
//
// The art for the ocean: region shapes, fish, and the little icons
// Split out of oceanSublayer.js the same way terrain and card art are.

// Region outlines are angular and random, so they're seeded (so they will look the same on load)
// Was gonna do things differently but this is where we ended up so here is where we will be
function seeded(seed, salt) {
    const x = Math.sin((seed + 1) * 12.9898 + salt * 78.233) * 43758.5453;
    return x - Math.floor(x);
}

/**
 * A closed polygon inside a box. Corners are evenly spaced and only nudged in or out a
 * little, so a region reads as a rounded-off tile rather than a splash of water
 * @param {number} seed     which region this is, so its shape stays put
 * @param {number} width
 * @param {number} height
 * @param {number} corners
 */
export function regionPath(seed, width, height, corners) {
    const midX = width / 2;
    const midY = height / 2;
    const reachX = midX - 6;
    const reachY = midY - 6;

    const turn = seeded(seed, 0) * Math.PI * 2; // Where the first corner sits
    const points = [];
    for (let i = 0; i < corners; i++) {
        const angle = turn + (i / corners) * Math.PI * 2;
        const pull = 0.95 + seeded(seed, i + 1) * 0.1;
        points.push(`${(midX + Math.cos(angle) * reachX * pull).toFixed(1)},`
            + `${(midY + Math.sin(angle) * reachY * pull).toFixed(1)}`);
    }
    return `M${points.join("L")}Z`;
}

// The fish. All of them are drawn swimming left at the same size, so they can flip
// in the current's direction without them needing their own numbers
const fish = (id, body) => `
    <svg class="ocean-fish ocean-fish-${id}" viewBox="0 0 64 30" aria-hidden="true">${body}</svg>`;

export const FISH_ART = {
    // Cod are heavy in the neck(?) area, tapered back, with the little thingy under the chin
    cod: fish("cod", `
        <path class="fish-tail" d="M52 15 L63 7 L60 15 L63 23 Z"/>
        <path class="fish-body" d="M6 15 C12 5, 30 2, 42 6 C50 9, 53 12, 54 15
            C53 18, 50 21, 42 24 C30 28, 12 25, 6 15 Z"/>
        <path class="fish-fin" d="M28 6 C33 1, 40 1, 43 4 C38 4, 33 5, 28 6 Z"/>
        <path class="fish-fin" d="M26 24 C30 28, 36 28, 39 26 C34 26, 30 25, 26 24 Z"/>
        <path class="fish-line" d="M12 12 C24 8, 40 9, 52 14"/>
        <path class="fish-line fish-barbel" d="M8 18 C7 21, 8 23, 10 24"/>
        <circle class="fish-eye" cx="12" cy="14" r="1.6"/>`),

    // Herring are real thin with very forked tails
    herring: fish("herring", `
        <path class="fish-tail" d="M50 15 L63 6 L58 15 L63 24 Z"/>
        <path class="fish-body" d="M4 15 C14 7, 32 5, 44 9 C49 11, 51 13, 52 15
            C51 17, 49 19, 44 21 C32 25, 14 23, 4 15 Z"/>
        <path class="fish-fin" d="M30 8 C34 3, 40 3, 42 6 C37 6, 33 7, 30 8 Z"/>
        <path class="fish-line" d="M10 15 C24 12, 40 13, 50 15"/>
        <circle class="fish-eye" cx="10" cy="14" r="1.5"/>`),

    // Mackerel are kinda torpedo shaped, and they have the bars across their backs
    mackerel: fish("mackerel", `
        <path class="fish-tail" d="M51 15 L63 8 L59 15 L63 22 Z"/>
        <path class="fish-body" d="M5 15 C13 6, 33 4, 45 8 C50 10, 52 13, 53 15
            C52 17, 50 20, 45 22 C33 26, 13 24, 5 15 Z"/>
        <path class="fish-fin" d="M24 6 C29 1, 36 2, 38 5 C33 5, 28 5, 24 6 Z"/>
        <path class="fish-fin" d="M40 23 C43 26, 47 26, 49 24 C45 24, 42 24, 40 23 Z"/>
        <path class="fish-line" d="M18 8 C20 11, 20 13, 19 16"/>
        <path class="fish-line" d="M26 6 C28 10, 28 12, 27 15"/>
        <path class="fish-line" d="M34 6 C36 10, 36 12, 35 15"/>
        <circle class="fish-eye" cx="11" cy="14" r="1.5"/>`),
};

export const fishArt = (id) => FISH_ART[id] || FISH_ART.cod;

// Boost icons they're pretty small, so they're pretty simple
const icon = (body) => `<svg class="boost-icon" viewBox="0 0 16 16" aria-hidden="true">${body}</svg>`;

export const BOOST_ICONS = {
    upwelling: icon(`
        <path class="icon-stroke" d="M8 14 L8 3"/>
        <path class="icon-stroke" d="M4.5 6.5 L8 2.5 L11.5 6.5"/>
        <path class="icon-stroke" d="M2.5 12 C4 10.5, 5.5 13.5, 7 12"/>`),
    bloom: icon(` 
        <circle class="icon-fill" cx="5" cy="6" r="2.2"/>
        <circle class="icon-fill" cx="10.5" cy="4.8" r="1.6"/>
        <circle class="icon-fill" cx="8.5" cy="10.5" r="2.6"/>
        <circle class="icon-fill" cx="4" cy="11.5" r="1.4"/>`),
    glint: icon(`
        <circle class="icon-fill" cx="8" cy="8" r="3"/>
        <path class="icon-stroke" d="M8 1 L8 3"/>
        <path class="icon-stroke" d="M8 13 L8 15"/>
        <path class="icon-stroke" d="M1 8 L3 8"/>
        <path class="icon-stroke" d="M13 8 L15 8"/>
        <path class="icon-stroke" d="M3.5 3.5 L4.9 4.9"/>
        <path class="icon-stroke" d="M11.1 11.1 L12.5 12.5"/>`),
    riptide: icon(`
        <path class="icon-stroke" d="M2 4.5 L7 8 L2 11.5"/>
        <path class="icon-stroke" d="M8 4.5 L13 8 L8 11.5"/>`),
    spawn: icon(`
        <circle class="icon-fill" cx="5.5" cy="9.5" r="3"/>
        <circle class="icon-fill" cx="11" cy="6" r="2.4"/>
        <circle class="icon-hollow" cx="5.5" cy="9.5" r="1"/>
        <circle class="icon-hollow" cx="11" cy="6" r="0.8"/>`),
};

export const boostIcon = (id) => BOOST_ICONS[id] || BOOST_ICONS.upwelling;

// Warning icon for when two schools are trying to go to the same spot
export const WARNING_ICON = `
    <svg class="warning-icon" viewBox="0 0 16 16" aria-hidden="true">
        <path class="warning-body" d="M8 1.6 L15 14 L1 14 Z"/>
        <path class="warning-mark" d="M8 5.6 L8 9.8"/>
        <circle class="warning-mark-dot" cx="8" cy="11.9" r="0.95"/>
    </svg>`;

// The arrowhead every current path ends with
export const CURRENT_DEFS = `
    <defs>
        <marker id="current-head" viewBox="0 0 10 10" refX="3" refY="5"
                markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path class="current-arrow" d="M0 1 L9 5 L0 9 Z"/>
        </marker>
    </defs>`;
