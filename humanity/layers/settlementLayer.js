// settlementLayer.js
//
// Humanity's landing page: every founded settlement, one at a time

import { registerLayer, resourceDefs } from "../../../core/registry.js";
import { switchToLayer } from "../../../render/canvasRouter.js";
import { setText, setDisplay, setWidth, setClass, setVar } from "../../../utils/dom.js";
import { setRichText, namedResourceSpan } from "../../../render/richText.js";
import { formatNumber, formatWhole, clockText } from "../../../utils/format.js";
import {
    settlementState, settlements, activeSettlement, economy, tickSettlements,
    TYPES, QUALITY, JOBS, PROJECTS, knownLimit, sizeOf, nextSize, borderColor,
    jobFor, upgradedJobs, working, building, jobYield, canAssign, canUnassign, assign, unassign,
    projectsOffered, projectNeed, projectProgress, projectPaid, projectEssence, builders, canAddBuilder, addBuilder,
    removeBuilder, shelter, foundCost, foundMaterials, canPayFounding, away, isDiscovery, discoveryName, projectsDone, projectMaterials, ROLES,
    tended,
} from "../systems/settlements.js";
import {
    tickExpeditions, expeditionsOpen, expeditionLeft, expeditionTotal, expeditionElapsed, expeditionCarrying, expeditionSpot,
    chooseEvent, EVENTS, EVENT_WAIT,
} from "../systems/expeditions.js";
import { TERRAIN, tileKind, worldState } from "../../main/systems/worldMap.js";
import { villageScene, dwellingsFor } from "../art/settlementArt.js";
import { checkKnowledge } from "../systems/knowledge.js";
import { checkLanguage } from "../systems/language.js";
import { notionsText } from "../sublayers/innovationSublayer.js";

function startSiting() {
    const s = settlementState();
    s.siting = true;
    s.siteChoice = null;
    s.plan = null;
    switchToLayer("world");
}

function startPlanning(t) {
    const s = settlementState();
    s.siting = false;
    s.plan = { id: t.id, route: [], people: t.lastExpedition?.people || 1 };
    switchToLayer("world");
}

const chip = (text, color, tip, cls = "") =>
    `<span class="settle-chip ${cls}" style="--chip:${color}" data-tip="${tip}">${text}</span>`;
export const qualityChip = (id) => {
    const q = QUALITY[id];
    return chip(q.name, q.color, `${q.name} land: ${Math.round(q.output * 100)}% food, ${Math.round(q.growth * 100)}% growth`,
        "is-quality");
};
const typeTip = (type, types) => [
    ...upgradedJobs(type).map(id => {
        const role = JOBS[id].role;
        const base = JOBS[jobFor({ types: [] }, role)].name;
        const used = jobFor({ types }, role);
        return used === id ? `${base}s become ${JOBS[id].name}s` : `${base}s would become ${JOBS[id].name}s, but here they are ${JOBS[used].name}s`;
    }),
    TYPES[type].text,
].filter(Boolean).join(". ");
export const typeChips = (types) => types.map(type => chip(TYPES[type].name, TYPES[type].color, typeTip(type, types))).join("");
const tendedChip = (times) => chip(`Tended x${times}`, "#9ccf6a",
    `Its people tend the land: its seven tiles make x${times} of everything. More people tend it better`);

const rate = (value) => Math.abs(value) >= 1000 ? formatNumber(value)
    : String(Number(Number(value.toPrecision(Math.abs(value) >= 10 ? 3 : 2)).toFixed(3)));
const signed = (value) => `${value >= 0 ? "+" : ""}${rate(value)}`;
const briefOf = (id) => resourceDefs[id]?.brief || resourceDefs[id]?.name || id[0].toUpperCase() + id.slice(1);
const costText = (cost) => Object.keys(cost)
    .map(id => namedResourceSpan(id, `${formatNumber(cost[id])} ${briefOf(id)}`)).join(", ");
export const countText = (amounts) => Object.keys(amounts)
    .map(id => namedResourceSpan(id, `${formatWhole(amounts[id])} ${id}`)).join(", ");
const TOO_MUCH = " (more than can be stored)";
const unstorable = (t, materials) => !!t && materials > economy(t).materialStore;
export const foundingText = () => [costText(foundCost()),
    foundMaterials() && countText({ materials: foundMaterials() }) + (unstorable(activeSettlement(), foundMaterials()) ? TOO_MUCH : "")]
    .filter(Boolean).join(", ");
const yieldText = (each) => Object.keys(each)
    .map(id => namedResourceSpan(id, `${rate(each[id])} ${briefOf(id)}`)).join(", ");

const stepper = (act, id) => `
    <button class="settle-step" data-act="${act}-less" data-id="${id}">-</button>
    <span class="task-count"></span>
    <button class="settle-step" data-act="${act}-more" data-id="${id}">+</button>`;

const PAGE = `
    <div class="settle-page">
        <div class="settle-tabs"></div>
        <div class="settle-empty">
            <h2>No one has settled yet</h2>
            <p>Every settlement starts somewhere. Pick a spot on the world map: dry ground, with its six neighbors
               claimed, and enough around it to live on. The land it's founded on decides what it becomes.</p>
            <button class="settle-button is-primary" data-act="find">Find a place to settle</button>
        </div>
        <div class="settle-body">
            <div class="settle-head">
                <div class="settle-art"></div>
                <div class="settle-title">
                    <div>
                        <h2 class="settle-name"></h2>
                        <div class="settle-size"><span class="size-name"></span><span class="size-next"></span></div>
                    </div>
                    <div class="settle-chips"></div>
                </div>
            </div>
            <div class="settle-stats">
                <div class="settle-stat" data-stat="population">
                    <span class="stat-label">Population</span><span class="stat-value"></span>
                    <div class="stat-bar"><div class="stat-fill"></div></div><span class="stat-sub"></span>
                </div>
                <div class="settle-stat" data-stat="food">
                    <span class="stat-label">Food</span><span class="stat-value"></span><span class="stat-sub"></span>
                </div>
                <div class="settle-stat" data-stat="water">
                    <span class="stat-label">Water</span><span class="stat-value"></span><span class="stat-sub"></span>
                </div>
                <div class="settle-stat" data-stat="shelter">
                    <span class="stat-label">Shelter</span><span class="stat-value"></span><span class="stat-sub"></span>
                </div>
                <div class="settle-stat" data-stat="materials">
                    <span class="stat-label">Materials</span><span class="stat-value"></span><span class="stat-sub"></span>
                </div>
            </div>
            <div class="settle-grid">
                <section class="settle-card">
                    <h3>Jobs <span class="card-note task-note"></span></h3>
                    <div class="task-list"></div>
                </section>
                <section class="settle-card">
                    <h3>Projects <span class="card-note">more hands, faster work</span></h3>
                    <div class="project-list"></div>
                </section>
                <section class="settle-card exp-card">
                    <h3>Expeditions <span class="card-note exp-note"></span></h3>
                    <div class="exp-home">
                        <p class="exp-about">Send people out along a route of your choosing. They bring back food and
                           materials from the land they cross, and learn things nobody here could learn at home.</p>
                        <button class="settle-button is-primary" data-act="plan">Plan an expedition</button>
                    </div>
                    <div class="exp-out">
                        <div class="exp-status"><span class="exp-where"></span><span class="exp-left"></span></div>
                        <div class="stat-bar"><div class="stat-fill"></div></div>
                        <div class="exp-status"><span class="exp-carry"></span>
                            <button class="settle-button" data-act="map">Show on map</button></div>
                        <div class="exp-event">
                            <p class="exp-event-text"></p>
                            <div class="exp-options"></div>
                            <span class="exp-event-wait"></span>
                        </div>
                    </div>
                    <div class="exp-log"></div>
                    <div class="exp-learning"></div>
                </section>
            </div>
        </div>
    </div>`;

function onClick(event) {
    const target = event.target.closest("[data-act]");
    if (!target) return;
    const s = settlementState();
    const t = activeSettlement();
    const { act, id, index } = target.dataset;

    if (act === "find" || act === "found-another") return startSiting();
    if (act === "tab") { s.activeSettlement = Number(index); return; }
    if (!t) return;
    if (act === "job-more") assign(t, id);
    else if (act === "job-less") unassign(t, id);
    else if (act === "project-more") addBuilder(t, id);
    else if (act === "project-less") removeBuilder(t, id);
    else if (act === "plan") startPlanning(t);
    else if (act === "map") switchToLayer("world");
    else if (act === "event") chooseEvent(t, Number(index));
}

function renderTabs(el) {
    const list = settlements();
    const s = settlementState();
    const key = JSON.stringify([list.map(t => t.name + t.hue), s.activeSettlement]);
    if (el.__key !== key) {
        el.__key = key;
        el.innerHTML = list.map((t, i) =>
            `<button class="settle-tab${i === s.activeSettlement ? " is-active" : ""}" style="--hue:${borderColor(t)}"
                data-act="tab" data-index="${i}">${t.name}</button>`
        ).join("") + `<button class="settle-tab is-new" data-act="found-another">+ Found another
            <span class="tab-cost"></span></button>`;
    }
    setRichText(el.querySelector(".tab-cost"), foundingText());
    setClass(el.querySelector(".is-new"), "is-short", !canPayFounding());
}

function renderHead(el, t) {
    const size = sizeOf(t);
    const { dwelling, shown } = dwellingsFor(size.name, t.pops);
    const key = JSON.stringify([t.id, dwelling, shown, t.types]);
    if (el.__key !== key) {
        el.__key = key;
        el.querySelector(".settle-art").innerHTML = villageScene(t, shown, dwelling);
    }
    const chips = el.querySelector(".settle-chips");
    const care = tended(t).toFixed(1);
    const chipKey = t.quality + t.types.join() + care;
    if (chips.__key !== chipKey) {
        chips.__key = chipKey;
        chips.innerHTML = qualityChip(t.quality) + typeChips(t.types) + tendedChip(care);
    }
    const next = nextSize(t);
    const limit = knownLimit(t);
    setText(el.querySelector(".size-name"), size.name);
    setText(el.querySelector(".size-next"), !next ? ""
        : next.from > limit ? `${next.name} at ${formatWhole(next.from)} population, but nobody knows yet `
            + `how to keep more than ${limit} together`
            : `${next.name} at ${formatWhole(next.from)} population`);
    setText(el.querySelector(".settle-name"), t.name);
    setClass(el.querySelector(".settle-art"), "is-unrest", !!t.starving);
}

function renderStats(el, t, e) {
    const cell = (name) => el.querySelector(`[data-stat="${name}"]`);
    const stat = (name, value, sub, bad) => {
        const c = cell(name);
        setRichText(c.querySelector(".stat-value"), value);
        setText(c.querySelector(".stat-sub"), sub);
        setClass(c, "is-bad", bad);
    };

    const growth = t.growth;
    setWidth(cell("population").querySelector(".stat-fill"), Math.abs(growth));
    stat("population", formatWhole(t.pops),
        t.starving ? "Starving: people are dying"
            : growth < 0 ? "Recovering from hunger"
                : t.pops >= knownLimit(t) ? "As many as anyone knows how to live with"
                    : t.pops >= e.limit ? "Out of shelter"
                        : e.growth <= 0 ? "No spare food to grow on"
                            : `Grows in ${clockText((1 - growth) / e.growth)}`,
        t.starving || growth < 0);

    stat("food", namedResourceSpan("food", `${signed(e.food)}/s`),
        `${rate(t.food)} / ${rate(e.storage)} stored`, e.food < 0);

    stat("water", `${signed(e.waterNet)}/s`,
        e.waterRatio < 1 ? `Ran dry: work at ${Math.round(e.thirst * 100)}%, growth nearly stops`
            : `${rate(t.water)} / ${rate(e.waterStore)} stored`
                + (e.soaked >= 0.01 ? `, +${rate(e.soaked)}/s from wet ground` : ""),
        e.waterNet < 0);

    stat("shelter", formatWhole(e.limit),
        shelter(t) >= knownLimit(t) ? "As many as anyone knows how to keep together"
            : t.pops >= e.limit ? "Full: build more shelter"
                : `Room for ${formatWhole(e.limit - t.pops)} more`,
        false);

    stat("materials", `${signed(e.materials)}/s`, `${rate(t.materials)} / ${rate(e.materialStore)} stored`, false);
}

function renderTasks(el, t, e) {
    const list = el.querySelector(".task-list");
    const key = `${t.id}:${ROLES.map(role => e.jobs[role]).join()}`;
    if (list.__key !== key) {
        list.__key = key;
        list.innerHTML = ROLES.map(role => {
            const id = e.jobs[role];
            return `
                <div class="task-row" data-role="${role}" title="${JOBS[id].text}">
                    <div class="task-info">
                        <span class="task-name">${JOBS[id].name}</span>
                        <span class="task-what"></span>
                    </div>
                    ${role === "gather" ? `<span class="task-count"></span>` : stepper("job", role)}
                </div>`;
        }).join("");
    }
    for (const row of list.children) {
        const role = row.dataset.role;
        const count = working(t, role);
        const room = e.room[role];
        setText(row.querySelector(".task-count"), formatWhole(count));
        setRichText(row.querySelector(".task-what"), `${yieldText(jobYield(t, e.jobs[role]))} each`
            + (room == null ? "" : count > room ? `, a quarter past ${room}` : `, room for ${room}`));
        if (role === "gather") continue;
        row.querySelector('[data-act="job-less"]').disabled = !canUnassign(t, role);
        row.querySelector('[data-act="job-more"]').disabled = !canAssign(t, role);
    }
    const busy = building(t);
    setText(el.querySelector(".task-note"), [busy && `${busy} on projects`, away(t) && `${away(t)} away`].filter(Boolean).join(", "));
}

function renderProjects(el, t, e) {
    const list = el.querySelector(".project-list");
    const ids = projectsOffered(t);
    const key = JSON.stringify([t.id, ids]);
    if (list.__key !== key) {
        list.__key = key;
        list.innerHTML = ids.length === 0 ? `<p class="project-empty">Nothing more to work on for now.</p>`
            : ids.map(id => `
                <div class="project-row" data-id="${id}">
                    <div class="project-info">
                        <span class="project-name">${PROJECTS[id].name}</span>
                        <span class="project-text">${PROJECTS[id].text}</span>
                        <div class="stat-bar"><div class="stat-fill"></div></div>
                        <span class="project-meta"></span>
                    </div>
                    ${stepper("project", id)}
                </div>`).join("");
    }
    for (const row of list.querySelectorAll(".project-row")) {
        const id = row.dataset.id;
        const hands = builders(t, id);
        const need = projectNeed(t, id);
        const left = need - projectProgress(t, id);
        setClass(row, "is-active", hands > 0);
        setWidth(row.querySelector(".stat-fill"), 1 - left / need);
        setText(row.querySelector(".task-count"), formatWhole(hands));
        setRichText(row.querySelector(".project-meta"),
            hands > 0 ? `${clockText(left / (hands * e.thirst))} left`
                : projectPaid(t, id) ? `${clockText(left)} of work left with one worker`
                    : `${clockText(need)} of work with one worker. Starting costs ${startCost(t, id)}`);
        row.querySelector('[data-act="project-less"]').disabled = hands === 0;
        row.querySelector('[data-act="project-more"]').disabled = !canAddBuilder(t, id);
    }
}

function startCost(t, id) {
    const materials = projectMaterials(t, id);
    const text = costText(projectEssence(t, id));
    if (!materials) return text;
    const note = unstorable(t, materials) ? TOO_MUCH
        : t.materials < materials ? ` (${formatWhole(t.materials)} stored)` : "";
    return `${text}, ${countText({ materials })}${note}`;
}

const placeName = (kind) => TERRAIN[kind]?.name.toLowerCase() || kind;
const optionHint = (option) => [
    option.time && `+${clockText(option.time)}`,
    option.food && `+${option.food} food`,
    option.materials && `+${option.materials} materials`,
    option.learn && "learn something",
].filter(Boolean).join(", ");

function renderExpedition(el, t) {
    const ex = t.expedition;
    const open = expeditionsOpen(t) || !!ex;
    setDisplay(el, open);
    if (!open) return;
    setDisplay(el.querySelector(".exp-home"), !ex);
    setDisplay(el.querySelector(".exp-out"), !!ex);
    setText(el.querySelector(".exp-note"), ex ? `${ex.people} out on a ${ex.route.length}-tile route` : "");

    if (ex) {
        const spot = expeditionSpot(t);
        const route = [null, ...ex.route];
        const here = route[spot.frac < 0.5 ? spot.index : spot.index + 1];
        const where = here ? placeName(tileKind(worldState(), here)) : "home ground";
        setText(el.querySelector(".exp-where"), ex.busy > 0 ? `Stopped on ${where}`
            : `${spot.back ? "Coming home" : "Heading out"} across ${where}`);
        setText(el.querySelector(".exp-left"), `${clockText(expeditionLeft(t))} left`);
        setWidth(el.querySelector(".exp-out .stat-fill"), expeditionElapsed(t) / expeditionTotal(t));
        const carrying = expeditionCarrying(t);
        setRichText(el.querySelector(".exp-carry"), `Carrying ${countText({ food: carrying.food, materials: carrying.materials })}`
            + (carrying.full ? ", all they can hold" : ""));

        const box = el.querySelector(".exp-event");
        setDisplay(box, !!ex.event);
        if (ex.event) {
            const def = EVENTS[ex.event.index];
            const options = box.querySelector(".exp-options");
            const key = `${ex.event.index}:${ex.event.tile}`;
            if (options.__key !== key) {
                options.__key = key;
                options.innerHTML = def.options.map((option, i) => `
                    <button class="settle-button exp-option" data-act="event" data-index="${i}">
                        ${option.label}<span class="exp-hint">${optionHint(option) || "carry on"}</span>
                    </button>`).join("");
            }
            setText(box.querySelector(".exp-event-text"), def.text);
            setText(box.querySelector(".exp-event-wait"),
                `They'll carry on in ${clockText(EVENT_WAIT - ex.event.waited)} if nobody decides`);
        }
    }

    const last = t.lastExpedition;
    const lines = ex ? ex.log.slice(-3)
        : last ? [`The last expedition came home with ${countText({ food: last.food, materials: last.materials })}`
            + `${last.full ? ", all they could carry" : ""}.`
            + (last.finished.length ? ` They learned ${last.finished.map(discoveryName).join(", ")}.` : "")
            + (last.notions ? ` Notions: ${notionsText(last.notions.notions)}.` : ""),
            ...last.log.slice(-3)] : [];
    const log = el.querySelector(".exp-log");
    const logKey = lines.join("|");
    if (log.__key !== logKey) {
        log.__key = logKey;
        log.innerHTML = lines.map(line => `<p>${line}</p>`).join("");
    }

    const learning = Object.keys(PROJECTS).filter(id => isDiscovery(id) && !projectsDone(t, id)
        && projectProgress(t, id) > 0 && !projectsOffered(t).includes(id));
    const list = el.querySelector(".exp-learning");
    const listKey = learning.join();
    if (list.__key !== listKey) {
        list.__key = listKey;
        list.innerHTML = learning.length === 0 ? "" : `<span class="exp-learning-head">Partly learned</span>` + learning.map(id => `
            <div class="exp-learned" data-id="${id}" title="${PROJECTS[id].text}">
                <span>${discoveryName(id)}</span><div class="stat-bar"><div class="stat-fill"></div></div>
            </div>`).join("");
    }
    for (const row of list.querySelectorAll(".exp-learned")) {
        setWidth(row.querySelector(".stat-fill"), projectProgress(t, row.dataset.id) / projectNeed(t, row.dataset.id));
    }
}


//    !!! LOST TO TIME !!!

function showFallen() {
    const s = settlementState();
    const lost = s.fallen[0];
    const overlay = document.createElement("div");
    overlay.className = "settle-fallen";
    overlay.innerHTML = `
        <div class="fallen-box">
            <div class="fallen-kicker">Lost to time</div>
            <h2 class="fallen-name">${lost.name}</h2>
            <p>The last of its people are gone. At its largest its population was ${formatWhole(lost.peak)},
               and it stood for ${clockText(lost.age)}. Grass will cover the hearths, and no one will remember its name.</p>
            <button class="settle-button" data-act="close">Let it rest</button>
        </div>`;
    overlay.querySelector('[data-act="close"]').addEventListener("click", () => {
        s.fallen.shift();
        overlay.remove();
    });
    document.body.appendChild(overlay);
}

registerLayer("settlement", {
    categoryId: "humanity",
    group: "settled",
    name: "Settlement",
    color: "#e2a55a",
    canvasType: "static",
    canvasClass: "settlement-canvas",
    order: 0,
    startUnlocked: false,

    resources: ["greenEssence", "blueEssence"],

    initialState: {
        settlements: [],
        activeSettlement: 0,
        siting: false,
        siteChoice: null,
        plan: null,
        fallen: [],
    },

    attention: (s) => settlements().length === 0 && !s.siting ? ["found"] : [],

    scene: {
        build(el) {
            el.innerHTML = PAGE;
            el.addEventListener("click", onClick);
        },
        update(el) {
            const t = activeSettlement();
            setDisplay(el.querySelector(".settle-empty"), !t);
            setDisplay(el.querySelector(".settle-body"), !!t);
            setDisplay(el.querySelector(".settle-tabs"), !!t);
            if (!t) return;

            const e = economy(t);
            setVar(el.querySelector(".settle-page"), "--hue", borderColor(t));
            renderTabs(el.querySelector(".settle-tabs"));
            renderHead(el.querySelector(".settle-head"), t);
            renderStats(el.querySelector(".settle-stats"), t, e);
            const cards = el.querySelectorAll(".settle-card");
            renderTasks(cards[0], t, e);
            renderProjects(cards[1], t, e);
            renderExpedition(cards[2], t);
        },
    },

    onTick(dt) {
        tickSettlements(dt);
        tickExpeditions(dt);
        checkKnowledge();
        checkLanguage();
        const s = settlementState();
        if (s.fallen.length && !document.querySelector(".settle-fallen")) showFallen();
    },
});
