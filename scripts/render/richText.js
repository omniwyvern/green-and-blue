// richText.js
//
// Colors resource names and amounts

import { resourceDefs } from "../core/registry.js";
import { costParts, registeredCostGroups } from "../core/resources.js";
import { formatNumber } from "../utils/format.js";


//    !!! SPANS !!!

const escapeHtml = (text) => String(text).replace(/[&<>]/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

const resourceSpan = (name, color, text = name) =>
    `<span class="res" style="--resource-color:${color}">${escapeHtml(text)}</span>`;

const colorOf = (resourceId) => (resourceDefs[resourceId] && resourceDefs[resourceId].color) || "var(--text)";

// "G&B Essence": each letter in its own color, the rest fading from first to last
function groupSpan(ids, amount, label, short) {
    const first = colorOf(ids[0]);
    const last = colorOf(ids[ids.length - 1]);
    const letters = short.split("&");

    let name = escapeHtml(label);
    if (letters.length === ids.length && label.startsWith(short)) {
        name = letters.map((letter, i) => resourceSpan(letter, colorOf(ids[i])))
            .join("&amp;") + escapeHtml(label.slice(short.length));
    }
    return `<span class="res res-group" style="--resource-color:${first};--resource-color-end:${last}">`
        + `${escapeHtml(amount)}${name}</span>`;
}

export function namedResourceSpan(resourceId, text = null) {
    const def = resourceDefs[resourceId];
    if (!def) return escapeHtml(text ?? "");
    return resourceSpan(def.name, def.color || "var(--text)", text ?? def.name);
}

// Resource names at three widths: full, abbreviated, and brief
export function resourceLabel(resourceId, form = "name") {
    const def = resourceDefs[resourceId];
    if (!def) return String(resourceId);
    if (form === "short") return def.short;
    if (form === "brief") return def.brief;
    return def.name;
}

// What something pays out each second, as plain text or in the resource's color
export const rateText = (resourceId, amount, form = "name") =>
    `${formatNumber(amount)} ${resourceLabel(resourceId, form)}/s`;

export const rateSpan = (resourceId, amount, form = "short") =>
    namedResourceSpan(resourceId, rateText(resourceId, amount, form));


//    !!! FINDING RESOURCES IN TEXT !!!

// Registration finishes during startup before anything renders
let matchIndex = null;

// An amount sitting right in front of a name reads as one thing
const AMOUNT_BEFORE_NAME = "(?:[-+]?\\d[\\d,]*(?:\\.\\d+)?(?:e\\d+)?%?\\s+)?";

function indexResources() {
    if (!matchIndex) {
        // Matches escaped text (so "G&amp;B"); entries are [find, plain name, def or cost group]
        const entries = [];
        for (const def of Object.values(resourceDefs)) {
            entries.push([def.name, def.name, def]);
            if (def.short && def.short !== def.name) entries.push([def.short, def.short, def]);
        }
        for (const group of registeredCostGroups()) {
            entries.push([escapeHtml(group.name), group.name, group]);
            if (group.short !== group.name) entries.push([escapeHtml(group.short), group.short, group]);
        }
        // Longest first, so "Blue Essence" is taken before anything that sits inside it
        entries.sort((a, b) => b[0].length - a[0].length);

        matchIndex = {
            pattern: new RegExp("\\b" + AMOUNT_BEFORE_NAME
                + "(" + entries.map(([find]) => find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")
                + ")\\b", "g"),
            entries,
        };
    }
    return matchIndex;
}

// Which resource a match is and how it's colored (unescaped here, re-escaped by the span)
function coloredMatch(entries, match) {
    for (const [find, plain, def] of entries) {
        if (match !== find && !match.endsWith(" " + find)) continue;
        const amount = match.slice(0, match.length - find.length);
        if (def.ids) return groupSpan(def.ids, amount, plain, def.short);
        return resourceSpan(plain, def.color || "var(--text)", amount + plain);
    }
    return match;
}

export function colorResources(text) {
    const { pattern, entries } = indexResources();
    return escapeHtml(text).replace(pattern, match => coloredMatch(entries, match));
}


//    !!! COSTS !!!

// A price with each resource colored; short uses abbreviations like BE
export function costHtml(cost, short = false) {
    return costParts(cost)
        .map(part => {
            const label = short ? part.short : part.label;
            if (part.ids.length > 1) return groupSpan(part.ids, `${part.amount} `, label, part.short);
            return resourceSpan(part.label, part.color || "var(--text)",
                `${part.amount} ${label}`);
        })
        .join(" + ");
}

// innerHTML with the same change-guard the other writes have
export function setRichText(el, text) {
    if (el.dataset.rich === text) return;
    el.dataset.rich = text;
    el.innerHTML = text.includes("<span") ? text : colorResources(text);
}


//    !!! UPGRADE DESCRIPTIONS !!!

// A faded "(+25%)" sitting beside an upgrade's total, so you can see what the next level adds
export function gainNote(gain) {
    return gain ? ` <span class="upgrade-step">(${escapeHtml(gain)})</span>` : "";
}

// Puts the "(+25%)" after the last number; -1 when the sentence quotes something that isn't one
function afterLastNumber(sentence) {
    let at = -1;
    for (const match of sentence.matchAll(/-?\d[\d,]*(?:\.\d+)?%?/g)) {
        at = match.index + match[0].length;
    }
    return at;
}

// The description itself, coloring the sentence and hanging the gain note off the end
export function upgradeDescription(sentence, gain = null) {
    if (!gain) return colorResources(sentence);

    const at = afterLastNumber(sentence);
    if (at < 0) {
        const cut = sentence.lastIndexOf(".");
        if (cut < 0) return colorResources(sentence) + gainNote(gain);
        return colorResources(sentence.slice(0, cut)) + gainNote(gain) + escapeHtml(sentence.slice(cut));
    }
    return colorResources(sentence.slice(0, at)) + gainNote(gain) + colorResources(sentence.slice(at));
}