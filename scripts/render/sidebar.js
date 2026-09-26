// sidebar.js
//
// Builds and renders the category bar and the layer sidebar

import { state, getLayerState, claimUnseen, saveState, layerUnlocked, defaultLayerId } from "../core/state.js";
import { layers, getOrderedCategories, getOrderedLayers, getOrderedGroups, getVisibleSubLayers, isSubLayerBlocked } from "../core/registry.js";
import { switchToLayer, switchToSubLayer, activeHeaderElement, absorbedInto, releaseLayerCanvas } from "./canvasRouter.js";
import { setText, setDisplay, svgEl } from "../utils/dom.js";
import { clamp01 } from "../utils/math.js";

const categoryBarEl = document.getElementById("category-bar");
const tabsEl = document.getElementById("sidebar-tabs"); // The scrollable tab list, above the sidebar's docked footer
const flyoutEl = document.getElementById("sidebar-flyout");
const navToggleEl = document.getElementById("nav-toggle");
const flyoutToggleEl = document.getElementById("flyout-toggle");
const appEl = document.getElementById("app");

let lastRenderedCategory = null;
let lastRenderedLayer = null;

// Called every tick; the tab list only rebuilds on category switch
export function renderSidebar() {
    if (state.activeCategory !== lastRenderedCategory) {
        buildCategoryBar();
        buildLayerSidebar();
        buildFlyout();
        lastRenderedCategory = state.activeCategory;
        lastRenderedLayer = state.activeLayer;
    } else if (state.activeLayer !== lastRenderedLayer) {
        highlightActiveLayer();
        buildFlyout();
        lastRenderedLayer = state.activeLayer;
    }

    refreshCategoryButtons();
    refreshLockedStates();
    refreshFlyoutMembership();
    refreshBlockedSubLayers();
    refreshSubLayerMarks();
    refreshActiveSubLayer();
    syncNavToggleTarget();
}


//    !!! THE HEADER !!!

let watchedHeader = null;
let lastHeaderHeight = -1;
const headerWatcher = "ResizeObserver" in window ? new ResizeObserver(() => {
    if (!watchedHeader) return;
    applyHeaderHeight(watchedHeader.offsetHeight);
}) : null;

function applyHeaderHeight(height) {
    if (height === lastHeaderHeight) return;
    lastHeaderHeight = height;
    appEl.style.setProperty("--nav-toggle-top", `${height}px`);
}


export function syncNavToggleTarget() {
    const header = activeHeaderElement();
    if (!headerWatcher) { // No way to hear about a wrap without it, measure per call instead
        applyHeaderHeight(header ? header.offsetHeight : 0);
        return;
    }
    if (header === watchedHeader) return;
    if (watchedHeader) headerWatcher.unobserve(watchedHeader);
    watchedHeader = header;
    if (header) headerWatcher.observe(header);

    // Whatever size it has right now, so switching headers isn't a frame of guesswork
    applyHeaderHeight(header ? header.offsetHeight : 0);
}


//    !!! FOLDING THE NAVIGATION AWAY !!!

// Folding the navigation away gives the canvas the whole window
export function initNavToggle() {
    if (!navToggleEl || !flyoutToggleEl) return;
    setNavHidden(!!state.settings.hideNav);
    setFlyoutHidden(!!state.settings.hideFlyout);
    requestAnimationFrame(() => appEl.classList.add("nav-animated")); // No fold on the way in
    navToggleEl.addEventListener("click", () => setNavHidden(!state.settings.hideNav));
    flyoutToggleEl.addEventListener("click", () => setFlyoutHidden(!state.settings.hideFlyout));
}

function setFlyoutHidden(hidden) {
    state.settings.hideFlyout = hidden;
    appEl.classList.toggle("flyout-hidden", hidden);
    positionFlyout();
    saveState();
}

function setNavHidden(hidden) {
    state.settings.hideNav = hidden;
    appEl.classList.toggle("nav-hidden", hidden);

    const label = hidden ? "Show navigation" : "Hide navigation";
    navToggleEl.title = label;
    navToggleEl.setAttribute("aria-label", label);

    if (hidden) appEl.classList.remove("flyout-over-header");
    else positionFlyout();
    saveState();
}


//    !!! THE CATEGORY BAR !!!

function buildCategoryBar() {
    categoryBarEl.innerHTML = "";
    for (const category of getOrderedCategories()) {
        const btn = document.createElement("button");
        btn.className = "category-button";
        btn.dataset.categoryId = category.id;
        btn.textContent = category.name;
        btn.classList.toggle("active", category.id === state.activeCategory);
        btn.addEventListener("click", () => {
            state.activeCategory = category.id;
            const layerId = defaultLayerId(category.id);
            if (layerId) switchToLayer(layerId);
            lastRenderedCategory = null; // Forces buildCategoryBar / buildLayerSidebar next tick
        });
        categoryBarEl.appendChild(btn);
    }
    refreshCategoryButtons();
}

// A category stays out of the bar until something in it opens
const categoryOpen = (id) => getOrderedLayers(id).some(layer => layerUnlocked(layer.id));
function refreshCategoryButtons() {
    for (const btn of categoryBarEl.children) {
        setDisplay(btn, btn.dataset.categoryId === state.activeCategory || categoryOpen(btn.dataset.categoryId));
    }
}


//    !!! THE LAYER TABS !!!

// Tabs are grouped with dividers and cached per category switch, so nothing re-queries the sidebar
let sidebarGroups = [];   // [{ el: group div, tabs: [button, ...] }] in display order
let tabButtons = [];      // Flat view of the above

function buildLayerSidebar() {
    tabsEl.innerHTML = "";
    sidebarGroups = [];
    tabButtons = [];
    for (const group of getOrderedGroups(state.activeCategory)) {
        if (group.layers.length === 0) continue;

        const groupEl = document.createElement("div");
        groupEl.className = "sidebar-group";
        groupEl.dataset.groupId = group.id;
        const tabs = [];

        if (group.name) {
            const label = document.createElement("div");
            label.className = "sidebar-group-label";
            label.textContent = group.name;
            groupEl.appendChild(label);
        }

        for (const layer of group.layers) {
            const btn = document.createElement("button");
            btn.className = "layer-tab";
            btn.style.setProperty("--layer-color", layer.color);
            btn.dataset.layerId = layer.id;

            const name = document.createElement("span");
            name.className = "layer-tab-name";
            name.textContent = layer.name;
            btn.appendChild(name);
            if (layer.tabMark) btn.appendChild(buildTabMark());
            if (layer.tabMeter) btn.appendChild(buildTabMeter());

            btn.addEventListener("click", () => {
                // A second click on the layer you're already on folds its flyout away
                if (state.activeLayer === layer.id) {
                    if (appEl.classList.contains("has-flyout")) setFlyoutHidden(!state.settings.hideFlyout);
                    return;
                }
                switchToLayer(layer.id);
                setFlyoutHidden(false);
            });
            groupEl.appendChild(btn);
            tabs.push(btn);
        }

        tabsEl.appendChild(groupEl);
        sidebarGroups.push({ el: groupEl, tabs });
        tabButtons.push(...tabs);
    }
    highlightActiveLayer();
}

function highlightActiveLayer() {
    for (const btn of tabButtons) {
        btn.classList.toggle("active", btn.dataset.layerId === state.activeLayer);
    }
}

function refreshLockedStates() {
    for (const btn of tabButtons) {
        const layerId = btn.dataset.layerId;
        const absorbed = !!absorbedInto(layers[layerId]);
        const locked = !layerUnlocked(layerId) || absorbed;

        if (absorbed) releaseLayerCanvas(layerId);
        if (locked !== btn.classList.contains("locked-tab")) {
            btn.classList.toggle("locked-tab", locked);
            refreshGroupVisibility();
            positionFlyout();
        }
        if (!locked && claimUnseen("layers", layerId)) flashNew(btn);
        if (!locked) refreshAttention(btn, layerId);
        refreshTabMark(btn, layers[layerId], locked);
        refreshTabMeter(btn, layerId, locked);
    }

    if (absorbedInto(layers[state.activeLayer])) switchToLayer(state.activeLayer);
}

function refreshGroupVisibility() {
    let seenVisible = false;
    for (const group of sidebarGroups) {
        const anyVisible = group.tabs.some(btn => !btn.classList.contains("locked-tab"));

        const display = anyVisible ? "" : "none";
        if (group.el.style.display !== display) group.el.style.display = display;

        group.el.classList.toggle("first-visible", anyVisible && !seenVisible);
        if (anyVisible) seenVisible = true;
    }
}


//    !!! WHAT NEEDS ATTENTION !!!

// A tab lights up when it is new, or when something on it is waiting, like a major node that can be bought
const flashedFor = new Map(); // layerId -> Set of attention ids already flashed for

function refreshAttention(btn, layerId) {
    const layer = layers[layerId];
    if (!layer || !layer.attention) return;

    const wanted = layer.attention(getLayerState(layer.stateKey), layer) || [];

    // Sticky layers stay lit for as long as something's waiting, instead of flashing once
    if (layer.stickyAttention) {
        btn.classList.toggle("attention", wanted.length > 0);
        return;
    }

    const already = flashedFor.get(layerId);

    if (!already) {
        flashedFor.set(layerId, new Set(wanted));
        return;
    }

    if (wanted.some(id => !already.has(id))) flashNew(btn);

    already.clear();
    for (const id of wanted) already.add(id);
}


//    !!! THE TAB METER !!!

// tabMeter() gives back 0 to 1, or null for nothing to show
const METER_RADIUS = 9;
const METER_LENGTH = 2 * Math.PI * METER_RADIUS;

function buildTabMeter() {
    const svg = svgEl("svg", { class: "tab-meter", viewBox: "0 0 24 24", "aria-hidden": "true" });

    for (const kind of ["track", "fill"]) {
        const circle = svgEl("circle", {
            class: `tab-meter-${kind}`, cx: "12", cy: "12", r: String(METER_RADIUS),
        });
        svg.appendChild(circle);
    }

    svg.style.setProperty("--meter-length", METER_LENGTH.toFixed(3));
    return svg;
}

function refreshTabMeter(btn, layerId, locked) {
    const meter = btn.querySelector(".tab-meter");
    if (!meter) return;

    const layer = layers[layerId];
    const part = locked ? null : layer.tabMeter(getLayerState(layer.stateKey), layer);
    const shown = typeof part === "number";

    setDisplay(meter, shown);
    if (!shown) return;

    const offset = METER_LENGTH * (1 - clamp01(part));
    meter.querySelector(".tab-meter-fill").style.strokeDashoffset = offset.toFixed(3);
}


//    !!! THE TAB MARK !!!

// tabMark() gives text for the tab (ocean tick meter, tree "!", etc.) or null
function buildTabMark() {
    const mark = document.createElement("span");
    mark.className = "tab-mark";
    mark.setAttribute("aria-hidden", "true");
    return mark;
}

function refreshTabMark(btn, def, locked) {
    const mark = btn.querySelector(".tab-mark");
    if (!mark) return;

    // The mark's text, or that text with its own color for a mark that isn't "something waiting"
    const result = locked ? null : def.tabMark(getLayerState(def.stateKey), def);
    const text = result && typeof result === "object" ? result.text : result;
    const color = result && typeof result === "object" ? result.color : null;

    setDisplay(mark, !!text);
    if (!text) return;
    setText(mark, text);
    mark.style.setProperty("--mark-color", color || "");
}

function flashNew(btn) {
    btn.classList.add("just-unlocked");
    btn.addEventListener("animationend", () => btn.classList.remove("just-unlocked"), { once: true });
}


//    !!! THE FLYOUT !!!

function buildFlyout() {
    flyoutEl.innerHTML = "";
    const subLayers = visibleSubLayers();
    lastFlyoutSignature = signatureOf(subLayers);

    appEl.classList.toggle("has-flyout", subLayers.length > 0);

    if (subLayers.length === 0) {
        flyoutEl.style.display = "none";
        appEl.classList.remove("flyout-over-header");
        return;
    }

    flyoutEl.style.display = "flex";
    for (const subLayer of subLayers) {
        const btn = document.createElement("button");
        btn.className = "sub-layer-tab";
        btn.textContent = subLayer.name;
        btn.style.setProperty("--layer-color", subLayer.color);
        btn.dataset.subLayerKey = subLayer.key;
        btn.addEventListener("click", () => {
            if (btn.classList.contains("blocked")) return;
            switchToSubLayer(state.activeLayer, subLayer.key);
        });
        if (subLayer.tabMark) btn.appendChild(buildTabMark());
        flyoutEl.appendChild(btn);

        if (claimUnseen("subLayers", subLayer.id)) flashNew(btn);
    }
    refreshBlockedSubLayers();
    highlightActiveSubLayer();
    positionFlyout();
    for (const btn of flyoutEl.children) fitTabText(btn);
}


//    !!! FITTING THE LABEL !!!

// Shrinks the label when it doesn't fit the tab
const MIN_TAB_FONT = 9;

function fitTabText(btn) {
    btn.style.fontSize = "";
    if (btn.scrollWidth <= btn.clientWidth) return;

    const base = parseFloat(getComputedStyle(btn).fontSize);
    for (let size = base - 0.5; size >= MIN_TAB_FONT; size -= 0.5) {
        btn.style.fontSize = `${size}px`;
        if (btn.scrollWidth <= btn.clientWidth) return;
    }
    // If it really really doesn't fit, wrap the text
    btn.style.overflowWrap = "anywhere";
}

// The flyout hangs off the layer tab's position
function positionFlyout() {
    if (flyoutEl.style.display === "none") return;
    if (appEl.classList.contains("nav-hidden")) return;

    const activeTab = tabsEl.querySelector(".layer-tab.active");
    if (!activeTab) return;

    const tab = activeTab.getBoundingClientRect();
    const top = Math.max(0, tab.top - appEl.getBoundingClientRect().top);
    flyoutEl.style.setProperty("--flyout-top", `${top}px`);

    // Folded away, the pull-out waits beside the layer's tab
    appEl.style.setProperty("--flyout-handle-top",
        `${top + (tab.height - flyoutToggleEl.offsetHeight) / 2}px`);

    appEl.classList.remove("flyout-over-header");
    const header = activeHeaderElement();
    if (header && top < header.offsetHeight) appEl.classList.add("flyout-over-header");
}

window.addEventListener("resize", positionFlyout);


//    !!! SUB-LAYERS IN THE FLYOUT !!!

function visibleSubLayers() {
    const layer = layers[state.activeLayer];
    if (!layer || !layer.subLayers) return [];
    return getVisibleSubLayers(state.activeLayer, getLayerState(state.activeLayer));
}

const signatureOf = (subLayers) => subLayers.map(s => s.key).join(",");
let lastFlyoutSignature = null;

function refreshFlyoutMembership() {
    if (signatureOf(visibleSubLayers()) !== lastFlyoutSignature) buildFlyout();
}

// Called after building the flyout and every tick after
function highlightActiveSubLayer() {
    const activeKey = getLayerState(state.activeLayer).activeSubLayer;
    for (const btn of flyoutEl.children) {
        const active = btn.dataset.subLayerKey === activeKey;
        if (active !== btn.classList.contains("active")) {
            btn.classList.toggle("active", active);
        }
    }
}


// A blocked sub-layer grays out in the flyout, and if it's the one open you're moved to the first open one
function refreshBlockedSubLayers() {
    if (flyoutEl.children.length === 0) return;

    const layer = layers[state.activeLayer];
    if (!layer || !layer.subLayers) return;

    const layerState = getLayerState(state.activeLayer);
    let activeBlocked = false;
    for (const btn of flyoutEl.children) {
        const subLayer = layer.subLayers[btn.dataset.subLayerKey];
        const blocked = !!subLayer && isSubLayerBlocked(subLayer, layerState);
        btn.classList.toggle("blocked", blocked);
        btn.setAttribute("aria-disabled", blocked ? "true" : "false");
        if (blocked && btn.dataset.subLayerKey === layerState.activeSubLayer) activeBlocked = true;
    }

    if (!activeBlocked) return;
    const open = visibleSubLayers().find(sub => !isSubLayerBlocked(sub, layerState));
    if (open) switchToSubLayer(state.activeLayer, open.key);
}

function refreshSubLayerMarks() {
    const layer = layers[state.activeLayer];
    if (!layer || !layer.subLayers) return;
    for (const btn of flyoutEl.children) {
        const subLayer = layer.subLayers[btn.dataset.subLayerKey];
        if (subLayer) refreshTabMark(btn, subLayer, false);
    }
}

function refreshActiveSubLayer() {
    if (flyoutEl.children.length === 0) return;
    highlightActiveSubLayer();
}
