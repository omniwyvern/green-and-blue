// registry.js
//
// Registers categories and layers. New content is a file in scripts/content/ that calls these,
// imported from its category's index.

export const categories = {}; // { categoryId: { id, name, order, layerIds: [], groups: {} } }
export const layers = {};     // { layerId: layerDefinition }

const DEFAULT_GROUP = "default";

/**
 * @param {string} id
 * @param {object} def
 * @param {string} def.name
 * @param {number} [def.order]
 * @param {object} [def.groups]
 */
export function registerCategory(id, { name, order = 0, groups = null }) {
    const declared = groups || { [DEFAULT_GROUP]: {} };

    const built = {};
    let index = 0;
    for (const groupId in declared) {
        const group = declared[groupId];
        built[groupId] = {
            id: groupId,
            name: group.name || null,
            // Falls back to declaration order.
            order: group.order === undefined ? index : group.order,
            layerIds: [],
        };
        index++;
    }

    categories[id] = { id, name, order, layerIds: [], groups: built };
}

export function getOrderedGroups(categoryId) {
    const category = categories[categoryId];
    if (!category) return [];
    return Object.values(category.groups)
        .sort((a, b) => a.order - b.order)
        .map(group => ({
            ...group,
            layers: group.layerIds.map(id => layers[id]).sort((a, b) => a.order - b.order),
        }));
}

function assertValidCanvasType(canvasType, label) {
    if (canvasType !== "static" && canvasType !== "drag") {
        throw new Error(`${label} has invalid canvasType "${canvasType}" (must be "static" or "drag").`);
    }
}

// Upgrades always end up in one flat map so buying doesn't care where an upgrade is from
function buildUpgradeGroups(label, upgrades, drawers) {
    const merged = { ...upgrades };
    const built = {};

    for (const drawerId in drawers || {}) {
        const drawer = drawers[drawerId];
        const upgradeIds = Object.keys(drawer.upgrades || {});
        for (const upgradeId of upgradeIds) {
            if (upgradeId in merged) {
                throw new Error(`${label} declares upgrade "${upgradeId}" more than once.`);
            }
            merged[upgradeId] = drawer.upgrades[upgradeId];
        }
        built[drawerId] = {
            id: drawerId,
            label: drawer.label || drawerId,
            color: drawer.color || null,
            note: drawer.note || null,
            hidden: drawer.hidden || null,
            upgradeIds,
        };
    }

    return { upgrades: merged, drawers: built };
}

/**
 * @param {string} id
 * @param {object} def
 * @param {string} def.categoryId
 * @param {string} [def.group]
 * @param {string} def.name
 * @param {string} [def.color] 
 * @param {"static"|"drag"} [def.canvasType]
 * @param {number} [def.order]
 * @param {object} [def.upgrades]
 * @param {object} [def.drawers]
 * @param {string} [def.absorbedBy]
 * @param {object} [def.subWindows]
 * @param {object} [def.nodes]
 * @param {object} [def.tiles]
 *                                    
 * @param {function} [def.overlay]
 * @param {string} [def.viewportClass]
 * @param {string} [def.canvasClass]
 * @param {function} [def.onCanvasClick]
 * @param {object} [def.hud]
 * @param {object} [def.defaultView]
 * @param {number} [def.defaultZoom]
 * @param {object} [def.resources]
 * @param {object} [def.indicators]
 * @param {object} [def.initialState]
 * @param {object} [def.subLayers] 
 * 
 * @param {function} [def.onTick]
 * @param {function} [def.attention]
 * @param {boolean} [def.startUnlocked=true]
 */
export function registerLayer(id, def) {
    const { categoryId, group = null, name, color = "#4a90d9", canvasType = null, order = 0,
        upgrades = {}, drawers = null, subWindows = {}, nodes = {}, subLayers: rawSubLayers = null,
        resources = {}, indicators = {}, initialState = {}, defaultView = null, defaultZoom = null,
        scene = null, note = null, canvasClass = null,
        tiles = null, overlay = null, viewportClass = null, onCanvasClick = null, hud = null,
        onTick = null, attention = null, startUnlocked = true, absorbedBy = null } = def;

    if (!categories[categoryId]) {
        throw new Error(`Layer "${id}" references unknown category "${categoryId}". Register the category first.`);
    }

    // Named rather than defaulted when it's wrong, so typos don't mess things up as bad
    const groupId = group || Object.keys(categories[categoryId].groups)[0];
    if (!categories[categoryId].groups[groupId]) {
        throw new Error(`Layer "${id}" references unknown group "${groupId}" in category "${categoryId}".`);
    }

    // A layer is either a canvas, or one or more sublayers selected with the sidebar flyout
    if (canvasType && rawSubLayers) {
        throw new Error(`Layer "${id}" has both canvasType and subLayers - pick one.`);
    }
    if (!canvasType && !rawSubLayers) {
        throw new Error(`Layer "${id}" needs either canvasType or subLayers.`);
    }

    let subLayers = null;
    if (rawSubLayers) {
        if (Object.keys(rawSubLayers).length === 0) {
            throw new Error(`Layer "${id}" has an empty subLayers object.`);
        }

        const seen = {};
        const claimIds = (subDef, stateKey, kind, ids) => {
            const key = `${stateKey}:${kind}`;
            if (!seen[key]) seen[key] = new Set();
            for (const claimed of ids) {
                if (seen[key].has(claimed)) {
                    throw new Error(`Layer "${id}" has ${kind} id "${claimed}" reused across sub-layers sharing "${stateKey}".`);
                }
                seen[key].add(claimed);
            }
        };

        subLayers = {};
        for (const key in rawSubLayers) {
            const subDef = rawSubLayers[key];
            assertValidCanvasType(subDef.canvasType, `Sub-layer "${id}:${key}"`);

            const stateKey = subDef.stateKey || id;
            const grouped = buildUpgradeGroups(`Sub-layer "${id}:${key}"`, subDef.upgrades, subDef.drawers);

            claimIds(subDef, stateKey, "upgrades", Object.keys(grouped.upgrades));
            claimIds(subDef, stateKey, "subWindows", Object.keys(subDef.subWindows || {}));
            claimIds(subDef, stateKey, "nodes", Object.keys(subDef.nodes || {}));

            subLayers[key] = {
                key,
                id: `${id}:${key}`,
                stateKey,
                resources: subDef.resources || resources,
                name: subDef.name,
                color: subDef.color || color,
                canvasType: subDef.canvasType,
                order: subDef.order || 0,
                upgrades: grouped.upgrades,
                drawers: grouped.drawers,
                subWindows: subDef.subWindows || {},
                nodes: subDef.nodes || {},
                tiles: subDef.tiles || null,
                hidden: subDef.hidden || null,
                overlay: subDef.overlay || null,
                defaultView: subDef.defaultView || null,
                defaultZoom: subDef.defaultZoom || null,
                scene: subDef.scene || null,
                note: subDef.note || null,
                canvasClass: subDef.canvasClass || null,
                viewportClass: subDef.viewportClass || null,
                onCanvasClick: subDef.onCanvasClick || null,
                hud: subDef.hud || null,
            };
        }
    } else {
        assertValidCanvasType(canvasType, `Layer "${id}"`);
    }

    const grouped = buildUpgradeGroups(`Layer "${id}"`, upgrades, drawers);

    layers[id] = {
        id, categoryId, group: groupId, name, color, order, onTick, attention, startUnlocked,
        resources, indicators, initialState, defaultView, defaultZoom,
        absorbedBy,
        stateKey: id,
        canvasType: subLayers ? null : canvasType,
        upgrades: subLayers ? {} : grouped.upgrades,
        drawers: subLayers ? {} : grouped.drawers,
        subWindows: subLayers ? {} : subWindows,
        nodes: subLayers ? {} : nodes,
        tiles: subLayers ? null : tiles,
        overlay: subLayers ? null : overlay,
        viewportClass: subLayers ? null : viewportClass,
        onCanvasClick: subLayers ? null : onCanvasClick,
        hud: subLayers ? null : hud,
        scene: subLayers ? null : scene,
        note: subLayers ? null : note,
        canvasClass: subLayers ? null : canvasClass,
        subLayers,
    };
    categories[categoryId].layerIds.push(id);
    categories[categoryId].groups[groupId].layerIds.push(id);
}

export function getOrderedCategories() {
    return Object.values(categories).sort((a, b) => a.order - b.order);
}

export function getOrderedLayers(categoryId) {
    return categories[categoryId].layerIds
        .map(id => layers[id])
        .sort((a, b) => a.order - b.order);
}

// Empty array for a flat layer (or an unknown id), so it doesn't error out in other functions
export function getOrderedSubLayers(layerId) {
    const layer = layers[layerId];
    if (!layer || !layer.subLayers) return [];
    return Object.values(layer.subLayers).sort((a, b) => a.order - b.order);
}

// The sub-layers the player can see right now go through this
export function getVisibleSubLayers(layerId, layerState) {
    return getOrderedSubLayers(layerId).filter(sub => !(sub.hidden && sub.hidden(layerState)));
}
