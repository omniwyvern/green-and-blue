// richText.js
//
// Makes resources display with their color names, including the amount of that resource.

import { resourceDefs } from "../core/registry.js";
import { costParts } from "../core/resources.js";

const escapeHtml = (text) => String(text).replace(/[&<>]/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

const resourceSpan = (name, color, text = name) =>
    `<span class="res" style="--resource-color:${color}">${escapeHtml(text)}</span>`;

export function namedResourceSpan(resourceId, text = null) {
    const def = resourceDefs[resourceId];
    if (!def) return escapeHtml(text ?? "");
    return resourceSpan(def.name, def.color || "var(--text)", text ?? def.name);
}

// Registration finishes during startup before anything renders
let matchIndex = null;

// An amount sitting right in front of a name reads as one thing
const AMOUNT_BEFORE_NAME = "(?:[-+]?\\d[\\d,]*(?:\\.\\d+)?(?:e\\d+)?%?\\s+)?";

function indexResources() {
    if (!matchIndex) {
        const entries = [];
        for (const def of Object.values(resourceDefs)) {
            entries.push([def.name, def]);
            if (def.short && def.short !== def.name) entries.push([def.short, def]);
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

// Which resource a matched piece of text is, and what it looks like colored. The match may
// have brought its leading amount along, which rides inside the same span
function coloredMatch(entries, match) {
    for (const [find, def] of entries) {
        if (match === find || match.endsWith(" " + find)) {
            return resourceSpan(find, def.color || "var(--text)", match);
        }
    }
    return escapeHtml(match);
}

export function colorResources(text) {
    const { pattern, entries } = indexResources();
    return escapeHtml(text).replace(pattern, match => coloredMatch(entries, match));
}

// A price, with each resource and its amount named in that resource's color. Short reads
// as the abbreviations, so narrow rows fit them
export function costHtml(cost, short = false) {
    return costParts(cost)
        .map(part => {
            const label = short ? part.short : part.label;
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

// A quieter "(+25%)" sitting beside an upgrade's quoted total, saying what the level being
// bought adds. Call sites bring their own sign, and it drops out entirely once maxed
export function gainNote(gain) {
    return gain ? ` <span class="upgrade-step">(${escapeHtml(gain)})</span>` : "";
}

// Where a note slots into a sentence: just past the last number quoted (keeping any % with
// it), so it lands beside the total it adds to. -1 when the sentence quotes no number at all
function afterLastNumber(sentence) {
    let at = -1;
    for (const match of sentence.matchAll(/-?\d[\d,]*(?:\.\d+)?%?/g)) {
        at = match.index + match[0].length;
    }
    return at;
}

// An upgrade description: resource names colored like everywhere else, and the next level's
// gain tucked in right after the number it adds to - "40% (+40%)" - so the pair reads as one.
// Sentences are written with the level-scaled number last; with no number anywhere the note
// falls back to the old spot ahead of the full stop, and maxed upgrades just read their total
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