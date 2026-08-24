// format.js
//
// This is where all the number formatting goes through.

import { D } from "./decimal.js";


export function formatNumber(value, places) {
    const n = D(value);
    places = 2;

    if (n.isNan()) return "NaN"; // break_eternity spells it isNan, instead of isNaN for some reason. but I'm not gonna mess with it
    if (!n.isFinite()) return "Infinity";
    if (n.eq(0)) return 0;
    if (n.lt(0)) return `-${formatNumber(n.neg(), places)}`;    // For negative numbers
    if (n.lt(100)) return n.toFixed(places);    // Numbers less than 100 displayed like 99.00
    if (n.lt(1000)) return n.toFixed(places - 1); // Numbers less than 1000 like 999.0

    const exponent = n.log10().floor().toNumber();

    if (exponent < 6) return n.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",");    // Numbers like 80,000,000,000 won't be fully written out
    return exponential(n, places);
}

// How many decimals the mantissa gets, based on how big the exponent is. Keeps the whole
// thing about the same width all the way up: 9.99e19, then 9.9e100, then 9e1000.
const mantissaPlaces = (exponent) => exponent < 100 ? 2 : exponent < 1000 ? 1 : 0;

// The mantissa is cut rather than rounded, so a round number reads as 9.99e19
// instead of rolling up to 10e19. toExponential() rounds it to 10 and leaves it there.
function exponential(n, places) {
    let exponent = n.log10().floor().toNumber();
    let mantissa = n.div(D(10).pow(exponent)).toNumber();

    // log10's last digit is put back in range instead of being over the mark.
    if (mantissa >= 10) { mantissa /= 10; exponent++; }
    if (mantissa < 1) { mantissa *= 10; exponent--; }

    const decimals = Math.min(places, mantissaPlaces(exponent));
    const step = Math.pow(10, decimals);
    return `${(Math.floor(mantissa * step) / step).toFixed(decimals)}e${exponent}`;
}

// Takes the fraction, not the percent - 0.25 reads as 25%.
//
// Percentages run away from a number much sooner than the number does, so this gives up on
// digits far earlier than formatNumber: four of them, then the same exponential everything else
// falls back to. Rounded rather than floored on the way, so a hair under 100% is still 100%.
const PERCENT_DIGITS = 4;
const PERCENT_CAP = Math.pow(10, PERCENT_DIGITS);

export function formatPercent(fraction) {
    const n = D(fraction).mul(100);
    if (n.lt(0)) return `-${formatPercent(D(fraction).neg())}`;
    return n.lt(PERCENT_CAP) ? `${n.toFixed(0)}%` : `${exponential(n, 2)}%`;
}

// For rates and other values where a bare integer reads better.
// This might be redundant, idk why I made this.
export function formatWhole(value) {
    const n = D(value);
    return n.lt(1000) ? n.floor().toString() : formatNumber(n);
}
