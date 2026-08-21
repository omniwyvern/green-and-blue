// settings.js
//
// The settings window. Little gear icon on the bottom left opens it. Pretty self-explanatory.

import { state, saveState, loadState, deleteSave, hasSave } from "../core/state.js";

const THEMES = [
    { id: "dark", name: "Dark" },
    { id: "light", name: "Light" },
];

const overlay = document.getElementById("settings-overlay");
const openButton = document.getElementById("settings-button");

let statusEl = null;
let deleteButton = null;
let deleteArmed = false; // Second click confirms; see armDelete below

export function initSettings() {
    if (!overlay || !openButton) return;

    applyTheme(state.settings.theme);
    buildWindow();

    openButton.addEventListener("click", () => setOpen(true));

    // Clicking the backdrop (but not the panel itself) or escape closes it.
    overlay.addEventListener("click", (e) => { if (e.target === overlay) setOpen(false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); });
}

function setOpen(open) {
    overlay.hidden = !open;
    if (!open) disarmDelete();
    else setStatus("");
}

function buildWindow() {
    const panel = document.createElement("div");
    panel.className = "settings-window";

    panel.innerHTML = `
        <div class="settings-header">
            <h2>Settings</h2>
            <button class="settings-close" aria-label="Close">&times;</button>
        </div>
        <div class="settings-section">
            <div class="settings-label">Theme</div>
            <div class="settings-row theme-row"></div>
        </div>
        <div class="settings-section">
            <div class="settings-label">Save</div>
            <div class="settings-row save-row"></div>
        </div>
        <div class="settings-status"></div>
    `;

    panel.querySelector(".settings-close").addEventListener("click", () => setOpen(false));

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

    const saveRow = panel.querySelector(".save-row");
    saveRow.appendChild(makeButton("Save", "settings-button-secondary", () => {
        saveState();
        setStatus("Saved.");
    }));
    saveRow.appendChild(makeButton("Load", "settings-button-secondary", () => {
        if (!hasSave()) return setStatus("No save to load.");
        loadState();

        window.location.reload();
    }));

    deleteButton = makeButton("Delete save", "settings-button-danger", armDelete);
    saveRow.appendChild(deleteButton);

    statusEl = panel.querySelector(".settings-status");

    overlay.appendChild(panel);
    highlightTheme(panel);
}

function makeButton(label, className, onClick) {
    const btn = document.createElement("button");
    btn.className = className;
    btn.textContent = label;
    btn.addEventListener("click", onClick);
    return btn;
}

// Makes deleting the save a two-step thing, first click arms it and second deletes.
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

function highlightTheme(panel) {
    for (const btn of panel.querySelectorAll(".theme-button")) {
        btn.classList.toggle("active", btn.dataset.theme === state.settings.theme);
    }
}

function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
}

// Everything color-related is a CSS variable keyed off this attribute, so switching
// themes is one attribute write rather than a stylesheet swap.
export function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
}
