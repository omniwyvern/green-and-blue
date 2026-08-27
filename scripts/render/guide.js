// guide.js
//
// These are the tutorial windows that pop up when you enter a layer/sublayer for the first time.
// They're written in the content/main/guides.js file, this just constructs the popup.
// Also the "i" icon opens this again. Uses the same framework as the settings and dev menus.

import { state, claimUnseen } from "../core/state.js";
import { availableGuides, pendingGuides } from "../core/guides.js";

const overlay = document.getElementById("guide-overlay");
const openButton = document.getElementById("guide-button");

// Shown when the info button is pressed on a layer that has no guide
const NOTHING_HERE = {
    id: null,
    title: "Nothing to explain",
    body: `<p>There's nothing to say about this layer yet. Come back once more of it has
           opened up - anything that turns up here will explain itself first.</p>`,
};

let els = null;
let queue = [];
let index = 0;

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

// Every .modal-overlay exists from page load on, so only they're collected once
const modalOverlays = [...document.querySelectorAll(".modal-overlay")];

function anyModalOpen() {
    return modalOverlays.some(el => !el.hidden);
}

function openForActiveLayer() {
    const list = availableGuides(state.activeLayer);
    open(list.length > 0 ? list : [NOTHING_HERE]);
}

function open(list, startIndex = 0) {
    if (list.length === 0) return;
    queue = list;
    index = startIndex;
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

function buildWindow() {
    const panel = document.createElement("div");
    panel.className = "settings-window guide-window";

    panel.innerHTML = `
        <div class="settings-header">
            <h2 class="guide-title"></h2>
            <button class="settings-close" aria-label="Close">&times;</button>
        </div>
        <div class="guide-body"></div>
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
