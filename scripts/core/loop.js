// loop.js
//
// The sim tick for every layer, plus requestAnimationFrame drawing the one on screen

import { state, saveState, layerUnlocked } from "./state.js";
import { layers } from "./registry.js";
import { sampleProduction } from "./resources.js";
import { renderActiveLayer, markDirty } from "../render/canvasRouter.js";
import { renderSidebar, syncNavToggleTarget } from "../render/sidebar.js";
import { checkGuides } from "../render/guide.js";

const SIM_TICK_MS = 50;      // 20 ticks/sec
const AUTOSAVE_MS = 5 * 60 * 1000; // Settings can switch this off; closing the tab still saves

let lastTickTime = Date.now();
let gameSpeed = 1;  // Dev menu only, and not saved

export const getGameSpeed = () => gameSpeed;
export function setGameSpeed(speed) { gameSpeed = speed > 0 ? speed : 1; }
let lastAutosave = Date.now();

function simulationTick() {
    const now = Date.now();
    const dt = (now - lastTickTime) / 1000 * gameSpeed; // Seconds, so onTick() reads as "+1 per second"
    lastTickTime = now;

    state.totalTimePlayed += dt;

    for (const layer of Object.values(layers)) {
        if (!layer.onTick) continue;
        // Being locked stops a layer, being off-screen doesn't
        if (!layerUnlocked(layer.id)) continue;

        try {   // A layer that throws doesn't stop the ones after it
        layer.onTick(dt, layer);
        markDirty(layer.id);
       } catch (err) {
        console.log(`Error ${err} when ticking ${layer.id}`)
       }
    }

    try { // A failed tick of the active layer doesn't stop what follows it
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

// Report errors so one bad tick doesn't kill the frame loop
let renderFailures = 0;
const MAX_REPORTED_FAILURES = 5;

function renderFrame() {
    try {
        renderActiveLayer();

        // Re-points the nav toggle at the active header
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
