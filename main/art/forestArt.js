// forestArt.js
//
// One tree, side view: height stretches the trunk, branches add limbs, roots spread below


import { STAT_IDS, lifeProgress, isMature } from "../systems/forestTrees.js";
import { clamp } from "../../../utils/math.js";


//    !!! THE SHAPE OF A TREE !!!

const GROUND = 170;
const MIN_TRUNK = 18;
const MAX_TRUNK = 150;

// Slight difference between seedlings, so they don't look identical
const jitter = (seed, step, spread) => {
    const noise = Math.sin((seed + step * 37.7) * 12.9898) * 43758.5453;
    return (noise - Math.floor(noise) - 0.5) * 2 * spread;
};

// Stats only move the shape to a certain point so they don't fill the whole bounding box
const shapeOf = (tree) => {
    const grown = lifeProgress(tree);
    const height = clamp(Math.max(0, tree.height), 0, 20);
    const branches = clamp(Math.max(0, tree.branches), 0, 20);
    const roots = clamp(Math.max(0, tree.roots), 0, 20);

    return {
        grown,
        trunk: MIN_TRUNK + (MAX_TRUNK - MIN_TRUNK) * grown * (0.55 + 0.045 * height),
        width: 2.4 + 0.28 * height * (0.4 + 0.6 * grown),
        limbs: Math.round(clamp(1 + branches * 0.55, 1, 9) * (0.35 + 0.65 * grown)),
        spread: 12 + 3.1 * branches,
        rootCount: Math.round(clamp(2 + roots * 0.5, 2, 8)),
        rootSpread: 8 + 2.6 * roots,
        rootDepth: 8 + 2.2 * roots * (0.4 + 0.6 * grown),
    };
};

// How the tree should be drawn, only rebuilt whenever it changes
export function shapeKey(tree) {
    const shape = shapeOf(tree);
    return `${tree.seed}:${shape.limbs}:${Math.round(shape.trunk)}:${Math.round(shape.width * 4)}`
        + `:${shape.rootCount}:${Math.round(shape.rootSpread)}:${Math.round(shape.rootDepth)}`
        + `:${isMature(tree) ? 1 : 0}`;
}

// Where the top of the tree is in its bounding box
export function crownTop(tree) {
    return (GROUND - shapeOf(tree).trunk) / 220;
}


//    !!! DRAWING IT !!!

function limbs(tree, shape) {
    const top = GROUND - shape.trunk;
    let out = "";

    for (let i = 0; i < shape.limbs; i++) {
        const along = 0.35 + 0.62 * (shape.limbs === 1 ? 0.5 : i / (shape.limbs - 1));
        const y = GROUND - shape.trunk * along;
        const side = i % 2 === 0 ? -1 : 1;
        const reach = shape.spread * (0.45 + 0.55 * along) * (0.5 + 0.5 * shape.grown)
            + jitter(tree.seed, i, 3);
        const x = 60 + side * reach;
        const tipY = y - shape.trunk * 0.16 + jitter(tree.seed, i + 20, 4);

        out += `<path class="tree-limb" d="M60 ${y.toFixed(1)} Q${(60 + side * reach * 0.55).toFixed(1)}`
            + ` ${(y - 4).toFixed(1)} ${x.toFixed(1)} ${tipY.toFixed(1)}"/>`;
        out += `<ellipse class="tree-leaf" cx="${x.toFixed(1)}" cy="${(tipY - 4).toFixed(1)}"`
            + ` rx="${(9 + shape.spread * 0.22).toFixed(1)}" ry="${(7 + shape.spread * 0.14).toFixed(1)}"/>`;
    }

    out += `<ellipse class="tree-leaf tree-crown" cx="${(60 + jitter(tree.seed, 5, 2)).toFixed(1)}"`
        + ` cy="${(top - 2).toFixed(1)}" rx="${(11 + shape.spread * 0.3).toFixed(1)}"`
        + ` ry="${(10 + shape.spread * 0.16).toFixed(1)}"/>`;
    return out;
}

function roots(tree, shape) {
    let out = "";
    for (let i = 0; i < shape.rootCount; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const step = Math.floor(i / 2) + 1;
        const reach = side * (shape.rootSpread * (0.4 + 0.3 * step)) + jitter(tree.seed, i + 40, 4);
        const depth = shape.rootDepth * (0.5 + 0.22 * step);
        out += `<path class="tree-root" d="M60 ${GROUND} Q${(60 + reach * 0.4).toFixed(1)}`
            + ` ${(GROUND + depth * 0.5).toFixed(1)} ${(60 + reach).toFixed(1)} ${(GROUND + depth).toFixed(1)}"/>`;
    }
    return out;
}

export function treeSvg(tree) {
    const shape = shapeOf(tree);
    const top = GROUND - shape.trunk;
    const half = shape.width / 2;
    const flare = half * 2.1;

    const trunk = `<path class="tree-trunk" d="M${(60 - flare).toFixed(1)} ${GROUND}`
        + ` Q${(60 - half).toFixed(1)} ${(GROUND - shape.trunk * 0.35).toFixed(1)}`
        + ` ${(60 - half * 0.55).toFixed(1)} ${top.toFixed(1)}`
        + ` L${(60 + half * 0.55).toFixed(1)} ${top.toFixed(1)}`
        + ` Q${(60 + half).toFixed(1)} ${(GROUND - shape.trunk * 0.35).toFixed(1)}`
        + ` ${(60 + flare).toFixed(1)} ${GROUND} Z"/>`;

    return `<svg class="tree-art${isMature(tree) ? " mature" : ""}" viewBox="0 0 120 220"`
        + ` preserveAspectRatio="xMidYMax meet" aria-hidden="true">`
        + `<g class="tree-roots">${roots(tree, shape)}</g>`
        + trunk
        + `<g class="tree-canopy">${limbs(tree, shape)}</g>`
        + `</svg>`;
}


//    !!! THE ICON !!!

// The little icon for the summary view
export function treeIcon(record, color) {
    const total = STAT_IDS.reduce((sum, id) => sum + Math.max(0, record[id] || 0), 0) || 1;
    const tall = 8 + 22 * (Math.max(0, record.height) / total);
    const wide = 4 + 11 * (Math.max(0, record.branches) / total);
    const deep = 2 + 8 * (Math.max(0, record.roots) / total);

    return `<svg class="tree-icon" viewBox="0 0 32 40" style="--icon-color:${color}" aria-hidden="true">`
        + `<path class="icon-root" d="M16 30 L${(16 - deep).toFixed(1)} ${(30 + deep).toFixed(1)}`
        + ` M16 30 L${(16 + deep).toFixed(1)} ${(30 + deep).toFixed(1)} M16 30 L16 ${(31 + deep).toFixed(1)}"/>`
        + `<path class="icon-trunk" d="M16 30 L16 ${(30 - tall).toFixed(1)}"/>`
        + `<ellipse class="icon-crown" cx="16" cy="${(28 - tall).toFixed(1)}"`
        + ` rx="${wide.toFixed(1)}" ry="${(wide * 0.8).toFixed(1)}"/>`
        + `</svg>`;
}
