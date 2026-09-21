// tabGuard.js
//
// One tab holds the save lock, others go read-only

import { blockSaving } from "../core/state.js";
import { notifySaveProblem } from "./settings.js";
import { buildModal, makeButton } from "./modal.js";

const LOCK_NAME = "green-and-blue-save";

const READ_ONLY_REASON = "This game is open in another tab. Saving is off here so this tab can't overwrite it.";

const overlay = document.getElementById("tab-overlay");
let bodyEl = null;
let actionRow = null;
let setOpen = null;

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
        "This tab is read-only so the two tabs don't overwrite each other. Nothing you do here will be saved."
        + "\n\nCarry on in the other tab, or close it and reload this page to play here instead.",
        [{ label: "Got it", onClick: () => setOpen(false) }]
    );
    setOpen(true);
}

// Keep saving off, or this tab's stale copy would undo the other tab's last save
function theOtherTabClosed() {
    setMessage(
        "The other tab is closed.",
        "This tab is still read-only because its data is out of date. Reload to load the latest save.",
        [
            { label: "Reload", onClick: () => window.location.reload() },
            { label: "Not now", onClick: () => setOpen(false) },
        ]
    );
    setOpen(true);
}

function buildWindow() {
    const { panel, setOpen: toggle } = buildModal(overlay, `
        <div class="settings-header">
            <h2 class="tab-title"></h2>
            <button class="settings-close" aria-label="Close">&times;</button>
        </div>
        <div class="tab-body"></div>
        <div class="settings-row tab-row"></div>
    `);
    setOpen = toggle;

    bodyEl = panel.querySelector(".tab-body");
    actionRow = panel.querySelector(".tab-row");
}

function setMessage(title, body, actions) {
    overlay.querySelector(".tab-title").textContent = title;

    // Blank lines in the text above become paragraphs, rather than being written as markup
    bodyEl.replaceChildren(...body.split("\n\n").map(text => {
        const p = document.createElement("p");
        p.textContent = text;
        return p;
    }));

    actionRow.replaceChildren(...actions.map(({ label, onClick }) => makeButton(label, onClick)));
}
