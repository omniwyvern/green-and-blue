// settings.js
//
// The settings window (gear icon, bottom left)

import { state, saveState, loadState, deleteSave, hasSave, getSaveProblem,
    hasBackup, restoreBackup, exportSave, importSave } from "../core/state.js";
import { buildModal, makeButton } from "./modal.js";

const AUTOSAVE_MINUTES = 5; // Matches AUTOSAVE_MS in loop.js

const THEMES = [
    { id: "dark", name: "Dark" },
    { id: "light", name: "Light" },
];

const overlay = document.getElementById("settings-overlay");
const openButton = document.getElementById("settings-button");

let statusEl = null;
let setOpen = null;
let warningEl = null;
let autosaveButton = null;
let restoreButton = null;
let restoreArmed = false;
let deleteButton = null;
let deleteArmed = false; // Second click confirms the delete
let playtimeEl = null;
let playtimeTimer = null;

// Kept off-screen and opened by the Load from file button, since a bare file input can't be styled
const filePicker = document.createElement("input");
filePicker.type = "file";
filePicker.accept = ".txt,.json,text/plain,application/json";
filePicker.hidden = true;
filePicker.addEventListener("change", () => {
    const file = filePicker.files[0];
    filePicker.value = ""; // So picking the same file twice in a row still fires
    loadFromFile(file);
});


//    !!! THE WINDOW !!!

export function initSettings() {
    if (!overlay || !openButton) return;

    applyTheme(state.settings.theme);
    buildWindow();

    openButton.addEventListener("click", () => setOpen(true));

    // If the save has a problem, it'll tell the player and bring up the window for it
    if (getSaveProblem()) {
        openButton.classList.add("has-problem");
        setOpen(true);
    }
}

export function notifySaveProblem() {
    if (openButton && getSaveProblem()) openButton.classList.add("has-problem");
    refreshWarning();
}

// Saving being off is the kind of thing a player needs told rather than left in the console
function refreshWarning() {
    if (!warningEl) return;
    const problem = getSaveProblem();
    warningEl.textContent = problem;
    warningEl.hidden = !problem;
    if (restoreButton) restoreButton.hidden = !hasBackup();
}

function buildWindow() {
    const built = buildModal(overlay, `
        <div class="settings-header">
            <h2>Settings</h2>
            <button class="settings-close" aria-label="Close">&times;</button>
        </div>
        <div class="settings-warning" hidden></div>
        <div class="settings-section">
            <div class="settings-label">Time played</div>
            <div class="settings-playtime"></div>
            <div class="settings-note">How long this save has been open in a tab. Time away doesn't count.</div>
        </div>
        <div class="settings-section">
            <div class="settings-label">Theme</div>
            <div class="settings-row theme-row"></div>
        </div>
        <div class="settings-section">
            <div class="settings-label">Autosave</div>
            <div class="settings-row autosave-row"></div>
            <div class="settings-note">Saves every ${AUTOSAVE_MINUTES} minutes while you play. Closing
                the tab saves either way, so turning this off only stops the timer.</div>
        </div>
        <div class="settings-section">
            <div class="settings-label">Save</div>
            <div class="settings-row save-row"></div>
        </div>
        <div class="settings-section">
            <div class="settings-label">Transfer</div>
            <div class="settings-row file-row"></div>
        </div>
        <div class="settings-status"></div>
    `, (open) => {
        clearInterval(playtimeTimer);
        if (!open) return disarmAll();
        setStatus("");
        refreshWarning();
        // Only ticks while the window is open, since nothing else reads it
        refreshPlaytime();
        playtimeTimer = setInterval(refreshPlaytime, 250);
    });
    setOpen = built.setOpen;
    const panel = built.panel;

    const themeRow = panel.querySelector(".theme-row");
    for (const theme of THEMES) {
        const btn = document.createElement("button");
        btn.className = "settings-button-secondary theme-button";
        btn.textContent = theme.name;
        btn.dataset.theme = theme.id;
        btn.addEventListener("click", () => {
            state.settings.theme = theme.id;
            applyTheme(theme.id);
            highlightTheme(panel);
            saveState();
        });
        themeRow.appendChild(btn);
    }

    const autosaveRow = panel.querySelector(".autosave-row");
    autosaveButton = makeButton("Autosave", toggleAutosave);
    autosaveRow.appendChild(autosaveButton);
    refreshAutosaveButton();

    const saveRow = panel.querySelector(".save-row");
    saveRow.appendChild(makeButton("Save", () => {
        // Saving goes quiet after a half-loaded page, so say that rather than claim it worked
        setStatus(saveState() ? "Saved." : getSaveProblem() || "Couldn't save.");
        refreshWarning();
    }));
    saveRow.appendChild(makeButton("Load", () => {
        if (!hasSave()) return setStatus("No save to load.");
        loadState();

        window.location.reload();
    }));

    restoreButton = makeButton("Restore backup", armRestore);
    restoreButton.title = "Puts back the save as it was when this tab was opened";
    saveRow.appendChild(restoreButton);

    deleteButton = makeButton("Delete save", armDelete, "settings-button-danger");
    saveRow.appendChild(deleteButton);

    const fileRow = panel.querySelector(".file-row");
    fileRow.appendChild(makeButton("Save to file", saveToFile));
    fileRow.appendChild(makeButton("Load from file", () => filePicker.click()));
    fileRow.appendChild(filePicker);

    statusEl = panel.querySelector(".settings-status");
    warningEl = panel.querySelector(".settings-warning");
    playtimeEl = panel.querySelector(".settings-playtime");

    highlightTheme(panel);
    refreshWarning();
}


//    !!! SAVE FILES !!!

// Writes the save out as a file
function saveToFile() {
    const contents = exportSave();
    const now = new Date();
    const stamp = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
        .map((part, i) => i ? String(part).padStart(2, "0") : part).join("-");
    const blob = new Blob([contents], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `green-and-blue-${stamp}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    setStatus(`Saved to ${link.download}.`);
}

async function loadFromFile(file) {
    if (!file) return;
    try {
        importSave(await file.text());
    } catch (err) {
        console.error("That file wasn't a save.", err);
        return setStatus("That file isn't a Green and Blue save.");
    }
    window.location.reload();
}


//    !!! AUTOSAVE !!!

function toggleAutosave() {
    state.settings.autosave = !state.settings.autosave;
    refreshAutosaveButton();
    saveState(); // The setting itself is worth writing right away, whichever way it just went
    setStatus(state.settings.autosave
        ? `Autosave on, every ${AUTOSAVE_MINUTES} minutes.`
        : "Autosave off. Use Save, or close the tab, to write your progress.");
}

function refreshAutosaveButton() {
    if (!autosaveButton) return;
    const on = !!state.settings.autosave;
    autosaveButton.textContent = `Autosave: ${on ? "on" : "off"}`;
    autosaveButton.classList.toggle("active", on);
}


//    !!! ROLLING BACK AND DELETING !!!

// Rolling back throws away the session, so it asks twice the same way deleting does
function armRestore() {
    if (!restoreArmed) {
        restoreArmed = true;
        restoreButton.textContent = "Really restore? This session is lost";
        restoreButton.classList.add("active");
        setStatus("Click again to go back to the save this tab started with.");
        return;
    }
    if (!restoreBackup()) return setStatus("There's no backup to restore.");
    window.location.reload();
}

function disarmRestore() {
    if (!restoreButton) return;
    restoreArmed = false;
    restoreButton.textContent = "Restore backup";
    restoreButton.classList.remove("active");
}

// Deleting is two steps: the first click arms it, the second deletes
function armDelete() {
    if (!deleteArmed) {
        deleteArmed = true;
        deleteButton.textContent = "Really delete? This cannot be undone";
        deleteButton.classList.add("armed");
        setStatus("Click again to permanently erase your save.");
        return;
    }
    deleteSave(); // Clears storage and reloads
}

function disarmDelete() {
    if (!deleteButton) return;
    deleteArmed = false;
    deleteButton.textContent = "Delete save";
    deleteButton.classList.remove("armed");
}

function disarmAll() {
    disarmDelete();
    disarmRestore();
}


//    !!! THE REST OF THE WINDOW !!!

function highlightTheme(panel) {
    for (const btn of panel.querySelectorAll(".theme-button")) {
        btn.classList.toggle("active", btn.dataset.theme === state.settings.theme);
    }
}

function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
}

// totalTimePlayed only moves on simulation ticks, which only run with the tab open
function refreshPlaytime() {
    if (!playtimeEl) return;
    const total = Math.floor(Number(state.totalTimePlayed) || 0);
    const days = Math.floor(total / 86400);
    const hours = Math.floor(total / 3600) % 24;
    const minutes = String(Math.floor(total / 60) % 60).padStart(2, "0");
    const seconds = String(total % 60).padStart(2, "0");
    const text = (days ? `${days}d ` : "") + `${hours}h ${minutes}m ${seconds}s`;
    if (playtimeEl.textContent !== text) playtimeEl.textContent = text;
}

// Colors are CSS variables keyed off this attribute, so themes switch with one write
export function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
}
