// reefArt.js
//
// Rocks in a 100x80 box with ground near y 74, plus per-shape overlays for characteristics


//    !!! THE SHAPES !!!

const SHAPES = {
    small: {
        body: "M12 71 C8 60 14 48 26 43 C36 38 52 36 64 38 C80 40 92 52 88 71 C76 78 24 78 12 71 Z",
        top: "M18 53 C22 45 36 40 50 39 C64 38 78 42 84 52 C72 59 30 60 18 53 Z",
        topY: 47,
        ridge: [[24, 46], [36, 40], [50, 38], [64, 39], [77, 44]],
        crevice: { x: 68, top: 45, bottom: 73 },
        shelter: { x0: 16, x1: 42, y: 48 },
    },
    medium: {
        body: "M6 72 C2 56 8 40 22 32 C32 24 46 20 58 22 C74 20 90 30 95 48 C98 58 96 66 94 72 C80 79 20 79 6 72 Z",
        top: "M12 46 C16 34 34 25 50 24 C66 21 84 28 90 42 C76 53 28 54 12 46 Z",
        topY: 36,
        ridge: [[17, 38], [29, 28], [43, 24], [58, 23], [73, 27], [85, 36]],
        crevice: { x: 70, top: 34, bottom: 74 },
        shelter: { x0: 10, x1: 42, y: 40 },
    },
    large: {
        body: "M3 73 C0 54 6 34 18 24 C28 15 40 12 50 14 C58 7 76 8 86 18 C96 28 100 50 97 73 C82 80 18 80 3 73 Z",
        top: "M9 36 C13 24 30 15 46 16 C56 10 74 11 86 22 C90 27 92 33 91 37 C74 46 26 46 9 36 Z",
        topY: 26,
        ridge: [[12, 30], [22, 20], [36, 13], [52, 10], [68, 12], [82, 19], [90, 28]],
        crevice: { x: 70, top: 26, bottom: 75 },
        shelter: { x0: 8, x1: 44, y: 32 },
    },
};

// Where an arch drawn from (x0, 75) to (x1, 75) with its control points at y peaks
const archTop = (y) => 75 - 0.75 * (75 - y);

const arch = (x0, x1, y) => `M${x0} 75 C${x0} ${y} ${x1} ${y} ${x1} 75 Z`;


//    !!! WHAT A CHARACTERISTIC LOOKS LIKE !!!

const exposedArt = (shape) => `
    <g class="trait-exposed">
        <path class="rock-bleach" d="${shape.top}"/>
        <path class="rock-stream" d="M56 ${shape.topY - 8} L114 ${shape.topY - 8}"/>
        <path class="rock-stream" d="M68 ${shape.topY} L120 ${shape.topY}"/>
        <path class="rock-stream" d="M36 ${shape.topY - 15} L96 ${shape.topY - 15}"/>
    </g>`;

const algaeArt = (shape, clip) => `
    <g class="trait-algae">
        <ellipse class="rock-moss" cx="34" cy="${shape.topY + 6}" rx="36" ry="15" clip-path="url(#${clip})"/>
        <ellipse class="rock-moss" cx="70" cy="${shape.topY + 20}" rx="12" ry="6" clip-path="url(#${clip})"/>
        ${shape.ridge.slice(0, -1).map(([x, y], i) =>
            blade(x - 2, y + 1, -3, 8 + (i % 3) * 3, i) + blade(x + 2, y + 1, 3, 10 + ((i + 1) % 3) * 3, i + 1)).join("")}
    </g>`;

const creviceArt = (shape) => {
    const { x, top, bottom } = shape.crevice;
    const at = (f) => top + (bottom - top) * f;
    return `
    <g class="trait-crevice">
        <path class="rock-crack" d="M${x - 1} ${top} L${x + 6} ${at(0.2)} L${x + 2} ${at(0.42)}
            L${x + 8} ${at(0.66)} L${x + 4} ${bottom} L${x - 5} ${bottom} L${x - 3} ${at(0.64)}
            L${x - 7} ${at(0.4)} L${x - 3} ${at(0.18)} Z"/>
        <path class="rock-crack-deep" d="M${x} ${at(0.14)} L${x + 3} ${at(0.32)} L${x} ${at(0.52)}
            L${x + 4} ${at(0.74)} L${x + 1} ${at(0.97)} L${x - 2} ${at(0.72)} L${x - 3} ${at(0.5)} Z"/>
    </g>`;
};

// A hood of stone curling round a dark pocket, the way a cove curls round still water
const shelteredArt = (shape) => {
    const { x0, x1, y } = shape.shelter;
    const w = x1 - x0;
    const a = archTop(y);
    return `
    <g class="trait-sheltered">
        <ellipse class="rock-hush" cx="${x0 + w * 0.4}" cy="75" rx="${w * 0.7}" ry="4.5"/>
        <path class="rock-pocket" d="${arch(x0, x1, y)}"/>
        <path class="rock-pocket-deep" d="${arch(x0 + w * 0.2, x1 - w * 0.2, y + (75 - y) * 0.35)}"/>
        <path class="rock-hood" d="M${x0 - 9} ${a + 5} C${x0 - 3} ${a - 7} ${x1 - 4} ${a - 10} ${x1 + 7} ${a - 3}
            L${x1 + 6} ${a + 3} C${x1 - 4} ${a - 3} ${x0 + 1} ${a - 1} ${x0 - 2} ${a + 5}
            C${x0 - 5} ${a + 14} ${x0 - 3} 68 ${x0 + 3} 75 L${x0 - 5} 75 C${x0 - 11} 66 ${x0 - 12} ${a + 14} ${x0 - 9} ${a + 5} Z"/>
        <path class="rock-hood-lip" d="M${x0 - 8} ${a + 3} C${x0 - 2} ${a - 7} ${x1 - 4} ${a - 10} ${x1 + 6} ${a - 3}"/>
    </g>`;
};

const blade = (x, y, lean, tall, i) => `
    <path class="rock-weed" style="--i:${i}"
        d="M${x - 1.8} ${y + 2} C${x - 1} ${y - tall * 0.5} ${x + lean} ${y - tall * 0.8} ${x + lean * 1.2} ${y - tall}
           C${x + lean * 0.4} ${y - tall * 0.6} ${x + 1.2} ${y - tall * 0.3} ${x + 1.8} ${y + 2} Z"/>`;

const TRAIT_ART = {
    exposed: exposedArt,
    algae: algaeArt,
    crevice: creviceArt,
    sheltered: shelteredArt,
};

// Drawn back to front: the top face first, then what's cut into the stone, then the hood over it
const TRAIT_ORDER = ["exposed", "algae", "crevice", "sheltered"];


//    !!! A ROCK !!!

function rockArt(size, traits = []) {
    const key = SHAPES[size] ? size : "small";
    const shape = SHAPES[key];
    // Same id for the same shape, so redrawing a rock gives the same markup
    const clip = `reef-rock-clip-${key}`;
    const drawn = TRAIT_ORDER.filter(id => traits.includes(id))
        .map(id => TRAIT_ART[id](shape, clip)).join("");
    return `
    <svg class="reef-rock reef-rock-${size}" viewBox="0 0 100 80" aria-hidden="true">
        <defs><clipPath id="${clip}"><path d="${shape.body}"/></clipPath></defs>
        <ellipse class="rock-shadow" cx="54" cy="74" rx="50" ry="6.5"/>
        <path class="rock-body" d="${shape.body}"/>
        <ellipse class="rock-dark" cx="84" cy="74" rx="34" ry="24" clip-path="url(#${clip})"/>
        <path class="rock-top" d="${shape.top}"/>
        ${drawn}
    </svg>`;
}


//    !!! KELP !!!

const strand = (x, lean, tall, i) => {
    const top = 150 - tall;
    const leaves = [0.35, 0.6, 0.85].map((f, k) => {
        const y = 150 - tall * f;
        const lx = x + lean * f * f + (k % 2 ? 5 : -5);
        return `<ellipse class="kelp-leaf" cx="${lx}" cy="${y}" rx="7" ry="3"
            transform="rotate(${k % 2 ? -28 : 28} ${lx} ${y})"/>`;
    }).join("");
    return `
    <g class="kelp-strand" style="--i:${i}">
        <path class="kelp-stipe" d="M${x} 150 C${x - 4} ${150 - tall * 0.35} ${x + lean} ${150 - tall * 0.65} ${x + lean} ${top}"/>
        ${leaves}
        <ellipse class="kelp-float" cx="${x + lean}" cy="${top}" rx="3.2" ry="3.8"/>
    </g>`;
};

const kelpArt = () => `
    <svg class="reef-kelp" viewBox="0 0 100 150" aria-hidden="true">
        <ellipse class="rock-shadow" cx="54" cy="147" rx="36" ry="7"/>
        ${strand(34, -10, 118, 0)}
        ${strand(58, 12, 142, 1)}
        ${strand(46, 4, 96, 2)}
        ${strand(66, 18, 84, 3)}
        <ellipse class="kelp-holdfast" cx="50" cy="147" rx="18" ry="4.5"/>
    </svg>`;

export const pieceArt = (piece, traits = []) =>
    piece.kind === "kelp" ? kelpArt() : rockArt(piece.size, traits);

export const BOOK_ICON = `
    <svg class="reef-book-icon" viewBox="0 0 40 32" aria-hidden="true">
        <path class="book-page" d="M20 7 C15 4 8 4 3 6 L3 27 C8 25 15 25 20 28 Z"/>
        <path class="book-page" d="M20 7 C25 4 32 4 37 6 L37 27 C32 25 25 25 20 28 Z"/>
        <path class="book-line" d="M7 11 C10 10 13 10 16 11 M7 15 C10 14 13 14 16 15 M7 19 C10 18 13 18 16 19"/>
        <path class="book-line" d="M24 11 C27 10 30 10 33 11 M24 15 C27 14 30 14 33 15"/>
        <path class="book-spine" d="M20 7 L20 28"/>
    </svg>`;
