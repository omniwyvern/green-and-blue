// category.js

// The Main category. Imports all the layers from their files, then registers the category.
// main.js imports this.

import { registerCategory } from "../../core/registry.js";

// Sidebar groups. "origin" is where the game itself is. "world" is where new layers go as they're added.
// Layers name their group with "group" in registerLayer.
registerCategory("main", {
    name: "Main",
    order: 0,
    groups: {
        origin: {},
        world: {},
        beyond: {},
    },
});
