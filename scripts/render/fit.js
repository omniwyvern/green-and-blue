// fit.js
//
// Shrinks text to fit its box and nudges tooltips back on screen


//    !!! SHRINKING TEXT !!!

// Text is measured with a Range, since overflow off the top of a box isn't counted in scrollHeight
const SHRINK = ["tight", "tighter", "tightest"];

export function textBox(box) {
    const range = document.createRange();
    range.selectNodeContents(box);
    return range.getBoundingClientRect();
}

// Steps down through the classes until the text stops spilling
function shrink(box, overflows) {
    box.classList.remove(...SHRINK);
    for (let step = 0; step < SHRINK.length && overflows(); step++) {
        box.classList.remove(...SHRINK);
        box.classList.add(SHRINK[step]);
    }
}

// For one-line text, which gives ground sideways instead
export function fitWide(box, text) {
    const key = `${text}|${box.clientWidth}`;
    if (box.__fit === key) return;
    shrink(box, () => textBox(box).width > box.clientWidth + 0.5);
    box.__fit = key;
}

export function fitText(box, text) {
    const key = `${text}|${box.clientWidth}x${box.clientHeight}`;
    if (box.__fit === key) return;
    const overflows = () => textBox(box).height > box.clientHeight + 0.5;
    shrink(box, overflows);
    box.__fit = overflows() ? "" : key;
}


//    !!! TOOLTIPS !!!

// Hover tips shift sideways (--tip-shift-x) or flip (.tip-flip), divided by the drag canvas's zoom
const OWNERS = ".node, .hex-tile, .resource-chip, .evo-node, .region-warning";
const TIPS = ".node-tooltip, .hex-tooltip, .resource-tooltip, .evo-tip, .region-warning-tip";

const EDGE = 8;

let active = null;
let activeOwner = null;

// The room a tip has is the window cut down by every ancestor that clips what spills out of it
function roomFor(tip) {
    const room = { left: EDGE, top: EDGE, right: innerWidth - EDGE, bottom: innerHeight - EDGE };

    for (let el = tip.parentElement; el; el = el.parentElement) {
        const style = getComputedStyle(el);
        const clipsX = style.overflowX !== "visible";
        const clipsY = style.overflowY !== "visible";
        if (!clipsX && !clipsY) continue;

        const box = el.getBoundingClientRect();
        if (clipsX) {
            room.left = Math.max(room.left, box.left + EDGE);
            room.right = Math.min(room.right, box.right - EDGE);
        }
        if (clipsY) {
            room.top = Math.max(room.top, box.top + EDGE);
            room.bottom = Math.min(room.bottom, box.bottom - EDGE);
        }
    }

    return room;
}

// Drawers are laid over the canvas, so their tabs and open page take room off the bottom
export function drawerTop(left, right) {
    let top = Infinity;
    for (const el of document.querySelectorAll(".drawer-handle, .drawer-panel")) {
        const box = el.getBoundingClientRect();
        if (box.width && box.height && box.left < right && box.right > left) top = Math.min(top, box.top);
    }
    return top;
}

// How far the worse of a tip's two vertical edges is past the room it has
const spillY = (box, room) => Math.max(0, room.top - box.top, box.bottom - room.bottom);

export function fitTip(tip) {
    if (!tip || !tip.isConnected) return;

    tip.style.setProperty("--tip-shift-x", "0px");
    tip.classList.remove("tip-flip");

    const box = tip.getBoundingClientRect();
    if (!box.width) return;

    const room = roomFor(tip);
    const scale = box.width / tip.offsetWidth || 1;

    // Pulled off the right edge first, then off the left, so a tip too wide to fit stays readable
    let shift = Math.min(0, room.right - box.right);
    shift += Math.max(0, room.left - (box.left + shift));
    if (shift) tip.style.setProperty("--tip-shift-x", `${shift / scale}px`);
    room.bottom = Math.min(room.bottom, drawerTop(box.left + shift, box.right + shift) - EDGE);

    // Over to the other side of its owner, but only if that side is actually roomier
    const spill = spillY(box, room);
    if (spill > 0) {
        tip.classList.add("tip-flip");
        if (spillY(tip.getBoundingClientRect(), room) >= spill) tip.classList.remove("tip-flip");
    }
}


//    !!! MEASURING AGAIN !!!

// Tip text is rewritten by the game loop while it is up, so a resize means measuring again
const watcher = typeof ResizeObserver === "function"
    ? new ResizeObserver(() => fitTip(active))
    : null;

function show(e) {
    const owner = e.target.closest?.(OWNERS) || null;
    if (owner === activeOwner) return;

    if (watcher && active) watcher.unobserve(active);
    activeOwner = owner;
    active = owner && owner.querySelector(TIPS);
    if (!active) return;
    if (watcher) watcher.observe(active);

    const tip = active;
    fitTip(tip);
    // :active on touch lands a frame after the press, so an unshown tip gets a second look
    requestAnimationFrame(() => { if (active === tip) fitTip(tip); });
}

// Panning asks for this every frame, so the measuring is coalesced out of the transform's way
let queued = false;
export function refitTip() {
    if (!active || queued) return;
    queued = true;
    requestAnimationFrame(() => {
        queued = false;
        if (active) fitTip(active);
    });
}

document.addEventListener("pointerover", show, true);
document.addEventListener("pointerdown", show, true);
window.addEventListener("resize", refitTip);
