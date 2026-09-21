// reefSublayer.js
//
// The seabed with its sites and one fish per Ocean species; scrolls when wide

import { canAfford, stepNote } from "../../../core/resources.js";
import { D } from "../../../utils/decimal.js";
import { setText, setDisplay, setVar, setAttr, setClass, frameLoop } from "../../../utils/dom.js";
import { clamp01 } from "../../../utils/math.js";
import { costHtml, upgradeDescription, resourceLabel } from "../../../render/richText.js";
import { formatPercent, formatNumber, clockText } from "../../../utils/format.js";
import { switchToLayer, switchToSubLayer } from "../../../render/canvasRouter.js";
import { fishArt } from "../art/oceanArt.js";
import { focusSchool } from "./oceanSublayer.js";
import { pieceArt, BOOK_ICON } from "../art/reefArt.js";
import {
    PIECES, PIECE_IDS, TRAITS, TRAIT_IDS, SIZES, HABITAT, HABITAT_IDS, SITES,
    reefState, reefOpen, siteCount, spotAt, placePiece, clearSpot, toggleTrait, traitBlocked,
    traitCost, slotsOf, isUnlocked, unlockHint, habitatReport, needProgress, needText,
    speciesName, speciesColor, unlockedSpecies, activeEvents, eventDef, eventAnswered, eventRoom,
    nextEventIn, boostMultiplier, settledMultiplier, settledMax, settledStreak,
    ASPECT_PER_LEVEL, SLACK_PER_LEVEL, KINSHIP_PER_LEVEL, SYMBIOSIS_PER_LEVEL,
} from "../systems/reef.js";

// What window is open. Not saved
let view = null;

export const REEF_VIEW = {
    name: "Reef",
    color: "#3fc0d0",
    canvasType: "static",
    canvasClass: "reef-canvas",

    scene: {
        build(el) {
            el.className = "static-scene reef-scene";
            el.innerHTML = layout();
            wire(el);
        },

        update(el) {
            shown = el;
            startSwim();
            paint(el);
        },
    },

    drawers: {
        reef: {
            label: "Reef",
            color: "#3fc0d0",
            upgrades: {
                slackWater: {
                    title: "Lingering Tide",
                    description: (s, lvl) => upgradeDescription(
                        `Events hang around ${formatPercent(SLACK_PER_LEVEL * lvl)} longer before they pass.`,
                        stepNote(lvl, 6, `+${formatPercent(SLACK_PER_LEVEL)}`)),
                    max: 6,
                    cost: (s, lvl) => ({ blueEssence: D(1e34).mul(D(2.5).pow(lvl)) }),
                },
                kinship: {
                    title: "Kinship",
                    description: (s, lvl) => upgradeDescription(
                        `Every fish's boosts are ${formatPercent(KINSHIP_PER_LEVEL * lvl)} stronger.`,
                        stepNote(lvl, 8, `+${formatPercent(KINSHIP_PER_LEVEL)}`)),
                    max: 8,
                    cost: (s, lvl) => ({ greenEssence: D(5e30).mul(D(2.4).pow(lvl)) }),
                },
                symbiosis: {
                    title: "Good Neighbors",
                    description: (s, lvl) => upgradeDescription(
                        "Ocean and deep ocean next"
                        + ` to reef tiles pay ${formatPercent(SYMBIOSIS_PER_LEVEL * lvl)} more.`,
                        stepNote(lvl, 10, `+${formatPercent(SYMBIOSIS_PER_LEVEL)}`)),
                    max: 10,
                    cost: (s, lvl) => ({ blueEssence: D(5e33).mul(D(2).pow(lvl)) }),
                },
                spawningGrounds: {
                    title: "Nursery Reef",
                    description: (s, lvl) => upgradeDescription(
                        "Every aspect in the Ocean"
                        + ` caps ${ASPECT_PER_LEVEL * lvl} levels higher.`,
                        stepNote(lvl, 10, `+${ASPECT_PER_LEVEL}`)),
                    max: 10,
                    cost: (s, lvl) => ({ greenEssence: D(2e30).mul(D(2).pow(lvl)) }),
                },
            },
        },
    },
};


//    !!! THE SCENE !!!

const MOTES = 28;
const RAYS = 5;

const motes = () => Array.from({ length: MOTES }, (_, i) =>
    `<span class="reef-mote" style="--x:${(i * 37) % 100}%;--y:${(i * 61) % 100}%;`
    + `--size:${2 + (i % 3)}px;--n:${i}"></span>`).join("");

const rays = () => Array.from({ length: RAYS }, (_, i) =>
    `<span class="reef-ray" style="--i:${i}"></span>`).join("");

// Ripples bunch up toward the far edge, the way they would on a slope going away from you
const RIPPLE_ROWS = [[4, 0.25, 60], [9, 0.35, 52], [16, 0.5, 44], [25, 0.7, 38], [37, 0.9, 32], [52, 1.15, 26], [70, 1.4, 21], [91, 1.7, 17]];
const ripples = () => RIPPLE_ROWS.map(([y, amp, waves], k) => {
    const step = 400 / waves;
    let d = "";
    for (let i = 0; i < waves; i++) {
        if ((i + k * 3) % 7 > 3) continue;
        const x = i * step;
        d += `M${x.toFixed(1)} ${y} Q${(x + step / 4).toFixed(1)} ${y - amp} ${(x + step / 2).toFixed(1)} ${y}`
            + ` T${(x + step).toFixed(1)} ${y}`;
    }
    return `<path class="reef-ripple" style="opacity:${(0.25 + k * 0.08).toFixed(2)}" d="${d}"/>`;
}).join("");

const depthZ = (d) => 150 + Math.round(d * 400);

const sitesHtml = () => SITES.map((site, i) => `
    <button class="reef-spot" type="button" data-spot="${i}"
        style="--x:${site.x};--d:${site.y};z-index:${depthZ(site.y)}">
        <span class="reef-spot-box"><span class="reef-plus"></span></span>
        <span class="reef-piece"></span>
        <span class="reef-pips"></span>
    </button>`).join("");

const layout = () => `
    <div class="reef-water">
        <div class="reef-rays">${rays()}</div>
        <svg class="reef-far" viewBox="0 0 400 100" preserveAspectRatio="none" aria-hidden="true">
            <path class="reef-far-back" d="M0 100 L0 58 C30 50 48 36 72 44 C96 52 110 30 140 34 C170 38 180 56 210 50
                C240 44 256 26 290 32 C320 38 336 52 362 46 C380 42 392 48 400 50 L400 100 Z"/>
            <path class="reef-far-front" d="M0 100 L0 74 C24 70 40 60 64 66 C92 72 104 58 128 62 C156 66 170 78 200 72
                C226 66 244 56 272 62 C300 68 318 76 344 70 C368 64 386 68 400 70 L400 100 Z"/>
        </svg>
        <div class="reef-motes">${motes()}</div>
    </div>
    <div class="reef-view">
        <div class="reef-world">
            <div class="reef-floor">
                <svg class="reef-sand" viewBox="0 0 400 100" preserveAspectRatio="none" aria-hidden="true">
                    ${ripples()}
                </svg>
            </div>
            <div class="reef-bed">${sitesHtml()}</div>
        </div>
    </div>
    <button class="reef-nudge left" type="button" data-nudge="-1" title="Scroll left">&#8249;</button>
    <button class="reef-nudge right" type="button" data-nudge="1" title="Scroll right">&#8250;</button>
    <div class="reef-events"></div>
    <button class="reef-book" type="button" title="Compendium">
        ${BOOK_ICON}
        <span class="reef-book-mark">!</span>
    </button>
    <div class="reef-veil"><span>No reef yet. Turn a tile to reef on the World map.</span></div>
    <div class="reef-shade" hidden></div>
    <div class="reef-window-wrap" hidden>
        <div class="reef-window">
            <div class="reef-window-head">
                <button class="reef-back" type="button" data-act="back" title="Back">&#8249;</button>
                <span class="reef-window-title"></span>
                <button class="reef-close" type="button" data-act="close" title="Close">&times;</button>
            </div>
            <div class="reef-window-body"></div>
        </div>
    </div>
`;


//    !!! CLICKS AND SCROLLING !!!

const open = (next) => { view = next; };

// Sub-layer first, so the layer comes up already on the right page
const goTo = (layerId, subKey) => {
    switchToSubLayer(layerId, subKey);
    switchToLayer(layerId);
};

export function openReefBook() {
    open({ kind: "book" });
    goTo("reef", "reef");
}

function wire(el) {
    el.querySelectorAll(".reef-spot").forEach(button => {
        button.addEventListener("click", (e) => {
            e.stopPropagation();
            const i = Number(button.dataset.spot);
            open({ kind: spotAt(i) ? "detail" : "pick", spot: i });
            paint(el);
        });
    });

    for (const sel of [".reef-book", ".reef-events"]) {
        el.querySelector(sel).addEventListener("click", (e) => {
            e.stopPropagation();
            open({ kind: "book" });
            paint(el);
        });
    }

    el.querySelector(".reef-shade").addEventListener("click", (e) => {
        e.stopPropagation();
        open(null);
        paint(el);
    });

    el.querySelector(".reef-window-wrap").addEventListener("click", (e) => {
        e.stopPropagation();
        if (e.target.classList.contains("reef-window-wrap")) {
            open(null);
            paint(el);
            return;
        }
        const button = e.target.closest("[data-act]");
        if (!button || button.classList.contains("inactive")) return;
        act(button.dataset, el);
        paint(el);
    });

    wireScroll(el);
}

function wireScroll(el) {
    const scroller = el.querySelector(".reef-view");
    const overflows = () => scroller.scrollWidth > scroller.clientWidth + 1;
    let drag = null;
    let swallow = false;

    scroller.addEventListener("pointerdown", (e) => {
        if (e.pointerType !== "mouse" || e.button !== 0 || !overflows()) return;
        drag = { x: e.clientX, from: scroller.scrollLeft, id: e.pointerId, moved: false };
    });
    scroller.addEventListener("pointermove", (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        const dx = e.clientX - drag.x;
        if (!drag.moved && Math.abs(dx) < 5) return;
        if (!drag.moved) {
            drag.moved = true;
            scroller.setPointerCapture(e.pointerId);
            scroller.classList.add("dragging");
        }
        scroller.scrollLeft = drag.from - dx;
    });
    const end = (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        swallow = drag.moved;
        drag = null;
        scroller.classList.remove("dragging");
    };
    scroller.addEventListener("pointerup", end);
    scroller.addEventListener("pointercancel", end);
    // The click that ends a drag shouldn't also open whatever the pointer let go over
    scroller.addEventListener("click", (e) => {
        if (!swallow) return;
        swallow = false;
        e.stopPropagation();
        e.preventDefault();
    }, true);

    scroller.addEventListener("wheel", (e) => {
        if (!overflows() || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
        scroller.scrollLeft += e.deltaY;
        e.preventDefault();
    }, { passive: false });

    el.querySelectorAll(".reef-nudge").forEach(button => {
        button.addEventListener("click", (e) => {
            e.stopPropagation();
            scroller.scrollBy({ left: Number(button.dataset.nudge) * scroller.clientWidth * 0.6, behavior: "smooth" });
        });
    });
}

// Keeps the same part of the reef in the middle when the screen or the reef changes size
function keepCentered(el, scroller) {
    const width = scroller.scrollWidth;
    const seen = scroller.clientWidth;
    if (!width || !seen) return;
    const k = scroller._reef || (scroller._reef = { width: 0, seen: 0, middle: 0.5 });
    if (width !== k.width || seen !== k.seen) {
        scroller.scrollLeft = k.middle * width - seen / 2;
        k.width = width;
        k.seen = seen;
    }
    k.middle = (scroller.scrollLeft + seen / 2) / width;
    const room = width - seen;
    setClass(el, "more-left", scroller.scrollLeft > 4);
    setClass(el, "more-right", scroller.scrollLeft < room - 4);
    setClass(scroller, "can-pan", room > 1);
}

function act(data, el) {
    const i = view?.spot;
    switch (data.act) {
        case "close": open(null); break;
        case "back": open(view.kind === "modify" || view.kind === "replace" ? { kind: "detail", spot: i } : null); break;
        case "place":
            if (placePiece(i, data.piece)) {
                flash(el, i);
                open(PIECES[data.piece].kind === "rock" ? { kind: "modify", spot: i } : { kind: "detail", spot: i });
            }
            break;
        case "replace": open({ kind: "replace", spot: i }); break;
        case "modify": open({ kind: "modify", spot: i }); break;
        case "remove":
            clearSpot(i);
            open(null);
            break;
        case "trait":
            if (toggleTrait(i, data.trait)) flash(el, i);
            break;
        case "ocean":
            open(null);
            focusSchool(data.species);
            goTo("aquatic", "ocean");
            break;
    }
}

function flash(el, i) {
    const spot = el.querySelector(`.reef-spot[data-spot="${i}"]`);
    if (!spot) return;
    spot.classList.remove("placed");
    void spot.offsetWidth;
    spot.classList.add("placed");
}


//    !!! PAINTING !!!

function paint(el) {
    const s = reefState();
    const live = reefOpen();
    const report = habitatReport(s);

    setClass(el, "bare", !live);
    if (!live) view = null;

    paintSpots(el, s, report);
    paintEvents(el, s, report);
    paintWindow(el, s, report);
    syncFish(el);

    const unmet = activeEvents(s).some(event => !eventAnswered(event, report));
    setClass(el.querySelector(".reef-book"), "alert", unmet);
}

function paintSpots(el, s, report) {
    const count = siteCount(s);
    // Past the widest site, with room so the compendium never covers one
    const reach = (front) => SITES.slice(0, count).reduce((most, site) =>
        Math.max(most, Math.abs(site.x) + 0.95 * (0.72 + 0.28 * site.y) + (site.y > 0.75 ? front : 0)), 0);
    const first = el.querySelector(".reef-spot");
    const u = first.offsetWidth / (1.9 * (0.72 + 0.28 * SITES[0].y));
    const scroller = el.querySelector(".reef-view");
    const span = 2 * (reach(0) + 0.2);
    const wide = u > 0 && span * u > scroller.clientWidth;
    const book = el.querySelector(".reef-book");
    const clear = wide ? Math.max(0, (book.offsetLeft + book.offsetWidth) / u - 0.1) : 0;
    setVar(el.querySelector(".reef-world"), "--span", (wide ? 2 * (reach(clear) + 0.2) : span).toFixed(2));

    el.querySelectorAll(".reef-spot").forEach(button => {
        const i = Number(button.dataset.spot);
        setDisplay(button, i < count);
        if (i >= count) return;

        const spot = spotAt(i, s);
        const uses = report.uses[i] || [];
        const sig = spot ? `${spot.piece}:${spot.traits.join(",")}` : "";
        setClass(button, "empty", !spot);
        setClass(button, "chosen", view?.spot === i && view.kind !== "book");
        setAttr(button, "data-size", spot ? PIECES[spot.piece].size || "kelp" : "");

        const piece = button.querySelector(".reef-piece");
        if (piece.dataset.sig !== sig) {
            piece.dataset.sig = sig;
            piece.innerHTML = spot ? pieceArt(PIECES[spot.piece], spot.traits) : "";
        }

        const pipSig = uses.map(use => ownerSpecies(use.group)).join(",");
        const pips = button.querySelector(".reef-pips");
        if (pips.dataset.sig !== pipSig) {
            pips.dataset.sig = pipSig;
            pips.innerHTML = uses.map(use =>
                `<span style="--c:${speciesColor(ownerSpecies(use.group))}"></span>`).join("");
        }

        const title = !spot ? "Empty site"
            : [PIECES[spot.piece].name, ...spot.traits.map(id => TRAITS[id].name)].join(", ");
        setAttr(button, "title", title);
    });
}

const eventOf = (group) => activeEvents().find(event => `event:${event.id}` === group);
const ownerSpecies = (group) => group.startsWith("event:") ? eventOf(group)?.species : group;

function paintEvents(el, s, report) {
    const box = el.querySelector(".reef-events");
    const events = activeEvents(s);
    const sig = events.map(event => `${event.id}:${eventAnswered(event, report)}`).join("|");
    if (box.dataset.sig !== sig) {
        box.dataset.sig = sig;
        box.innerHTML = events.map(event => `
            <span class="reef-event ${eventAnswered(event, report) ? "met" : ""}"
                style="--c:${speciesColor(event.species)}">
                <span class="reef-event-dot"></span>
                <span class="reef-event-name">${speciesName(event.species)}: ${eventDef(event).name}</span>
                <span class="reef-event-clock" data-clock="${event.id}"></span>
            </span>`).join("");
    }
    paintClocks(box, events);
}

const paintClocks = (root, events = activeEvents()) => {
    root.querySelectorAll("[data-clock]").forEach(span => {
        const event = events.find(e => e.id === span.dataset.clock);
        setText(span, event ? clockText(Math.max(0, event.left)) : "");
    });
};


//    !!! THE WINDOWS !!!

const TITLES = {
    pick: () => "Choose a habitat piece",
    replace: (i) => `Replace the ${PIECES[spotAt(i).piece].name}`,
    detail: (i) => PIECES[spotAt(i).piece].name,
    modify: (i) => `Shape the ${PIECES[spotAt(i).piece].name}`,
    book: () => "Compendium",
};

const BODIES = {
    pick: pickerHtml,
    replace: pickerHtml,
    detail: detailHtml,
    modify: modifyHtml,
    book: (i, s, report) => bookHtml(s, report),
};

function paintWindow(el, s, report) {
    const wrap = el.querySelector(".reef-window-wrap");
    const shade = el.querySelector(".reef-shade");

    // A window onto a site that has since been emptied, or filled, has nothing left to show
    if (view && view.kind !== "book") {
        const spot = spotAt(view.spot, s);
        const wantsSpot = view.kind !== "pick";
        if (view.spot >= siteCount(s) || wantsSpot !== !!spot) view = null;
    }

    if (wrap.hidden !== !view) wrap.hidden = shade.hidden = !view;
    if (!view) return;

    const win = wrap.querySelector(".reef-window");
    setAttr(win, "data-kind", view.kind);
    setText(wrap.querySelector(".reef-window-title"), TITLES[view.kind](view.spot));
    setDisplay(wrap.querySelector(".reef-back"), view.kind === "modify" || view.kind === "replace");

    const body = wrap.querySelector(".reef-window-body");
    const html = BODIES[view.kind](view.spot, s, report);
    if (body.dataset.html !== html) {
        body.dataset.html = html;
        body.innerHTML = html;
    }
    paintClocks(body);
    body.querySelectorAll("[data-settled-boost]").forEach(span =>
        setText(span, formatNumber(settledMultiplier(span.dataset.settledBoost, s))));
    body.querySelectorAll("[data-settled-time]").forEach(span =>
        setText(span, clockText(settledStreak(span.dataset.settledTime, s))));
    const next = body.querySelector("[data-next-event]");
    if (next) setText(next, clockText(nextEventIn(s)));
}

const sizeLine = (piece) => {
    const size = SIZES[piece.size];
    return size ? `${size.name}, ${size.slots} characteristic${size.slots === 1 ? "" : "s"}` : "Kelp, can't be shaped";
};

function pickerHtml(i, s) {
    const current = spotAt(i, s);
    return `
        <div class="reef-cards">
            ${PIECE_IDS.map(id => {
                const piece = PIECES[id];
                const locked = !isUnlocked(id, s);
                const here = current && current.piece === id;
                const poor = !locked && !canAfford(piece.cost);
                const state = locked ? "locked" : here ? "here" : poor ? "poor" : "";
                return `
                <button class="reef-card ${state} ${locked || here || poor ? "inactive" : ""}" type="button"
                    data-act="place" data-piece="${id}">
                    <span class="reef-card-art" data-size="${piece.size || "kelp"}">
                        ${locked ? "" : pieceArt(piece)}
                    </span>
                    <span class="reef-card-name">${locked ? "???" : piece.name}</span>
                    <span class="reef-card-note">${locked ? sizeLine(piece).split(",")[0] : sizeLine(piece)}</span>
                    <span class="reef-card-cost">${locked ? `Unlock: ${unlockHint(id)}`
                        : here ? "Already here" : costHtml(piece.cost, true)}</span>
                </button>`;
            }).join("")}
        </div>
        ${current ? `<p class="reef-small">Whatever was here, and its characteristics, is refunded.</p>` : ""}`;
}

const groupLabel = (group) => {
    if (!group.startsWith("event:")) return speciesName(group);
    const event = eventOf(group);
    return event ? `${speciesName(event.species)} (${eventDef(event).name})` : "";
};

function detailHtml(i, s, report) {
    const spot = spotAt(i, s);
    const piece = PIECES[spot.piece];
    const uses = report.uses[i] || [];
    const traits = spot.traits.length
        ? spot.traits.map(id => `<span class="reef-chip">${TRAITS[id].name}</span>`).join("")
        : piece.kind === "rock" ? `<span class="reef-small">No characteristics yet.</span>` : "";

    return `
        <div class="reef-detail">
            <div class="reef-detail-art" data-size="${piece.size || "kelp"}">${pieceArt(piece, spot.traits)}</div>
            <div class="reef-detail-info">
                <div class="reef-small">${sizeLine(piece)}</div>
                <div class="reef-chips">${traits}</div>
                <div class="reef-housing">
                    ${uses.length ? uses.map(use => `
                        <div class="reef-house" style="--c:${speciesColor(ownerSpecies(use.group))}">
                            <span class="reef-house-dot"></span>${groupLabel(use.group)}
                            <span class="reef-small">${use.trait ? TRAITS[use.trait].name.toLowerCase() : piece.name.toLowerCase()}</span>
                        </div>`).join("")
                        : `<span class="reef-small">Nothing is living here yet.</span>`}
                </div>
            </div>
        </div>
        <div class="reef-actions">
            <button class="reef-button" type="button" data-act="replace">Replace</button>
            <button class="reef-button ${piece.kind === "rock" ? "" : "inactive"}" type="button" data-act="modify">Modify</button>
            <button class="reef-button danger" type="button" data-act="remove">Remove</button>
        </div>`;
}

function modifyHtml(i, s) {
    const spot = spotAt(i, s);
    const piece = PIECES[spot.piece];
    const room = slotsOf(spot.piece);

    return `
        <div class="reef-detail">
            <div class="reef-detail-art" data-size="${piece.size}">${pieceArt(piece, spot.traits)}</div>
            <div class="reef-detail-info">
                <div class="reef-slots">${Array.from({ length: room }, (_, k) =>
                    `<span class="${k < spot.traits.length ? "full" : ""}"></span>`).join("")}
                    <span class="reef-small">${spot.traits.length} / ${room} characteristics</span>
                </div>
                <div class="reef-small">Taking one off refunds it.</div>
            </div>
        </div>
        <div class="reef-traits">
            ${TRAIT_IDS.map(id => {
                const trait = TRAITS[id];
                const cost = traitCost(spot.piece, id);
                const on = spot.traits.includes(id);
                const locked = !isUnlocked(id, s);
                const clash = !on && traitBlocked(spot, id);
                const full = !on && spot.traits.length >= room;
                const poor = !on && !canAfford(cost);
                const note = on ? "On. Click to take off"
                    : locked ? `Unlock: ${unlockHint(id)}`
                    : clash ? `Can't be ${TRAITS[trait.clash].name.toLowerCase()} too`
                    : full ? "No room left on this rock"
                    : costHtml(cost, true);
                const off = !on && (locked || clash || full || poor);
                return `
                <button class="reef-trait ${on ? "on" : ""} ${locked ? "locked" : ""} ${off ? "inactive" : ""}"
                    type="button" data-act="trait" data-trait="${id}">
                    <span class="reef-trait-name">${locked ? "???" : trait.name}</span>
                    <span class="reef-trait-blurb">${locked ? "" : trait.blurb}</span>
                    <span class="reef-trait-note">${note}</span>
                </button>`;
            }).join("")}
        </div>`;
}

const needRow = (report, group, n, index) => {
    const have = Math.min(n.count, needProgress(report, group, index));
    const done = have >= n.count;
    return `<li class="${done ? "done" : ""}"><span class="reef-tick">${done ? "&#10003;" : ""}</span>
        ${needText(n)}<span class="reef-count">${have}/${n.count}</span></li>`;
};

function speciesEntry(id, s, report) {
    const known = unlockedSpecies().includes(id);
    const habitat = HABITAT[id];
    const boost = habitat.boost;
    if (!known) {
        return `
        <div class="reef-entry unknown">
            <div class="reef-entry-fish" style="--school-color:#46586a">${fishArt(id)}</div>
            <div class="reef-entry-main">
                <div class="reef-entry-name">???</div>
                <div class="reef-small">Not found yet. It comes to the reef once it's in the Ocean.</div>
            </div>
        </div>`;
    }

    const settled = !!report.met[id];
    const event = activeEvents(s).find(e => e.species === id);
    const answered = event && eventAnswered(event, report);
    const eventBlock = event ? `
        <div class="reef-entry-event ${answered ? "met" : ""}">
            <div class="reef-entry-event-head">
                <b>${eventDef(event).name}</b>
                <span class="reef-event-clock" data-clock="${event.id}"></span>
            </div>
            <div class="reef-small">${eventDef(event).blurb}</div>
            <ul class="reef-needs">${eventDef(event).needs.map((n, k) =>
                needRow(report, `event:${event.id}`, n, k)).join("")}</ul>
            <div class="reef-entry-verdict">${answered ? `${boost.name} is active`
                : settled ? "Meet these as well to get the boost" : `Settle the ${speciesName(id)} first`}</div>
        </div>` : "";

    const home = habitat.settled;
    return `
        <div class="reef-entry ${settled ? "settled" : ""}">
            <div class="reef-entry-side">
                <div class="reef-entry-fish" style="--school-color:${speciesColor(id)}">${fishArt(id)}</div>
                <button class="reef-entry-go" type="button" data-act="ocean" data-species="${id}"
                    title="See the ${speciesName(id)} in the Ocean">Ocean &#8250;</button>
            </div>
            <div class="reef-entry-main">
                <div class="reef-entry-name">${speciesName(id)}
                    <span class="reef-pill">${settled ? "Settled" : "Unsettled"}</span></div>
                <ul class="reef-needs">${habitat.needs.map((n, k) => needRow(report, id, n, k)).join("")}</ul>
                <div class="reef-entry-boost ${settled ? "on" : ""}">
                    <b>${home.name}</b>: ${resourceLabel(home.resource)} x<span data-settled-boost="${id}"></span>
                    while it stays settled, growing toward x${formatNumber(settledMax(id))} the longer it does.
                    ${settled ? `Settled for <span data-settled-time="${id}"></span>.` : ""}
                </div>
                <div class="reef-entry-boost ${answered ? "on" : ""}">
                    <b>${boost.name}</b>: ${resourceLabel(boost.resource)} x${formatNumber(boostMultiplier(id))}
                    while one of its events is answered.
                </div>
                ${eventBlock}
            </div>
        </div>`;
}

const unlockRow = (id, name) => isUnlocked(id)
    ? `<li class="done"><span class="reef-tick">&#10003;</span>${name}</li>`
    : `<li><span class="reef-tick"></span>??? <span class="reef-small">${unlockHint(id)}</span></li>`;

function bookHtml(s, report) {
    const settled = unlockedSpecies().filter(id => report.met[id]).length;
    const sites = siteCount(s);
    return `
        <div class="reef-book-summary reef-small">
            ${settled} settled, ${sites} site${sites === 1 ? "" : "s"} open.
            Next event in <span data-next-event></span>, with up to ${eventRoom(s)} at once.
        </div>
        ${HABITAT_IDS.map(id => speciesEntry(id, s, report)).join("")}
        <div class="reef-entry-name reef-book-heading">Habitat</div>
        <div class="reef-unlocks">
            <ul class="reef-needs">${PIECE_IDS.map(id => unlockRow(id, PIECES[id].name)).join("")}</ul>
            <ul class="reef-needs">${TRAIT_IDS.map(id => unlockRow(id, TRAITS[id].name)).join("")}</ul>
        </div>`;
}


//    !!! THE FISH !!!

// Fish x runs across, y from far (0) to near (1), so they pass behind nearer pieces
const fish = new Map();
const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const remPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
const depthScale = (y) => 0.55 + 0.45 * clamp01((y + 0.3) / 1.3);

const setDepth = (f, y) => {
    f.y = y;
    setVar(f.el, "--s", depthScale(y).toFixed(3));
    f.el.style.zIndex = depthZ(y);
};

const newCourse = (f) => {
    f.speed = 1.3 + Math.random() * 1.1;
    f.lift = 0.3 + Math.random() * 0.55;
    setVar(f.el, "--lift", f.lift.toFixed(2));
    setDepth(f, -0.25 + Math.random() * 1.2);
    f.turnIn = 10 + Math.random() * 16;
};

function syncFish(el) {
    const bed = el.querySelector(".reef-bed");
    const wanted = new Set(reefOpen() ? unlockedSpecies() : []);
    for (const [id, f] of fish) {
        if (wanted.has(id) && f.el.isConnected && bed.contains(f.el)) continue;
        f.el.remove();
        fish.delete(id);
    }
    for (const id of wanted) {
        if (fish.has(id)) continue;
        const node = document.createElement("div");
        node.className = "reef-fish";
        node.style.setProperty("--school-color", speciesColor(id));
        node.innerHTML = `<span class="reef-fish-shadow"></span><span class="reef-fish-body">${fishArt(id)}</span>`;
        const f = { el: node, body: node.lastChild, x: 0.15 + Math.random() * 0.7, dir: Math.random() < 0.5 ? -1 : 1, phase: Math.random() * 6 };
        newCourse(f);
        fish.set(id, f);
        bed.appendChild(node);
        move(f, 0, bed.clientWidth, bed.clientHeight, remPx());
    }
}

function move(f, dt, w, h, rem) {
    if (w > 0) f.x += f.dir * f.speed * rem * depthScale(f.y) * dt / w;
    f.phase += dt * 1.6;
    const bob = Math.sin(f.phase) * 0.25;
    f.el.style.transform = `translate3d(${(f.x * w).toFixed(1)}px, ${(f.y * h).toFixed(1)}px, 0)`;
    f.body.style.transform = `translate(-50%, calc(-50% - var(--lift) * var(--reef-u) * var(--s) + ${bob.toFixed(2)}rem))`
        + ` scaleX(${f.dir > 0 ? -1 : 1})`;
}

// Off either edge the fish comes back round at a new depth; turning mid-reef keeps its depth
let shown = null;
const startSwim = frameLoop(() => shown, (dt) => {
    const bed = shown.querySelector(".reef-bed");
    keepCentered(shown, shown.querySelector(".reef-view"));
    const still = reducedMotion();
    const w = bed.clientWidth;
    const h = bed.clientHeight;
    const rem = remPx();
    for (const f of fish.values()) {
        f.turnIn -= dt;
        if (f.x < -0.04 || f.x > 1.04) {
            f.dir = f.x < 0 ? 1 : -1;
            newCourse(f);
        } else if (f.turnIn <= 0 && f.x > 0.15 && f.x < 0.85) {
            f.dir = -f.dir;
            f.turnIn = 10 + Math.random() * 16;
        }
        move(f, still ? 0 : dt, w, h, rem);
    }
    return true;
}, () => {
    if (shown?.isConnected) return;
    for (const f of fish.values()) f.el.remove();
    fish.clear();
});
