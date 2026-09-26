// mushroomArt.js
//
// One drawing per mushroom, all on the same ground line so beds can scale them


//    !!! THE PIECES !!!

const svg = (id, body) =>
    `<svg class="shroom shroom-${id}" viewBox="0 0 60 60" aria-hidden="true">${body}</svg>`;

const spots = (list, fill) => list.map(([x, y, r]) =>
    `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`).join("");

const inkBell = (x, h, s) => `
    <g transform="translate(${x} 56) scale(${s})">
        <rect x="-2.2" y="-${h}" width="4.4" height="${h}" rx="2" fill="#e8e3da"/>
        <path d="M-9 -${h - 20} C-9 -${h + 6} -5 -${h + 14} 0 -${h + 14} C5 -${h + 14} 9 -${h + 6} 9 -${h - 20} Z" fill="#d9d3c8"/>
        <path d="M-9 -${h - 20} C-9 -${h - 16} 9 -${h - 16} 9 -${h - 20} C9 -${h - 23} -9 -${h - 23} -9 -${h - 20} Z" fill="#3a3440"/>
        <path d="M-5 -${h + 6} l1 3 M0 -${h + 10} l1 3 M4 -${h + 4} l1 3 M-6 -${h - 4} l1 3 M5 -${h - 8} l1 3"
            stroke="#a8a096" stroke-width="1.1" stroke-linecap="round"/>
    </g>`;

const oysterShelf = (x, y, rx, tilt) => `
    <g transform="rotate(${tilt} ${x} ${y})">
        <ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${rx * 0.42}" fill="#d8d0bf"/>
        <ellipse cx="${x}" cy="${y + rx * 0.12}" rx="${rx * 0.9}" ry="${rx * 0.26}" fill="#b9ae98"/>
        <path d="M${x - rx * 0.6} ${y + 1} L${x} ${y + rx * 0.3} L${x + rx * 0.6} ${y + 1}"
            stroke="#a0957f" stroke-width="0.8" fill="none"/>
    </g>`;

const enokiStem = (x, top, bend) => `
    <path d="M30 56 C30 48 ${x - bend} ${top + 18} ${x} ${top}" stroke="#efe9d4" stroke-width="2" fill="none" stroke-linecap="round"/>
    <ellipse cx="${x}" cy="${top - 1}" rx="2.8" ry="2.2" fill="#f6f0dc"/>`;

const spine = (x, top, len) =>
    `<path d="M${x} ${top} l0 ${len}" stroke="#e9e2d2" stroke-width="1.5" stroke-linecap="round"/>`;


//    !!! EVERY MUSHROOM !!!

export const MUSHROOM_ART = {
    inkCap: svg("inkCap", `
        ${inkBell(38, 30, 0.72)}
        ${inkBell(24, 34, 0.95)}`),

    oyster: svg("oyster", `
        <path d="M22 56 C22 46 24 36 30 30 C36 36 38 46 38 56 Z" fill="#5a4636"/>
        <path d="M26 56 C26 48 28 40 30 36" stroke="#3e3026" stroke-width="1" fill="none"/>
        ${oysterShelf(21, 44, 12, -14)}
        ${oysterShelf(40, 38, 11, 12)}
        ${oysterShelf(26, 30, 10, -8)}
        ${oysterShelf(38, 24, 8, 10)}`),

    shiitake: svg("shiitake", `
        <rect x="27.5" y="40" width="5" height="16" rx="2.2" fill="#e6d9c0"/>
        <path d="M12 42 C12 30 21 23 30 23 C39 23 48 30 48 42 C40 45.5 20 45.5 12 42 Z" fill="#8a5a36"/>
        <path d="M14 41 C22 43.5 38 43.5 46 41" stroke="#5e3b22" stroke-width="1.2" fill="none"/>
        ${spots([[21, 32, 1.4], [30, 28, 1.1], [38, 33, 1.5], [26, 37, 1], [42, 38, 0.9], [18, 38, 0.9]], "#e8d8b8")}
        <rect x="44" y="48" width="3" height="8" rx="1.4" fill="#e6d9c0"/>
        <path d="M38 49 C38 43 42 40 45.5 40 C49 40 53 43 53 49 C49 50.5 42 50.5 38 49 Z" fill="#9a6a44"/>`),

    enoki: svg("enoki", `
        ${enokiStem(16, 16, -6)}
        ${enokiStem(22, 10, -3)}
        ${enokiStem(28, 6, 0)}
        ${enokiStem(34, 9, 2)}
        ${enokiStem(40, 14, 5)}
        ${enokiStem(45, 22, 7)}
        ${enokiStem(12, 26, -8)}
        <ellipse cx="30" cy="55" rx="7" ry="2.4" fill="#d6ceb4"/>`),

    morel: svg("morel", `
        <path d="M23 56 C24 48 25 42 26 37 L34 37 C35 42 36 48 37 56 Z" fill="#efe6d2"/>
        <path d="M30 5 C38.5 9 41 22 37.5 38 L22.5 38 C19 22 21.5 9 30 5 Z" fill="#b3905c"/>
        ${[[27, 14], [33, 13], [25, 21], [30, 20], [35, 21], [24, 29], [29.5, 28], [35, 29], [30, 34.5], [25.5, 35], [34.5, 35]]
            .map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="2.2" ry="3" fill="#6d5230"/>`).join("")}
        <path d="M30 7 L30 37 M23 24 L37 24 M22.5 31.5 L37.5 31.5 M24 17 L36 17" stroke="#cfae78" stroke-width="0.8"/>`),

    chanterelle: svg("chanterelle", `
        <path d="M26 56 L34 56 C34 46 36 38 47 30 C41 26.5 19 26.5 13 30 C24 38 26 46 26 56 Z" fill="#e5a53a"/>
        <path d="M13 30 C17 25 25 27 30 25 C35 27 43 25 47 30 C41 33 19 33 13 30 Z" fill="#c98422"/>
        <path d="M28 54 C27 44 24 38 18 32 M32 54 C33 44 36 38 42 32 M30 54 L30 32" stroke="#c98422" stroke-width="0.9" fill="none"/>
        <path d="M44 56 L48 56 C48 51 49 47 54 43 C51 41 41 41 38 43 C43 47 44 51 44 56 Z" fill="#eab04a"/>`),

    lionsMane: svg("lionsMane", `
        <path d="M26 56 C26 50 27 44 30 40 C33 44 34 50 34 56 Z" fill="#6a5040"/>
        <path d="M12 34 C10 18 20 10 30 10 C41 10 50 18 48 34 C42 39 18 39 12 34 Z" fill="#f0ebdf"/>
        ${[14, 17, 20, 23, 26, 29, 32, 35, 38, 41, 44, 47].map((x, k) => spine(x, 32 + (k % 3), 8 + ((k * 5) % 7))).join("")}
        ${[16, 22, 28, 34, 40].map((x, k) => spine(x, 18 + (k % 2) * 3, 6)).join("")}`),

    reishi: svg("reishi", `
        <path d="M28 56 C29 50 31 44 30 38 C33 42 34 50 33 56 Z" fill="#6b2a1c"/>
        <path d="M8 32 C8 19 21 12 34 14 C47 16 54 24 52 33 C45 38 15 40 8 32 Z" fill="#9c3524"/>
        <path d="M13 31 C14 22 24 17 34 18 C44 19 49 25 48 31" stroke="#c0573d" stroke-width="1.6" fill="none"/>
        <path d="M19 30 C20 25 27 22 34 23 C41 24 44 27 43 30" stroke="#7a2415" stroke-width="1.4" fill="none"/>
        <path d="M8 32 C15 40 45 38 52 33" stroke="#e8d7b0" stroke-width="2.2" fill="none" stroke-linecap="round"/>
        <path d="M20 19 C24 16 30 15 34 15.5" stroke="rgba(255,255,255,0.35)" stroke-width="1.3" fill="none" stroke-linecap="round"/>`),

    flyAgaric: svg("flyAgaric", `
        <path d="M25 56 C23 53 24 49 27 48 L27.5 34 L32.5 34 L33 48 C36 49 37 53 35 56 Z" fill="#f3efe4"/>
        <path d="M24 40 C26 43 34 43 36 40 L34.5 38 L25.5 38 Z" fill="#e2dccd"/>
        <path d="M10 33 C10 17 20 9 30 9 C40 9 50 17 50 33 C42 36.5 18 36.5 10 33 Z" fill="#d23a2a"/>
        <path d="M12 32.5 C20 35 40 35 48 32.5" stroke="#f3e6c8" stroke-width="1.4" fill="none"/>
        ${spots([[20, 21, 2.2], [30, 15, 2], [40, 22, 2.4], [25, 28, 1.6], [36, 29, 1.7], [15, 29, 1.3], [45, 29.5, 1.2], [31, 23, 1.3]], "#f7f1e2")}
        <path d="M17 17 C21 12 27 10.5 31 10.5" stroke="rgba(255,255,255,0.3)" stroke-width="1.6" fill="none" stroke-linecap="round"/>`),
};

export const mushroomArt = (id) => MUSHROOM_ART[id] || "";
