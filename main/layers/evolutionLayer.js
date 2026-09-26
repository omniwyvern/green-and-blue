// evolutionLayer.js
//
// One pressure's trait tree, with meters that turn adaptation points into potential

import { registerLayer } from "../../../core/registry.js";
import { getResource } from "../../../core/resources.js";
import { markDirty } from "../../../render/canvasRouter.js";
import { formatNumber, formatWhole } from "../../../utils/format.js";
import { setText, setHeight, frameLoop, onRelease } from "../../../utils/dom.js";
import { PRESSURES, PRESSURE_IDS, pressureFelt } from "../systems/pressures.js";
import {
    BASE_RATE, capacityOf, potentialOf, conversionMod, convertPressure, drainIntoNode, generationsOpen, generationShort,
    missingParents, nodeLocked, nodeProgress, nodeStalled, nodeVisible, leftOn, passiveAdaptationRate,
    driftPotential, overflowing, earnAdaptation, flowingInto, BANK,
} from "../systems/evolutionTree.js";
import { meterArt, sceneryHtml } from "../art/pressureArt.js";
import {
    TREES, evolutionState, traitDef, traitEntry, traitCost, traitOwned, traitsIn, treeLinks, treeRows,
} from "../systems/evolutionTraits.js";


//    !!! HOLDING A BUTTON DOWN !!!

let treeEl = null;  // The drag canvas scene
let bayEl = null;   // The meters, in the canvas HUD
let hold = null;    // { kind: "convert" | "node", id, seconds }

// A tap is still worth something, so the first step of a hold covers a beat rather than one frame
const TAP_SECONDS = 0.15;

function startHold(kind, id) {
    hold = { kind, id, seconds: 0 };
    stepHold(TAP_SECONDS);
    startFrames();
}

function stepHold(dt) {
    if (!hold) return;
    hold.seconds += dt;

    if (hold.kind === "convert") {
        convertPressure(hold.id, dt, hold.seconds);
        return;
    }

    // A trait that finishes lets go on its own, so it doesn't spill into the next one
    if (drainIntoNode(hold.id, dt, hold.seconds)) {
        hold = null;
        markDirty("evolution");
    }
}

// A quick tap on the meter already being poured into sends earned points to the bank instead
const STOP_TAP_SECONDS = 0.4;

const releaseHold = () => {
    if (hold?.stopsFlow && hold.seconds < STOP_TAP_SECONDS) evolutionState().flowing = BANK;
    hold = null;
};
onRelease(releaseHold);

// Holds run off the render clock so the ramp is as smooth as the screen is
const startFrames = frameLoop(() => treeEl, (dt) => {
    stepHold(dt);
    paint();
    return !!hold;
}, releaseHold);


//    !!! WHICH TREE IS SHOWING !!!

// Which tree is on the canvas. Until a meter's been clicked, it's the first pressure the world pushes with
function viewedTree(s = evolutionState()) {
    if (TREES[s.viewing]) return s.viewing;
    return PRESSURE_IDS.find(id => pressureFelt(id)) || PRESSURE_IDS[0];
}

function viewTree(id) {
    const s = evolutionState();
    if (s.viewing === id) return;
    s.viewing = id;
    markDirty("evolution");
}


//    !!! LAYING THE TREE OUT !!!

// Lanes across, rows up from a shared bottom line so every tree's first generation sits in the same place
const LANE = 150;
const LEFT = 110;
const ROW_GAP = 135;
const GEN_GAP = 60;
const TOP = 200;
const TREE_PAD = 110;
const HEADING_GAP = 130;
const BRANCH_GAP = 80;

const tallest = Math.max(...Object.keys(TREES).map(treeId =>
    (treeRows(treeId).rows - 1) * ROW_GAP + (TREES[treeId].generations.length - 1) * GEN_GAP));
const BASE_Y = TOP + tallest;

const laneX = (lane) => LEFT + lane * LANE;
const rowY = (row, generation) => BASE_Y - (row * ROW_GAP + generation * GEN_GAP);

function traitSpot(id) {
    const entry = traitEntry(id);
    return { x: laneX(entry.x), y: rowY(entry.row, entry.generation) };
}

// Where the line between two generations goes
const lineY = (treeId, index) => {
    const base = treeRows(treeId).genBase[index + 1];
    return BASE_Y - ((base - 0.5) * ROW_GAP + (index + 0.5) * GEN_GAP);
};

// What's being drawn right now, boxed. Generations that haven't opened are nowhere on the canvas
function shownBox(treeId = viewedTree()) {
    const shown = traitsIn(treeId).filter(id => nodeVisible(id)).map(traitSpot);
    const xs = shown.map(spot => spot.x);
    const ys = shown.map(spot => spot.y);
    return {
        minX: Math.min(...xs) - TREE_PAD, maxX: Math.max(...xs) + TREE_PAD,
        minY: Math.min(...ys) - HEADING_GAP - 40, maxY: Math.max(...ys) + BRANCH_GAP + 40,
    };
}


//    !!! BUILDING THE TREE !!!

function buildTree(el, treeId) {
    const box = shownBox(treeId);
    const top = generationsOpen(treeId) - 1;
    el.classList.add("evo-tree");
    el.innerHTML = `<svg class="evo-links" width="${box.maxX}" height="${box.maxY}"
        viewBox="0 0 ${box.maxX} ${box.maxY}" aria-hidden="true">${linkLines(treeId)}</svg>`;

    const heading = document.createElement("div");
    heading.className = "evo-heading";
    heading.style.left = `${(box.minX + box.maxX) / 2}px`;
    heading.style.top = `${box.minY + 40}px`;
    heading.innerHTML = `<span class="evo-heading-name">${TREES[treeId].name}</span><span class="evo-heading-note"></span>`;
    el.appendChild(heading);

    // A line between each open generation
    for (let index = 0; index < top; index++) {
        const line = document.createElement("div");
        line.className = "evo-line";
        line.style.left = `${box.minX}px`;
        line.style.top = `${lineY(treeId, index)}px`;
        line.style.width = `${box.maxX - box.minX}px`;
        el.appendChild(line);
    }

    for (const branch of TREES[treeId].branches) {
        const label = document.createElement("div");
        label.className = "evo-branch";
        label.style.left = `${laneX(branch.x)}px`;
        label.style.top = `${BASE_Y + BRANCH_GAP}px`;
        label.textContent = branch.name;
        el.appendChild(label);
    }

    for (const id of traitsIn(treeId)) {
        if (nodeVisible(id)) el.appendChild(buildNode(id));
    }
}

// Behind the traits, and only where both ends of the link are being drawn
const linkLines = (treeId) => treeLinks(treeId)
    .filter(([fromId, toId]) => nodeVisible(fromId) && nodeVisible(toId))
    .map(([fromId, toId]) => {
        const from = traitSpot(fromId);
        const to = traitSpot(toId);
        const lit = traitOwned(fromId) ? ` class="lit"` : "";
        return `<line${lit} x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" />`;
    })
    .join("");

const HEX_POINTS = "50,3 96,30 96,82 50,109 4,82 4,30";

function buildNode(nodeId) {
    const def = traitDef(nodeId);
    const spot = traitSpot(nodeId);
    const button = document.createElement("button");
    button.className = `evo-node ${def.kind || ""}`;
    button.type = "button";
    button.dataset.node = nodeId;
    button.style.left = `${spot.x}px`;
    button.style.top = `${spot.y}px`;
    button.innerHTML = `
        <span class="evo-hex">
            <span class="evo-body"><span class="evo-fill"></span></span>
            <svg class="evo-shell" viewBox="0 0 100 112" aria-hidden="true">
                <polygon points="${HEX_POINTS}" />
            </svg>
            <svg class="evo-pulse" viewBox="0 0 100 112" aria-hidden="true">
                <polygon points="${HEX_POINTS}" />
                <polygon points="${HEX_POINTS}" />
            </svg>
        </span>
        <span class="evo-title">${def.title}</span>
        <span class="evo-tip">
            ${def.kind ? `<span class="tip-kind">${def.kind === "apex" ? "Apex trait" : "Capstone"}</span>` : ""}
            <span class="tip-title">${def.title}</span>
            <span class="tip-text">${def.text}</span>
            <span class="tip-effect">${def.effect}</span>
            <span class="tip-cost">${costHtml(nodeId)}</span>
            <span class="tip-need"></span>
        </span>
    `;

    // The canvas pans on any press that isn't caught, so a trait has to catch its own
    button.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!traitOwned(nodeId) && !nodeLocked(nodeId)) startHold("node", nodeId);
    });

    // Hovering a trait highlights the meters it would drain
    button.addEventListener("pointerenter", () => markWanted(nodeId));
    button.addEventListener("pointerleave", () => markWanted(null));

    return button;
}

// Remaining cost of a trait, written in the color of the meter it comes out of
const costHtml = (nodeId) => Object.keys(traitCost(nodeId))
    .map(pressureId => `<span class="tip-piece" data-cost="${pressureId}"`
        + ` style="color:${PRESSURES[pressureId].color}"></span>`)
    .join("");

// Which meters the hovered trait is asking for
function markWanted(nodeId) {
    if (!bayEl) return;
    const wanted = nodeId ? traitCost(nodeId) : {};
    for (const column of bayEl.querySelectorAll(".pressure-meter")) {
        column.classList.toggle("wanted", column.dataset.pressure in wanted);
    }
}


//    !!! THE METERS !!!

// One column per pressure: rate, meter, and fill button
function buildBay(host) {
    host.innerHTML = `<div class="pressure-bay" data-canvas-cover></div>`;
    const bay = host.querySelector(".pressure-bay");

    for (const id of PRESSURE_IDS) {
        const def = PRESSURES[id];
        const art = meterArt(id);

        const column = document.createElement("div");
        column.className = "pressure-meter";
        column.dataset.pressure = id;
        column.style.setProperty("--pressure-color", def.color);
        column.innerHTML = `
            <div class="pressure-rate"></div>
            <div class="pressure-shell" title="${def.text}\nClick to see ${def.name} traits.">
                <div class="pressure-fill">
                    <div class="pressure-texture">${art.texture}</div>
                    ${art.surface}
                </div>
                <div class="pressure-readout"></div>
            </div>
            <button class="pressure-convert" type="button"
                title="Tap to pour earned points into ${def.name}, and again to bank them instead.
Hold to also turn banked points into potential, at a quarter of the rate.">
                <span class="convert-ridge"></span>
                <span class="convert-name">${def.name}</span>
            </button>
        `;

        column.querySelector(".pressure-shell").addEventListener("click", () => viewTree(id));

        const button = column.querySelector(".pressure-convert");
        button.addEventListener("pointerdown", (e) => {
            e.preventDefault();
            const s = evolutionState();
            const stopsFlow = flowingInto(s) === id;
            s.flowing = id;
            startHold("convert", id);
            hold.stopsFlow = stopsFlow;
        });

        bay.appendChild(column);
    }
}


//    !!! PAINTING !!!

// Repainting. Called every render tick, and every frame while something is held
function paint() {
    if (bayEl) paintBay();
    if (treeEl) paintTree();
}

function paintBay() {
    const points = getResource("adaptationPoints");
    const viewing = viewedTree();
    const flowing = flowingInto();

    for (const column of bayEl.querySelectorAll(".pressure-meter")) {
        const id = column.dataset.pressure;
        const mod = conversionMod(id);
        const held = potentialOf(id);
        const capacity = capacityOf(id);

        setHeight(column.querySelector(".pressure-fill"), held / capacity);
        setText(column.querySelector(".pressure-readout"), `${formatNumber(held, 1)} / ${formatWhole(capacity)}`);
        const rateEl = column.querySelector(".pressure-rate");
        setText(rateEl, mod > 0 ? `${1 / BASE_RATE} → ${formatNumber(mod, 1)}` : "-");
        rateEl.title = mod > 0
            ? `x${formatNumber(mod, 2)} off the ground the world has, on ${1 / BASE_RATE} earned points to one potential`
                + `
Banked points convert at a quarter of that`
            : `Nothing on the map is pushing this way`;

        const full = held >= capacity;
        column.classList.toggle("idle", mod <= 0 || (points.lte(0) && id !== flowing) || (full && !overflowing()));
        column.classList.toggle("flowing", id === flowing);
        column.classList.toggle("full", full);
        column.classList.toggle("empty", held <= 0);
        column.classList.toggle("viewing", id === viewing);
        column.classList.toggle("holding", !!hold && hold.kind === "convert" && hold.id === id);
    }
}

// Buying a trait sends a pulse out from it
const wasOwned = new Map();

function paintPurchases(treeId) {
    for (const nodeId of traitsIn(treeId)) {
        const owned = traitOwned(nodeId);
        const before = wasOwned.get(nodeId);
        wasOwned.set(nodeId, owned);
        if (!owned || before !== false) continue;

        const button = treeEl.querySelector(`.evo-node[data-node="${nodeId}"]`);
        if (!button) continue;
        button.classList.add("just-bought");

        // The rings are staggered, so it's the last one out that says the wave is over
        const rings = button.querySelectorAll(".evo-pulse polygon");
        rings[rings.length - 1].addEventListener("animationend",
            () => button.classList.remove("just-bought"), { once: true });
    }
}

function paintTree() {
    const treeId = treeEl.__tree;

    for (const button of treeEl.querySelectorAll(".evo-node")) {
        const nodeId = button.dataset.node;
        const owned = traitOwned(nodeId);

        const locked = nodeLocked(nodeId);
        const wantState = owned ? "owned"
            : locked ? "locked"
            : nodeStalled(nodeId) ? "stalled" : "ready";
        if (button.dataset.state !== wantState) {
            button.className = `evo-node ${traitDef(nodeId).kind || ""} ${wantState}`;
            button.dataset.state = wantState;
        }
        button.classList.toggle("holding", !!hold && hold.kind === "node" && hold.id === nodeId);

        setHeight(button.querySelector(".evo-fill"), nodeProgress(nodeId));

        const need = button.querySelector(".tip-need");
        const short = locked ? missingParents(nodeId).map(id => traitDef(id).title) : [];
        setText(need, short.length ? `Needs ${listOf(short)} first` : "");
        need.hidden = !short.length;

        // What's left rather than what it cost, so a trait part-way through says which meter is holding it up
        if (!owned) {
            for (const piece of button.querySelectorAll(".tip-piece")) {
                const pressureId = piece.dataset.cost;
                setText(piece, `${formatNumber(leftOn(nodeId, pressureId), 1)} ${PRESSURES[pressureId].name}`);
            }
        }
    }

    const next = generationsOpen(treeId);
    setText(treeEl.querySelector(".evo-heading-note"), next >= TREES[treeId].generations.length
        ? "Every generation open" : `${generationShort(treeId, next)} more to open generation ${next + 1}`);

    paintPurchases(treeId);
}

const listOf = (names) => names.length < 3 ? names.join(" and ")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;


//    !!! SCENERY !!!

// Rebuilt only when the tree's shape changes, otherwise patched each frame
const treeSignature = (treeId) =>
    treeId + JSON.stringify(traitsIn(treeId).map(id => [nodeVisible(id), traitOwned(id)]));

// On the viewport so it stays put while panning, replaced on tree change so it fades in
function setScenery(canvas, treeId) {
    const old = canvas.viewport.querySelector(":scope > .evo-scenery");
    if (old && old.dataset.tree === treeId) return;
    if (old) old.remove();

    const scenery = document.createElement("div");
    scenery.className = "evo-scenery";
    scenery.dataset.tree = treeId;
    scenery.setAttribute("aria-hidden", "true");
    scenery.innerHTML = sceneryHtml(treeId);
    canvas.viewport.insertBefore(scenery, canvas.inner);
}

function syncScene(el, canvas) {
    treeEl = el;
    const treeId = viewedTree();
    const signature = treeSignature(treeId);
    if (el.__signature === signature) return;

    const switched = el.__tree !== undefined && el.__tree !== treeId;
    el.__signature = signature;
    el.__tree = treeId;
    buildTree(el, treeId);

    canvas.viewport.dataset.tree = treeId;
    canvas.viewport.style.setProperty("--tree-color", PRESSURES[treeId].color);
    setScenery(canvas, treeId);
    if (switched) {
        const box = shownBox(treeId);
        canvas.centerOn((box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2);
    }
}


//    !!! THE LAYER !!!

registerLayer("evolution", {
    categoryId: "main",
    group: "beyond",
    name: "Evolution",
    color: "#7fd06a",
    order: 1,
    startUnlocked: false, // Opened by the Evolution node on the Cores tree, probably a challenge reward later

    resources: ["adaptationPoints"],

    initialState: {
        potential: {},   // { pressureId: amount }, capped by capacityOf()
        owned: {},       // { traitId: true }
        paid: {},        // { traitId: { pressureId: amount } }, a trait still being held down
        viewing: null,   // Which pressure's tree is on the canvas
        flowing: null,   // Which meter earned points pour into
    },

    // Adapting stops being the only way to earn points once this is open
    onTick(dt) {
        earnAdaptation(passiveAdaptationRate().mul(dt));
        driftPotential(dt);
    },

    subLayers: {
        evolve: {
            name: "Evolution",
            canvasType: "drag",
            order: 0,

            viewportClass: "evolution-canvas",
            cornerLift: "12.75rem",
            defaultZoom: 0.85,
            defaultView: { x: laneX(4.5), y: (BASE_Y + 10) / 1.5 },

            scene: {
                build(el, layerState, layer, canvas) {
                    syncScene(el, canvas);
                },

                update(el, layerState, layer, canvas) {
                    syncScene(el, canvas);
                    paintTree();
                },

                bounds: () => shownBox(),
            },

            hud: {
                build(el) {
                    bayEl = el;
                    buildBay(el);
                },

                update: paintBay,
            },
        },
    },
});
