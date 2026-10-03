// mushroomGroveSublayer.js
//
// Pick a mushroom from the basket, plant it in a bed, click it once grown to fruit

import { canAfford, getResource, stepNote } from "../../../core/resources.js";
import { D } from "../../../utils/decimal.js";
import { setText, setVar, setDisplay } from "../../../utils/dom.js";
import { upgradeDescription } from "../../../render/richText.js";
import { formatNumber, formatPercent, formatWhole, clockText } from "../../../utils/format.js";
import { mushroomArt } from "../art/mushroomArt.js";
import {
    SPECIES, PLANTABLE, BEDS, groveState, groveOpen, bedCount, bedAt, plant, fruit,
    isFound, fruitsToFind, isMature, canFruit, growthShare, secondsToMature, sapShare,
    activeBoosts, boostLeft, fruitMultiplier, fruitSeconds, adjacencyPerNeighbor, stillnessActive,
    sporeMultiplier, growthSpeed, SOIL_PER_LEVEL, PRINT_PER_LEVEL, POTENCY_PER_LEVEL, LINGER_PER_LEVEL,
    MULCH_PER_LEVEL,
} from "../systems/mushroomGrove.js";

// Which mushroom is picked out of the basket. Not saved
let selected = null;

export const MUSHROOM_GROVE_VIEW = {
    name: "Mushroom Grove",
    color: "#c4544c",
    canvasType: "static",
    canvasClass: "grove-canvas",

    scene: {
        build(el) {
            el.className = "static-scene grove-scene";
            el.innerHTML = layout();
            wire(el);
        },

        update(el) {
            paint(el);
        },
    },

    drawers: {
        grove: {
            label: "Grove",
            color: "#c4544c",
            upgrades: {
                clearing: {
                    title: "Clear the Undergrowth",
                    description: (s, lvl) => upgradeDescription(
                        `Opens ${lvl} more bed${lvl === 1 ? "" : "s"} in the clearing.`,
                        stepNote(lvl, 2, "+1")),
                    max: 2,
                    cost: (s, lvl) => ({ greenEssence: D(2e33).mul(D(8).pow(lvl)) }),
                },
                richSoil: {
                    title: "Leaf Mold",
                    description: (s, lvl) => upgradeDescription(
                        `Mushrooms come up ${formatPercent(SOIL_PER_LEVEL * lvl)} faster.`,
                        stepNote(lvl, 10, `+${formatPercent(SOIL_PER_LEVEL)}`)),
                    max: 10,
                    cost: (s, lvl) => ({ spores: D(60).mul(D(1.75).pow(lvl)) }),
                },
                mulch: {
                    title: "Deadwood Mulch",
                    description: (s, lvl) => upgradeDescription(
                        `Growing mushrooms feed on the mulch instead, sapping ${formatPercent(MULCH_PER_LEVEL * lvl)} less Biomass.`,
                        stepNote(lvl, 8, `-${formatPercent(MULCH_PER_LEVEL)}`)),
                    max: 8,
                    cost: (s, lvl) => ({ greenEssence: D(6e32).mul(D(3.5).pow(lvl)) }),
                },
                sporePrint: {
                    title: "Spore Prints",
                    description: (s, lvl) => upgradeDescription(
                        `Mushrooms that are up shed ${formatPercent(PRINT_PER_LEVEL * lvl)} more Spores.`,
                        stepNote(lvl, 10, `+${formatPercent(PRINT_PER_LEVEL)}`)),
                    max: 10,
                    cost: (s, lvl) => ({ spores: D(40).mul(D(1.7).pow(lvl)) }),
                },
                fruitingBody: {
                    title: "Fruiting Bodies",
                    description: (s, lvl) => upgradeDescription(
                        `Every fruiting boost is ${formatPercent(POTENCY_PER_LEVEL * lvl)} stronger.`,
                        stepNote(lvl, 8, `+${formatPercent(POTENCY_PER_LEVEL)}`)),
                    max: 8,
                    cost: (s, lvl) => ({ blueEssence: D(1e33).mul(D(4).pow(lvl)) }),
                },
                lingering: {
                    title: "Lingering Spores",
                    description: (s, lvl) => upgradeDescription(
                        `Fruiting boosts last ${LINGER_PER_LEVEL * lvl} seconds longer.`,
                        stepNote(lvl, 6, `+${LINGER_PER_LEVEL}`)),
                    max: 6,
                    cost: (s, lvl) => ({ spores: D(150).mul(D(2.2).pow(lvl)) }),
                },
            },
        },
    },
};


//    !!! THE SCENE !!!

const MOTES = 22;

// The rim of the hollow, in the back bank's 100x100 box
const lipY = (x) => 20 + 3.5 * Math.sin(x * 0.13) + 2 * Math.sin(x * 0.37 + 1);
const LIP = Array.from({ length: 51 }, (_, i) => `${i ? "L" : "M"}${i * 2} ${lipY(i * 2).toFixed(2)}`).join(" ");

const ROOTS = Array.from({ length: 16 }, (_, i) => {
    const x = 2 + i * 6.3 + (i * 13) % 4;
    const y = lipY(x) - 0.5;
    const len = 12 + (i * 17) % 30;
    const sway = (i % 2 ? 1 : -1) * (1 + (i * 7) % 3);
    const main = `M${x} ${y} C${x + sway} ${y + len * 0.35} ${x - sway} ${y + len * 0.7} ${x + sway * 0.4} ${y + len}`;
    const branch = i % 3 ? "" : ` M${x + sway * 0.2} ${y + len * 0.4} C${x + sway * 1.6} ${y + len * 0.5} ${x + sway * 2} ${y + len * 0.62} ${x + sway * 2.6} ${y + len * 0.7}`;
    return `<path class="grove-root" d="${main}${branch}"/>`;
}).join("");

const TUFTS = Array.from({ length: 60 }, (_, i) => {
    const x = i * 1.7 + (i * 7) % 3 * 0.3;
    const y = lipY(x);
    return `M${x} ${y} l${(i % 3) * 0.4 - 0.4} -${1.8 + (i * 5) % 4 * 0.6}`;
}).join(" ");

const BANK = `
    <svg class="grove-bank" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs>
            <linearGradient id="grove-bank-shade" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0.15" class="grove-bank-stop-top"/>
                <stop offset="1" class="grove-bank-stop-low"/>
            </linearGradient>
        </defs>
        <path class="grove-bank-wall" d="${LIP} L100 100 L0 100 Z" fill="url(#grove-bank-shade)"/>
        <path class="grove-bank-strata" d="M0 46 C20 42 40 50 60 44 C76 40 90 46 100 42 M0 68 C18 64 36 72 54 66 C72 60 88 68 100 64
            M0 86 C24 82 46 90 70 84 C84 81 94 86 100 84"/>
        <g class="grove-bank-stones">
            <ellipse cx="14" cy="58" rx="1.6" ry="2.4"/><ellipse cx="41" cy="36" rx="1.1" ry="1.8"/>
            <ellipse cx="72" cy="54" rx="2" ry="2.8"/><ellipse cx="90" cy="30" rx="1.2" ry="2"/>
        </g>
        ${ROOTS}
        <path class="grove-bank-lip" d="${LIP}"/>
        <path class="grove-bank-tufts" d="${TUFTS}"/>
    </svg>`;

// Where the sides of the hollow slope in
const SIDE_PATH = "M100 0 C96 18 80 30 70 44 C58 62 40 78 0 100";
const SIDES = ["left", "right"].map(side => `
    <svg class="grove-side ${side}" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path class="grove-side-fill" d="M0 0 L100 0 ${SIDE_PATH.slice(SIDE_PATH.indexOf("C"))} Z"/>
        <path class="grove-side-lip" d="${SIDE_PATH}"/>
    </svg>`).join("");

// An old log rotting along the back of the hollow
const LOG = `
    <svg class="grove-log" viewBox="0 0 240 44" aria-hidden="true">
        <path class="grove-log-body" d="M14 14 C60 8 150 8 222 12 L224 38 C150 42 60 42 12 38 Z"/>
        <path class="grove-log-bark" d="M40 16 C70 20 90 14 120 18 M60 28 C90 32 130 26 170 30 M140 17 C160 20 180 15 205 19
            M30 32 C45 34 60 31 80 34 M180 33 C195 35 205 32 218 34"/>
        <ellipse class="grove-log-end" cx="13" cy="26" rx="7" ry="12.5"/>
        <ellipse class="grove-log-ring" cx="13" cy="26" rx="4.2" ry="8"/>
        <ellipse class="grove-log-ring" cx="13" cy="26" rx="1.8" ry="3.6"/>
        <path class="grove-log-moss" d="M30 12 C50 4 80 6 96 10 C104 12 100 18 92 16 C80 13 66 16 58 18 C48 20 34 18 30 12 Z
            M130 10 C150 5 176 6 196 11 C204 14 198 19 188 16 C174 13 160 15 146 16 C136 17 128 14 130 10 Z"/>
        <path class="grove-log-drip" d="M62 17 l0 9 M72 16 l0 6 M150 15 l0 8 M170 14 l0 5 M186 15 l0 10"/>
        <g class="grove-log-shelf">
            <path d="M104 26 C110 22 122 22 126 26 C120 28 110 28 104 26 Z"/>
            <path d="M110 32 C115 29 124 29 128 32 C123 34 115 34 110 32 Z"/>
        </g>
    </svg>`;

const fern = (flip) => `
    <g transform="${flip ? "translate(60 0) scale(-1 1)" : ""}">
        ${[[4, 60, -52], [10, 58, -38], [16, 60, -24], [22, 60, -60], [2, 60, -30]].map(([x, len, lean]) => {
            const tip = x + lean * 0.25 + 26;
            return `<path class="grove-fern" d="M${x} 60 C${x + 4} ${60 - len * 0.5} ${tip - 6} ${60 - len * 0.9} ${tip} ${60 - len}"/>`
                + Array.from({ length: 6 }, (_, k) => {
                    const t = (k + 1) / 7;
                    const px = x + (tip - x) * t;
                    const py = 60 - len * t;
                    return `<path class="grove-frond" d="M${px} ${py} q-5 -1 -8 3 M${px} ${py} q4 -4 8 -3"/>`;
                }).join("");
        }).join("")}
    </g>`;

const FERNS = `
    <svg class="grove-ferns left" viewBox="0 0 60 60" aria-hidden="true">${fern(false)}</svg>
    <svg class="grove-ferns right" viewBox="0 0 60 60" aria-hidden="true">${fern(true)}</svg>`;

const motes = () => Array.from({ length: MOTES }, (_, i) =>
    `<span class="grove-mote" style="--x:${(i * 41 + 7) % 100}%;--y:${35 + (i * 29) % 60}%;--n:${i}"></span>`).join("");

const LITTER = Array.from({ length: 34 }, (_, i) => [(i * 53 + 11) % 100, (i * 37 + 5) % 100, i % 4]);
const litter = () => LITTER.map(([x, y, k]) =>
    `<ellipse class="grove-leaf leaf-${k}" cx="${x * 4}" cy="${y}" rx="${2.2 + k * 0.5}" ry="${0.9 + y * 0.012}"
        transform="rotate(${(x * 7) % 60 - 30} ${x * 4} ${y})"/>`).join("");

const THREADS = `
    <svg class="grove-threads" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
        <path d="M50 20 C40 18 30 24 14 21 M50 20 C60 16 72 24 88 19 M50 20 C46 26 36 30 26 33
            M50 20 C56 27 66 29 76 34 M30 22 C26 16 20 14 10 15 M70 21 C76 15 84 13 92 14"/>
    </svg>`;

const depthZ = (d) => 100 + Math.round(d * 100);

const bedsHtml = () => BEDS.map((bed, i) => `
    <button class="grove-bed empty" type="button" data-bed="${i}"
        style="--x:${bed.x};--d:${bed.d};z-index:${depthZ(bed.d)}">
        <span class="grove-soil"></span>
        ${THREADS}
        <span class="grove-plant"><span class="grove-art"></span></span>
        <span class="grove-puffs"><i></i><i></i><i></i><i></i></span>
        <span class="grove-hit"></span>
    </button>`).join("");

const basketHtml = () => PLANTABLE.map(id => `
    <button class="grove-seed" type="button" data-species="${id}" style="--c:${SPECIES[id].color}">
        <span class="grove-seed-art">${mushroomArt(id)}</span>
        <span class="grove-seed-name"></span>
        <span class="grove-seed-cost"></span>
    </button>`).join("");

const layout = () => `
    <div class="grove-back">
        ${BANK}
        <span class="grove-fog far"></span>
    </div>
    <div class="grove-floor">
        <svg class="grove-litter" viewBox="0 0 400 100" preserveAspectRatio="none" aria-hidden="true">${litter()}</svg>
        <span class="grove-fog near"></span>
    </div>
    ${LOG}
    <span class="grove-shaft"></span>
    ${SIDES}
    <span class="grove-shade"></span>
    ${FERNS}
    <div class="grove-motes">${motes()}</div>
    <div class="grove-clearing">
        ${bedsHtml()}
        <div class="grove-tag" hidden>
            <div class="grove-tag-name"></div>
            <div class="grove-tag-line"></div>
            <div class="grove-tag-act"></div>
        </div>
    </div>
    <div class="grove-boosts"></div>
    <div class="grove-bottom">
        <div class="grove-hint"></div>
        <div class="grove-basket">${basketHtml()}</div>
    </div>
    <div class="grove-veil"><span>No grove yet. Turn a tile into a Mushroom Grove on the World map.</span></div>
`;


//    !!! CLICKS !!!

function wire(el) {
    el.__hover = -1;

    el.querySelectorAll(".grove-bed").forEach(button => {
        const i = Number(button.dataset.bed);
        button.addEventListener("pointerenter", () => { el.__hover = i; paint(el); });
        button.addEventListener("pointerleave", () => {
            if (el.__hover === i) { el.__hover = -1; paint(el); }
        });
        button.addEventListener("click", (e) => {
            e.stopPropagation();
            clickBed(el, i);
        });
    });

    el.querySelectorAll(".grove-seed").forEach(button => {
        button.addEventListener("click", (e) => {
            e.stopPropagation();
            const id = button.dataset.species;
            if (!isFound(id)) return;
            selected = selected === id ? null : id;
            paint(el);
        });
    });

    el.addEventListener("click", () => {
        if (!selected) return;
        selected = null;
        paint(el);
    });
}

function clickBed(el, i) {
    const bed = bedAt(i);
    if (!bed) {
        if (selected && plant(i, selected)) {
            pop(el, i, "planted");
            if (!canAfford({ spores: D(SPECIES[selected].cost) })) selected = null;
        }
    } else if (canFruit(bed)) {
        const id = bed.species;
        if (fruit(i)) burst(el, i, id);
    }
    paint(el);
}

function pop(el, i, name) {
    const bed = el.querySelector(`.grove-bed[data-bed="${i}"]`);
    bed.classList.remove(name);
    void bed.offsetWidth;
    bed.classList.add(name);
}

// The mushroom is already gone from the bed by the time this runs, so it bursts from a copy
function burst(el, i, id) {
    const bed = el.querySelector(`.grove-bed[data-bed="${i}"]`);
    const node = document.createElement("div");
    node.className = "grove-burst";
    node.style.cssText = bed.style.cssText;
    node.style.setProperty("--c", SPECIES[id].color);
    node.innerHTML = `<span class="grove-plant"><span class="grove-art">${mushroomArt(id)}</span></span>`
        + Array.from({ length: 12 }, (_, k) => `<i style="--k:${k}"></i>`).join("");
    el.querySelector(".grove-clearing").appendChild(node);
    setTimeout(() => node.remove(), 1400);
}


//    !!! PAINTING !!!

function paint(el) {
    const s = groveState();
    const live = groveOpen();
    el.classList.toggle("bare", !live);
    if (!live) selected = null;
    if (selected && !isFound(selected, s)) selected = null;

    const count = bedCount(s);
    el.querySelectorAll(".grove-bed").forEach(button => {
        const i = Number(button.dataset.bed);
        setDisplay(button, i < count);
        if (i >= count) return;
        paintBed(button, bedAt(i, s));
    });

    paintBasket(el, s);
    paintBoosts(el, s);
    paintTag(el, s);
    paintHint(el, s);
}

function paintBed(button, bed) {
    const mature = isMature(bed);
    const sig = bed ? bed.species : "";
    button.classList.toggle("empty", !bed);
    button.classList.toggle("growing", !!bed && !mature);
    button.classList.toggle("mature", mature);
    button.classList.toggle("fruitable", canFruit(bed));
    button.classList.toggle("wild", !!bed && !!SPECIES[bed.species].wild);
    button.classList.toggle("target", !bed && !!selected);
    setVar(button, "--g", growthShare(bed).toFixed(3));

    const art = button.querySelector(".grove-art");
    if (art.dataset.sig !== sig) {
        art.dataset.sig = sig;
        art.innerHTML = bed ? mushroomArt(bed.species) : "";
        button.setAttribute("aria-label", bed ? SPECIES[bed.species].name : "Empty bed");
        button.style.setProperty("--c", bed ? SPECIES[bed.species].color : "transparent");
    }
}

function paintBasket(el, s) {
    const spores = getResource("spores");
    el.querySelectorAll(".grove-seed").forEach(button => {
        const id = button.dataset.species;
        const found = isFound(id, s);
        const poor = found && spores.lt(SPECIES[id].cost);
        button.classList.toggle("locked", !found);
        button.classList.toggle("poor", poor);
        button.classList.toggle("picked", selected === id);
        setText(button.querySelector(".grove-seed-name"), found ? SPECIES[id].name : "???");
        const left = fruitsToFind(id, s);
        setText(button.querySelector(".grove-seed-cost"), found
            ? `${formatWhole(SPECIES[id].cost)} Spores`
            : `Fruit ${left} more`);
        const title = found ? SPECIES[id].blurb : `Fruit ${left} more mushroom${left === 1 ? "" : "s"} to find this one`;
        if (button.title !== title) button.title = title;
    });
}

const times = (v) => Number.isInteger(v) ? String(v) : v.toFixed(1);

const boostText = (id) => {
    const kind = SPECIES[id].fruit.kind;
    if (kind === "stillness") return "Every other boost holds still";
    if (kind === "adjacency") return `+${formatPercent(adjacencyPerNeighbor())} to tiles for each tile touching them`;
    return `x${times(fruitMultiplier(id))} ${SPECIES[id].fruit.name}`;
};

function paintBoosts(el, s) {
    const box = el.querySelector(".grove-boosts");
    const ids = PLANTABLE.filter(id => boostLeft(id, s) > 0);
    const still = stillnessActive(s);
    const sig = ids.join(",");
    if (box.dataset.sig !== sig) {
        box.dataset.sig = sig;
        box.innerHTML = ids.map(id => `
            <div class="grove-boost" data-boost="${id}" style="--c:${SPECIES[id].color}">
                <span class="grove-boost-cord"></span>
                <span class="grove-boost-orb">${mushroomArt(id)}</span>
                <span class="grove-boost-text">${boostText(id)}</span>
                <span class="grove-boost-left"></span>
            </div>`).join("");
    }
    const boosts = activeBoosts(s);
    box.querySelectorAll("[data-boost]").forEach(node => {
        const id = node.dataset.boost;
        const left = boosts[id] || 0;
        setText(node.querySelector(".grove-boost-left"), `${Math.ceil(left)}s`);
        setVar(node, "--left", Math.min(1, left / fruitSeconds()).toFixed(3));
        node.classList.toggle("held", still && SPECIES[id].fruit.kind !== "stillness");
    });
}

function paintTag(el, s) {
    const tag = el.querySelector(".grove-tag");
    const i = el.__hover;
    const show = i >= 0 && i < bedCount(s) && groveOpen();
    if (tag.hidden !== !show) tag.hidden = !show;
    if (!show) return;

    const bed = bedAt(i, s);
    setVar(tag, "--x", BEDS[i].x);
    setVar(tag, "--d", BEDS[i].d);

    const lines = tagLines(bed);
    setText(tag.querySelector(".grove-tag-name"), lines.name);
    setText(tag.querySelector(".grove-tag-line"), lines.line);
    setText(tag.querySelector(".grove-tag-act"), lines.act);
}

function tagLines(bed) {
    if (!bed) {
        const def = selected && SPECIES[selected];
        return {
            name: "Empty bed",
            line: def ? `Plant ${def.name} for ${formatWhole(def.cost)} Spores` : "Pick a mushroom from the basket to plant here",
            act: def ? `Comes up in about ${clockText(def.grow / growthSpeed())}` : "",
        };
    }
    const def = SPECIES[bed.species];
    if (!isMature(bed)) {
        return {
            name: def.name,
            line: `Coming up, about ${clockText(secondsToMature(bed))} to go`,
            act: def.sap > 0 ? `Sapping ${(def.sap * sapShare() * 100).toFixed(1)}% of all Biomass a second` : "Takes nothing from the ground",
        };
    }
    return {
        name: def.name,
        line: `Shedding ${formatNumber(def.spores * sporeMultiplier())} Spores a second`,
        act: def.fruit ? `Click to fruit: ${boostText(bed.species)} for ${fruitSeconds()}s` : "Nothing here to fruit",
    };
}

function paintHint(el, s) {
    const hint = el.querySelector(".grove-hint");
    let text = "";
    if (selected) text = `${SPECIES[selected].name}. When fruited: ${boostText(selected)} for ${fruitSeconds()}s. Sheds ${formatNumber(SPECIES[selected].spores * sporeMultiplier())} Spores a second once grown.`;
    else if (bedAt(0, s)?.species === "inkCap" && !isMature(bedAt(0, s))) text = "Something is coming up on its own.";
    setText(hint, text);
    hint.classList.toggle("on", !!text);
}
