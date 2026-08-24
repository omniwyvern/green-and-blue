// cardArt.js
//
// The picture on each evolution card. Drawn in `currentColor`, and the frame sets that from the card's
// color, so a card's art and border don't need to really interact at all
//
// Drawings are from pieces below, so they can be reused on multiple cards in different positions.
// Don't want to need to manually include the cloud art for every single card, but moved around easily.
//
// Classes do shading. "art-line" is the subject, "art-accent" marks the key part of the card "art-ground" is scenery.

const frame = (contents) =>
    `<svg class="card-art-svg" viewBox="0 0 100 62" aria-hidden="true">${contents}</svg>`;

const ground = (y = 52) => `<path class="art-ground" d="M14 ${y} H86"/>`;

// Set of grass blades, easier for this than three copies of single blade since this is in so many cards.
const blades = (y, x = 42) => `
    <path class="art-line art-grass" d="M${x - 8} ${y} C${x - 11} ${y - 12} ${x - 9} ${y - 20} ${x - 12} ${y - 28}"/>
    <path class="art-line art-grass" d="M${x} ${y} C${x - 1} ${y - 14} ${x + 1} ${y - 24} ${x} ${y - 32}"/>
    <path class="art-line art-grass" d="M${x + 8} ${y} C${x + 10} ${y - 12} ${x + 12} ${y - 21} ${x + 15} ${y - 27}"/>
`;

// A single blade, position/angle easy to alter.
const blade = (x, y, height, lean = 0) =>
    `<path class="art-line art-grass" d="M${x} ${y} C${x + lean} ${y - height * 0.4} ${x + lean * 1.5} ${y - height * 0.7} ${x + lean * 2} ${y - height}"/>`;

const arrowUp = (x, y, length = 24) => `
    <path class="art-line art-accent" d="M${x} ${y} L${x} ${y - length}"/>
    <path class="art-fill art-accent" d="M${x} ${y - length - 8} L${x + 7} ${y - length + 3} L${x - 7} ${y - length + 3} Z"/>
`;

const arrowDown = (x, y, length = 22) => `
    <path class="art-line art-accent" d="M${x} ${y - length} L${x} ${y}"/>
    <path class="art-fill art-accent" d="M${x} ${y + 8} L${x + 7} ${y - 3} L${x - 7} ${y - 3} Z"/>
`;

// Two of them, makes it easier for like one of the card arts lmao.
const arrowsUp = (x, y) => arrowUp(x - 8, y, 18) + arrowUp(x + 8, y - 6, 18);

const cloud = (x, y, scale = 1) => `
    <g class="art-fill art-cloud" transform="translate(${x} ${y}) scale(${scale})">
        <circle cx="-11" cy="0" r="8"/>
        <circle cx="0" cy="-3" r="10"/>
        <circle cx="10" cy="1" r="7"/>
        <rect x="-19" y="0" width="30" height="8" rx="4"/>
    </g>
`;

const drops = (y, xs, lean = 2) => xs.map(x =>
    `<path class="art-line art-accent art-rain" d="M${x} ${y} L${x - lean} ${y + 9}"/>`).join("");

const droplet = (x, y, scale = 1) =>
    `<path class="art-fill art-accent art-rain" transform="translate(${x} ${y}) scale(${scale})" d="M0 -9 C5 -2 7 2 7 4 A7 7 0 1 1 -7 4 C-7 2 -5 -2 0 -9 Z"/>`;

// One wave line, "amp" is for how rough it is.
const wave = (y, amp = 5, cls = "art-line art-water") =>
    `<path class="${cls}" d="M12 ${y} q9 ${-amp} 18 0 t18 0 t18 0 t16 0"/>`;

const waves = (ys, amp = 5) => ys.map(y => wave(y, amp)).join("");

const fish = (x, y, scale = 1) => `
    <g class="art-fill art-accent art-fish" transform="translate(${x} ${y}) scale(${scale})">
        <path d="M-9 0 L-1 -6 L-1 6 Z"/>
        <path d="M-2 0 C2 -8 15 -7 19 0 C15 7 2 8 -2 0 Z"/>
    </g>
`;

// Pond weed, each strand leans a different way
const weeds = (xs, y, height = 26) => xs.map((x, i) => {
    const lean = i % 2 === 0 ? 5 : -5;
    return `<path class="art-line art-algae" d="M${x} ${y} C${x - lean} ${y - height * 0.45} ${x + lean} ${y - height * 0.7} ${x - lean * 0.6} ${y - height}"/>`;
}).join("");

const roots = (y, depth = 14, x = 42) => `
    <path class="art-ground" d="M${x - 6} ${y + 2} C${x - 4} ${y} ${x - 10} ${y + 4} ${x - 12} ${y + depth}"/>
    <path class="art-ground" d="M${x - 3} ${y + 2} C${x + 4} ${y + 2} ${x + 6} ${y + 8} ${x + 6} ${y + depth}"/>
    <path class="art-ground" d="M${x + 1} ${y + 2} C${x + 13} ${y - 1} ${x + 20} ${y + 3} ${x + 23} ${y + depth}"/>
`;

// A core. "fill" is how much of the meter is filled, from 0 to 1
const core = (x, y, r = 15) => `<circle class="art-line" cx="${x}" cy="${y}" r="${r}"/>`;
const coreArc = (x, y, r, fill) => {
    const end = -Math.PI / 2 + fill * Math.PI * 2;
    const big = fill > 0.5 ? 1 : 0;
    return `<path class="art-line art-accent" d="M${x} ${y - r} A${r} ${r} 0 ${big} 1 `
        + `${(x + r * Math.cos(end)).toFixed(1)} ${(y + r * Math.sin(end)).toFixed(1)}"/>`;
};

const bolt = (x, y, scale = 1) =>
    `<path class="art-fill art-accent" transform="translate(${x} ${y}) scale(${scale})" d="M2 -16 L-8 2 L-1 2 L-3 16 L8 -3 L1 -3 Z"/>`;

const sparkle = (x, y, scale = 1) =>
    `<path class="art-fill art-accent" transform="translate(${x} ${y}) scale(${scale})" d="M0 -7 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 Z"/>`;

const sun = (x, y, r = 8) => `
    <circle class="art-line art-accent art-sun" cx="${x}" cy="${y}" r="${r}"/>
    ${[0, 45, 90, 135, 180, 225, 270, 315].map(a => {
        const rad = a * Math.PI / 180;
        const x1 = x + Math.cos(rad) * (r + 3), y1 = y + Math.sin(rad) * (r + 3);
        const x2 = x + Math.cos(rad) * (r + 7), y2 = y + Math.sin(rad) * (r + 7);
        return `<path class="art-line art-accent art-sun" d="M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}"/>`;
    }).join("")}
`;

// A map tile, for the cards that are about the ground specifically
const hexTile = (x, y, r = 12, cls = "art-line") => {
    const points = [30, 90, 150, 210, 270, 330].map(a => {
        const rad = a * Math.PI / 180;
        return `${(x + r * Math.cos(rad)).toFixed(1)} ${(y + r * Math.sin(rad)).toFixed(1)}`;
    });
    return `<path class="${cls}" d="M${points.join(" L")} Z"/>`;
};

// A clock, for cards about time passing
const clock = (x, y, r = 10) => `
    <circle class="art-line" cx="${x}" cy="${y}" r="${r}"/>
    <path class="art-line art-accent" d="M${x} ${y} L${x} ${y - r + 3} M${x} ${y} L${x + r - 4} ${y}"/>
`;

// A curved arrow, for things like a cycle, loop, or return
const cycleArrow = (x, y, r = 13) => `
    <path class="art-line art-accent" d="M${x - r} ${y} A${r} ${r} 0 1 1 ${x} ${y + r}"/>
    <path class="art-fill art-accent" d="M${x - 4} ${y + r} L${x + 4} ${y + r - 5} L${x + 4} ${y + r + 5} Z"/>
`;

// Container with something in it, e.g. charge meter seen side on. "w" widens it.
const vessel = (x, y, level = 0.6, w = 13) => `
    <path class="art-line" d="M${x - w} ${y - 16} L${x - w} ${y + 12} Q${x - w} ${y + 16} ${x - w + 4} ${y + 16}
        L${x + w - 4} ${y + 16} Q${x + w} ${y + 16} ${x + w} ${y + 12} L${x + w} ${y - 16}"/>
    <path class="art-fill art-accent" d="M${x - w + 2} ${y + 14 - 28 * level} L${x + w - 2} ${y + 14 - 28 * level} L${x + w - 2} ${y + 14} L${x - w + 2} ${y + 14} Z" opacity="0.55"/>
`;


// Probably not as much explanation as there should be in here. There are so so many.
export const CARD_ART = {
    // Cores: green
    quickGrowth: frame(`${core(32, 31, 18)}${coreArc(32, 31, 18, 0.7)}${arrowUp(74, 48, 26)}`),
    verdantPulse: frame(`${core(32, 31, 17)}${coreArc(32, 31, 17, 0.6)}${sparkle(66, 18, 1.6)}${sparkle(80, 34, 1.2)}${sparkle(68, 46, 0.9)}`),
    verdantAbundance: frame(`${core(28, 31, 17)}${coreArc(28, 31, 17, 0.8)}${sparkle(60, 16, 1.7)}${sparkle(78, 30, 1.4)}${sparkle(62, 46, 1.1)}`),
    thickRoots: frame(`${ground(32)}${core(50, 18, 13)}${roots(32, 26, 50)}`),
    strongRoots: frame(`${ground(30)}${core(50, 16, 13)}${roots(30, 30, 42)}${roots(30, 24, 60)}`),
    maturation: frame(`
        ${core(46, 31, 16)}${coreArc(46, 31, 16, 1)}
        <circle class="art-ground" cx="46" cy="31" r="24"/>
        ${sparkle(82, 12, 1.3)}${sparkle(86, 30, 0.9)}
    `),
    overgrowth: frame(`${core(48, 46, 13)}${blades(36, 48)}${sparkle(80, 18, 1.2)}${sparkle(20, 26, 0.9)}`),

    // Cores: blue
    quickening: frame(`${core(32, 31, 18)}${coreArc(32, 31, 18, 0.75)}${arrowUp(74, 48, 26)}`),
    staticCharge: frame(`${core(50, 31, 21)}${bolt(50, 31, 1.5)}${sparkle(18, 16, 1)}${sparkle(84, 44, 1)}`),
    powerSurge: frame(`
        ${core(50, 31, 22)}${coreArc(50, 31, 22, 1)}${bolt(50, 31, 1.9)}
        ${sparkle(14, 14, 1.3)}${sparkle(88, 46, 1.3)}${sparkle(86, 14, 0.9)}${sparkle(14, 46, 0.9)}
    `),
    deepReservoir: frame(`${vessel(42, 30, 0.75, 22)}${arrowUp(80, 42, 20)}`),
    overflow: frame(`${vessel(40, 34, 1, 20)}${drops(12, [30, 40, 50], 3)}${droplet(76, 26, 1.2)}`),
    pressureValve: frame(`${vessel(34, 34, 0.9, 18)}${arrowUp(74, 46, 22)}${sparkle(74, 10, 1.2)}`),

    // Cores: both
    photosynthesis: frame(`${sun(24, 20, 7)}${blades(52, 60)}${ground(52)}`),
    efficientPhotosynthesis: frame(`${sun(22, 18, 8)}${blades(52, 58)}${ground(52)}${sparkle(80, 26, 1.1)}`),
    feedbackLoop: frame(`
        ${core(34, 31, 12)}${core(66, 31, 12)}
        ${cycleArrow(50, 24, 15)}
    `),

    // Pond
    thrivingAlgae: frame(`${ground(54)}${weeds([32, 42, 52], 54, 30)}${arrowUp(74, 48, 18)}`),
    productiveAlgae: frame(`${ground(54)}${weeds([32, 42, 52], 54, 30)}${sparkle(74, 26, 1.3)}`),
    healthyFish: frame(`${waves([20], 4)}${fish(34, 38, 1.1)}${arrowUp(78, 46, 16)}`),
    productiveFish: frame(`${waves([20], 4)}${fish(32, 38, 1.1)}${sparkle(78, 32, 1.3)}`),
    turbulentWaters: frame(`${waves([20, 34, 48], 9)}`),
    stillness: frame(`${waves([22, 34, 46], 1)}${clock(80, 14, 8)}`),
    restlessWaters: frame(`${waves([30, 48], 11)}${arrowUp(50, 28, 14)}`),
    strongCurrent: frame(`${waves([18], 11)}${fish(36, 38, 1.2)}`),
    nutrientRich: frame(`${waves([16], 2)}${ground(54)}${weeds([34, 44, 54], 54, 28)}`),
    deepWaters: frame(`${waves([16], 4)}${arrowDown(50, 40, 18)}${ground(56)}`),
    abundantLife: frame(`${waves([16], 4)}${weeds([24, 32], 54, 26)}${fish(52, 34, 1.1)}${ground(54)}`),
    deeperDepths: frame(`
        ${waves([14], 4)}${weeds([28, 38, 48], 34, 18)}
        <path class="art-ground" d="M12 38 H88"/>
        ${fish(48, 50, 1.1)}
    `),
    tidalCycle: frame(`
        <path class="art-line art-accent art-water" d="M12 31 q11 -17 22 0 t22 0 t22 0 t10 0"/>
        ${waves([48], 3)}
    `),
    rainwater: frame(`${cloud(40, 16, 0.85)}${drops(26, [30, 40, 50])}${waves([46], 5)}`),
    algaeBloom: frame(`
        ${ground(56)}
        ${weeds([20, 31, 42, 53, 64, 75, 85], 56, 30)}
    `),

    // Grass
    rapidSprouting: frame(`${ground(52)}${blades(52)}${arrowUp(74, 50, 20)}`),
    lushGrowth: frame(`${ground(52)}${blades(52)}${sparkle(74, 24, 1.3)}`),
    verdantFields: frame(`
        ${ground(52)}${blades(52, 34)}
        ${blade(60, 52, 26, 3)}${blade(68, 52, 30, -2)}${blade(76, 52, 24, 2)}
        ${sparkle(84, 20, 1.1)}
    `),
    spreadingRoots: frame(`${ground(38)}${blades(38, 34)}${roots(38, 18, 34)}`),
    establishedRoots: frame(`${ground(38)}${blades(38, 40)}${roots(38, 20, 40)}${sparkle(78, 46, 1)}`),
    interwovenRoots: frame(`
        ${ground(36)}${blades(36, 32)}${blades(36, 62)}
        ${roots(36, 16, 32)}${roots(36, 16, 56)}
    `),
    rootNetwork: frame(`
        ${ground(34)}${blades(34, 30)}${blades(34, 62)}
        ${roots(34, 22, 28)}${roots(34, 22, 50)}
        <path class="art-ground" d="M20 48 H80"/>
    `),
    quickMaturation: frame(`${ground(52)}${blades(52, 34)}${clock(74, 24, 10)}${arrowDown(74, 46, 8)}`),
    creepingGrowth: frame(`
        ${ground(52)}${blades(52, 50)}
        <path class="art-line art-accent" d="M28 40 L16 30 M72 40 L84 30"/>
        <path class="art-fill art-accent" d="M14 24 L22 30 L14 34 Z"/>
        <path class="art-fill art-accent" d="M86 24 L78 30 L86 34 Z"/>
    `),
    chainReaction: frame(`
        ${hexTile(22, 31, 17)}${hexTile(78, 31, 17, "art-ground")}
        <path class="art-line art-accent" d="M42 31 H54"/>
        <path class="art-fill art-accent" d="M64 31 L52 24 L52 38 Z"/>
        ${sparkle(78, 31, 1.3)}
    `),
    deepRoots: frame(`
        ${ground(34)}${blades(34, 44)}
        ${roots(34, 26, 36)}${roots(34, 22, 56)}
    `),
    deepDrinkers: frame(`
        ${drops(14, [26, 42, 58], 1)}
        ${ground(44)}${blades(44, 40)}
        ${roots(44, 30, 34)}${roots(44, 26, 52)}
        ${droplet(80, 24, 1.1)}
    `),
    seedstorm: frame(`
        ${cloud(50, 14, 0.9)}
        ${drops(24, [34, 50, 66], 1)}
        <circle class="art-fill art-accent art-grass" cx="34" cy="42" r="3"/>
        <circle class="art-fill art-accent art-grass" cx="50" cy="46" r="3"/>
        <circle class="art-fill art-accent art-grass" cx="66" cy="42" r="3"/>
        ${ground(54)}
    `),

    // Rain
    gatheringClouds: frame(`${cloud(30, 22, 0.9)}${cloud(62, 30, 1.2)}${arrowUp(88, 46, 16)}`),
    prolongedStorm: frame(`${cloud(40, 16, 1.15)}${drops(28, [26, 38, 50])}${drops(38, [32, 44])}${clock(80, 42, 10)}`),
    gentleRain: frame(`${cloud(46, 12, 0.75)}${drops(20, [38, 48, 58])}${ground(54)}${blades(54, 48)}`),
    condensation: frame(`${cloud(36, 24, 0.9)}${droplet(68, 26, 1.1)}${arrowUp(84, 48, 12)}`),
    lightDrizzle: frame(`${cloud(36, 20, 0.95)}${drops(30, [26, 36, 46])}${arrowDown(80, 36, 20)}`),
    soakingRain: frame(`
        ${cloud(44, 12, 0.8)}${drops(20, [36, 46, 56])}
        ${ground(38)}
        <path class="art-ground" d="M26 44 q6 -4 12 0 t12 0 t12 0 t10 0"/>
        <path class="art-ground" d="M26 52 q6 -4 12 0 t12 0 t12 0 t10 0"/>
    `),
    cloudBreak: frame(`
        ${sun(50, 30, 8)}
        ${cloud(24, 20, 0.75)}${cloud(76, 20, 0.75)}
    `),
    monsoon: frame(`
        ${cloud(56, 18, 0.95)}${drops(30, [46, 56, 66])}
        <path class="art-line art-accent" d="M30 14 H16 M34 22 H20"/>
        <path class="art-fill art-accent" d="M78 46 L66 40 L66 52 Z"/>
        ${ground(54)}
    `),
    rainDance: frame(`
        ${cloud(38, 16, 0.8)}${drops(24, [30, 40])}
        ${ground(54)}${blades(54, 62)}
        ${cycleArrow(62, 26, 11)}
    `),
    saturation: frame(`
        ${cloud(30, 12, 0.75)}${drops(20, [24, 34])}
        ${waves([38, 48], 4)}
        <path class="art-ground" d="M12 56 H88"/>
    `),
};

// Banners
const badge = (contents) =>
    `<svg class="banner-art-svg" viewBox="0 0 64 64" aria-hidden="true">${contents}</svg>`;

export const BANNER_ART = {
    // Grass banner
    grass: badge(`
        <path class="art-ground" d="M10 48 H54"/>
        <path class="art-line" d="M20 48 C16 38 22 32 18 24"/>
        <path class="art-line" d="M31 48 C29 36 33 28 31 18"/>
        <path class="art-line" d="M42 48 C46 38 40 32 45 23"/>
    `),

    // Rain banner
    rain: badge(`
        <g class="art-fill" transform="translate(32 26)">
            <circle cx="-10" cy="0" r="8"/>
            <circle cx="1" cy="-4" r="10"/>
            <circle cx="11" cy="1" r="7"/>
            <rect x="-18" y="0" width="30" height="8" rx="4"/>
        </g>
        <path class="art-line art-accent" d="M20 40 L17 50"/>
        <path class="art-line art-accent" d="M32 40 L29 50"/>
        <path class="art-line art-accent" d="M44 40 L41 50"/>
    `),

    // Pond banner
    pond: badge(`
        <path class="art-line" d="M8 20 q7 -5 14 0 t14 0 t14 0 t6 0"/>
        <path class="art-line" d="M8 50 q7 -5 14 0 t14 0 t14 0 t6 0"/>
        <path class="art-fill art-accent" d="M20 35 L29 29 L29 41 Z"/>
        <path class="art-fill art-accent" d="M28 35 C33 26 46 27 51 35 C46 43 33 44 28 35 Z"/>
    `),
    // cores banner
    cores: badge(`
        <circle class="art-line" cx="25" cy="32" r="14"/>
        <circle class="art-line art-accent" cx="39" cy="32" r="14"/>
    `),
};
