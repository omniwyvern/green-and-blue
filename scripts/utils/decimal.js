// decimal.js
//
// break_eternity is a UMD bundle that assigns globalThis.Decimal, so everything is good with Decimal.
// It's really good for really big/small numbers.

export const Decimal = globalThis.Decimal;

if (!Decimal) {
    throw new Error("break_eternity.min.js must load before the module graph - check the <script> order in index.html.");
}

// Short constructor, used constantly: D(4), D("1e300").
export const D = (value) => new Decimal(value);

export const isDecimal = (value) => value instanceof Decimal;
