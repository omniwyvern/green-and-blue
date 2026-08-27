// dom.js
//
// Write-guards shared by the render and content files. Assigning text or style makes
// the browser throw out style recalculation work even when nothing actually changed, so
// every helper here reads first and writes only when the value differs.

export function setText(el, text) {
    const value = String(text);
    if (el.textContent !== value) el.textContent = value;
}

// An empty string hands display back to the stylesheet, "none" takes it off screen
export function setDisplay(el, shown) {
    const display = shown ? "" : "none";
    if (el.style.display !== display) el.style.display = display;
}

export function setWidth(el, fraction) {
    const width = `${(Math.max(0, Math.min(1, fraction)) * 100).toFixed(1)}%`;
    if (el.style.width !== width) el.style.width = width;
}