// forestSublayer.js
//
// The forest page: ground, trees, and info windows (logic in forestTrees.js)

import { getLayerState } from "../../../core/state.js";
import { formatNumber, formatWhole, clockText } from "../../../utils/format.js";
import { setText, setDisplay, setWidth } from "../../../utils/dom.js";
import { setRichText } from "../../../render/richText.js";
import {
    STATS, STAT_IDS, CATEGORIES, GROWTH_OPTIONS, CHOICES, MATURE_AT, standSeconds,
    trees, oldGrowth, treeById, treeBonus, categorize, chooseGrowth, forestBonuses, growthRate,
    liveBonus, lifeProgress, isMature, isWaiting, instinctLeft, nextThreshold, optionEffects,
    CHANNELS, emptyBonus, appliedBonus,
    stageName, stageProgress, statTotal, forestIsBare,
    standsUntilFelled, silviculture, canFell, fellTree,
} from "../systems/forestTrees.js";
import { treeSvg, shapeKey, treeIcon, crownTop } from "../art/forestArt.js";


//    !!! TREE SLOTS !!!

// Where each tree slot is, so that they don't move others around
const SLOT_X = [22, 68, 42, 86, 10, 56, 34];
const SLOT_DEPTH = [1, 0.94, 0.79, 0.86, 0.72, 0.82, 0.9];

const slotX = (slot) => SLOT_X[slot % SLOT_X.length];
const slotDepth = (slot) => SLOT_DEPTH[slot % SLOT_DEPTH.length];


// Number of old growth trees needed before the backdrop is as green as it gets
const FULL_FOREST = 30;


//    !!! SELECTION !!!

// Clicking on a tree on the right side of the page opens the window on the left and vice-versa
const panelSide = (tree) => (tree && slotX(tree.slot) > 50 ? "left" : "right");


const selectedId = (s) => (s.forestSelection === null || s.forestSelection === undefined)
    ? null : Number(s.forestSelection);

const selectedTree = (s) => {
    const id = selectedId(s);
    return id === null ? null : treeById(s, id);
};

function selectTree(s, id) {
    s.forestSelection = id;
    if (id !== null) s.forestSummaryOpen = false;
}

// Opening it from a tree leaves it on the side that tree's window was on
function toggleSummary(s) {
    const tree = selectedTree(s);
    if (tree) s.forestSummarySide = panelSide(tree);
    s.forestSummaryOpen = !s.forestSummaryOpen;
    if (s.forestSummaryOpen) s.forestSelection = null;
}


//    !!! READOUTS !!!

// Readouts
const multiplierText = (bonus) => `x${formatNumber(1 + bonus)}`;

// What a tree currently reads as, if it matured in its current state. Growth choices change this
const readsAs = (tree) => CATEGORIES[categorize(tree)];

const COUNT_WORDS = { 2: "two", 3: "three", 4: "four", 5: "five" };


// How long before the tree hits the next growth stage and needs a choice
function waitText(tree, s) {
    if (isWaiting(tree)) return instinctLeft(tree) === null ? "Waiting on you" : `Waiting on you, picks itself in ${clockText(instinctLeft(tree))}`;
    if (isMature(tree)) {
        return standsUntilFelled(s) ? "Standing until you take it" : `Standing, ${clockText(standSeconds() - tree.held)} left`;
    }
    const rate = growthRate(tree, s);
    if (rate <= 0) return "Not growing";
    return `${clockText((nextThreshold(tree) - tree.growth) / rate)} to the next step`;
}


//    !!! THE PAGE MARKUP !!!

const SCENE_MARKUP = `
    <div class="forest-sky"></div>
    <div class="forest-green"></div>
    <div class="forest-haze"></div>
    <div class="forest-thicket"></div>
    <div class="forest-floor"><div class="forest-grass"></div></div>
    <div class="forest-grove"></div>

    <button class="forest-open-summary" type="button">
        <span class="open-summary-label">The Forest</span>
        <span class="open-summary-value">Bonuses &amp; old growth</span>
        <span class="open-summary-count"></span>
    </button>

    <div class="forest-bare">
        <div class="forest-page-title">No forests yet</div>
        <div class="forest-page-note">Nothing has anywhere to stand. Forest is made on the world
            map, out of three tiles of grass at a time, and the forest opens as soon as there
            is one of them.</div>
    </div>

    <aside class="forest-panel">
        <button class="forest-close" type="button" aria-label="Close">&times;</button>

        <div class="forest-page" data-page="tree">
            <div class="forest-page-head">
                <span class="forest-page-title"></span>
            </div>
            <div class="forest-page-note tree-wait"></div>

            <div class="forest-card">
                <div class="forest-card-head">
                    <span class="forest-page-label">Growth</span>
                    <span class="tree-growth"></span>
                </div>
                <div class="forest-bar"><div class="forest-fill tree-stage-fill"></div></div>
                <div class="forest-page-note tree-stage-note"></div>
            </div>

            <div class="forest-section">
                <div class="forest-section-head">
                    <span class="forest-page-label">Balance</span>
                    <span class="forest-reads-as"></span>
                </div>
                <div class="tree-stats"></div>
            </div>

            <div class="forest-section">
                <div class="forest-page-label">Worth while it stands</div>
                <div class="forest-yield tree-yield"></div>
            </div>

            <button type="button" class="tree-fell" data-fell>Take it for old growth</button>

            <div class="forest-section tree-offer">
                <div class="forest-page-label offer-label">The tree can grow two ways</div>
                <div class="offer-cards"></div>
            </div>

            <div class="forest-section">
                <div class="forest-page-label tree-picks-label">Grown so far</div>
                <div class="tree-picks"></div>
            </div>
        </div>

        <div class="forest-page" data-page="summary">
            <div class="forest-page-head">
                <span class="forest-page-title">The Forest</span>
            </div>
            <div class="forest-card">
                <div class="forest-page-label">Everything the forest is worth</div>
                <div class="forest-yield summary-total"></div>
            </div>

            <div class="forest-section silviculture-block">
                <div class="forest-page-label">Silviculture</div>
                <button type="button" class="silviculture-toggle" data-hold></button>
                <div class="forest-page-note silviculture-note"></div>
            </div>

            <div class="forest-section summary-block">
                <div class="forest-page-label">Old growth <span class="summary-count"></span></div>
                <div class="summary-old-list"></div>
            </div>

            <div class="forest-section summary-block">
                <div class="forest-page-label">Standing now</div>
                <div class="summary-live-list"></div>
            </div>
        </div>
    </aside>
`;


//    !!! YIELD CHIPS !!!

const yieldChip = (label, value, color) =>
    `<span class="forest-chip" style="--resource-color:${color}">${value} <em>${label}</em></span>`;

// Labels for each channel a tree pays into, long and short (richText.js was acting weird here)
const YIELDS = [
    { key: "green",   long: "Green Essence",  short: "GE",     color: "#3aa876" },
    { key: "blue",    long: "Blue Essence",   short: "BE",     color: "#4a90d9" },
    { key: "growth",  long: "Vitality",       short: "Vitality", color: "#8ccf5e" },
    { key: "biomass", long: "Biomass",        short: "Biomass", color: "#0d8f88" },
    { key: "speed",   long: "Tree growth",    short: "Tree growth", color: "#6fc27a" },
    { key: "living",  long: "Standing trees", short: "Standing", color: "#e0a05a" },
    { key: "amplify", long: "All old growth", short: "All old growth", color: "#f2c14e" },
];

const yieldChips = (bonus, { speedLabel = "Tree growth", short = false } = {}) =>
    YIELDS.filter(entry => bonus[entry.key] > 0)
        .map(entry => yieldChip(
            entry.key === "speed" ? speedLabel : (short ? entry.short : entry.long),
            multiplierText(bonus[entry.key]), entry.color));

// One row of chips for a set of bonuses. Empty ones are ignored so it doesn't just show a bunch of x1 mults
function renderYield(host, bonus, { speedLabel = "Tree growth" } = {}) {
    const parts = yieldChips(bonus, { speedLabel });

    const key = parts.join("");
    if (host.dataset.key === key) return;
    host.dataset.key = key;
    host.innerHTML = parts.join("") || `<span class="forest-yield-empty">Nothing yet</span>`;
}


//    !!! TREE PAGE !!!

// Renders the 3 stat bars
function renderStats(host, tree) {
    if (!host.dataset.built) {
        host.dataset.built = "1";
        host.innerHTML = STAT_IDS.map(id => `
            <div class="stat-row" data-stat="${id}" style="--stat-color:${STATS[id].color}"
                title="${STATS[id].blurb}">
                <span class="stat-name">${STATS[id].name}</span>
                <span class="stat-track"><span class="stat-fill"></span></span>
                <span class="stat-points"></span>
            </div>`).join("");
    }

    const total = statTotal(tree) || 1;
    for (const row of host.querySelectorAll(".stat-row")) {
        const points = Math.max(0, tree[row.dataset.stat]);
        setWidth(row.querySelector(".stat-fill"), points / total);
        setText(row.querySelector(".stat-points"), points);
    }
}

// Renders the card offers, only rebuilt when it changes
function renderOffer(host, tree) {
    const key = tree.offer ? tree.offer.join("|") : "";
    if (host.dataset.key === key) return;
    host.dataset.key = key;

    if (!tree.offer) {
        host.innerHTML = "";
        return;
    }

    host.innerHTML = tree.offer.map(id => {
        const option = GROWTH_OPTIONS[id];
        const effects = optionEffects(id)
            .map(part => `<span class="offer-effect ${part.good ? "good" : "bad"}">${part.text}</span>`)
            .join("");
        return `<button class="offer-card" type="button" data-option="${id}">
                <span class="offer-name">${option.name}</span>
                <span class="offer-effects">${effects}</span>
                <span class="offer-text">${option.text}</span>
            </button>`;
    }).join("");
}

// Renders what the previous growth choices were
function renderPicks(host, tree) {
    const key = tree.picks.join("|");
    if (host.dataset.key === key) return;
    host.dataset.key = key;
    host.innerHTML = tree.picks.length === 0
        ? `<span class="forest-yield-empty">Nothing chosen yet</span>`
        : tree.picks.map(id => `<span class="pick-tag">${GROWTH_OPTIONS[id].name}</span>`).join("");
}


function updateTreePage(page, s, tree) {
    setText(page.querySelector(".forest-page-title"), `${stageName(tree)}, Tree ${tree.id}`);

    const reads = readsAs(tree);
    const readsEl = page.querySelector(".forest-reads-as");
    setText(readsEl, isMature(tree) ? reads.name : `Reads as ${reads.name}`);
    if (readsEl.dataset.color !== reads.color) {
        readsEl.dataset.color = reads.color;
        readsEl.style.setProperty("--category-color", reads.color);
    }

    setText(page.querySelector(".tree-wait"), waitText(tree, s));

    const rate = growthRate(tree, s);
    setRichText(page.querySelector(".tree-growth"),
        `${formatWhole(tree.growth)} / ${formatWhole(MATURE_AT)}`);
    setWidth(page.querySelector(".tree-stage-fill"), stageProgress(tree));

    const step = isMature(tree)
        ? (standsUntilFelled(s)
            ? `Standing at its full size. It holds there until you take it for old growth.`
            : `Standing at its full size. The forest takes it once it has held for ${Math.round(standSeconds())}s.`)
        : isWaiting(tree)
        ? (instinctLeft(tree) === null
            ? `It has stopped growing until it is told which way to go.`
            : `It has stopped growing, and picks a way on its own in ${clockText(instinctLeft(tree))}.`)
        : `${formatNumber(rate)} growth/s, ${tree.stage}/${CHOICES} choices made.`;
    setRichText(page.querySelector(".tree-stage-note"), step);

    renderStats(page.querySelector(".tree-stats"), tree);
    renderYield(page.querySelector(".tree-yield"), liveBonus(tree), { speedLabel: "Forest growth" });

    setDisplay(page.querySelector(".tree-fell"), isMature(tree) && canFell(s));
    setDisplay(page.querySelector(".tree-offer"), isWaiting(tree));
    setText(page.querySelector(".offer-label"),
        `The tree can grow ${COUNT_WORDS[tree.offer?.length] || tree.offer?.length} ways`);
    renderOffer(page.querySelector(".offer-cards"), tree);
    renderPicks(page.querySelector(".tree-picks"), tree);
}


//    !!! SUMMARY PAGE !!!

// Rows read as what the whole forest pays for them, so they redraw when any of its steps move
const factorKey = (bonuses) => {
    const f = bonuses.factors;
    return [f.scale, f.shelter, f.depth, f.output, f.scarred, f.kept]
        .map(v => Math.round(v * 1000)).join(":");
};

// Old growth bonuses grouped by category instead of per-tree
function oldGrowthGroups(s) {
    const groups = new Map();
    for (const record of oldGrowth(s)) {
        let group = groups.get(record.category);
        if (!group) {
            group = { category: record.category, count: 0, best: record, bonus: emptyBonus() };
            groups.set(record.category, group);
        }
        const part = treeBonus(record);
        group.count += 1;
        for (const channel of CHANNELS) group.bonus[channel] += part[channel];
        if (statTotal(record) > statTotal(group.best)) group.best = record;
    }
    return [...groups.values()].sort((a, b) => b.count - a.count);
}

function renderOldGrowth(host, s, bonuses) {
    const groups = oldGrowthGroups(s);
    const key = factorKey(bonuses) + "|" + groups.map(group => `${group.category}:${group.count}:`
        + CHANNELS.map(channel => Math.round(group.bonus[channel] * 1000)).join(":")).join(",");
    if (host.dataset.key === key) return;
    host.dataset.key = key;

    if (groups.length === 0) {
        host.innerHTML = `<div class="forest-yield-empty">No tree has finished growing yet.</div>`;
        return;
    }

    host.innerHTML = groups.map(group => {
        const category = CATEGORIES[group.category] || CATEGORIES.keystone;
        const chips = yieldChips(appliedBonus(group.bonus, bonuses), { short: true });

        return `<div class="forest-row" style="--category-color:${category.color}">
                ${treeIcon(group.best, category.color)}
                <span class="row-body">
                    <span class="row-head">
                        <span class="row-name">${category.name}</span>
                        <span class="row-count">${group.count}</span>
                    </span>
                    <span class="forest-yield">${chips.join("")}</span>
                    <span class="row-text">${category.text}</span>
                </span>
            </div>`;
    }).join("");
}

function renderLiving(host, s, bonuses) {
    const treeList = trees(s);
    const key = factorKey(bonuses) + "|" + treeList.map(tree =>
        `${tree.id}:${Math.round(tree.growth)}:${statTotal(tree)}:${isWaiting(tree) ? "!" : ""}`).join(",");
    if (host.dataset.key === key) {
        // Only the bar moves between rebuilds, so it gets patched
        for (const row of host.querySelectorAll("[data-tree]")) {
            const tree = treeById(s, Number(row.dataset.tree));
            if (tree) setWidth(row.querySelector(".row-fill"), lifeProgress(tree));
        }
        return;
    }
    host.dataset.key = key;

    if (treeList.length === 0) {
        host.innerHTML = `<div class="forest-yield-empty">Nothing is growing.</div>`;
        return;
    }

    host.innerHTML = treeList.map(tree => {
        const reads = CATEGORIES[categorize(tree)];
        const chips = yieldChips(appliedBonus(liveBonus(tree), bonuses, { standing: true }),
            { short: true, speedLabel: "Forest growth" });

        return `<button class="forest-row" type="button" data-tree="${tree.id}"
                style="--category-color:${reads.color}">
                ${treeIcon(tree, reads.color)}
                <span class="row-body">
                    <span class="row-head">
                        <span class="row-name">Tree ${tree.id}</span>
                        <span class="row-count">${isWaiting(tree) ? "waiting" : stageName(tree)}</span>
                    </span>
                    <span class="forest-yield">${chips.join("")}</span>
                    <span class="forest-bar"><span class="forest-fill row-fill"></span></span>
                </span>
            </button>`;
    }).join("");

    for (const row of host.querySelectorAll("[data-tree]")) {
        const tree = treeById(s, Number(row.dataset.tree));
        if (tree) setWidth(row.querySelector(".row-fill"), lifeProgress(tree));
    }
}

function updateSummaryPage(page, s) {
    const bonuses = forestBonuses(s);
    renderYield(page.querySelector(".summary-total"), bonuses);

    const silva = page.querySelector(".silviculture-block");
    setDisplay(silva, silviculture());
    if (silviculture()) {
        const hold = standsUntilFelled(s);
        const toggle = silva.querySelector(".silviculture-toggle");
        setText(toggle, hold ? "Holding trees on" : "Holding trees off");
        toggle.classList.toggle("on", hold);
        setText(silva.querySelector(".silviculture-note"), hold
            ? `Full grown trees stand where they are until you take them for old growth, and a
               standing tree is worth double the old growth it would become.`
            : `Full grown trees turn to old growth on their own after ${Math.round(standSeconds())}s again.`);
    }

    setText(page.querySelector(".summary-count"), `${oldGrowth(s).length}`);
    renderOldGrowth(page.querySelector(".summary-old-list"), s, bonuses);
    renderLiving(page.querySelector(".summary-live-list"), s, bonuses);
}


//    !!! VISUALS + INTERACTION !!!

// One element per tree, kept between renders and only redraws when the tree changes shape
function syncForest(host, s) {
    const treeList = trees(s);
    const key = treeList.map(tree => tree.id).join(",");
    if (host.dataset.key !== key) {
        host.dataset.key = key;
        host.innerHTML = treeList.map(tree => `
            <button class="forest-tree" type="button" data-tree="${tree.id}"
                style="left:${slotX(tree.slot)}%; --depth:${slotDepth(tree.slot)}">
                <span class="tree-art-host"></span>
                <span class="tree-flag">!</span>
                <span class="tree-tag"></span>
            </button>`).join("");
    }

    const chosen = selectedId(s);
    for (const el of host.querySelectorAll("[data-tree]")) {
        const tree = treeById(s, Number(el.dataset.tree));
        if (!tree) continue;

        const shape = shapeKey(tree);
        if (el.dataset.shape !== shape) {
            el.dataset.shape = shape;
            el.querySelector(".tree-art-host").innerHTML = treeSvg(tree);
        }

        const scale = lifeProgress(tree).toFixed(3);
        if (el.style.getPropertyValue("--grown") !== scale) el.style.setProperty("--grown", scale);

        const crown = crownTop(tree).toFixed(3);
        if (el.style.getPropertyValue("--crown") !== crown) el.style.setProperty("--crown", crown);

        el.classList.toggle("selected", tree.id === chosen);
        el.classList.toggle("waiting", isWaiting(tree));
        const left = instinctLeft(tree);
        el.classList.toggle("timed", left !== null);
        setText(el.querySelector(".tree-flag"), left === null ? "!"
            : `${Math.floor(Math.ceil(left) / 60)}:${String(Math.ceil(left) % 60).padStart(2, "0")}`);
        el.classList.toggle("ripe", isMature(tree));
        setText(el.querySelector(".tree-tag"), stageName(tree));
    }
}

// Centered when there is nothing to dodge, pinned to a side when there is
function setOpenerSide(opener, side) {
    if ((opener.dataset.side || "") === side) return;
    if (side) opener.dataset.side = side;
    else delete opener.dataset.side;
}


//    !!! SCENE !!!

const FOREST_SCENE = {
    build(el, s, layer) {
        el.className = "static-scene forest-scene";
        el.innerHTML = SCENE_MARKUP;

        const pages = {};
        for (const page of el.querySelectorAll(".forest-page")) pages[page.dataset.page] = page;

        el.addEventListener("click", (event) => {
            if (event.target.closest(".forest-panel, .forest-tree, .forest-open-summary")) return;
            const state = getLayerState(layer.stateKey);
            state.forestSelection = null;
            state.forestSummaryOpen = false;
        });

        el.querySelector(".forest-grove").addEventListener("click", (event) => {
            const button = event.target.closest("[data-tree]");
            if (button) selectTree(getLayerState(layer.stateKey), Number(button.dataset.tree));
        });

        el.querySelector(".forest-open-summary").addEventListener("click", () =>
            toggleSummary(getLayerState(layer.stateKey)));

        el.querySelector(".forest-close").addEventListener("click", () => {
            const state = getLayerState(layer.stateKey);
            state.forestSelection = null;
            state.forestSummaryOpen = false;
        });

        // Offer cards and summaries are rebuilt when they change
        pages.tree.addEventListener("click", (event) => {
            const state = getLayerState(layer.stateKey);
            const id = selectedId(state);
            if (id === null) return;
            if (event.target.closest("[data-fell]")) {
                fellTree(state, id);
                return;
            }
            const card = event.target.closest("[data-option]");
            if (card) chooseGrowth(state, id, card.dataset.option);
        });

        pages.summary.addEventListener("click", (event) => {
            const state = getLayerState(layer.stateKey);
            if (event.target.closest("[data-hold]")) {
                state.holdMature = !standsUntilFelled(state);
                return;
            }
            const row = event.target.closest("[data-tree]");
            if (row) selectTree(getLayerState(layer.stateKey), Number(row.dataset.tree));
        });

        el.__forest = { pages };
    },

    update(el, s) {
        const { pages } = el.__forest;
        const bare = forestIsBare();

        setDisplay(el.querySelector(".forest-bare"), bare);
        setDisplay(el.querySelector(".forest-grove"), !bare);

        if (!bare) {
            syncForest(el.querySelector(".forest-grove"), s);

            // The background fills in as you get more old growth trees
            const density = Math.min(1, oldGrowth(s).length / FULL_FOREST).toFixed(3);
            if (el.style.getPropertyValue("--density") !== density) el.style.setProperty("--density", density);

            const finished = oldGrowth(s).length;
            setText(el.querySelector(".open-summary-count"),
                finished === 0 ? "nothing finished yet" : `${finished} finished`);
        }

        const tree = bare ? null : selectedTree(s);
        const summary = !bare && !tree && !!s.forestSummaryOpen;
        const panel = el.querySelector(".forest-panel");

        setDisplay(panel, !!tree || summary);
        setDisplay(pages.tree, !!tree);
        setDisplay(pages.summary, summary);

        // The button sits opposite an open tree window, so old growth is one click from a tree
        const treeSide = tree ? panelSide(tree) : null;
        const opener = el.querySelector(".forest-open-summary");
        setDisplay(opener, !bare && !summary);
        setOpenerSide(opener, treeSide === "right" ? "left" : treeSide === "left" ? "right" : "");

        const side = treeSide || (s.forestSummarySide === "left" ? "left" : "right");
        if (panel.dataset.side !== side) panel.dataset.side = side;

        if (tree) updateTreePage(pages.tree, s, tree);
        else if (summary) updateSummaryPage(pages.summary, s);
    },
};


export const FOREST_VIEW = {
    name: "Forest",
    color: "#3d9455",
    canvasType: "static",
    canvasClass: "forest-canvas",

    scene: FOREST_SCENE,
};

