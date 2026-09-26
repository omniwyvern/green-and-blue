// category.js
//
// Registers the Humanity category, before any of its layers

import { registerCategory } from "../../core/registry.js";

registerCategory("humanity", {
    name: "Humanity",
    order: 1,
    groups: {
        settled: {},
    },
});
