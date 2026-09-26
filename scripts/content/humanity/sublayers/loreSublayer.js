// loreSublayer.js
//
// Everything people already know: discoveries made by any settlement, and finished innovations

import { settlements, PROJECTS, discoveriesMade, discoveryName } from "../systems/settlements.js";
import { INNOVATIONS, innovated, innovationOpen, knownDiscoveries, worldText } from "../systems/knowledge.js";
import { setDisplay } from "../../../utils/dom.js";

const PAGE = `
    <div class="know-page lore-page flyout-inset">
        <section class="know-card"><h3>Discoveries</h3><div class="lore-list lore-discoveries"></div></section>
        <section class="know-card lore-innovation-card"><h3>Innovations</h3><div class="lore-list lore-innovations"></div></section>
    </div>`;

const entry = (name, text, note) => `
    <div class="lore-entry">
        <span class="lore-name">${name}</span>
        <span class="lore-text">${text}</span>
        <span class="lore-note">${note}</span>
    </div>`;

function renderDiscoveries(el) {
    const ids = knownDiscoveries();
    const key = JSON.stringify(settlements().map(t => [t.name, discoveriesMade(t)]));
    if (el.__key === key) return;
    el.__key = key;
    el.innerHTML = ids.length === 0 ? `<p class="know-empty">No discoveries yet.</p>` : ids.map(id => {
        const where = settlements().filter(t => discoveriesMade(t).includes(id)).map(t => t.name);
        return entry(discoveryName(id), PROJECTS[id].text, `Known in ${where.join(", ")}`);
    }).join("");
}

function renderInnovations(el) {
    const ids = Object.keys(INNOVATIONS).filter(innovated);
    if (el.__key === ids.join()) return;
    el.__key = ids.join();
    el.innerHTML = ids.length === 0 ? `<p class="know-empty">Nothing new has been worked out yet. That happens under Innovation.</p>`
        : ids.map(id => entry(INNOVATIONS[id].name,
            [`${INNOVATIONS[id].text}, in every settlement`, worldText(id)].filter(Boolean).join("; "), INNOVATIONS[id].lore)).join("");
}

export const LORE_VIEW = {
    name: "Lore",
    color: "#d9b36a",
    canvasType: "static",
    canvasClass: "knowledge-canvas",
    scene: {
        build(el) {
            el.innerHTML = PAGE;
        },
        update(el) {
            renderDiscoveries(el.querySelector(".lore-discoveries"));
            setDisplay(el.querySelector(".lore-innovation-card"), innovationOpen());
            if (innovationOpen()) renderInnovations(el.querySelector(".lore-innovations"));
        },
    },
};
