// hex.js
//
// Hex tiles, works off of axial coordinates (q along row, r down and to the right).

export const hexId = (q, r) => `${q},${r}`;

// The six directions around a tile, in order.
export const HEX_DIRECTIONS = [
    { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
    { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
];

export function hex(q, r) {
    return { id: hexId(q, r), q, r };
}

// Finds hexes within a given radius.
export function hexesWithin(radius) {
    const tiles = [];
    for (let q = -radius; q <= radius; q++) {
        const from = Math.max(-radius, -q - radius);
        const to = Math.min(radius, -q + radius);
        for (let r = from; r <= to; r++) tiles.push(hex(q, r));
    }
    return tiles;
}

// Finds adjacent tiles.
export function neighboursOf(tile) {
    return HEX_DIRECTIONS.map(step => hex(tile.q + step.q, tile.r + step.r));
}

export function areNeighbours(a, b) {
    const dq = a.q - b.q;
    const dr = a.r - b.r;
    return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)) === 1;
}

// Deals with hex to actual size conversion.
export function hexToPixel(tile, size) {
    return {
        x: size * Math.sqrt(3) * (tile.q + tile.r / 2),
        y: size * 1.5 * tile.r,
    };
}
