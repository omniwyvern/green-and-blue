// loop.js 
// 
// Two loops: simulation for every unlocked layer, and rendering on requestAnimationFrame
// for whichever is on screen. DOM writes are the main thing that cost time.

import { state, saveState, getLayerState } from "./state.js";
import { layers } from "./registry.js";
import { sampleProduction } from "./resources.js";
import { renderActiveLayer, markDirty } from "../render/canvasRouter.js";
import { renderSidebar } from "../render/sidebar.js";
import { checkGuides } from "../render/guide.js";

const SIM_TICK_MS = 50;      // 20 ticks/sec
const AUTOSAVE_MS = 10000;

let lastTickTime = Date.now();
let lastAutosave = Date.now();

function simulationTick() {
    const now = Date.now();
    const dt = (now - lastTickTime) / 1000; // seconds, so onTick() reads as "+1 per second."
    lastTickTime = now;

    state.totalTimePlayed += dt;

    for (const layer of Object.values(layers)) {
        if (!layer.onTick) continue;
        // Being locked stops a layer, being off-screen doesn't.
        if (!getLayerState(layer.id).unlocked) continue;

        layer.onTick(dt, layer);
        markDirty(layer.id);
    }

    markDirty(state.activeLayer);
    sampleProduction(dt);

    if (now - lastAutosave > AUTOSAVE_MS) {
        saveState();
        lastAutosave = now;
    }
}

function renderFrame() {
    renderActiveLayer();
    renderSidebar();
    checkGuides(); 
    requestAnimationFrame(renderFrame);
}

export function startGameLoop() {
    setInterval(simulationTick, SIM_TICK_MS);
    requestAnimationFrame(renderFrame);
}
