// main.js
//
// Imports core, rendering and content, then loads the save and starts the loop

import { loadState, state, saveState, resolveActiveSelection, markSeenTabs } from "./core/state.js";
import { switchToLayer } from "./render/canvasRouter.js";
import { renderSidebar, initNavToggle } from "./render/sidebar.js";
import { initSettings } from "./render/settings.js";
import { initDev } from "./render/dev.js";
import { initTabGuard } from "./render/tabGuard.js";
import { initGuides } from "./render/guide.js";
import { startGameLoop } from "./core/loop.js";
import { assertResourceHolders } from "./core/registry.js";

// Keeps hover tips from hanging off the edge of whatever they are shown over
import "./render/fit.js";

// Every resource in the game, before the categories that show them
import "./content/resourceDefs.js";

// Each category file imports its own layers, so new layers go there rather than here
import "./content/main/index.js";

// The term list the info button shows, after the layers its entries check against
import "./content/glossary.js";

assertResourceHolders(); // Before the save is touched, so a bad holder can't eat a pool
loadState();
resolveActiveSelection(); // After content registration, so it can see what actually exists
markSeenTabs();           // And before the first render, so nothing already owned flashes
initSettings();
initTabGuard(); // After initSettings, since it may have to tell it saving is off
initDev();
initGuides();
initNavToggle();
switchToLayer(state.activeLayer);
renderSidebar();
startGameLoop();

// Saves whenever you exit the window
window.addEventListener("beforeunload", saveState);
