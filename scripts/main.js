// main.js
// It's the main javascript file. Imports core components, rendering tools, and game content.
// Also begins startup things, e.g. loading the game, rendering stuff, and starting the game loop.

import { loadState, state, saveState, resolveActiveSelection, markSeenTabs } from "./core/state.js";
import { switchToLayer } from "./render/canvasRouter.js";
import { renderSidebar, initNavToggle } from "./render/sidebar.js";
import { initSettings } from "./render/settings.js";
import { initDev } from "./render/dev.js";
import { initTabGuard } from "./utils/tabGuard.js";
import { initGuides } from "./render/guide.js";
import { startGameLoop } from "./core/loop.js";
import { assertResourceHolders } from "./core/registry.js";

// Every resource in the game, before the categories that show them
import "./content/resourceDefs.js";

// Imports all layers in a category at once based on its category file
// Adding new layers is done in the category file rather than here
import "./content/main/index.js";

assertResourceHolders(); // Before the save is touched, so a bad holder can't eat a pool
loadState();
resolveActiveSelection(); // after content registration, so it can see what actually exists
markSeenTabs();           // ...and before the first render, so nothing already owned flashes
initSettings();
initTabGuard(); // After initSettings, since it may have to tell it saving is off
initDev();
initGuides();
initNavToggle();
switchToLayer(state.activeLayer);
renderSidebar();
startGameLoop();

// Saves whenever you exit the window.
window.addEventListener("beforeunload", saveState);
