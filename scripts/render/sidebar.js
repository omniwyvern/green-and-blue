// sidebar.js
// Builds and renders the category and sidebar that lets you select between groups of layers and layers respectively.
// I was really into it and forgot to write comments on most of this. My bad whoopsie daisies

import { state, getLayerState, claimUnseen, saveState } from "../core/state.js";
import { layers, getOrderedCategories, getOrderedLayers, getOrderedGroups, getVisibleSubLayers } from "../core/registry.js";
import { switchToLayer, switchToSubLayer, activeHeaderElement, absorbedInto, releaseLayerCanvas } from "./canvasRouter.js";

const categoryBarEl = document.getElementById("category-bar");
const sidebarEl = document.getElementById("sidebar");
const flyoutEl = document.getElementById("sidebar-flyout");
const navToggleEl = document.getElementById("nav-toggle");
const appEl = document.getElementById("app");

let lastRenderedCategory = null;
let lastRenderedLayer = null;

// Called once per simulation tick; the tab list only rebuilds on category switch.
// It also renders the category bar which is on the top and isn't a sidebar teehee
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

    refreshLockedStates();
    refreshFlyoutMembership();
    refreshActiveSubLayer();
    syncNavToggleTarget();
}

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
    if (!headerWatcher) { // No way to hear about a wrap without it; measure per call instead
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

// Folding the navigation away gives the canvas the whole window
export function initNavToggle() {
    if (!navToggleEl) return;
    setNavHidden(!!state.settings.hideNav);
    navToggleEl.addEventListener("click", () => setNavHidden(!state.settings.hideNav));
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

function buildCategoryBar() {
    categoryBarEl.innerHTML = "";
    for (const category of getOrderedCategories()) {
        const btn = document.createElement("button");
        btn.className = "category-button";
        btn.textContent = category.name;
        btn.classList.toggle("active", category.id === state.activeCategory);
        btn.addEventListener("click", () => {
            state.activeCategory = category.id;
            const firstLayer = getOrderedLayers(category.id)[0];
            if (firstLayer) switchToLayer(firstLayer.id);
            lastRenderedCategory = null; // force buildCategoryBar / buildLayerSidebar next tick
        });
        categoryBarEl.appendChild(btn);
    }
}

// Tabs are grouped, with a little divider between them. Built once per category switch, so
// everything else walks these cached arrays instead of querying the sidebar over and over
let sidebarGroups = [];   // [{ el: group div, tabs: [button, ...] }] in display order
let tabButtons = [];      // Flat view of the above

function buildLayerSidebar() {
    sidebarEl.innerHTML = "";
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
            btn.textContent = layer.name;
            btn.style.setProperty("--layer-color", layer.color);
            btn.dataset.layerId = layer.id;
            btn.addEventListener("click", () => switchToLayer(layer.id));
            groupEl.appendChild(btn);
            tabs.push(btn);
        }

        sidebarEl.appendChild(groupEl);
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
        const locked = !getLayerState(layerId).unlocked || absorbed;

        if (absorbed) releaseLayerCanvas(layerId);
        if (locked !== btn.classList.contains("locked-tab")) {
            btn.classList.toggle("locked-tab", locked);
            refreshGroupVisibility();
            positionFlyout();
        }
        if (!locked && claimUnseen("layers", layerId)) flashNew(btn);
        if (!locked) refreshAttention(btn, layerId);
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

// Tab lights up either if they're new, or if there's something like a major node being purchaseable
const flashedFor = new Map(); // layerId -> Set of attention ids already flashed for

function refreshAttention(btn, layerId) {
    const layer = layers[layerId];
    if (!layer || !layer.attention) return;

    const wanted = layer.attention(getLayerState(layer.stateKey), layer) || [];
    const already = flashedFor.get(layerId);

    if (!already) {
        flashedFor.set(layerId, new Set(wanted));
        return;
    }

    if (wanted.some(id => !already.has(id))) flashNew(btn);

    already.clear();
    for (const id of wanted) already.add(id);
}

function flashNew(btn) {
    btn.classList.add("just-unlocked");
    btn.addEventListener("animationend", () => btn.classList.remove("just-unlocked"), { once: true });
}

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
        btn.addEventListener("click", () => switchToSubLayer(state.activeLayer, subLayer.key));
        flyoutEl.appendChild(btn);

        if (claimUnseen("subLayers", subLayer.id)) flashNew(btn);
    }
    highlightActiveSubLayer();
    positionFlyout();
    for (const btn of flyoutEl.children) fitTabText(btn);
}

// Text size change when it can't fit in the tab/flyout tab
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

// Flyout hangs off of the layer tab's position
function positionFlyout() {
    const firstTab = flyoutEl.firstElementChild;
    if (flyoutEl.style.display === "none" || !firstTab) return;
    if (appEl.classList.contains("nav-hidden")) return;

    const activeTab = sidebarEl.querySelector(".layer-tab.active");
    if (!activeTab) return;

    const inset = firstTab.getBoundingClientRect().top - flyoutEl.getBoundingClientRect().top;
    const top = activeTab.getBoundingClientRect().top - appEl.getBoundingClientRect().top - inset;
    flyoutEl.style.setProperty("--flyout-top", `${Math.max(0, top)}px`);

    appEl.classList.remove("flyout-over-header");
    const header = activeHeaderElement();
    if (header && top < header.offsetHeight) appEl.classList.add("flyout-over-header");
}

window.addEventListener("resize", positionFlyout);

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


function refreshActiveSubLayer() {
    if (flyoutEl.children.length === 0) return;
    highlightActiveSubLayer();
}
