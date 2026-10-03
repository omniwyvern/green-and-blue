// marshSublayer.js
//
// Draws the marsh and its zones (tussock = clump, hummock = mound, carr = wet wood)

import { getLayerState } from "../../../core/state.js";
import { getLevel, nextStep } from "../../../core/resources.js";
import { D } from "../../../utils/decimal.js";
import { formatNumber, formatPercent, formatWhole } from "../../../utils/format.js";
import { setText, setDisplay, setWidth, svgEl, setVar, setAttr, setClass } from "../../../utils/dom.js";
import { setRichText, upgradeDescription, rateSpan } from "../../../render/richText.js";
import { drawerTop } from "../../../render/fit.js";
import {
    STAGES, STAGE_ORDER, TOP_RANK, MOST_ZONES, NEIGHBOR_PER_TILE, PLANTS,
    marshIsBare, marshTiles, nextZoneAt, marshTooSmall,
    activeZones, stageOf, zoneKind, plantOf, heldBySilt,
    wetBand, suitsZone, nextPlant, fallbackPlant,
    diversityBonus, stagesHeld, marshHealth, marshScale, sizePenalty,
    keystoneBonus, communitiesHeld, stageMultiplier, communityMultiplier,
    storedWater, waterCapacity, waterFraction, refillRate, releaseCost, floodCost,
    releaseWater, floodZone, drainZone, drainYield, DRAIN_LIFT,
    sluicesOpen, floodPrecise, drawdownOpen, PART_SHARE,
    zoneProductionBoosted, marshProduction, plantYields, marshNeighborShare,
    TEMPO_PER_LEVEL, TOLERANCE_PER_LEVEL, SILT_PER_LEVEL, ALLUVIUM_PER_LEVEL,
    PEAT_PER_LEVEL, HARDY_PER_LEVEL,
    LEVEE_PER_LEVEL, CATCHMENT_PER_LEVEL, SEEPAGE_PER_LEVEL,
} from "../systems/marsh.js";
import { cardActive } from "../systems/cards.js";
import { extendUpgrade, capOf } from "../systems/evolutionTraits.js";
import { clamp01 } from "../../../utils/math.js";


//    !!! THE GROUND, SEEN FROM ABOVE AND FROM THE SIDE AT ONCE !!!

// The art is drawn flat then tilted and squashed into perspective, with plants kept upright
const TILT = 0.54;
const TURN = Math.SQRT1_2;
const project = (x, y) => ({ x: (x - y) * TURN, y: (x + y) * TURN * TILT });

const SCENE_W = 1500;
const SCENE_H = 1100;
const ORIGIN = { x: SCENE_W / 2, y: SCENE_H / 2 };

const LOBE_R = 126;
const SPREAD = 105;
const PANEL_ROOM = 220;

// Where each zone's lobe sits flat, for a marsh of that many zones
const LOBE_SPOTS = [
    [[0, 0]],
    [[-SPREAD, 0], [SPREAD, 0]],
    [[-SPREAD, -60], [SPREAD, -60], [0, 115]],
    [[-88, -88], [88, -88], [-88, 88], [88, 88]],
];

// Too many zones would make things be too big, so it rescales based on the number of them
const spriteScale = (tiles) => 1 + 0.85 * (1 - Math.exp(-0.16 * Math.max(0, tiles - 1)));

// Ragged edges of the zones, so it looks more natural
const edgeWobble = (angle, seed) =>
    1 + 0.13 * Math.sin(angle * 2 + seed) + 0.1 * Math.sin(angle * 3 - seed * 1.4)
      + 0.07 * Math.sin(angle * 5 + seed * 2.2) + 0.045 * Math.sin(angle * 7 - seed * 0.7)
      + 0.03 * Math.sin(angle * 11 + seed * 3.1);

function lobePath(cx, cy, radius, seed) {
    const points = [];
    const steps = 40;
    for (let i = 0; i < steps; i++) {
        const angle = (i / steps) * Math.PI * 2;
        const wobble = edgeWobble(angle, seed);
        points.push(project(cx + Math.cos(angle) * radius * wobble,
                            cy + Math.sin(angle) * radius * wobble));
    }

    const mid = (a, b) => `${((a.x + b.x) / 2).toFixed(1)} ${((a.y + b.y) / 2).toFixed(1)}`;
    let d = `M${mid(points[points.length - 1], points[0])}`;
    for (let i = 0; i < points.length; i++) {
        const here = points[i];
        d += ` Q${here.x.toFixed(1)} ${here.y.toFixed(1)} ${mid(here, points[(i + 1) % points.length])}`;
    }
    return `${d}Z`;
}

// Lobes overlap, so this bends each border to follow the water instead of coming out flat
const SWIRL = 21;
const swirlX = (x, y) => x + SWIRL * Math.sin(y / 46 + 1.3) + SWIRL * 0.5 * Math.sin(y / 21 - 2.1);
const swirlY = (x, y) => y + SWIRL * Math.sin(x / 52 - 0.7) + SWIRL * 0.5 * Math.sin(x / 24 + 1.9);

const inLobe = (x, y, cx, cy, seed) => {
    const dx = x - cx;
    const dy = y - cy;
    return Math.hypot(dx, dy) <= LOBE_R * edgeWobble(Math.atan2(dy, dx), seed);
};

function ownedBy(spots, index, x, y) {
    if (!inLobe(x, y, spots[index][0], spots[index][1], index * 1.9)) return false;
    const wx = swirlX(x, y);
    const wy = swirlY(x, y);
    const mine = (wx - spots[index][0]) ** 2 + (wy - spots[index][1]) ** 2;
    for (let j = 0; j < spots.length; j++) {
        if (j === index) continue;
        if (!inLobe(x, y, spots[j][0], spots[j][1], j * 1.9)) continue;
        if ((wx - spots[j][0]) ** 2 + (wy - spots[j][1]) ** 2 < mine) return false;
    }
    return true;
}

// Makes sure that zones sharing a border share the line properly and don't have overlapping borders
function cellReach(spots, index, angle) {
    const [cx, cy] = spots[index];
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const edge = LOBE_R * edgeWobble(angle, index * 1.9);
    const mine = (r) => ownedBy(spots, index, cx + dx * r, cy + dy * r);
    if (mine(edge - 0.01)) return { reach: edge, shared: false };

    let inside = 0;
    let outside = edge;
    for (let r = 2; r < edge; r += 2) {
        if (!mine(r)) { outside = r; break; }
        inside = r;
    }
    for (let i = 0; i < 9; i++) {
        const mid = (inside + outside) / 2;
        if (mine(mid)) inside = mid;
        else outside = mid;
    }
    return { reach: inside, shared: true };
}

const CELL_STEPS = 96;

// When there's a triple border, it's rounded off so that there's not a super angular bit
const ROUNDING = [1, 3, 5, 6, 5, 3, 1];

// Only the borders get rounded off, the shoreline does its own thing
function roundOff(reaches, shared) {
    const half = (ROUNDING.length - 1) / 2;
    const weight = ROUNDING.reduce((sum, w) => sum + w, 0);
    const at = (i) => (i + reaches.length * 2) % reaches.length;
    return reaches.map((raw, i) => {
        let total = 0;
        let near = 0;
        for (let k = 0; k < ROUNDING.length; k++) {
            total += ROUNDING[k] * reaches[at(i + k - half)];
            if (shared[at(i + k - half)]) near += ROUNDING[k];
        }
        const pull = near / weight;
        return raw * (1 - pull) + (total / weight) * pull;
    });
}

// Flooded waters overlap stuff, but the shoreline is where the marsh stops so nothing goes past it
function cellPath(spots, index, swell = 1) {
    const [cx, cy] = spots[index];
    const reaches = [];
    const shared = [];
    for (let i = 0; i < CELL_STEPS; i++) {
        const angle = (i / CELL_STEPS) * Math.PI * 2;
        const cut = cellReach(spots, index, angle);
        reaches.push(cut.shared ? cut.reach * swell : cut.reach);
        shared.push(cut.shared);
    }

    const points = roundOff(reaches, shared).map((reach, i) => {
        const angle = (i / CELL_STEPS) * Math.PI * 2;
        return project(cx + Math.cos(angle) * reach, cy + Math.sin(angle) * reach);
    });

    const mid = (a, b) => `${((a.x + b.x) / 2).toFixed(1)} ${((a.y + b.y) / 2).toFixed(1)}`;
    let d = `M${mid(points[points.length - 1], points[0])}`;
    for (let i = 0; i < points.length; i++) {
        const here = points[i];
        d += ` Q${here.x.toFixed(1)} ${here.y.toFixed(1)} ${mid(here, points[(i + 1) % points.length])}`;
    }
    return `${d}Z`;
}

// A few bits of land in each zone stay dry, mostly on the border to hide the seams
const SHOAL_R = LOBE_R * 0.19;

function shoalPath(spots, index) {
    const [cx, cy] = spots[index];
    const rays = [];
    for (let i = 0; i < CELL_STEPS; i++) {
        rays.push(cellReach(spots, index, (i / CELL_STEPS) * Math.PI * 2));
    }
    const reachAt = (step) => rays[(Math.round(step) % CELL_STEPS + CELL_STEPS) % CELL_STEPS].reach;
    const blob = (step, out, size, seed) => {
        const angle = (step / CELL_STEPS) * Math.PI * 2;
        return lobePath(cx + Math.cos(angle) * reachAt(step) * out,
                        cy + Math.sin(angle) * reachAt(step) * out, size, seed);
    };

    const runs = [];
    for (let i = 0; i < CELL_STEPS; i++) {
        if (!rays[i].shared) continue;
        const last = runs[runs.length - 1];
        if (last && last[1] === i - 1) last[1] = i;
        else runs.push([i, i]);
    }
    if (runs.length > 1 && runs[0][0] === 0 && runs[runs.length - 1][1] === CELL_STEPS - 1) {
        runs[0][0] = runs.pop()[0] - CELL_STEPS;
    }
    runs.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]));

    const parts = [];

    if (runs.length > 0) {
        const [from, to] = runs[0];
        parts.push(blob(from + (to - from) * (index % 2 === 0 ? 0.28 : 0.72),
                        0.92, SHOAL_R, index * 3.7));
    }
    // One zone keeps a second well clear of any border, so the banks are not all seams
    if (index === 1 || runs.length === 0) {
        const step = CELL_STEPS * (0.13 + index * 0.31) % CELL_STEPS;
        parts.push(blob(step, 0.66, SHOAL_R * 0.7, index * 2.1 + 1.4));
    }
    return parts.join(" ");
}

// The bits of the zone that stand out of the water
const ISLES = 5;

function islesPath(cx, cy, seed) {
    const parts = [];
    for (let j = 0; j < ISLES; j++) {
        const angle = j * 2.399963 + seed;
        const out = Math.sqrt((j + 0.65) / ISLES) * 0.56;
        parts.push(lobePath(cx + Math.cos(angle) * out * LOBE_R,
                            cy + Math.sin(angle) * out * LOBE_R,
                            LOBE_R * (0.28 - 0.03 * (j % 3)), seed + j * 2.3));
    }
    return parts.join(" ");
}

function ripplesPath(cx, cy) {
    const arcs = [[-0.42, -0.3, 0.5], [0.16, 0.1, 0.62], [-0.2, 0.46, 0.44]];
    return arcs.map(([ox, oy, width]) => {
        const from = project(cx + (ox - width / 2) * LOBE_R, cy + oy * LOBE_R);
        const bend = project(cx + ox * LOBE_R, cy + (oy - 0.14) * LOBE_R);
        const to = project(cx + (ox + width / 2) * LOBE_R, cy + oy * LOBE_R);
        return `M${from.x.toFixed(1)} ${from.y.toFixed(1)}`
            + ` Q${bend.x.toFixed(1)} ${bend.y.toFixed(1)} ${to.x.toFixed(1)} ${to.y.toFixed(1)}`;
    }).join(" ");
}

// Where growth sits in a lobe as fractions of its radius, spaced by the golden angle so it isn't too regular
function tuftSpots(index, count) {
    const spots = [];
    for (let i = 0; i < count; i++) {
        const angle = i * 2.399963 + index * 1.71;
        const out = Math.sqrt((i + 0.55) / count) * 0.82;
        spots.push({ x: Math.cos(angle) * out, y: Math.sin(angle) * out });
    }
    return spots;
}

const blade = (x, y, dx, dy, width, color) =>
    `<path d="M${x.toFixed(1)} ${y.toFixed(1)} Q${(x + dx * 0.35).toFixed(1)} ${(y + dy * 0.55).toFixed(1)}`
    + ` ${(x + dx).toFixed(1)} ${(y + dy).toFixed(1)}" fill="none" stroke="${color}"`
    + ` stroke-width="${width}" stroke-linecap="round"/>`;

// One clump of each kind of growth, drawn standing up and not tilted like the rest of the ground
const LOOKS = {
    wisp: { count: 16, draw: (x, y, seed, color) => {
        const h = 9 + (seed % 3) * 2.5;
        return blade(x, y, -3.5, -h, 1.6, color) + blade(x, y, 0.6, -h - 2, 1.6, color)
            + blade(x, y, 3.8, -h + 1, 1.6, color);
    } },

    sward: { count: 30, draw: (x, y, seed, color) => {
        const h = 12 + (seed % 4) * 2;
        return blade(x, y, -3, -h, 2.2, color) + blade(x, y, 1, -h - 3, 2.2, color)
            + blade(x, y, 4, -h + 1.5, 2.2, color);
    } },

    // Sedges are the round-topped guys, so their blades arc right over
    tuft: { count: 20, draw: (x, y, seed, color) => {
        const h = 17 + (seed % 3) * 3;
        return blade(x, y, -7, -h * 0.72, 2.4, color) + blade(x, y, -2.5, -h, 2.4, color)
            + blade(x, y, 2.5, -h - 1.5, 2.4, color) + blade(x, y, 7.5, -h * 0.66, 2.4, color);
    } },

    // Tussocks stand on their own hummocks (teehee funny words) with the blades thrown out all around the top
    tussock: { count: 14, draw: (x, y, seed, color) => {
        const h = 15 + (seed % 3) * 3;
        return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="9" ry="4"`
            + ` fill="${color}" opacity="0.45"/>`
            + blade(x, y - 3, -9, -h * 0.6, 2.2, color) + blade(x, y - 3, -4, -h, 2.2, color)
            + blade(x, y - 3, 1, -h - 4, 2.2, color) + blade(x, y - 3, 5.5, -h, 2.2, color)
            + blade(x, y - 3, 10, -h * 0.55, 2.2, color);
    } },

    reed: { count: 24, draw: (x, y, seed, color) => {
        const h = 32 + (seed % 4) * 6;
        const lean = ((seed % 3) - 1) * 3;
        const top = { x: x + lean, y: y - h };
        return blade(x, y, lean, -h, 2.2, color)
            + blade(top.x, top.y + 2, lean * 0.4 + 2, -7, 1.4, color)
            + blade(top.x, top.y + 2, lean * 0.4 - 2, -6, 1.4, color);
    } },

    cattail: { count: 22, draw: (x, y, seed, color) => {
        const h = 34 + (seed % 4) * 5;
        const lean = ((seed % 3) - 1) * 3;
        const top = { x: x + lean, y: y - h };
        return blade(x, y, lean, -h, 2.4, color)
            + `<rect x="${(top.x - 2.1).toFixed(1)}" y="${(top.y - 1).toFixed(1)}" width="4.2"`
            + ` height="11" rx="2.1" fill="#7a5334"/>`
            + blade(x, y, lean - 7, -h * 0.6, 1.8, color);
    } },

    // Carr gets little trees
    carr: { count: 9, draw: (x, y, seed, color) => {
        const h = 34 + (seed % 3) * 6;
        const crown = { x: x + ((seed % 2) - 0.5) * 4, y: y - h };
        return `<path d="M${x.toFixed(1)} ${y.toFixed(1)} L${crown.x.toFixed(1)} ${(crown.y + 8).toFixed(1)}"`
            + ` fill="none" stroke="#4a3a2a" stroke-width="3" stroke-linecap="round"/>`
            + `<ellipse cx="${crown.x.toFixed(1)}" cy="${crown.y.toFixed(1)}" rx="12.5" ry="9.5" fill="${color}"/>`
            + `<ellipse cx="${(crown.x - 8).toFixed(1)}" cy="${(crown.y + 5).toFixed(1)}" rx="7.5" ry="6" fill="${color}"/>`
            + `<ellipse cx="${(crown.x + 8).toFixed(1)}" cy="${(crown.y + 5.5).toFixed(1)}" rx="7" ry="5.5" fill="${color}"/>`;
    } },
};

// A zone's standing vegetation, sorted front to back so the near clumps sit over the far ones
function plantsSvg(zone, index) {
    const plant = plantOf(zone);
    const look = LOOKS[plant.look];
    if (!look) return "";

    return tuftSpots(index, look.count)
        .map((spot, i) => ({ at: project(spot.x * LOBE_R, spot.y * LOBE_R), i }))
        .sort((a, b) => a.at.y - b.at.y)
        .map(({ at, i }) => look.draw(at.x, at.y, i * 7, plant.color))
        .join("");
}


//    !!! WHAT A ZONE IS DOING !!!

// What the zone is paying out this second
function rateSpans(output) {
    const parts = [];
    for (const resourceId in output) parts.push(rateSpan(resourceId, output[resourceId]));
    return parts;
}

function productionText(s, zone) {
    const parts = rateSpans(zoneProductionBoosted(s, zone));
    return parts.length > 0 ? parts.join(" &middot; ") : "Nothing until something grows here";
}

// The reference to what each community wants and what it pays for it
function plantsText(s) {
    return PLANTS.filter((plant) => plant.rank > 0).map((plant) => {
        const [low, high] = wetBand(plant);
        const pays = plantYields(plant, s)
            .map(([stage, output]) => {
                const parts = rateSpans(output);
                return parts.length > 0
                    ? `<div class="plant-pay"><span>${STAGES[stage].name}</span>${parts.join(" ")}</div>`
                    : "";
            }).join("");
        return `<div class="plant-entry">
            <div class="plant-name"><span class="plant-swatch" style="background:${plant.color}"></span>${plant.name}</div>
            <div class="plant-wants">Holds between ${formatPercent(low)} and ${formatPercent(high)} wet${plant.needs > 0 ? `, once the bed is ${formatPercent(plant.needs)} silt` : ", on bare ground"}</div>
            <div class="plant-blurb">${plant.blurb}</div>
            ${pays}
        </div>`;
    }).join("");
}

// How much water is standing in the zone, and which way it is going
const waterText = (zone) =>
    `${formatPercent(zone.water)} full, ${zone.rising ? "still filling" : "draining away"}`;

// What is growing, and whether the zone suits it
function plantText(zone) {
    const plant = plantOf(zone);
    if (plant.rank === 0) return "Bare mud, nothing has taken hold yet.";

    if (!suitsZone(plant, zone)) {
        const wet = zone.wetness > wetBand(plant)[1];
        return `${plant.name} is dying, this zone is ${wet ? "too wet" : "too dry"}.`;
    }
    return `${plant.name} is thriving, this zone suits it.`;
}

// What the zone is turning into, and what is holding that up
function nextPlantText(zone) {
    const plant = plantOf(zone);
    if (plant.rank > 0 && !suitsZone(plant, zone)) {
        return `${fallbackPlant(zone).name} instead,`
            + ` ${formatPercent(Math.max(0, -zone.growth))} of the way there`;
    }

    const coming = nextPlant(zone);
    if (coming !== null) {
        return `${coming.name}, ${formatPercent(Math.max(0, zone.growth))} of the way there`;
    }

    const waiting = heldBySilt(zone);
    if (waiting !== null) {
        return `${waiting.name}, once the silt reaches ${formatPercent(waiting.needs)}`
            + `. It is at ${formatPercent(zone.sediment)}, and builds up while the zone is flooded`;
    }
    if (plant.rank >= TOP_RANK) return `Nothing more, ${plant.name} is the richest growth there is`;
    return "Nothing else fits this water level, so flood it more or less to change that";
}


//    !!! BUILDING THE PICTURE !!!

const DEFS = `
    <filter id="marsh-soften" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="5"/>
    </filter>
    <linearGradient id="marsh-water-fill" x1="0" y1="0" x2="0.35" y2="1">
        <stop offset="0" style="stop-color: var(--water-top)"/>
        <stop offset="1" style="stop-color: var(--water-deep)"/>
    </linearGradient>
    <radialGradient id="marsh-bank-fill" cx="0.4" cy="0.3" r="0.8">
        <stop offset="0" style="stop-color: var(--bank-high)"/>
        <stop offset="1" style="stop-color: var(--bank-low)"/>
    </radialGradient>
`;

const MARK_MARKUP = (index) => `
    <div class="zone-mark" data-zone="${index}">
        <div class="zone-plate">
            <span class="zone-name"></span>
            <span class="zone-stage"></span>
            <div class="zone-bar"><div class="zone-bar-fill"></div></div>
        </div>
        <div class="zone-gates">
            <button class="zone-flood" type="button" data-flood="${index}">Flood</button>
            <button class="zone-flood zone-flood-part" type="button"
                    data-flood="${index}" data-share="${PART_SHARE}">Part</button>
            <button class="zone-flood zone-drain" type="button" data-drain="${index}">Drain</button>
        </div>
    </div>
`;

const TIP_MARKUP = `
    <div class="zone-tip">
        <div class="zone-tip-head"><span class="zone-tip-name"></span><span class="zone-tip-stage"></span></div>
        <div class="zone-tip-blurb"></div>
        <div class="zone-tip-row"><span>Paying</span><span class="zone-tip-yield"></span></div>
        <div class="zone-tip-row"><span>Water</span><span data-tip="water"></span></div>
        <div class="zone-tip-row zone-tip-stack"><span>Vegetation</span><span data-tip="plant"></span></div>
        <div class="zone-tip-row zone-tip-stack"><span>Turning into</span><span data-tip="next"></span></div>
        <div class="zone-tip-note"></div>
    </div>
`;

function buildScene(el, layer) {
    el.classList.add("marsh-scene");
    el.style.left = `${-ORIGIN.x}px`;
    el.style.top = `${-ORIGIN.y}px`;
    el.style.width = `${SCENE_W}px`;
    el.style.height = `${SCENE_H}px`;

    const svg = svgEl("svg", { class: "marsh-svg", viewBox: `0 0 ${SCENE_W} ${SCENE_H}` });

    // Water is cut off hard at the shoreline, but faded along shared borders
    const cuts = [0, 1, 2, 3].map(i =>
        `<clipPath id="marsh-clip-${i}"><path/></clipPath>`
        + `<mask id="marsh-soft-${i}" maskUnits="userSpaceOnUse"`
        + ` x="-800" y="-800" width="1600" height="1600">`
        + `<path fill="#fff" stroke="#fff" stroke-width="10" filter="url(#marsh-soften)"/>`
        + `</mask>`).join("");
    svg.innerHTML = `<defs>${DEFS}${cuts}</defs>
        <g class="marsh-iso">
            <g class="marsh-rim"></g>
            <g class="marsh-bank"></g>
            <g class="marsh-soil"></g>
            <g class="marsh-water"></g>
            <g class="marsh-isles"></g>
            <g class="marsh-shoals"></g>
            <g class="marsh-edges"></g>
            <g class="marsh-flora"></g>
            <g class="marsh-hits"></g>
        </g>`;
    el.appendChild(svg);

    const built = { svg, iso: svg.querySelector(".marsh-iso"), zones: [],
                    layoutKey: 0, outlines: [], cells: [], reaches: [] };

    for (let i = 0; i < MOST_ZONES; i++) {
        const rim = svgEl("path", { class: "lobe-rim" });
        svg.querySelector(".marsh-rim").appendChild(rim);

        const bank = svgEl("path", { class: "lobe-bank" });
        svg.querySelector(".marsh-bank").appendChild(bank);

        const soil = svgEl("path", { class: "lobe-soil" });
        svg.querySelector(".marsh-soil").appendChild(soil);

        const pool = svgEl("g", { "clip-path": `url(#marsh-clip-${i})` });
        pool.innerHTML = `<g mask="url(#marsh-soft-${i})">`
            + `<g class="lobe-wet"><path class="lobe-water"/><path class="lobe-ripples"/></g></g>`;
        svg.querySelector(".marsh-water").appendChild(pool);

        const isles = svgEl("path", { class: "lobe-isles" });
        svg.querySelector(".marsh-isles").appendChild(isles);

        const shoal = svgEl("path", {
            class: "lobe-shoal", "clip-path": `url(#marsh-clip-${i})`,
        });
        svg.querySelector(".marsh-shoals").appendChild(shoal);

        const edge = svgEl("path", { class: "lobe-edge" });
        svg.querySelector(".marsh-edges").appendChild(edge);

        const flora = svgEl("g", { class: "lobe-flora" });
        flora.innerHTML = `<g class="flora-was"></g><g class="flora-now"></g>`;
        svg.querySelector(".marsh-flora").appendChild(flora);

        const hit = svgEl("path", { class: "lobe-hit" });
        svg.querySelector(".marsh-hits").appendChild(hit);

        built.zones.push({
            rim, bank, soil, pool, isles, shoal, edge, flora, hit,
            clip: svg.querySelector(`#marsh-clip-${i} path`),
            soft: svg.querySelector(`#marsh-soft-${i} path`),
            wet: pool.querySelector(".lobe-wet"),
            water: pool.querySelector(".lobe-water"),
            ripples: pool.querySelector(".lobe-ripples"),
            key: "",
        });
    }

    const marks = document.createElement("div");
    marks.className = "marsh-marks";
    marks.innerHTML = [0, 1, 2, 3].map(MARK_MARKUP).join("");
    el.appendChild(marks);
    built.marks = [...marks.querySelectorAll(".zone-mark")];

    const over = el.closest(".drag-canvas-viewport");
    const shelf = (over || el).querySelector(".zone-tip-layer") || document.createElement("div");
    shelf.className = "zone-tip-layer";
    shelf.innerHTML = TIP_MARKUP;
    (over || el).appendChild(shelf);
    built.tip = shelf.querySelector(".zone-tip");
    built.open = -1;

    marks.addEventListener("click", (event) => {
        const gate = event.target.closest("[data-flood], [data-drain]");
        if (!gate) return;
        const s = getLayerState(layer.stateKey);
        if (gate.dataset.drain !== undefined) drainZone(s, Number(gate.dataset.drain));
        else floodZone(s, Number(gate.dataset.flood), Number(gate.dataset.share) || 1);
    });

    // Hovering over a zone (or its label) lights up that zone, clicking opens/closes the readout
    for (let i = 0; i < MOST_ZONES; i++) {
        const light = (on) => {
            setClass(built.zones[i].edge, "hovered", on);
            setClass(built.marks[i], "hovered", on);
        };
        const pick = (event) => {
            if (event.target.closest("[data-flood], [data-drain]")) return;
            event.stopPropagation();
            built.open = built.open === i ? -1 : i;
            placeTip(built, el);
        };
        for (const target of [built.zones[i].hit, built.marks[i]]) {
            target.addEventListener("pointerenter", () => light(true));
            target.addEventListener("pointerleave", () => light(false));
            target.addEventListener("click", pick);
        }
    }

    // A click that missed every zone, or a look at anything else, closes the readout
    const shut = () => {
        if (built.open < 0) return;
        built.open = -1;
        placeTip(built, el);
    };
    built.svg.addEventListener("click", shut);
    const room = el.closest(".drag-canvas-viewport");
    if (room) room.addEventListener("pointerdown", (event) => {
        if (!event.target.closest(".zone-mark, .marsh-hits, .zone-tip")) shut();
    });

    el.__marsh = built;
}


//    !!! THE VIEW !!!

export const MARSH_VIEW = {
    name: "Marsh",
    color: "#7cae6a",
    canvasType: "drag",
    viewportClass: "marsh-viewport",
    defaultZoom: 1,
    defaultView: { x: 110, y: 0 },

    scene: {
        build(el, s, layer) {
            buildScene(el, layer);
        },

        bounds() {
            if (marshIsBare()) return null;
            const reach = (SPREAD + LOBE_R + 70) * spriteScale(marshTiles());
            return { minX: -reach, minY: -reach * TILT, maxX: reach + PANEL_ROOM, maxY: reach * TILT };
        },

        update(el, s) {
            const built = el.__marsh;
            const zones = activeZones(s);
            setDisplay(el, zones.length > 0);
            if (zones.length === 0) return;

            // Nothing is drawn while it's off screen, so it kept fading in instead of being placed
            const now = performance.now();
            const fresh = now - (built.lastDrawn || 0) > 400;
            built.lastDrawn = now;

            const scale = spriteScale(marshTiles());
            setAttr(built.iso, "transform",
                `translate(${ORIGIN.x} ${ORIGIN.y}) scale(${scale.toFixed(3)})`);

            const spots = LOBE_SPOTS[zones.length - 1];
            // The shapes only move when the marsh gains a lobe
            if (built.layoutKey !== zones.length) {
                built.layoutKey = zones.length;
                built.outlines = spots.map(([cx, cy], i) => lobePath(cx, cy, LOBE_R, i * 1.9));
                built.cells = spots.map((_, i) => cellPath(spots, i));
                built.shoals = spots.map((_, i) => shoalPath(spots, i));
                built.pools = spots.map((_, i) => cellPath(spots, i, 1.03));
                built.reaches = spots.map((_, i) => cellPath(spots, i, 1.06));
            }

            for (let i = 0; i < MOST_ZONES; i++) {
                const shown = i < zones.length;
                const parts = built.zones[i];
                for (const piece of [parts.rim, parts.bank, parts.soil, parts.pool,
                                     parts.isles, parts.shoal, parts.edge, parts.flora,
                                     parts.hit]) {
                    setDisplay(piece, shown);
                }
                setDisplay(built.marks[i], shown);
                if (shown) {
                    updateZone(built, i, s, zones[i], spots[i], built.outlines[i], built.cells[i],
                               built.pools[i], built.reaches[i], built.shoals[i],
                               zones.length, scale, fresh);
                }
            }

            if (built.open >= zones.length) built.open = -1;
            placeTip(built, el);
        },
    },

    hud: {
        build(el, s, layer) {
            el.innerHTML = HUD_MARKUP;
            el.querySelector(".marsh-release").addEventListener("click", () =>
                releaseWater(getLayerState(layer.stateKey)));

            for (const row of el.querySelectorAll(".marsh-readout")) {
                const hint = row.querySelector(".marsh-hint");
                if (hint === null) continue;
                row.addEventListener("pointerenter", () => {
                    hint.style.display = "block";
                    const size = hint.getBoundingClientRect();
                    hint.style.display = "";
                    const at = row.getBoundingClientRect();
                    hint.style.left = `${Math.round(Math.max(8, at.left - size.width - 8))}px`;
                    hint.style.top = `${Math.round(Math.min(Math.max(8, at.top - 6),
                        window.innerHeight - size.height - 8))}px`;
                });
            }
        },

        update(el, s) {
            const bare = marshIsBare();
            setDisplay(el.querySelector(".marsh-bare"), bare);
            setDisplay(el.querySelector(".marsh-live"), !bare);
            setDisplay(el.querySelector(".marsh-warning"), marshTooSmall());
            if (!bare) updateMeters(el, s, activeZones(s));
        },
    },

    drawers: {
        water: {
            label: "Water",
            color: "#4a90d9",
            upgrades: {
                catchment: {
                    title: "Bigger Store",
                    description: (s) => upgradeDescription(
                        `The marsh holds ${formatPercent(CATCHMENT_PER_LEVEL * getLevel(s, "catchment"))} more water in store.`,
                        nextStep(s, "catchment", 10, "+5%")),
                    max: 10,
                    cost: (s, level) => ({ blueEssence: D(1.25e21).mul(D(11).pow(level)) }),
                },
                seepage: {
                    title: "Faster Refill",
                    description: (s) => upgradeDescription(
                        `Water comes back into the store ${formatPercent(SEEPAGE_PER_LEVEL * getLevel(s, "seepage"))} faster.`,
                        nextStep(s, "seepage", 12, "+25%")),
                    max: 12,
                    cost: (s, level) => ({ blueEssence: D(1.75e21).mul(D(7).pow(level)) }),
                },
                tempo: {
                    title: "Spring Tempo",
                    description: (s) => upgradeDescription(
                        `Every zone fills and drains ${formatPercent(TEMPO_PER_LEVEL * getLevel(s, "tempo"))} faster,`
                        + ` so it moves through all four stages sooner.`,
                        nextStep(s, "tempo", 8, "+12%")),
                    max: 8,
                    cost: (s, level) => ({
                        greenEssence: D(5e20).mul(D(7.5).pow(level)),
                        blueEssence: D(5e21).mul(D(16).pow(level)),
                    }),
                },
                levees: {
                    title: "Levees",
                    description: (s) => upgradeDescription(
                        `Zones drift into sync ${formatPercent(LEVEE_PER_LEVEL * getLevel(s, "levees"))} slower.`,
                        nextStep(s, "levees", 5, "+10%")),
                    max: 5,
                    cost: (s, level) => ({ greenEssence: D(1e21).mul(D(30).pow(level)) }),
                },
                sluiceGates: {
                    title: "Flood Gates",
                    description: () => upgradeDescription(
                        `Flood one zone at a time instead of the whole marsh. This is the only way to push zones apart by hand.`),
                    max: 1,
                    cost: () => ({ greenEssence: D(7.5e20), blueEssence: D(3.75e21) }),
                },
                floodPrecision: {
                    title: "Flood Precision",
                    description: () => upgradeDescription(
                        `Adds a smaller flood to each gate: ${formatPercent(PART_SHARE)} of the effect for`
                        + ` ${formatPercent(PART_SHARE)} of the water. Good for nudging a zone into the next stage.`),
                    max: 1,
                    hidden: () => !sluicesOpen(),
                    cost: () => ({ greenEssence: D(2.5e23), blueEssence: D(2.5e24) }),
                },
                drawdown: {
                    title: "Drain Gates",
                    description: () => upgradeDescription(
                        `Drain ${formatPercent(DRAIN_LIFT)} of a zone's depth on demand and get some of that`
                        + ` water back in the store.`),
                    max: 1,
                    hidden: () => !sluicesOpen(),
                    cost: () => ({ greenEssence: D(5e24), blueEssence: D(3e26) }),
                },
            },
        },

        ground: {
            label: "Ground",
            color: "#7cae6a",
            upgrades: {
                siltTraps: {
                    title: "Silt Traps",
                    description: (s) => upgradeDescription(
                        `${formatPercent(SILT_PER_LEVEL * getLevel(s, "siltTraps"))} less of a zone's silt washes back out while the water is running off.`,
                        nextStep(s, "siltTraps", 5, "+15%")),
                    max: 5,
                    cost: (s, level) => ({ greenEssence: D(7.5e20).mul(D(33).pow(level)), biomass: D(1e12).mul(D(8).pow(level)) }),
                },
                floodTolerance: {
                    title: "Flood Tolerance",
                    description: (s) => upgradeDescription(
                        `Everything growing holds on through ${formatPercent(TOLERANCE_PER_LEVEL * getLevel(s, "floodTolerance"))} more standing water than it otherwise would.`,
                        nextStep(s, "floodTolerance", 5, "+6%")),
                    max: 5,
                    cost: (s, level) => ({ greenEssence: D(1.25e21).mul(D(29).pow(level)), biomass: D(2e12).mul(D(8).pow(level)) }),
                },
                alluvium: {
                    title: "Settling Silt",
                    description: (s) => upgradeDescription(
                        `${formatPercent(ALLUVIUM_PER_LEVEL * getLevel(s, "alluvium"))} more silt settles out of`
                        + ` standing water, so richer plants can grow sooner.`,
                        nextStep(s, "alluvium", 6, "+20%")),
                    max: 6,
                    cost: (s, level) => ({ blueEssence: D(5e21).mul(D(50).pow(level)) }),
                },
                peatMemory: {
                    title: "Peat Memory",
                    description: (s) => upgradeDescription(
                        `Plants react to water changes`
                        + ` ${formatPercent(PEAT_PER_LEVEL * getLevel(s, "peatMemory"))} more slowly, so a zone can be`
                        + ` flooded briefly without hurting what grows there.`,
                        nextStep(s, "peatMemory", 5, "+15%")),
                    max: 5,
                    cost: (s, level) => ({ greenEssence: D(2.5e21).mul(D(25).pow(level)), biomass: D(3e12).mul(D(8).pow(level)) }),
                },
                hardyStands: {
                    title: "Hardy Stands",
                    description: (s) => upgradeDescription(
                        `Plants in the wrong water level die back`
                        + ` ${formatPercent(HARDY_PER_LEVEL * getLevel(s, "hardyStands"))} slower, giving you more time to fix it.`,
                        nextStep(s, "hardyStands", 5, "+15%")),
                    max: 5,
                    cost: (s, level) => ({ greenEssence: D(1.75e21).mul(D(26).pow(level)), biomass: D(2e12).mul(D(8).pow(level)) }),
                },
                mosaic: {
                    title: "Mosaic",
                    description: (s) => upgradeDescription(
                        `Each stage held at once past the first multiplies the marsh by`
                        + ` ${formatNumber(stageMultiplier())} instead of 3.`,
                        nextStep(s, "mosaic", 10, "+30%")),
                    max: 10,
                    cost: (s, level) => ({ greenEssence: D(2.5e23).mul(D(45).pow(level)), biomass: D(3e13).mul(D(8).pow(level)) }),
                },
                keystone: extendUpgrade("keystone", {
                    title: "Varied Life",
                    description: (s) => upgradeDescription(
                        `Each different plant community past the first multiplies`
                        + ` what the zones pay by ${formatNumber(communityMultiplier())}.`
                        + ` Two zones with the same plants count once.`,
                        nextStep(s, "keystone", capOf("keystone"), "+50% each")),
                    max: 8,
                    cost: (s, level) => ({ greenEssence: D(1.25e21).mul(D(6.8).pow(level)), biomass: D(3e12).mul(D(6).pow(level)) }),
                }, (over) => ({ greenEssence: D(1e38).mul(D(30).pow(over)) })),
            },
        },
    },
};


//    !!! THE PANEL BESIDE IT !!!

const HUD_MARKUP = `
    <aside class="marsh-panel" data-canvas-cover>
        <div class="marsh-warning">This marsh is too small, so one zone can only be in one stage at a time.</div>

        <div class="marsh-card marsh-bare">
            <div class="marsh-page-title">No marsh yet</div>
            <div class="marsh-page-note">Make a marsh tile on the world map to open this.</div>
        </div>

        <div class="marsh-live">
            <div class="marsh-card">
                <div class="meter-head"><span>Stored Water</span><span class="water-amount"></span></div>
                <div class="meter-track"><div class="meter-fill water-fill"></div></div>
                <div class="meter-note water-note"></div>
            </div>
            <button class="marsh-release" type="button"></button>
            <div class="marsh-info">
                <div class="marsh-card marsh-readouts">
                    <div class="marsh-readout"><span>Variety</span><span class="marsh-variety"></span>
                        <span class="marsh-hint">How many of the four stages your zones are in, and the
                            bonus for it. Zones drift into sync over time - flood one at a time to split them up.</span></div>
                    <div class="marsh-readout marsh-keystone-row"><span>Communities</span><span class="marsh-keystone"></span>
                        <span class="marsh-hint">How many different plant communities are growing, and
                            the bonus for it. Keep zones at different water levels to grow different plants.</span></div>
                    <div class="marsh-readout"><span>Vegetation</span><span class="marsh-health"></span>
                        <span class="marsh-hint">How well each zone's plants suit its water level. Plants
                            grow while the water is in their range and die back outside it.</span></div>
                    <div class="marsh-readout"><span>Marsh</span><span class="marsh-size"></span>
                        <span class="marsh-hint">How many zones the marsh has. More marsh tiles on the
                            world map make it bigger and sometimes add a zone.</span></div>
                    <div class="marsh-readout"><span>Neighbors</span><span class="marsh-adjacent"></span>
                        <span class="marsh-hint">Bonus from marsh tiles next to each other. Keep marsh
                            tiles together on the world map.</span></div>
                    <div class="marsh-next"></div>
                </div>
                <div class="marsh-card marsh-total">
                    <div class="marsh-total-head">Everything the zones pay</div>
                    <div class="marsh-total-lines"></div>
                </div>
            </div>
            <details class="marsh-card marsh-plants">
                <summary>What grows here</summary>
                <div class="marsh-plants-list"></div>
            </details>
        </div>
    </aside>
`;


//    !!! PATCHING !!!

function updateZone(built, index, s, zone, spot, outline, cell, pool, reach, shoal,
                    count, scale, fresh) {
    const parts = built.zones[index];
    const mark = built.marks[index];
    const [cx, cy] = spot;
    const kind = zoneKind(zone);
    const stage = stageOf(zone);
    const middle = project(cx, cy);

    // A zone's shapes only depend on the layout, so they are cut once for it
    const key = `${count}:${cx},${cy}`;
    if (parts.key !== key) {
        parts.key = key;
        setAttr(parts.rim, "d", lobePath(cx, cy, LOBE_R + 54, index * 1.9));
        setAttr(parts.bank, "d", lobePath(cx, cy, LOBE_R + 44, index * 1.9));
        setAttr(parts.soil, "d", outline);
        setAttr(parts.edge, "d", cell);
        setAttr(parts.hit, "d", reach);
        setAttr(parts.clip, "d", outline);
        setAttr(parts.soft, "d", pool);
        setAttr(parts.water, "d", outline);
        setAttr(parts.isles, "d", islesPath(cx, cy, index * 1.9));
        setAttr(parts.shoal, "d", shoal);
        setAttr(parts.ripples, "d", ripplesPath(cx, cy));
        setAttr(parts.flora, "transform", `translate(${middle.x.toFixed(1)} ${middle.y.toFixed(1)})`);
        parts.flora.dataset.key = "";
    }

    // Water spreads out from the middle of a lobe rather than climbing up it, so it's weird to do
    const spread = 0.28 + 0.85 * zone.water;
    setAttr(parts.wet, "transform",
        `translate(${middle.x.toFixed(1)} ${middle.y.toFixed(1)})`
        + ` scale(${spread.toFixed(3)})`
        + ` translate(${(-middle.x).toFixed(1)} ${(-middle.y).toFixed(1)})`);
    setVar(parts.edge, "--stage-color", STAGES[stage].color);
    setVar(parts.soil, "--silt", zone.sediment.toFixed(3));

    // The hummocks go under as the water comes up
    setVar(parts.isles, "--isle", Math.max(0, 1 - 0.92 * zone.water).toFixed(3));
    setVar(parts.isles, "--isle-fade", clamp01((0.94 - zone.water) * 4).toFixed(3));

    // Plants fade in/out instead of immediately swapping
    if (fresh) {
        const going = parts.flora.querySelector(".flora-was");
        if (going) going.remove();
        const standing = parts.flora.querySelector(".flora-now");
        if (standing) standing.setAttribute("class", "flora-now flora-settled");
    }

    if (parts.flora.dataset.key !== String(zone.plant)) {
        const first = fresh || parts.flora.dataset.key === "";
        const leaving = parts.flora.querySelector(".flora-now").innerHTML;
        const was = svgEl("g", { class: "flora-was" });
        was.innerHTML = first ? "" : leaving;
        const now = svgEl("g", { class: first ? "flora-now flora-settled" : "flora-now" });
        now.innerHTML = plantsSvg(zone, index);
        if (!first) {
            now.addEventListener("animationend", () => {
                now.setAttribute("class", "flora-now flora-settled");
                was.remove();
            }, { once: true });
        }
        parts.flora.replaceChildren(was, now);
        parts.flora.dataset.key = String(zone.plant);
    }

    // Label and tooltip ride along on top, unsquashed, over the lobe's middle
    setVar(mark, "--at-x", `${(ORIGIN.x + middle.x * scale).toFixed(1)}px`);
    setVar(mark, "--at-y", `${(ORIGIN.y + middle.y * scale).toFixed(1)}px`);
    setVar(mark, "--stage-color", STAGES[stage].color);

    setText(mark.querySelector(".zone-name"), kind.name);
    setText(mark.querySelector(".zone-stage"), STAGES[stage].name);
    setWidth(mark.querySelector(".zone-bar-fill"), zone.water);

    setDisplay(mark.querySelector(".zone-gates"), sluicesOpen());
    if (sluicesOpen()) {
        const stored = storedWater(s);
        const gate = (button, share, label) => {
            const cost = floodCost(zone, share);
            setText(button, `${label} for ${formatWhole(cost)}w`);
            button.disabled = zone.water >= 1 || cost <= 0 || stored < cost;
        };
        gate(mark.querySelector(".zone-flood"), 1, "Flood");

        const part = mark.querySelector(".zone-flood-part");
        setDisplay(part, floodPrecise());
        if (floodPrecise()) gate(part, PART_SHARE, "Trickle");

        // The drawdown pays back rather than charging, so it reads the other way around
        const drain = mark.querySelector(".zone-drain");
        setDisplay(drain, drawdownOpen());
        if (drawdownOpen()) {
            setText(drain, `Drain + ${formatWhole(drainYield(zone))}w`);
            drain.disabled = zone.water <= 0;
        }
    }

    // Only the zone whose readout is open is worth writing out
    if (built.open !== index) return;
    const tip = built.tip;
    setVar(tip, "--stage-color", STAGES[stage].color);
    setText(tip.querySelector(".zone-tip-name"), kind.name);
    setText(tip.querySelector(".zone-tip-stage"), STAGES[stage].name);
    setText(tip.querySelector(".zone-tip-blurb"), STAGES[stage].blurb);
    setRichText(tip.querySelector(".zone-tip-yield"), productionText(s, zone));
    setText(tip.querySelector('[data-tip="water"]'), waterText(zone));
    setText(tip.querySelector('[data-tip="plant"]'), plantText(zone));
    setText(tip.querySelector('[data-tip="next"]'), nextPlantText(zone));
    setText(tip.querySelector(".zone-tip-note"), kind.blurb);
}

// The readout is laid over the picture rather than pinned into it, so it is put back on every draw
const TIP_GAP = 10;

function placeTip(built, el) {
    const room = el.closest(".drag-canvas-viewport");
    const mark = built.open >= 0 ? built.marks[built.open] : null;
    const shown = mark !== null && room !== null && mark.style.display !== "none";
    setClass(built.tip, "shown", shown);
    if (!shown) return;

    const box = room.getBoundingClientRect();
    const at = mark.querySelector(".zone-plate").getBoundingClientRect();
    const size = built.tip.getBoundingClientRect();
    const floor = box.height - size.height - 8;

    let top = at.top - box.top - size.height - TIP_GAP;
    if (top < 8) top = at.bottom - box.top + TIP_GAP;
    top = Math.max(8, Math.min(top, floor));

    const panel = room.querySelector(".marsh-panel");
    const over = panel ? panel.getBoundingClientRect() : null;
    const beside = over !== null
        && box.top + top < over.bottom && box.top + top + size.height > over.top;
    const rightMost = (beside ? over.left - 8 : box.right - 8) - box.left - size.width;
    let left = at.left + at.width / 2 - box.left - size.width / 2;
    left = Math.max(8, Math.min(left, rightMost));

    const tab = document.querySelector(".sub-layer-tab");
    const chip = tab ? tab.getBoundingClientRect() : null;
    if (chip !== null && box.left + left + size.width > chip.left
        && box.left + left < chip.right) {
        const ceiling = chip.bottom - box.top + 8;
        if (top < ceiling) {
            top = Math.max(ceiling, Math.min(at.bottom - box.top + TIP_GAP, floor));
        }
    }

    const cover = drawerTop(box.left + left, box.left + left + size.width) - box.top - 8;
    if (top + size.height > cover) top = Math.max(8, cover - size.height);

    setVar(built.tip, "--tip-x", `${Math.round(left)}px`);
    setVar(built.tip, "--tip-y", `${Math.round(top)}px`);
}

function updateMeters(el, s, zones) {
    const stored = storedWater(s);
    const capacity = waterCapacity();

    setText(el.querySelector(".water-amount"), `${formatWhole(stored)} / ${formatWhole(capacity)}`);
    setWidth(el.querySelector(".water-fill"), waterFraction(s));
    setText(el.querySelector(".water-note"), `+${formatNumber(refillRate(s))} per second`);

    const release = el.querySelector(".marsh-release");
    const cost = Math.round(releaseCost(s));
    setText(release, cardActive("floodPulse")
        ? `Pulse the marsh for ${formatWhole(cost)}w`
        : sluicesOpen()
        ? `Flood the whole marsh for ${formatWhole(cost)}w`
        : `Release water for ${formatWhole(cost)}w`);
    release.disabled = cost <= 0 || stored < cost;
    setClass(release, "release-crude", !sluicesOpen());

    const held = stagesHeld(s).size;
    setText(el.querySelector(".marsh-variety"),
        `${held} of ${Math.min(zones.length, STAGE_ORDER.length)}, x${formatNumber(diversityBonus(s))}`);
    const keystoneRow = el.querySelector(".marsh-keystone-row");
    setDisplay(keystoneRow, getLevel(s, "keystone") > 0);
    setText(el.querySelector(".marsh-keystone"),
        `${communitiesHeld(s)} of ${zones.length}, x${formatNumber(keystoneBonus(s))}`);

    setText(el.querySelector(".marsh-health"), formatPercent(marshHealth(s)));
    setText(el.querySelector(".marsh-size"),
        `${zones.length} zone${zones.length === 1 ? "" : "s"}, x${formatNumber(marshScale() * sizePenalty())}`);
    setText(el.querySelector(".marsh-adjacent"),
        `+${formatPercent(NEIGHBOR_PER_TILE * marshNeighborShare())} each`);

    const lines = rateSpans(marshProduction(s));
    setRichText(el.querySelector(".marsh-total-lines"), lines.length > 0
        ? lines.join("")
        : "Nothing yet, no zone is paying out.");

    const plants = el.querySelector(".marsh-plants");
    if (plants.open) setRichText(el.querySelector(".marsh-plants-list"), plantsText(s));

    const next = nextZoneAt();
    setText(el.querySelector(".marsh-next"), next === null
        ? "The marsh is as broad as it gets."
        : `${next - marshTiles()} more marsh tile${next - marshTiles() === 1 ? "" : "s"} opens another zone.`);
}
