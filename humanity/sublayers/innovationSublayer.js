// innovationSublayer.js
//
// Working notions into innovations on a hex note, combining them, and the manual of what makes what

import { setText, setDisplay, setClass } from "../../../utils/dom.js";
import { setRichText } from "../../../render/richText.js";
import { hexToPixel, areNeighbors } from "../../../utils/hex.js";
import {
    knowledgeState, NOTIONS, INNOVATIONS, isPrimal, notionTier, notionCount, notionKnown, knownNotions, landsWith, landGroupsWith, seenLandCount, fromLand, combine,
    triedNothing, knownResult, makeableCount,
    innovated, innovationShown, canStudy, canWork, missingNeeds, missingNotions, needName, noteLayout, noteAt, notePlaced, noteJoined,
    placeNotion, placeProblem, clearCell, clearNote, linked, worldText,
} from "../systems/knowledge.js";
import { notionIcon, notionPath } from "../art/notionIcons.js";

const byTier = (a, b) => notionTier(a) - notionTier(b) || Object.keys(NOTIONS).indexOf(a) - Object.keys(NOTIONS).indexOf(b);
// A recipe's ingredients, most basic first; the manual groups recipes by that first one
const partsOf = (id) => [...(NOTIONS[id].of || [])].sort(byTier);
const byRecipe = (x, y) => isPrimal(y) - isPrimal(x) || (isPrimal(x) ? byTier(x, y)
    : byTier(partsOf(x)[0], partsOf(y)[0]) || byTier(partsOf(x)[1], partsOf(y)[1]));
const notionSpan = (id) => `<span class="notion-name" style="--notion:${NOTIONS[id].color}">${notionIcon(id)}${NOTIONS[id].name}</span>`;
export const notionsText = (notions) => {
    const ids = Object.keys(notions).sort(byTier);
    return ids.length ? ids.map(id => `${notionSpan(id)} ${notions[id]}`).join(", ") : "<span>none along this route</span>";
};
const countLabel = (id) => notionCount(id) === Infinity ? "∞" : String(notionCount(id));
const listText = (items) => items.length < 3 ? items.join(" and ") : `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;

const HEX = `<svg class="mix-hex" viewBox="0 0 86.6 100" preserveAspectRatio="none"><polygon points="43.3,1 85.6,25.5 85.6,74.5 43.3,99 1,74.5 1,25.5"/></svg>`;

const PAGE = `
    <div class="know-page innov-page flyout-inset">
        <section class="know-card innov-note-card">
            <div class="innov-head">
                <button class="innov-pick" data-act="pick">
                    <span class="innov-pick-text"><span class="innov-title"></span><span class="innov-effect"></span></span>
                    <span class="innov-pick-arrow">▾</span>
                </button>
                <div class="innov-menu"></div>
            </div>
            <p class="innov-status"></p>
            <svg class="innov-note"></svg>
            <div class="innov-actions">
                <span class="innov-brush"></span>
                <button class="settle-button" data-act="clear-note">Start over</button>
            </div>
        </section>
        <section class="know-card">
            <h3>Notions</h3>
            <div class="notion-palette"></div>
            <div class="notion-mix">
                <button class="mix-slot" data-slot="a">${HEX}<span class="mix-body"></span></button>
                <span class="mix-op">+</span>
                <button class="mix-slot" data-slot="b">${HEX}<span class="mix-body"></span></button>
                <span class="mix-arrow"></span>
                <span class="mix-slot mix-result">${HEX}<span class="mix-body"></span></span>
            </div>
            <button class="mix-combine" data-act="combine">Combine</button>
            <p class="mix-hint"></p>
            <p class="combine-result"></p>
        </section>
        <section class="know-card innov-manual"><h3>Manual</h3><div class="notion-manual"></div></section>
    </div>`;

let combineResult = "";
let menuOpen = false;
let mixA = null;
let mixB = null;
let mixTarget = "a";
let finished = null;

const unfinished = () => Object.keys(INNOVATIONS).filter(id => !innovated(id) && innovationShown(id));

function selected() {
    const k = knowledgeState();
    const open = unfinished();
    if (!open.includes(k.selected) && (!k.selected || k.selected !== finished)) k.selected = open.find(canStudy) || open.find(canWork) || open[0] || null;
    return k.selected;
}

function onClick(event) {
    const k = knowledgeState();
    const target = event.target.closest("[data-act], [data-cell], [data-innov], [data-brush], [data-slot], [data-recipe]");
    const picking = target?.dataset.act === "pick";
    menuOpen = picking && !menuOpen;
    if (!target || picking) return;
    if (target.dataset.innov) k.selected = target.dataset.innov;
    else if (target.dataset.brush) pickNotion(target.dataset.brush);
    else if (target.dataset.slot) clickSlot(target.dataset.slot);
    else if (target.dataset.cell) clickCell(target.dataset.cell);
    else if (target.dataset.act === "clear-note") clearNote(selected());
    else if (target.dataset.recipe) makeRecipe(target, target.dataset.recipe);
    else if (target.dataset.act === "combine") tryCombine(mixA, mixB);
}

function pickNotion(id) {
    knowledgeState().brush = id;
    if (mixA === id) { mixA = null; mixTarget = "a"; }
    else if (mixB === id) { mixB = null; mixTarget = "b"; }
    else if (mixTarget === "b") mixB = id;
    else { mixA = id; if (!mixB) mixTarget = "b"; }
}

function clickSlot(slot) {
    if (mixTarget !== slot) mixTarget = slot;
    else if (slot === "a") mixA = null;
    else mixB = null;
}

function clickCell(cellId) {
    const id = selected();
    if (notePlaced(id)[cellId]) return clearCell(id, cellId);
    const brush = knowledgeState().brush;
    if (placeProblem(id, cellId, brush)) return;
    if (placeNotion(id, cellId, brush)) finished = id;
}

function flash(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    el.addEventListener("animationend", () => el.classList.remove(cls), { once: true });
}

function makeRecipe(el, id) {
    const parts = partsOf(id);
    const short = parts.filter(n => notionCount(n) < 1);
    if (!short.length) combine(...parts);
    const slots = el.querySelectorAll(".mix-slot");
    parts.forEach((n, i) => { if (short.includes(n)) flash(slots[i], "is-short"); });
    el.querySelector(".manual-pop")?.remove();
    const pop = document.createElement("span");
    pop.className = `manual-pop${short.length ? " is-short" : ""}`;
    pop.textContent = short.length ? `Need ${short.map(n => NOTIONS[n].name).join(" and ")}` : `+1 ${NOTIONS[id].name}`;
    pop.addEventListener("animationend", () => pop.remove());
    el.append(pop);
}

function tryCombine(a, b) {
    if (!a || !b) return;
    const made = combine(a, b);
    combineResult = made ? `Made ${notionSpan(made)}.`
        : made === false ? `Not enough ${notionSpan(notionCount(a) < 1 ? a : b)}.`
        : `Nothing comes of ${notionSpan(a)} and ${notionSpan(b)}, and both are spent.`;
}


//    !!! THE LIST !!!

function innovationState(id) {
    if (innovated(id)) return { cls: "is-done", text: "Known" };
    const needs = missingNeeds(id);
    if (needs.length) return { cls: "is-locked", text: `After ${needs.map(needName).join(", ")}` };
    const unknown = missingNotions(id).length;
    if (unknown) return { cls: "is-open", text: `${unknown} notion${unknown === 1 ? "" : "s"} not found yet` };
    return { cls: "is-open", text: Object.keys(notePlaced(id)).length ? "Being worked out" : "Ready to work on" };
}

function renderMenu(el) {
    setClass(el, "is-open", menuOpen);
    const ids = unfinished();
    if (el.__key !== ids.join()) {
        el.__key = ids.join();
        el.innerHTML = ids.map(id => `
        <button class="innov-row" data-innov="${id}">
            <span class="innov-row-name">${INNOVATIONS[id].name}</span><span class="innov-row-state"></span>
        </button>`).join("");
    }
    for (const row of el.children) {
        const id = row.dataset.innov;
        const st = innovationState(id);
        for (const cls of ["is-done", "is-locked", "is-open"]) setClass(row, cls, st.cls === cls);
        setClass(row, "is-active", id === selected());
        setText(row.querySelector(".innov-row-state"), st.text);
    }
}


//    !!! THE NOTE !!!

const CELL = 30;
const ICON = 30;
const corners = (x, y) => [0, 1, 2, 3, 4, 5]
    .map(i => { const a = Math.PI / 180 * (60 * i - 30); return `${(x + CELL * 0.95 * Math.cos(a)).toFixed(1)},${(y + CELL * 0.95 * Math.sin(a)).toFixed(1)}`; })
    .join(" ");

// Half a recipe, preferring the half the player already knows
function hiddenClue(id) {
    if (isPrimal(id)) return "Not found yet. Expeditions bring this one home from the land.";
    const part = NOTIONS[id].of.find(notionKnown) || NOTIONS[id].of[0];
    return `Not found yet. Something made with ${NOTIONS[part].name}.`;
}

function renderNote(svg, id) {
    const { radius, cells, pinned, blocked } = noteLayout(id);
    const placed = notePlaced(id);
    const key = JSON.stringify([id, placed, innovated(id), missingNotions(id)]);
    if (svg.__key === key) return;
    svg.__key = key;

    const w = CELL * Math.sqrt(3) * (radius + 0.6);
    const h = CELL * (1.5 * radius + 1.1);
    svg.setAttribute("viewBox", `${-w} ${-h} ${2 * w} ${2 * h}`);
    const joined = noteJoined(id);
    const at = (cid) => noteAt(id, cid);
    const pos = Object.fromEntries(cells.map(c => [c.id, hexToPixel(c, CELL)]));

    const links = [];
    for (const a of cells) for (const b of cells) {
        if (a.id >= b.id || !areNeighbors(a, b)) continue;
        const na = at(a.id);
        const nb = at(b.id);
        if (na && nb && linked(na, nb)) links.push(`<line class="note-link${joined.has(a.id) ? " is-joined" : ""}"
            x1="${pos[a.id].x}" y1="${pos[a.id].y}" x2="${pos[b.id].x}" y2="${pos[b.id].y}"/>`);
    }
    const labels = [];
    svg.innerHTML = cells.map(c => {
        const notion = at(c.id);
        const { x, y } = pos[c.id];
        const cls = ["note-cell", blocked.has(c.id) && "is-blocked", pinned[c.id] && "is-pinned", placed[c.id] && "is-placed",
            joined.has(c.id) && notion && "is-joined"].filter(Boolean).join(" ");
        const hidden = notion && pinned[c.id] && !notionKnown(notion);
        const style = notion && !hidden ? ` style="--notion:${NOTIONS[notion].color}"` : "";
        if (hidden) labels.push(`<text class="note-label" x="${x}" y="${y}">?</text>`);
        else if (notion) labels.push(`<g class="note-icon"${style} transform="translate(${x - ICON / 2} ${y - ICON / 2}) scale(${ICON / 24})">
            <path class="note-icon-under" d="${notionPath(notion)}"/><path d="${notionPath(notion)}"/></g>`);
        const title = notion ? `<title>${hidden ? hiddenClue(notion) : NOTIONS[notion].name}</title>` : "";
        return `<g class="${cls}" data-cell="${c.id}"${style}><polygon points="${corners(x, y)}"/>${title}</g>`;
    }).join("") + links.join("") + labels.join("");
}

function renderNoteCard(el, id) {
    renderMenu(el.querySelector(".innov-menu"));
    setDisplay(el.querySelector(".innov-note"), !!id);
    setDisplay(el.querySelector(".innov-pick-arrow"), unfinished().length > 0);
    if (!id) {
        const all = Object.keys(INNOVATIONS).every(innovated);
        setText(el.querySelector(".innov-title"), all ? "Nothing left to work out" : "Nothing to work on yet");
        setText(el.querySelector(".innov-effect"), "");
        setText(el.querySelector(".innov-status"), all ? "Every innovation known so far is in the Lore."
            : "Every innovation starts from something found in the land. Make more discoveries.");
        setDisplay(el.querySelector(".innov-actions"), false);
        return;
    }
    const def = INNOVATIONS[id];
    setText(el.querySelector(".innov-title"), def.name);
    setText(el.querySelector(".innov-effect"), [def.text, worldText(id)].filter(Boolean).join(", "));
    const st = innovationState(id);
    setClass(el, "is-finished", innovated(id));
    setClass(el.querySelector(".innov-pick"), "is-next", innovated(id) && unfinished().some(canWork));
    setText(el.querySelector(".innov-status"), innovated(id) ? `Worked out! ${def.lore}`
        : st.cls === "is-locked" ? `${st.text}.`
        : def.desc);
    setClass(el, "is-locked", st.cls === "is-locked");
    renderNote(el.querySelector(".innov-note"), id);
    const brush = knowledgeState().brush;
    setDisplay(el.querySelector(".innov-actions"), canWork(id));
    setRichText(el.querySelector(".innov-brush"), brush && NOTIONS[brush]
        ? `Placing ${notionSpan(brush)} (${countLabel(brush)} left)` : "<span>Pick a notion to place</span>");
    el.querySelector('[data-act="clear-note"]').disabled = !Object.keys(notePlaced(id)).length;
}


//    !!! NOTIONS AND THE MANUAL !!!

function renderPalette(el, known) {
    const brush = knowledgeState().brush;
    if (el.__key !== known.join()) {
        el.__key = known.join();
        el.innerHTML = known.length === 0 ? `<p class="know-empty">Expeditions bring notions home from the land they cross.</p>`
            : known.map(id => `<button class="notion-chip" data-brush="${id}" style="--notion:${NOTIONS[id].color}">
                ${notionIcon(id)}<span>${NOTIONS[id].name}</span><span class="notion-count"></span></button>`).join("");
    }
    for (const chip of el.querySelectorAll(".notion-chip")) {
        setText(chip.querySelector(".notion-count"), countLabel(chip.dataset.brush));
        setClass(chip, "is-empty", notionCount(chip.dataset.brush) < 1);
        setClass(chip, "is-brush", chip.dataset.brush === brush);
    }
}

const slotHtml = (id) => id ? `${notionIcon(id)}<span class="mix-name">${NOTIONS[id].name}</span>` : "";

function setSlot(el, html, color) {
    if (el.__key === html) return;
    el.__key = html;
    el.querySelector(".mix-body").innerHTML = html;
    el.style.setProperty("--notion", color || "");
}

function renderMix(el, known) {
    if (!known.includes(mixA)) mixA = null;
    if (!known.includes(mixB)) mixB = null;
    const [a, b, result] = el.querySelectorAll(".mix-slot");
    setSlot(a, slotHtml(mixA), mixA && NOTIONS[mixA].color);
    setSlot(b, slotHtml(mixB) || (mixTarget === "b" ? `<span class="mix-name">Pick one</span>` : ""), mixB && NOTIONS[mixB].color);
    setClass(a, "is-target", mixTarget === "a");
    setClass(b, "is-target", mixTarget === "b");
    const both = mixA && mixB;
    const made = both && knownResult(mixA, mixB);
    const failed = both && triedNothing(mixA, mixB);
    setSlot(result, made ? slotHtml(made) : both && !failed ? `<span class="mix-unknown">?</span>` : "", made && NOTIONS[made].color);
    setClass(result, "is-failed", !!failed);
    const hint = mixA ? makeableCount(mixA) : makeableCount();
    setText(el.parentElement.querySelector(".mix-hint"), known.length < 2 ? ""
        : mixA ? (hint ? `${NOTIONS[mixA].name} can still make ${hint} new notion${hint === 1 ? "" : "s"} with what you know.`
            : `Nothing new comes of ${NOTIONS[mixA].name} with what you know yet.`)
        : hint ? `${hint} new notion${hint === 1 ? "" : "s"} can be made from what you know.` : "Nothing new can be made from what you know yet.");
    el.parentElement.querySelector('[data-act="combine"]').disabled = !both || failed
        || notionCount(mixA) < 1 || notionCount(mixB) < 1;
}

const recipeSlot = (id) => id
    ? `<span class="mix-slot" style="--notion:${NOTIONS[id].color}">${HEX}<span class="mix-body">${slotHtml(id)}</span></span>`
    : `<span class="mix-slot is-failed">${HEX}</span>`;

function manualTip(id) {
    const lands = isPrimal(id) ? landGroupsWith(id) : landsWith(id);
    return lands.length ? `Found in ${listText(lands)}` : isPrimal(id) || fromLand(id) ? "" : "Only made by combining";
}

function renderManual(el, known) {
    const key = `${known.join()}|${seenLandCount()}`;
    if (el.__key === key) return;
    el.__key = key;
    el.innerHTML = known.length === 0 ? `<p class="know-empty">Every notion you find is written in here, with what makes it.</p>`
        : known.map(id => {
            const [a, b] = partsOf(id);
            const tip = manualTip(id);
            const tag = a ? `button data-recipe="${id}"` : "div";
            return `<${tag} class="manual-recipe"${tip ? ` title="${tip}"` : ""}>${recipeSlot(a)}<span class="mix-op">+</span>${recipeSlot(b)}`
                + `<span class="mix-arrow"></span>${recipeSlot(id)}</${a ? "button" : "div"}>`;
        }).join("");
}

export const INNOVATION_VIEW = {
    name: "Innovation",
    color: "#b67ae0",
    canvasType: "static",
    canvasClass: "knowledge-canvas",
    scene: {
        build(el) {
            el.innerHTML = PAGE;
            el.firstElementChild.addEventListener("click", onClick);
        },
        update(el) {
            const known = knownNotions().sort(byRecipe);
            const id = selected();
            renderNoteCard(el.querySelector(".innov-note-card"), id);
            renderPalette(el.querySelector(".notion-palette"), known);
            renderMix(el.querySelector(".notion-mix"), known);
            setRichText(el.querySelector(".combine-result"), combineResult ? `<span>${combineResult}</span>` : "");
            renderManual(el.querySelector(".notion-manual"), known);
        },
    },
};
