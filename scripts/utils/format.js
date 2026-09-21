// format.js
//
// Number formatting

import { D } from "./decimal.js";


export function formatNumber(value, places = 2) {
    const n = D(value);

    if (n.isNan()) return "NaN"; // break_eternity spells it isNan
    if (!n.isFinite()) return "Infinity";
    if (n.eq(0)) return 0;
    if (n.lt(0)) return `-${formatNumber(n.neg(), places)}`;
    if (n.lt(100)) return n.toFixed(places);    // Like 99.00
    // One decimal fewer once there are three digits in front of the point, never below zero since toFixed(-1) throws
    if (n.lt(1000)) return n.toFixed(Math.max(0, places - 1)); // Like 999.0

    const exponent = n.log10().floor().toNumber();

    if (exponent < 6) return n.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",");    // Written out with commas below a million
    return exponential(n, places);
}

// Fewer mantissa decimals as the exponent grows, so the width stays the same
const mantissaPlaces = (exponent) => exponent < 100 ? 2 : exponent < 1000 ? 1 : 0;

// The mantissa is truncated so 9.999e19 doesn't round up to 10e19
function exponential(n, places) {
    let exponent = n.log10().floor().toNumber();
    let mantissa = n.div(D(10).pow(exponent)).toNumber();

    // log10's last digit is put back in range instead of being over the mark
    if (mantissa >= 10) { mantissa /= 10; exponent++; }
    if (mantissa < 1) { mantissa *= 10; exponent--; }

    let decimals = Math.min(places, mantissaPlaces(exponent));
    // The nudge stops float error from cutting 1e11 down to 9.99e10
    let cut = Math.floor(mantissa * Math.pow(10, decimals) * (1 + 1e-9)) / Math.pow(10, decimals);
    if (cut >= 10) {
        exponent++;
        decimals = Math.min(places, mantissaPlaces(exponent));
        cut = 1;
    }
    return `${cut.toFixed(decimals)}e${exponent}`;
}

// Rounded, so just under 100% still shows 100%
const PERCENT_DIGITS = 4;
const PERCENT_CAP = Math.pow(10, PERCENT_DIGITS);

export function formatPercent(fraction) {
    const n = D(fraction).mul(100);
    if (n.lt(0)) return `-${formatPercent(D(fraction).neg())}`;
    return n.lt(PERCENT_CAP) ? `${n.toFixed(0)}%` : `${exponential(n, 2)}%`;
}

// A multiplier as a signed percent change
export const deltaPercent = (multiplier) =>
    `${multiplier > 1 ? "+" : ""}${Math.round((multiplier - 1) * 100)}%`;

export function formatWhole(value) {
    const n = D(value);
    return n.lt(1000) ? n.floor().toString() : formatNumber(n);
}

// A countdown read as minutes and seconds
export const clockText = (seconds) => {
    const left = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(left / 60)}m ${String(left % 60).padStart(2, "0")}s`;
};

// Small counts read as numerals where a level is meant to look like a rank
const NUMERALS = [
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];
export function roman(value) {
    let left = Math.max(0, Math.round(value));
    let out = "";
    while (left > 0) {
        const [size, mark] = NUMERALS.find(([size]) => size <= left);
        out += mark;
        left -= size;
    }
    return out || "-";
}
