// guide.js
//
// Builds the first-visit popups (text in content/main/guides.js) and the glossary

import { state, claimUnseen } from "../core/state.js";
import { availableGuides, pendingGuides, availableTerms } from "../core/guides.js";
import { colorResources } from "./richText.js";

const overlay = document.getElementById("guide-overlay");
const openButton = document.getElementById("guide-button");

// Shown when the info button is pressed on a layer that has no guide
const NOTHING_HERE = {
    id: null,
    title: "Nothing to explain",
    body: `<p>There's nothing to say about this layer yet. Come back once more of it has
           opened up. Anything that turns up here will explain itself first.</p>`,
};

let els = null;
let panel = null;
let queue = [];
let index = 0;


//    !!! OPENING A GUIDE !!!

export function initGuides() {
    if (!overlay || !openButton) return;

    buildWindow();

    openButton.addEventListener("click", openForActiveLayer);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
}

export function checkGuides() {
    if (!overlay || anyModalOpen()) return;

    const pending = pendingGuides(state.activeLayer);
    if (pending.length > 0) open(pending);
}

// Every .modal-overlay exists from page load, so they're collected once
const modalOverlays = [...document.querySelectorAll(".modal-overlay")];

function anyModalOpen() {
    return modalOverlays.some(el => !el.hidden);
}

// Hitting the info button shows the glossary beside it, but auto-popups don't
function openForActiveLayer() {
    const list = availableGuides(state.activeLayer);
    open(list.length > 0 ? list : [NOTHING_HERE], { glossary: true });
}


//    !!! THE GLOSSARY !!!

// Every term met so far, its shorthand, how it's gained, and what it does
function fillGlossary() {
    const met = availableTerms();
    els.glossary.hidden = met.length === 0;
    panel.classList.toggle("with-glossary", met.length > 0);
    if (met.length === 0) return;

    els.terms.innerHTML = met.map(term => {
        const color = term.color || "var(--text)";
        // The shorthand reads in the same color as the name, since it stands for the same thing
        const named = (text) => `<span class="res" style="--resource-color:${color}">${text}</span>`;
        const short = term.short ? ` <span class="glossary-slash">/</span> ${named(term.short)}` : "";
        const body = typeof term.body === "function" ? term.body() : term.body;
        return `<dt>${named(term.term)}${short}</dt><dd>${colorResources(body)}</dd>`;
    }).join("");
    els.terms.scrollTop = 0;
}


//    !!! THE QUEUE !!!

function open(list, { glossary = false } = {}) {
    if (list.length === 0) return;
    queue = list;
    index = 0;

    if (glossary) fillGlossary();
    else {
        els.glossary.hidden = true;
        panel.classList.remove("with-glossary");
    }

    overlay.hidden = false;
    show();
}

function show() {
    const guide = queue[index];

    els.title.textContent = guide.title;
    els.body.innerHTML = guide.body;
    els.body.scrollTop = 0;

    // Being put on screen is what counts as having been given it
    if (guide.id) claimUnseen("guides", guide.id);

    const more = index < queue.length - 1;
    els.next.textContent = more ? "Next" : "Got it";
    els.back.hidden = index === 0;
    els.progress.textContent = queue.length > 1 ? `${index + 1} of ${queue.length}` : "";
}

function close() {
    if (overlay.hidden) return;
    overlay.hidden = true;

    for (const guide of queue) {
        if (guide.id) claimUnseen("guides", guide.id);
    }
    queue = [];
    index = 0;
}


//    !!! THE WINDOW !!!

function buildWindow() {
    panel = document.createElement("div");
    panel.className = "settings-window guide-window";

    panel.innerHTML = `
        <div class="settings-header">
            <h2 class="guide-title"></h2>
            <button class="settings-close" aria-label="Close">&times;</button>
        </div>
        <div class="guide-columns">
            <div class="guide-body"></div>
            <aside class="guide-glossary" hidden>
                <h3 class="glossary-heading">Glossary</h3>
                <dl class="glossary"></dl>
            </aside>
        </div>
        <div class="guide-footer">
            <span class="guide-progress"></span>
            <div class="guide-nav">
                <button class="settings-button-secondary guide-back">Back</button>
                <button class="settings-button-secondary guide-next">Got it</button>
            </div>
        </div>
    `;

    els = {
        title: panel.querySelector(".guide-title"),
        body: panel.querySelector(".guide-body"),
        glossary: panel.querySelector(".guide-glossary"),
        terms: panel.querySelector(".glossary"),
        progress: panel.querySelector(".guide-progress"),
        back: panel.querySelector(".guide-back"),
        next: panel.querySelector(".guide-next"),
    };

    panel.querySelector(".settings-close").addEventListener("click", close);
    els.back.addEventListener("click", () => { if (index > 0) { index--; show(); } });
    els.next.addEventListener("click", () => {
        if (index < queue.length - 1) { index++; show(); } else close();
    });

    overlay.appendChild(panel);
}
