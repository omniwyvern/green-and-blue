// knowledgeLayer.js
//
// What humanity knows, and what it is working out next; Lore opens with the first discovery, Innovation after a few more

import { registerLayer } from "../../../core/registry.js";
import { LORE_VIEW } from "../sublayers/loreSublayer.js";
import { INNOVATION_VIEW } from "../sublayers/innovationSublayer.js";
import { INNOVATIONS, canStudy } from "../systems/knowledge.js";

registerLayer("knowledge", {
    categoryId: "humanity",
    group: "settled",
    name: "Knowledge",
    color: "#b67ae0",
    order: 1,
    startUnlocked: false,

    initialState: {
        notions: {},
        known: [],
        failed: [],
        innovations: {},
        notes: {},
        packed: {},
        selected: null,
        brush: null,
        innovationOpen: false,
    },

    attention: () => Object.keys(INNOVATIONS).filter(canStudy),

    subLayers: {
        lore: { ...LORE_VIEW, order: 0 },
        innovation: { ...INNOVATION_VIEW, order: 1, hidden: (k) => !k.innovationOpen },
    },
});
