// loop.js 
// 
// Two clocks: the simulation tick advancing every unlocked layer, and requestAnimationFrame
// drawing whichever one is on screen. The chrome around the canvas (sidebar, guides) reads game
// data, which only moves on ticks - so it follows the simulation clock instead of re-checking
// unchanged unlocks at frame rate.

import { state, saveState, getLayerState } from "./state.js";
import { layers } from "./registry.js";
import { sampleProduction } from "./resources.js";
import { renderActiveLayer, markDirty } from "../render/canvasRouter.js";
import { renderSidebar, syncNavToggleTarget } from "../render/sidebar.js";
import { checkGuides } from "../render/guide.js";

const SIM_TICK_MS = 50;      // 20 ticks/sec
const AUTOSAVE_MS = 5 * 60 * 1000; // Settings can switch this off; closing the tab still saves

let lastTickTime = Date.now();
let lastAutosave = Date.now();

function simulationTick() {
    const now = Date.now();
    const dt = (now - lastTickTime) / 1000; // seconds, so onTick() reads as "+1 per second"
    lastTickTime = now;

    state.totalTimePlayed += dt;

    for (const layer of Object.values(layers)) {
        if (!layer.onTick) continue;
        // Being locked stops a layer, being off-screen doesn't
        if (!getLayerState(layer.id).unlocked) continue;

        try {   // if it fails to tick a layer, it won't skip things after it
        layer.onTick(dt, layer);
        markDirty(layer.id);
       } catch (err) {
        console.log(`Error ${err} when ticking ${layer.id}`)
       }
    }

    try { // if it fails to tick the active layer, it won't skip things after it
        markDirty(state.activeLayer);
        sampleProduction(dt);
    } catch (err) {
        console.log(`Error ${err} when ticking ${state.activeLayer}`);
    }

    try {   // Between ticks nothing new reaches the sidebar or guides
        renderSidebar();
        checkGuides();
    } catch (err) {
        console.log(`Error ${err} when updating the sidebar or guides`);
    }

    if (state.settings.autosave && now - lastAutosave > AUTOSAVE_MS) {
        saveState();
        lastAutosave = now;
    }
}

// One thrown error used to take the whole animation frame chain with it, now
// it's reported and the tick carries on
let renderFailures = 0;
const MAX_REPORTED_FAILURES = 5;

function renderFrame() {
    try {
        renderActiveLayer();

        // Re-points the nav toggle at the active header. 
        syncNavToggleTarget();
    } catch (err) {
        if (renderFailures++ < MAX_REPORTED_FAILURES) {
            console.error("A layer failed to render. The loop is still running.", err);
            if (renderFailures === MAX_REPORTED_FAILURES) console.error("Not reporting further render errors.");
        }
    }
    requestAnimationFrame(renderFrame);
}

export function startGameLoop() {
    setInterval(simulationTick, SIM_TICK_MS);
    requestAnimationFrame(renderFrame);
}
