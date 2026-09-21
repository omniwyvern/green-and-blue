// decimal.js
//
// The break_eternity library sets globalThis.Decimal for huge and tiny numbers

export const Decimal = globalThis.Decimal;

if (!Decimal) {
    throw new Error("break_eternity.min.js must load before the module graph. Check the <script> order in index.html.");
}

// Short constructor: D(4), D("1e300")
export const D = (value) => new Decimal(value);

export const isDecimal = (value) => value instanceof Decimal;
