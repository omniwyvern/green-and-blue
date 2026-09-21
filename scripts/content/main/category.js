// category.js
//
// Registers the Main category, its own module so index.js can import it before any layer

import { registerCategory } from "../../core/registry.js";

// Sidebar groups, which layers pick with "group" in registerLayer
registerCategory("main", {
    name: "Main",
    order: 0,
    groups: {
        origin: {},
        world: {},
        beyond: {},
    },
});
