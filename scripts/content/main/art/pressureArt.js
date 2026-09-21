// pressureArt.js
//
// Meter textures and tree scenery per pressure; motion is in evolution-scenery.css

import { seededRandom } from "../../../utils/math.js";


//    !!! THE SAME SCENE EVERY TIME !!!

// Seeded, so the scenery comes out the same every time a tree is rebuilt
const seeded = (seed) => {
    let salt = 0;
    return () => seededRandom(seed, salt++);
};

const between = (rand, min, max) => min + rand() * (max - min);
const n = (value) => Math.round(value * 10) / 10;
const unit = (suffix) => (rand, min, max) => `${n(between(rand, min, max))}${suffix}`;
const pct = unit("%");
const px = unit("px");
const secs = unit("s");
const deg = unit("deg");
const pick = (rand, list) => list[Math.floor(rand() * list.length)];
// Starts part-way through its loop, so nothing arrives all at once
const lead = (rand, max) => `-${n(between(rand, 0, max))}s`;


//    !!! THE PIECES !!!

// Loose particles, each told where it sits and how it moves through custom properties
function scatter(className, count, seed, vars) {
    const rand = seeded(seed);
    return Array.from({ length: count }, () => {
        const style = Object.entries(vars(rand)).map(([key, value]) => `--${key}:${value}`).join(";");
        return `<i class="${className}" style="${style}"></i>`;
    }).join("");
}

// A row of rounded tops along a baseline, for treetops, undergrowth and soil
function crowns(rand, { width, height, base, minW, maxW, minH, maxH }) {
    let x = -between(rand, 0, maxW / 2);
    let d = `M${n(x)} ${height}V${base}`;
    while (x < width) {
        const w = between(rand, minW, maxW);
        const h = between(rand, minH, maxH);
        const b = base + between(rand, -minH / 3, minH / 3);
        d += `C${n(x - w * 0.12)} ${n(b - h)} ${n(x + w * 1.12)} ${n(b - h)} ${n(x + w)} ${n(b)}`;
        x += w;
    }
    return `${d}V${height}Z`;
}

// A forking line for fungal threads and frost; nodes collects junctions to light up
function branches(rand, out, x, y, angle, length, depth, spread, nodes) {
    if (depth <= 0) return out;
    const bend = between(rand, -0.4, 0.4);
    const toX = x + Math.cos(angle) * length;
    const toY = y + Math.sin(angle) * length;
    const viaX = x + Math.cos(angle + bend) * length * 0.55;
    const viaY = y + Math.sin(angle + bend) * length * 0.55;
    out.push(`M${n(x)} ${n(y)}Q${n(viaX)} ${n(viaY)} ${n(toX)} ${n(toY)}`);
    if (nodes && rand() < 0.22) nodes.push([toX, toY]);

    const forks = rand() < 0.7 ? 2 : 1;
    for (let i = 0; i < forks; i++) {
        const turn = forks === 1 ? between(rand, -spread, spread) / 2
            : (i ? 1 : -1) * between(rand, spread * 0.35, spread);
        branches(rand, out, toX, toY, angle + turn, length * between(rand, 0.6, 0.85), depth - 1, spread, nodes);
    }
    return out;
}

// The bright points that sit on those junctions, each pulsing on its own clock
const nodeCircles = (rand, nodes, className, radius) => nodes
    .map(([x, y]) => `<circle class="${className}" cx="${n(x)}" cy="${n(y)}" r="${n(between(rand, radius * 0.7, radius))}"`
        + ` style="--d:${secs(rand, 2.2, 4.5)};--delay:${lead(rand, 4.5)}" />`).join("");

function mushroomCaps(rand, x, ground, height, capWidth) {
    const lean = between(rand, -0.15, 0.15) * height;
    const tipX = x + lean;
    const top = ground - height;
    const stemWidth = capWidth * 0.24;
    const stem = `M${n(x - stemWidth)} ${n(ground + 3)}L${n(tipX - stemWidth * 0.7)} ${n(top)}`
        + `L${n(tipX + stemWidth * 0.7)} ${n(top)}L${n(x + stemWidth)} ${n(ground + 3)}Z`;
    const cap = `M${n(tipX - capWidth)} ${n(top + capWidth * 0.2)}`
        + `C${n(tipX - capWidth)} ${n(top - capWidth * 0.95)} ${n(tipX + capWidth)} ${n(top - capWidth * 0.95)} ${n(tipX + capWidth)} ${n(top + capWidth * 0.2)}`
        + `Q${n(tipX)} ${n(top - capWidth * 0.05)} ${n(tipX - capWidth)} ${n(top + capWidth * 0.2)}Z`;
    return { stem, cap };
}


//    !!! THE METERS !!!

// Anything that drifts is twice as wide as the meter, so sliding it along by half loops cleanly
const tiled = (y, segment) => `M0 ${y}${segment.repeat(4)} V24 H0 Z`;

const surface = (paths, viewBox = "0 0 240 24") => `
    <svg class="pressure-wave" viewBox="${viewBox}" preserveAspectRatio="none" aria-hidden="true">
        ${paths.map(([className, d]) => `<path class="${className}" d="${d}" />`).join("")}
    </svg>`;

const specks = (count) => Array.from({ length: count }, (_, i) => `<i style="--i:${i}"></i>`).join("");

function canopyMeter() {
    const rand = seeded(31);
    // Rows of treetops further and further down, each one a shade deeper than the last
    const rows = Array.from({ length: 8 }, (_, i) =>
        `<path d="${crowns(rand, { width: 120, height: 240, base: 14 + i * 26, minW: 12, maxW: 26, minH: 5, maxH: 11 })}" />`).join("");
    return {
        texture: `
            <svg class="pressure-foliage" viewBox="0 0 120 240" preserveAspectRatio="xMidYMin slice" aria-hidden="true">${rows}</svg>
            ${specks(5)}`,
        surface: surface([
            ["wave-back", crowns(rand, { width: 120, height: 28, base: 14, minW: 18, maxW: 30, minH: 5, maxH: 11 })],
            ["wave-front", crowns(rand, { width: 120, height: 28, base: 19, minW: 12, maxW: 24, minH: 4, maxH: 9 })],
        ], "0 0 120 28"),
    };
}

function decayMeter() {
    const rand = seeded(61);
    const ground = crowns(rand, { width: 120, height: 28, base: 22, minW: 18, maxW: 34, minH: 1, maxH: 3 });
    const shrooms = [[15, 10, 5], [23, 6, 3.4], [60, 12, 6], [91, 8, 4.4], [98, 5, 2.8]]
        .map(([x, height, cap]) => mushroomCaps(rand, x, 22, height, cap));

    const threads = [];
    const nodes = [];
    for (const x of [18, 52, 84]) branches(rand, threads, x, 102, -Math.PI / 2 + between(rand, -0.5, 0.5), 24, 5, 0.9, nodes);

    return {
        texture: `
            <svg class="pressure-mycelium" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <path class="threads" d="${threads.join("")}" />
                ${nodeCircles(rand, nodes, "pressure-node", 2.2)}
            </svg>
            ${specks(6)}`,
        surface: surface([
            ["wave-front", ground + shrooms.map(s => s.stem).join("")],
            ["mush-caps", shrooms.map(s => s.cap).join("")],
        ], "0 0 120 28"),
    };
}

function brainCoral(rand, x, ground, w, h) {
    let grooves = "";
    for (let i = 1; i < 4; i++) {
        const gw = w * (1 - i * 0.24);
        const gh = h * (1 - i * 0.26);
        grooves += `M${n(x - gw)} ${ground}Q${n(x - gw * 0.9)} ${n(ground - gh * 1.3)} ${n(x + between(rand, -w, w) * 0.08)} ${n(ground - gh * 1.02)}`
            + `Q${n(x + gw * 0.9)} ${n(ground - gh * 1.3)} ${n(x + gw)} ${ground}`;
    }
    const mound = `M${n(x - w)} ${ground + 2}C${n(x - w)} ${n(ground - h * 1.3)} ${n(x + w)} ${n(ground - h * 1.3)} ${n(x + w)} ${ground + 2}Z`;
    return { mound, grooves };
}

const tube = (x, ground, w, h) => {
    const r = w / 2;
    return `M${n(x - r)} ${ground + 2}V${n(ground - h + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + r)} ${n(ground - h + r)}V${ground + 2}Z`;
};

// The reef sits on the meter floor so the water rises over it
function salineMeter() {
    const rand = seeded(53);
    const ground = 27;
    const arms = [];
    for (const x of [11, 74]) {
        for (let i = 0; i < 3; i++) branches(rand, arms, x + (i - 1) * 3, ground, -Math.PI / 2 + (i - 1) * 0.45, 5, 3, 0.8);
    }
    const fan = [];
    branches(rand, fan, 52, ground, -Math.PI / 2, 4.5, 5, 1.1);
    const brains = [brainCoral(rand, 32, ground, 12, 9), brainCoral(rand, 94, ground, 9, 6)];
    const tubes = [[104, 3.4, 13], [108, 3, 18], [112, 3.4, 10]].map(([x, w, h]) => tube(x, ground, w, h)).join("");
    return {
        texture: `
            <svg class="pressure-reef" viewBox="0 0 120 28" preserveAspectRatio="none" aria-hidden="true">
                <path class="coral-fan" d="${fan.join("")}" />
                <path class="coral-arms" d="${arms.join("")}" />
                <path class="coral-tubes" d="${tubes}" />
                <path class="coral-mound" d="${brains.map(b => b.mound).join("")}" />
                <path class="coral-groove" d="${brains.map(b => b.grooves).join("")}" />
                <path class="coral-bed" d="${crowns(rand, { width: 120, height: 28, base: 27, minW: 8, maxW: 18, minH: 1, maxH: 2.5 })}" />
            </svg>
            ${specks(3)}`,
        surface: surface([
            ["wave-back", tiled(17, " q 15 -3 30 0 t 30 0 t 30 0 t 30 0")],
            ["wave-front", tiled(18, " q 15 3 30 0 t 30 0 t 30 0 t 30 0")],
        ]),
    };
}

const METERS = {
    tidal: () => ({
        texture: "",
        surface: surface([
            ["wave-back", tiled(12, " q 30 -9 60 0 t 60 0")],
            ["wave-front", tiled(13, " q 30 8 60 0 t 60 0")],
        ]),
    }),
    canopy: canopyMeter,
    stagnant: () => ({
        texture: specks(4),
        surface: surface([
            ["wave-back", tiled(15, " q 30 -3 60 0 t 60 0")],
            ["wave-front", tiled(16, " q 30 2 60 0 t 60 0")],
        ]),
    }),
    saline: salineMeter,
    frigid: () => ({
        texture: "",
        surface: surface([
            ["wave-back", "M0 12 L14 6 L22 11 L38 4 L50 10 L62 7 L76 13 L90 5 L102 11 L118 7 L130 12 L144 4 L156 10 L170 6 L184 12 L198 5 L210 11 L226 6 L240 10 V24 H0 Z"],
            ["wave-front", "M0 15 L10 11 L24 16 L36 9 L46 14 L60 12 L72 17 L86 10 L98 15 L112 11 L126 16 L138 9 L152 14 L166 11 L178 16 L192 10 L204 15 L220 12 L240 14 V24 H0 Z"],
        ]),
    }),
    decay: decayMeter,
};

export const meterArt = (id) => (METERS[id] || METERS.tidal)();


//    !!! THE SCENERY !!!

// Silhouettes are drawn wide and cropped to the screen, so they don't stretch on odd window shapes

function swell(name, amplitude) {
    const crest = `M0 30${` q75 ${-amplitude} 150 0 t150 0`.repeat(8)}`;
    return `
        <div class="sc-swell sc-swell-${name}">
            <svg viewBox="0 0 2400 100" preserveAspectRatio="none">
                <path class="sc-swell-body" d="${crest} V100 H0 Z" />
                <path class="sc-swell-crest" d="${crest}" />
            </svg>
        </div>`;
}

// Clumps of blades leaning out from one spot, some of them with a cattail standing in them
function reeds(rand, { clumps, tall, thick }) {
    let blades = "";
    let heads = "";
    for (let c = 0; c < clumps; c++) {
        const x = between(rand, 0, 2000);
        for (let i = 0; i < 7; i++) {
            const bladeX = x + between(rand, -40, 40);
            const height = between(rand, tall * 0.5, tall);
            const lean = between(rand, -50, 50);
            blades += `M${n(bladeX)} 322Q${n(bladeX)} ${n(320 - height * 0.6)} ${n(bladeX + lean)} ${n(320 - height)}`;
        }
        if (rand() < 0.6) {
            const stemX = x + between(rand, -25, 25);
            const height = between(rand, tall * 0.8, tall * 1.1);
            blades += `M${n(stemX)} 322L${n(stemX + 4)} ${n(320 - height)}`;
            heads += `<rect x="${n(stemX + 3 - thick * 1.4)}" y="${n(320 - height * 0.88)}" width="${n(thick * 2.8)}" height="${n(height * 0.16)}" rx="${n(thick * 1.4)}" />`;
        }
    }
    return `<path d="${blades}" stroke-width="${thick}" />${heads}`;
}

// Branching coral, brain coral and tube sponges, each clump its own color
function reef(rand, { clumps, tall, colors }) {
    let html = "";
    for (let c = 0; c < clumps; c++) {
        const x = between(rand, 0, 2000);
        const kind = rand();
        let body;
        if (kind < 0.45) {
            const arms = [];
            for (let i = 0; i < 3; i++) {
                branches(rand, arms, x + (i - 1) * 25, 266, -Math.PI / 2 + between(rand, -0.4, 0.4), between(rand, tall * 0.22, tall * 0.32), 4, 0.7);
            }
            body = `<path class="sc-coral-arms" stroke-width="${n(between(rand, 9, 15))}" d="${arms.join("")}" />`;
        } else if (kind < 0.78) {
            const w = between(rand, 45, 95);
            const brain = brainCoral(rand, x, 262, w, between(rand, w * 0.55, w * 0.9));
            body = `<path class="sc-coral-mound" d="${brain.mound}" /><path class="sc-coral-groove" d="${brain.grooves}" />`;
        } else {
            let tubes = "";
            let mouths = "";
            for (let i = 0; i < 3; i++) {
                const tx = x + (i - 1) * between(rand, 18, 32);
                const tw = between(rand, 14, 24);
                const th = between(rand, tall * 0.25, tall * 0.6);
                tubes += tube(tx, 262, tw, th);
                mouths += `<ellipse cx="${n(tx)}" cy="${n(266 - th)}" rx="${n(tw * 0.32)}" ry="${n(tw * 0.18)}" />`;
            }
            body = `<path class="sc-coral-tubes" d="${tubes}" /><g class="sc-tube-mouth">${mouths}</g>`;
        }
        html += `<g class="sc-coral" style="--c:${pick(rand, colors)}">${body}</g>`;
    }
    return html;
}

// A loose bunch of fish that crosses the screen together
function fishSchools(count, seed) {
    const rand = seeded(seed);
    return Array.from({ length: count }, () => {
        const size = between(rand, 7, 13);
        const fish = Array.from({ length: 6 }, () =>
            `<i style="--ox:${px(rand, 0, size * 7)};--oy:${px(rand, -size * 2, size * 2)}"></i>`).join("");
        const reverse = rand() < 0.4 ? ";--flip:-1" : "";
        return `<div class="sc-school" style="--y:${pct(rand, 12, 62)};--s:${n(size)}px;--d:${secs(rand, 26, 48)};--delay:${lead(rand, 48)}${reverse}">${fish}</div>`;
    }).join("");
}

function iceShelf(rand) {
    const points = [];
    for (let x = 0; x < 2000; x += between(rand, 40, 120)) points.push(`${n(x)} ${n(between(rand, 60, 130))}`);
    points.push(`2000 ${n(between(rand, 60, 130))}`);
    const edge = `M${points.join("L")}`;
    return `<path class="sc-ice-body" d="${edge}V200H0Z" /><path class="sc-ice-edge" d="${edge}" />`;
}

function mushroomPatch(rand) {
    const ground = 232;
    let stems = "";
    let caps = "";
    // Evenly spaced spots with some jitter, so the mushrooms spread along the floor instead of piling up
    const spots = 7;
    for (let c = 0; c < spots; c++) {
        const clusterX = (c + 0.5) * 2000 / spots + between(rand, -80, 80);
        let capPaths = "";
        const count = rand() < 0.6 ? 1 : 2;
        for (let i = 0; i < count; i++) {
            const height = between(rand, 30, 105);
            const shroom = mushroomCaps(rand, clusterX + (count > 1 ? between(rand, -35, 35) : 0), ground, height, between(rand, 12, 20) + height * 0.14);
            stems += shroom.stem;
            capPaths += shroom.cap;
        }
        const timing = `--d:${secs(rand, 2.5, 5)};--delay:${lead(rand, 5)}`;
        caps += `<path class="sc-halo" style="${timing}" d="${capPaths}" /><path class="sc-cap" style="${timing}" d="${capPaths}" />`;
    }
    const soil = crowns(rand, { width: 2000, height: 262, base: ground, minW: 60, maxW: 160, minH: 6, maxH: 22 });
    return `<path class="sc-stem" d="${stems}" />${caps}<path class="sc-soil" d="${soil}" />`;
}

const CORAL_COLORS = [
    "color-mix(in srgb, var(--tree-color) 45%, transparent)",
    "color-mix(in srgb, #e5806b 40%, transparent)",
    "color-mix(in srgb, #cf78b4 36%, transparent)",
    "color-mix(in srgb, #e6b45a 34%, transparent)",
];

const AURORA_COLORS = [
    ["color-mix(in srgb, var(--tree-color) 30%, transparent)", "color-mix(in srgb, #6fe3b5 26%, transparent)"],
    ["color-mix(in srgb, #6fe3b5 22%, transparent)", "color-mix(in srgb, #9a86e6 20%, transparent)"],
    ["color-mix(in srgb, #9a86e6 14%, transparent)", "color-mix(in srgb, var(--tree-color) 22%, transparent)"],
];

const SCENERY = {
    tidal: () => `
        <div class="sc-wash"></div>
        ${scatter("sc-current", 9, 11, r => ({ y: pct(r, 8, 55), w: px(r, 80, 280), d: secs(r, 16, 30), delay: lead(r, 30) }))}
        ${swell("far", 12)}${swell("mid", 18)}${swell("near", 24)}`,

    canopy: () => {
        const rand = seeded(21);
        const hang = (base, minH, maxH) => crowns(rand, { width: 2000, height: 220, base, minW: 90, maxW: 210, minH, maxH });
        return `
            <div class="sc-wash"></div>
            ${scatter("sc-ray", 7, 22, r => ({ x: pct(r, 0, 92), w: px(r, 50, 170), d: secs(r, 6, 11), delay: lead(r, 11), tilt: deg(r, 12, 26) }))}
            <svg class="sc-canopy sc-canopy-back" viewBox="0 0 2000 220" preserveAspectRatio="xMidYMin slice">
                <path transform="matrix(1 0 0 -1 0 220)" d="${hang(110, 40, 80)}" />
            </svg>
            <svg class="sc-canopy sc-canopy-front" viewBox="0 0 2000 220" preserveAspectRatio="xMidYMin slice">
                <path transform="matrix(1 0 0 -1 0 220)" d="${hang(150, 30, 70)}" />
            </svg>
            <svg class="sc-floor" viewBox="0 0 2000 140" preserveAspectRatio="xMidYMax slice">
                <path d="${crowns(rand, { width: 2000, height: 140, base: 95, minW: 40, maxW: 120, minH: 15, maxH: 50 })}" />
            </svg>
            ${scatter("sc-leaf", 16, 24, r => ({ x: pct(r, 0, 100), s: px(r, 8, 13), d: secs(r, 11, 18), delay: lead(r, 18), drift: px(r, -50, 50) }))}`;
    },

    stagnant: () => {
        const rand = seeded(41);
        return `
            <div class="sc-wash"></div>
            <svg class="sc-reeds" viewBox="0 0 2000 320" preserveAspectRatio="xMidYMax slice">${reeds(rand, { clumps: 18, tall: 250, thick: 5 })}</svg>
            ${scatter("sc-bubble", 14, 42, r => ({ x: pct(r, 3, 97), y: pct(r, 0, 12), s: px(r, 4, 9), rise: px(r, 60, 180), d: secs(r, 4, 9), delay: lead(r, 9) }))}
            ${scatter("sc-firefly", 14, 43, r => ({ x: pct(r, 5, 95), y: pct(r, 30, 85), "pulse-x": px(r, -40, 40), "pulse-y": px(r, -30, 30), d: secs(r, 7, 13), b: secs(r, 2.5, 5), delay: lead(r, 13) }))}`;
    },

    saline: () => {
        const rand = seeded(51);
        return `
            <div class="sc-wash"></div>
            ${fishSchools(4, 54)}
            <svg class="sc-reef" viewBox="0 0 2000 262" preserveAspectRatio="xMidYMax slice">${reef(rand, { clumps: 8, tall: 200, colors: CORAL_COLORS })}</svg>`;
    },

    frigid: () => {
        const rand = seeded(71);
        return `
            <div class="sc-wash"></div>
            ${AURORA_COLORS.map(([a, b], i) => `<div class="sc-aurora" style="--y:${[2, 9, 17][i]}%;--a:${a};--b:${b};--d:${[17, 23, 29][i]}s;--delay:-${i * 6}s"></div>`).join("")}
            <svg class="sc-ice" viewBox="0 0 2000 200" preserveAspectRatio="xMidYMax slice">${iceShelf(rand)}</svg>
            ${scatter("sc-snow", 44, 72, r => ({ x: pct(r, 0, 100), s: px(r, 2, 5), drift: px(r, -50, 50), d: secs(r, 10, 18), delay: lead(r, 18) }))}`;
    },

    decay: () => {
        const rand = seeded(81);
        const roots = [];
        const nodes = [];
        for (let x = between(rand, 20, 120); x < 1600; x += between(rand, 150, 260)) {
            branches(rand, roots, x, 705, -Math.PI / 2 + between(rand, -0.6, 0.6), between(rand, 70, 110), 5, 0.85, nodes);
        }
        return `
            <div class="sc-wash"></div>
            <svg class="sc-hyphae" viewBox="0 0 1600 700" preserveAspectRatio="xMidYMax slice">
                <path class="sc-hyphae-base" d="${roots.join("")}" />
                ${nodeCircles(rand, nodes, "sc-node", 7)}
            </svg>
            <svg class="sc-mushrooms" viewBox="0 0 2000 262" preserveAspectRatio="xMidYMax slice">${mushroomPatch(rand)}</svg>
            ${scatter("sc-spore", 32, 82, r => ({ x: pct(r, 2, 98), y: pct(r, 35, 95), s: px(r, 2, 5), dx: px(r, -40, 40), dy: px(r, -240, -80), d: secs(r, 8, 16), delay: lead(r, 16) }))}`;
    },
};

export const sceneryHtml = (id) => (SCENERY[id] || SCENERY.tidal)();
