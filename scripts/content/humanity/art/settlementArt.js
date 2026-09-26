// settlementArt.js
//
// Settlement sprites on the map and the settlement's own view

const n = (v) => +v.toFixed(1);

const tentIcon = (cx, base, s) => {
    const top = base - 17 * s;
    return `
        <path class="settle-pole" d="M${n(cx)} ${n(top)} L${n(cx - 2.5 * s)} ${n(top - 4 * s)} M${n(cx)} ${n(top)} L${n(cx + 2.5 * s)} ${n(top - 4 * s)}"/>
        <path class="settle-hide" d="M${n(cx - 9 * s)} ${n(base)} L${n(cx)} ${n(top)} L${n(cx + 9 * s)} ${n(base)} Z"/>
        <path class="settle-hide-shade" d="M${n(cx)} ${n(top)} L${n(cx + 9 * s)} ${n(base)} L${n(cx + 3 * s)} ${n(base)} Z"/>
        <path class="settle-flap" d="M${n(cx - 2.8 * s)} ${n(base)} L${n(cx)} ${n(base - 8 * s)} L${n(cx + 2.8 * s)} ${n(base)} Z"/>`;
};

const hutIcon = (cx, base, s) => `
    <rect class="settle-hut-wall" x="${n(cx - 7 * s)}" y="${n(base - 7 * s)}" width="${n(14 * s)}" height="${n(7 * s)}"/>
    <path class="settle-thatch" d="M${n(cx - 9.5 * s)} ${n(base - 6 * s)} Q${n(cx - 3 * s)} ${n(base - 12 * s)} ${n(cx)} ${n(base - 17 * s)} Q${n(cx + 3 * s)} ${n(base - 12 * s)} ${n(cx + 9.5 * s)} ${n(base - 6 * s)} Z"/>
    <rect class="settle-door" x="${n(cx - 1.8 * s)}" y="${n(base - 5 * s)}" width="${n(3.6 * s)}" height="${n(5 * s)}"/>`;

const fireIcon = (cx, base) => `
    <ellipse class="settle-stones" cx="${cx}" cy="${base}" rx="3.4" ry="1.2"/>
    <path class="settle-flame" d="M${cx} ${base} C${cx - 2.6} ${base - 1.5} ${cx - 1} ${base - 3.5} ${cx - 0.3} ${base - 6} C${cx + 1.2} ${base - 3.8} ${cx + 2.8} ${base - 1.8} ${cx} ${base} Z"/>
    <path class="settle-smoke" d="M${cx} ${base - 8} C${cx - 1} ${base - 11} ${cx + 2} ${base - 12} ${cx + 1} ${base - 15}"/>`;

const icon = (shadow, body) => `
    <svg class="settle-sprite" viewBox="0 0 40 40" aria-hidden="true">
        <ellipse class="settle-shadow" cx="20" cy="30.5" rx="${shadow}" ry="2.8"/>
        ${body}
    </svg>`;

const SPRITES = {
    tent: icon(12, tentIcon(16, 30.5, 1) + fireIcon(30, 30)),
    tents: icon(16, tentIcon(21, 26.5, 0.75) + tentIcon(11, 31, 0.85) + tentIcon(29.5, 31, 0.8) + fireIcon(20, 33)),
    huts: icon(16, hutIcon(21, 26, 0.8) + hutIcon(11, 31, 0.85) + hutIcon(29.5, 31, 0.85)),
    houses: icon(15.5, `
        <path class="settle-roof" d="M7 22 L14 15 L21 22 Z"/>
        <rect class="settle-wall" x="9" y="22" width="10" height="8"/>
        <rect class="settle-door" x="12.5" y="25" width="3" height="5"/>
        <path class="settle-roof" d="M19 20 L27 11 L35 20 Z"/>
        <rect class="settle-wall" x="21" y="20" width="12" height="10"/>
        <rect class="settle-window" x="24" y="23" width="3" height="3"/>
        <path class="settle-smoke" d="M30 12 C29 9 32 8 31 5"/>`),
};

// What people live in at each size
const DWELLING = { "Settlement": "tent", "Hamlet": "tents", "Village": "huts", "Small Town": "huts" };

export const settlementSprite = (sizeName) => SPRITES[DWELLING[sizeName] || "houses"];

export function dwellingsFor(sizeName, pops) {
    if (sizeName === "Settlement") return { dwelling: "tent", shown: Math.min(3, Math.max(1, Math.ceil(pops / 3))) };
    if (sizeName === "Hamlet") return { dwelling: "tent", shown: Math.min(6, 3 + Math.floor((pops - 10) / 8)) };
    if (sizeName === "Village") return { dwelling: "hut", shown: Math.min(10, 4 + Math.floor((pops - 50) / 60)) };
    if (sizeName === "Small Town") return { dwelling: "hut", shown: Math.min(14, 8 + Math.floor((pops - 500) / 250)) };
    return { dwelling: "house", shown: 14 };
}
export const SITE_SPRITE = SPRITES.tent;

const WIDTH = 480;
const HEIGHT = 150;
const GROUND = 108;

// A small repeatable scatter, so the same settlement always draws the same way
const scatter = (seed) => {
    let x = seed * 9301 + 49297;
    return () => ((x = (x * 9301 + 49297) % 233280) / 233280);
};

const house = (x, scale, hue) => {
    const w = 22 * scale;
    const h = 16 * scale;
    const y = GROUND - h;
    return `
        <g class="village-house">
            <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="hsl(${hue} 22% 38%)"/>
            <path d="M${x - 3 * scale} ${y} L${x + w / 2} ${y - 12 * scale} L${x + w + 3 * scale} ${y} Z" fill="hsl(${hue} 30% 26%)"/>
            <rect x="${x + w / 2 - 3 * scale}" y="${GROUND - 9 * scale}" width="${6 * scale}" height="${9 * scale}" fill="#2a1e14"/>
            <rect class="village-light" x="${x + 3 * scale}" y="${y + 4 * scale}" width="${4 * scale}" height="${4 * scale}"/>
        </g>`;
};

const tent = (x, scale, hue) => {
    const w = 26 * scale;
    const h = 30 * scale;
    const cx = x + w / 2;
    const top = GROUND - h;
    return `
        <g class="village-tent">
            <path d="M${cx} ${top} L${cx - 4 * scale} ${top - 7 * scale} M${cx} ${top} L${cx + 4 * scale} ${top - 7 * scale}" stroke="#4a3522" stroke-width="${1.6 * scale}"/>
            <path d="M${x} ${GROUND} L${cx} ${top} L${x + w} ${GROUND} Z" fill="hsl(${hue} 32% 58%)"/>
            <path d="M${cx} ${top} L${x + w} ${GROUND} L${cx + 5 * scale} ${GROUND} Z" fill="hsl(${hue} 30% 46%)"/>
            <path d="M${cx - 4.5 * scale} ${GROUND} L${cx} ${GROUND - 13 * scale} L${cx + 4.5 * scale} ${GROUND} Z" fill="#2a1e14"/>
        </g>`;
};

const hut = (x, scale, hue) => {
    const w = 24 * scale;
    const cx = x + w / 2;
    const wall = GROUND - 11 * scale;
    return `
        <g class="village-hut">
            <rect x="${x}" y="${wall}" width="${w}" height="${11 * scale}" fill="hsl(${hue} 24% 40%)"/>
            <path d="M${x - 4 * scale} ${wall + 2 * scale} Q${cx - 5 * scale} ${wall - 9 * scale} ${cx} ${wall - 17 * scale} Q${cx + 5 * scale} ${wall - 9 * scale} ${x + w + 4 * scale} ${wall + 2 * scale} Z" fill="hsl(${hue + 15} 42% 44%)"/>
            <rect x="${cx - 3 * scale}" y="${GROUND - 8 * scale}" width="${6 * scale}" height="${8 * scale}" fill="#2a1e14"/>
        </g>`;
};

const campfire = (x) => `
    <g class="village-fire">
        <ellipse cx="${x}" cy="${GROUND + 1}" rx="9" ry="2.5" fill="#6d665c"/>
        <path class="village-flame" d="M${x} ${GROUND} C${x - 6} ${GROUND - 3} ${x - 2} ${GROUND - 9} ${x - 0.5} ${GROUND - 14} C${x + 3} ${GROUND - 9} ${x + 6} ${GROUND - 4} ${x} ${GROUND} Z" fill="#f29a3a"/>
        <path d="M${x} ${GROUND} C${x - 3} ${GROUND - 2} ${x - 1} ${GROUND - 5} ${x} ${GROUND - 8} C${x + 2} ${GROUND - 5} ${x + 3} ${GROUND - 2} ${x} ${GROUND} Z" fill="#fbd66a"/>
    </g>`;

const DWELLINGS = { tent, hut, house };

const tree = (x, s) => `
    <g class="village-tree"><rect x="${x - 1.5 * s}" y="${GROUND - 8 * s}" width="${3 * s}" height="${8 * s}" fill="#4a3522"/>
    <path d="M${x - 9 * s} ${GROUND - 7 * s} L${x} ${GROUND - 30 * s} L${x + 9 * s} ${GROUND - 7 * s} Z" fill="#3f7a45"/></g>`;
const mushroom = (x, s) => `
    <g><rect x="${x - 2 * s}" y="${GROUND - 12 * s}" width="${4 * s}" height="${12 * s}" fill="#e6dccb"/>
    <ellipse cx="${x}" cy="${GROUND - 12 * s}" rx="${11 * s}" ry="${6 * s}" fill="#b07ad0"/></g>`;
const reed = (x) => `<path d="M${x} ${GROUND} q2 -12 -1 -20 M${x + 4} ${GROUND} q-1 -10 3 -16" stroke="#8aa56a" stroke-width="1.5" fill="none"/>`;

const SKY = { frost: ["#243349", "#8fb3cf"], fungal: ["#2b2138", "#6b5b86"], harbor: ["#1d3346", "#6fa3c4"] };
const GROUND_FILL = { pastoral: "#56773c", wooded: "#3d5a33", frost: "#d9e7ef", fen: "#4f5c3c", fungal: "#4a3f55" };

export function villageScene(t, shown, dwelling) {
    const seed = t.id;
    const rand = scatter(seed);
    const lead = t.types[0];
    const [skyTop, skyLow] = SKY[lead] || ["#1f3044", "#7aa7c7"];
    const ground = GROUND_FILL[lead] || "#5e5a40";
    const has = (type) => t.types.includes(type);

    const back = [];
    if (has("wooded")) for (let i = 0; i < 7; i++) back.push(tree(20 + rand() * WIDTH * 0.95, 0.7 + rand() * 0.6));
    if (has("fungal")) for (let i = 0; i < 4; i++) back.push(mushroom(30 + rand() * WIDTH * 0.9, 0.8 + rand() * 0.9));
    if (has("frost")) back.push(`<path d="M0 ${GROUND - 10} L70 60 L130 ${GROUND - 20} L210 48 L300 ${GROUND - 15} L380 64 L480 ${GROUND - 12} L480 ${GROUND} L0 ${GROUND} Z" fill="#b8cbd8"/>`);

    const front = [];
    if (has("fishing") || has("harbor")) {
        front.push(`<rect x="0" y="${GROUND + 14}" width="${WIDTH}" height="${HEIGHT - GROUND - 14}" fill="${has("harbor") ? "#2f6b99" : "#3d7fa6"}"/>`);
        front.push(`<path class="village-wave" d="M0 ${GROUND + 20} q10 -4 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0" stroke="#9fd0ec" fill="none" stroke-width="1.2"/>`);
    }
    if (has("pastoral")) for (let i = 0; i < 6; i++) front.push(`<rect x="${10 + i * 26}" y="${GROUND + 4 + (i % 2) * 5}" width="22" height="3" fill="#c9b35a" opacity="0.75"/>`);
    if (has("fen")) for (let i = 0; i < 10; i++) front.push(reed(10 + rand() * WIDTH * 0.95));

    const spots = [];
    const span = WIDTH - 120;
    for (let i = 0; i < shown; i++) spots.push(60 + (span * (i + 0.5)) / shown + (rand() - 0.5) * 10);
    const draw = DWELLINGS[dwelling];
    let houses = spots.map(x => draw(x, 0.8 + rand() * 0.45, 20 + Math.floor(rand() * 25))).join("");
    if (dwelling === "tent") houses += campfire(WIDTH / 2 + (shown % 2 ? Math.min(span / (2 * shown), 30) : 0) + 14);

    return `
        <svg class="village-scene" viewBox="0 0 ${WIDTH} ${HEIGHT}" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
            <defs><linearGradient id="village-sky-${seed}" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="${skyTop}"/><stop offset="1" stop-color="${skyLow}"/>
            </linearGradient></defs>
            <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#village-sky-${seed})"/>
            ${back.join("")}
            <rect x="0" y="${GROUND}" width="${WIDTH}" height="${HEIGHT - GROUND}" fill="${ground}"/>
            ${houses}
            ${front.join("")}
        </svg>`;
}
