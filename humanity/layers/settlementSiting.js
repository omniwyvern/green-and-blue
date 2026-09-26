// settlementSiting.js
//
// Settlements on the world map: candidate sites, territory borders, and founding one

import { contributeMapOverlay } from "../../main/layers/worldLayer.js";
import { TERRAIN, TILE_SIZE, tileById, worldState } from "../../main/systems/worldMap.js";
import { switchToLayer } from "../../../render/canvasRouter.js";
import { hexToPixel, neighborsOf } from "../../../utils/hex.js";
import { setText, setDisplay, setWidth, setVar, setClass } from "../../../utils/dom.js";
import { setRichText } from "../../../render/richText.js";
import {
    settlementState, settlements, settlementOn, candidateSites, evaluateSite, isCandidate, territoryOf,
    foundCost, canPayFounding, foundSettlement, sizeOf, CENTER_KINDS, FACTORS, factorReading, borderColor, willClear, bareTiles,
} from "../systems/settlements.js";
import { generateName, cleanName, MOST_NAME_LENGTH } from "../systems/settlementNames.js";
import { settlementSprite, SITE_SPRITE } from "../art/settlementArt.js";
import { qualityChip, typeChips, foundingText } from "./settlementLayer.js";

const siting = () => settlementState().siting;
const choice = () => settlementState().siteChoice;

let candidateCache = { at: -Infinity, ids: new Set() };
const candidates = () => {
    const now = performance.now();
    if (now - candidateCache.at > 250) candidateCache = { at: now, ids: new Set(candidateSites(worldState())) };
    return candidateCache.ids;
};

const chosenTiles = () => (choice() && territoryOf(choice())) || [];

function stopSiting() {
    const s = settlementState();
    s.siting = false;
    s.siteChoice = null;
}


//    !!! BORDERS !!!

const corner = (center, i) => {
    const angle = (Math.PI / 180) * (60 * i - 90);
    return { x: center.x + TILE_SIZE * Math.cos(angle), y: center.y + TILE_SIZE * Math.sin(angle) };
};

// The outline of a set of tiles: every edge whose far side is outside the set
function outline(ids) {
    const inside = new Set(ids);
    const segments = [];
    for (const id of ids) {
        const tile = tileById(id);
        const center = hexToPixel(tile, TILE_SIZE);
        const corners = [0, 1, 2, 3, 4, 5].map(i => corner(center, i));
        for (const next of neighborsOf(tile)) {
            if (inside.has(next.id)) continue;
            const far = hexToPixel(next, TILE_SIZE);
            const [a, b] = corners
                .map(c => ({ c, d: Math.hypot(c.x - far.x, c.y - far.y) }))
                .sort((x, y) => x.d - y.d);
            segments.push(`M${a.c.x.toFixed(1)} ${a.c.y.toFixed(1)}L${b.c.x.toFixed(1)} ${b.c.y.toFixed(1)}`);
        }
    }
    return segments.join("");
}

const bordersScene = {
    build(el) {
        el.classList.add("settle-borders");
        el.innerHTML = `<svg width="1" height="1"></svg>`;
    },
    update(el) {
        const chosen = siting() ? choice() : null;
        const key = JSON.stringify([settlements().map(t => t.center + ":" + t.hue), chosen]);
        if (el.__key === key) return;
        el.__key = key;
        const paths = settlements().map(t =>
            `<path class="settle-border" style="stroke:${borderColor(t)}" d="${outline(t.tiles)}"/>`);
        if (chosen && territoryOf(chosen)) paths.push(`<path class="settle-border is-preview" d="${outline(territoryOf(chosen))}"/>`);
        el.firstElementChild.innerHTML = paths.join("");
    },
};


//    !!! THE SITE PANEL !!!

const DRY_CENTERS = [...CENTER_KINDS].map(kind => TERRAIN[kind].name.toLowerCase()).join(", ");

const sitePanel = {
    build(el) {
        el.innerHTML = `
            <div class="settle-site">
                <div class="site-prompt">
                    <p class="site-text"></p>
                    <button class="settle-button" data-act="cancel">Cancel</button>
                </div>
                <div class="site-detail">
                    <div class="site-head"><span class="site-quality"></span><span class="site-types"></span></div>
                    <div class="site-bars">
                        ${Object.keys(FACTORS).map(key => `
                            <div class="site-bar" data-bar="${key}">
                                <span class="site-bar-name"></span>
                                <div class="stat-bar"><div class="stat-fill"></div><div class="site-bar-mark"></div></div>
                            </div>`).join("")}
                    </div>
                    <p class="site-clears">Standing water here will drain, and snow will melt, once people settle.</p>
                    <p class="site-bare"></p>
                    <p class="site-cost"></p>
                    <div class="site-buttons">
                        <button class="settle-button" data-act="back">Back</button>
                        <button class="settle-button is-primary" data-act="found">Found here</button>
                    </div>
                </div>
            </div>`;
        el.addEventListener("click", (event) => {
            const act = event.target.closest("[data-act]")?.dataset.act;
            if (act === "cancel") { stopSiting(); switchToLayer("settlement"); }
            else if (act === "back") settlementState().siteChoice = null;
            else if (act === "found" && choice() && canPayFounding()) openConfirm(choice());
        });
    },
    update(el) {
        const panel = el.firstElementChild;
        setDisplay(panel, siting());
        if (!siting()) return;
        const s = worldState();
        const chosen = choice() && isCandidate(s, choice()) ? choice() : null;
        setDisplay(panel.querySelector(".site-prompt"), !chosen);
        setDisplay(panel.querySelector(".site-detail"), !!chosen);

        if (!chosen) {
            const count = candidates().size;
            setText(panel.querySelector(".site-text"), count > 0
                ? `${count} possible site${count === 1 ? "" : "s"} marked. Pick one to see what would grow there.`
                : `Nowhere fits yet. A settlement needs dry, solid ground at its center (${DRY_CENTERS}), `
                    + `all six tiles around it claimed, at least three of the seven dry, and a gap of one tile from any other settlement.`);
            return;
        }

        const site = evaluateSite(s, chosen);
        const detail = panel.querySelector(".site-detail");
        if (detail.__key !== chosen + site.types.join()) {
            detail.__key = chosen + site.types.join();
            detail.querySelector(".site-quality").innerHTML = qualityChip(site.quality);
            detail.querySelector(".site-types").innerHTML = typeChips(site.types);
        }
        for (const key in FACTORS) {
            const bar = detail.querySelector(`[data-bar="${key}"]`);
            const reading = factorReading(key, site.parts[key]);
            setWidth(bar.querySelector(".stat-fill"), reading.fill);
            setDisplay(bar.querySelector(".site-bar-mark"), reading.mark !== null);
            if (reading.mark !== null) setVar(bar, "--mark", `${reading.mark * 100}%`);
            setText(bar.querySelector(".site-bar-name"), reading.over ? FACTORS[key].overName : FACTORS[key].name);
            setClass(bar, "is-over", reading.over);
        }
        setDisplay(detail.querySelector(".site-clears"), willClear(s, site.tiles));
        const bare = bareTiles(Object.values(site.kinds));
        setDisplay(detail.querySelector(".site-bare"), bare > 0);
        setText(detail.querySelector(".site-bare"), `${bare === 1 ? "One tile is" : `${bare} tiles are`} bare ground. `
            + "Almost nothing grows there, nothing lives there, and nobody can work it.");
        const cost = foundCost();
        setRichText(detail.querySelector(".site-cost"), Object.keys(cost).length
            ? `Costs ${foundingText()}` : "Your first settlement is free.");
        const button = detail.querySelector('[data-act="found"]');
        button.disabled = !canPayFounding();
    },
};


//    !!! FOUNDING !!!

function openConfirm(center) {
    const site = evaluateSite(worldState(), center);
    let generated = generateName(site.types, site.quality);

    const overlay = document.createElement("div");
    overlay.className = "settle-confirm";
    overlay.innerHTML = `
        <div class="confirm-box settle-confirm-box">
            <div class="confirm-head">A mark in history</div>
            <div class="settle-confirm-chips">${qualityChip(site.quality)}${typeChips(site.types)}</div>
            <p class="confirm-warn">Founding a settlement cannot be undone. It will never be moved or abandoned.</p>
            ${willClear(worldState(), site.tiles) ? `<p class="confirm-note">Its standing water will drain and its snow will melt, leaving bare ground.</p>` : ""}
            <p class="confirm-note">Its seven tiles become historically protected. Nothing will raze, transform,
               flood, freeze or overgrow them again, so the land stays exactly as it was the day it was settled.</p>
            <label class="settle-name-field">
                <span>Name</span>
                <input type="text" maxlength="${MOST_NAME_LENGTH}" spellcheck="false">
                <button class="settle-button" data-act="reroll" title="Randomize">Randomize</button>
            </label>
            <div class="confirm-buttons">
                <button class="confirm-cancel" data-act="close">Not yet</button>
                <button class="confirm-go" data-act="go"></button>
            </div>
        </div>`;
    const input = overlay.querySelector("input");
    const go = overlay.querySelector('[data-act="go"]');
    const showName = () => { go.textContent = `Found ${cleanName(input.value, generated)}`; };
    input.value = generated;
    showName();

    const close = () => overlay.remove();
    input.addEventListener("input", showName);
    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") go.click();
        if (event.key === "Escape") close();
    });
    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) return close();
        const act = event.target.closest("[data-act]")?.dataset.act;
        if (act === "close") close();
        else if (act === "reroll") {
            event.preventDefault();
            generated = generateName(site.types, site.quality, input.value);
            input.value = generated;
            showName();
        } else if (act === "go") {
            if (foundSettlement(site, cleanName(input.value, generated))) {
                close();
                switchToLayer("settlement");
            }
        }
    });

    document.body.appendChild(overlay);
    input.focus();
    input.select();
}


//    !!! ON THE MAP !!!

contributeMapOverlay("settlement", {
    tileClass(s, tile) {
        const owner = settlementOn(tile.id);
        if (owner) return `settle-territory settle-hue-${owner.hue}${owner.center === tile.id ? " settle-center" : ""}`;
        if (!siting()) return "";
        if (chosenTiles().includes(tile.id)) return tile.id === choice() ? "settle-chosen settle-chosen-center" : "settle-chosen";
        return candidates().has(tile.id) ? "settle-candidate" : "";
    },
    content(s, tile) {
        const owner = settlementOn(tile.id);
        if (owner && owner.center === tile.id) return settlementSprite(sizeOf(owner).name);
        return siting() && candidates().has(tile.id) ? SITE_SPRITE : "";
    },
    tooltip(s, tile) {
        const owner = settlementOn(tile.id);
        if (owner) return `Historically protected, part of ${owner.name}`;
        return siting() && candidates().has(tile.id) ? "Possible settlement site" : "";
    },
    onClick(s, tile) {
        if (!siting()) return false;
        if (!candidates().has(tile.id)) {
            settlementState().siteChoice = null;
            return false;
        }
        settlementState().siteChoice = tile.id;
        return true;
    },
    onCanvasClick() {
        if (siting()) settlementState().siteChoice = null;
    },
    scene: bordersScene,
    hud: sitePanel,
});

// Unclaimed tiles never reach the overlay's handlers, so a stray click there is caught here
document.addEventListener("click", (event) => {
    if (!siting()) return;
    const tile = event.target.closest?.(".hex-tile");
    if (!tile || !tile.closest(".layer-canvas")?.querySelector(".settle-site")) return;
    if (!candidates().has(tile.dataset.tileId)) settlementState().siteChoice = null;
});
