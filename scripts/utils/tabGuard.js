// tabGuard.js
//
// Two tabs on the same save overwrite each other. So, this makes one tab hold a lock and
// the other becomes read only. Tabs that die randomly drop the lock.

import { blockSaving } from "../core/state.js";
import { notifySaveProblem } from "../render/settings.js";

const LOCK_NAME = "green-and-blue-save";

const READ_ONLY_REASON = "This game is open in another tab, which is the one that saves."
    + " Saving is off here so this tab can't overwrite it.";

const overlay = document.getElementById("tab-overlay");
let bodyEl = null;
let actionRow = null;

export function initTabGuard() {
    if (!overlay || !navigator.locks) return;

    buildWindow();

    navigator.locks.request(LOCK_NAME, { ifAvailable: true }, (lock) => {
        if (lock) return held(); // First tab owns saving, and keeps it until the tab goes

        becomeReadOnly();

        // Queued behind whoever holds it. Being granted it later means that tab has gone away
        navigator.locks.request(LOCK_NAME, () => {
            theOtherTabClosed();
            return held();
        });
    });
}

// Never resolves, so the lock is only released by the tab itself closing
const held = () => new Promise(() => {});

function becomeReadOnly() {
    blockSaving(READ_ONLY_REASON);
    notifySaveProblem(); // The settings window was built before this, so it needs telling

    setMessage(
        "This game is already open in another tab.",
        "Both tabs would be saving over each other, and whichever saved last would win - so this"
        + " tab is read-only. Anything you do here won't be kept."
        + "\n\nCarry on in the other tab, or close it and reload this page to play here instead.",
        [{ label: "Got it", onClick: () => setOpen(false) }]
    );
    setOpen(true);
}

// Saving stays off even now. This tab has been sat on a copy of the save from before the other
// tab wrote to it, so switching saving back on here would undo whatever it did on its way out
function theOtherTabClosed() {
    setMessage(
        "The other tab is closed.",
        "This tab is still read-only, because what it's holding is older than what that tab last"
        + " saved. Reload to pick up the save as it stands and carry on here.",
        [
            { label: "Reload", onClick: () => window.location.reload() },
            { label: "Not now", onClick: () => setOpen(false) },
        ]
    );
    setOpen(true);
}

function buildWindow() {
    const panel = document.createElement("div");
    panel.className = "settings-window";
    panel.innerHTML = `
        <div class="settings-header">
            <h2 class="tab-title"></h2>
            <button class="settings-close" aria-label="Close">&times;</button>
        </div>
        <div class="tab-body"></div>
        <div class="settings-row tab-row"></div>
    `;
    panel.querySelector(".settings-close").addEventListener("click", () => setOpen(false));

    bodyEl = panel.querySelector(".tab-body");
    actionRow = panel.querySelector(".tab-row");
    overlay.appendChild(panel);

    overlay.addEventListener("click", (e) => { if (e.target === overlay) setOpen(false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); });
}

function setMessage(title, body, actions) {
    overlay.querySelector(".tab-title").textContent = title;

    // Blank lines in the text above become paragraphs, rather than being written as markup
    bodyEl.replaceChildren(...body.split("\n\n").map(text => {
        const p = document.createElement("p");
        p.textContent = text;
        return p;
    }));

    actionRow.replaceChildren(...actions.map(({ label, onClick }) => {
        const button = document.createElement("button");
        button.className = "settings-button-secondary";
        button.textContent = label;
        button.addEventListener("click", onClick);
        return button;
    }));
}

function setOpen(open) {
    overlay.hidden = !open;
}
