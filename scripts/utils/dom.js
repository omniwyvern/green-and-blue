// dom.js
//
// Write guards that only touch the DOM when a value actually changes

import { clamp01 } from "./math.js";

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
    const width = `${(clamp01(fraction) * 100).toFixed(1)}%`;
    if (el.style.width !== width) el.style.width = width;
}

export function setHeight(el, fraction) {
    const height = `${(clamp01(fraction) * 100).toFixed(1)}%`;
    if (el.style.height !== height) el.style.height = height;
}

export function setVar(el, name, value) {
    if (el.style.getPropertyValue(name) !== value) el.style.setProperty(name, value);
}

export function setAttr(el, name, value) {
    if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

export function setClass(el, name, on) {
    if (el.classList.contains(name) !== on) el.classList.toggle(name, on);
}

// start() runs step(dt, now) each frame while it returns true and host() is visible; dt caps at 0.1s
export function frameLoop(host, step, onHidden) {
    let handle = 0;
    let last = 0;

    const run = (now) => {
        handle = 0;
        const el = host();
        if (!el || !el.isConnected || el.offsetParent === null) return onHidden();

        const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
        last = now;
        if (step(dt, now)) handle = requestAnimationFrame(run);
    };

    return () => {
        if (handle) return;
        last = 0;
        handle = requestAnimationFrame(run);
    };
}

// A press ending anywhere, or the window losing focus, lets go
export function onRelease(release) {
    for (const type of ["pointerup", "pointercancel", "blur"]) window.addEventListener(type, release);
}

const SVG_NS = "http://www.w3.org/2000/svg";

// SVG needs its namespace or the browser makes an element that won't render
export function svgEl(tag, attrs = {}) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const name in attrs) el.setAttribute(name, attrs[name]);
    return el;
}
