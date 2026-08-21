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
    if (exponent >= 6) return n.toExponential(places).replace("e+", "e");
    const mantissa = n.div(D(10).pow(exponent));
    return `${mantissa.toFixed(places)}e${exponent}`;
}

// For rates and other values where a bare integer reads better.
// This might be redundant, idk why I made this.
export function formatWhole(value) {
    const n = D(value);
    return n.lt(1000) ? n.floor().toString() : formatNumber(n);
}
