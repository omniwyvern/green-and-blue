// modal.js
//
// Builds all the panels (settings, dev, warnings, etc.)

export function makeButton(label, onClick, className = "settings-button-secondary") {
    const btn = document.createElement("button");
    btn.className = className;
    btn.textContent = label;
    btn.addEventListener("click", onClick);
    return btn;
}

// Also closes on the x, on a click outside the panel, or on escape
export function buildModal(overlay, markup, onToggle) {
    const panel = document.createElement("div");
    panel.className = "settings-window";
    panel.innerHTML = markup;
    overlay.appendChild(panel);

    const setOpen = (open) => {
        overlay.hidden = !open;
        if (onToggle) onToggle(open);
    };

    panel.querySelector(".settings-close").addEventListener("click", () => setOpen(false));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) setOpen(false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); });

    return { panel, setOpen };
}
