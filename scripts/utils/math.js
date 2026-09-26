// math.js
//
// Small shared number helpers

export const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

// Keeps a fraction between 0 and 1, and treats a missing value as 0
export const clamp01 = (value) => clamp(value || 0, 0, 1);

// Repeatable 0-1 "random" so scattered art looks the same every load
export const seededRandom = (seed, salt) => {
    const x = Math.sin((seed + 1) * 12.9898 + salt * 78.233) * 43758.5453;
    return x - Math.floor(x);
};

// A stable number from a string, to salt seededRandom with
export const hashText = (text) => [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 1000003, 7);
