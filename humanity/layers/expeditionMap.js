// expeditionMap.js
//
// Expeditions on the world map: planning a route, and the ones already out walking it

import { contributeMapOverlay } from "../../main/layers/worldLayer.js";
import { TILE_SIZE, tileById, tileKind } from "../../main/systems/worldMap.js";
import { switchToLayer } from "../../../render/canvasRouter.js";
import { hexToPixel } from "../../../utils/hex.js";
import { setText, setDisplay, setClass } from "../../../utils/dom.js";
import { setRichText } from "../../../render/richText.js";
import { clockText, formatWhole } from "../../../utils/format.js";
import { settlementState, settlements, idle, away, PROJECTS, discoveryName } from "../systems/settlements.js";
import {
    nextSteps, crossing, crossProblem, routeStart, expeditionCost, expeditionOutlook, sendProblem, sendExpedition,
    expeditionSpot, openDiscoveries, loops, outside, MOST_ROUTE, STOCKS,
} from "../systems/expeditions.js";
import { countText } from "./settlementLayer.js";
import { notionsText } from "../sublayers/innovationSublayer.js";

const plan = () => settlementState().plan;
const planned = () => plan() && settlements().find(t => t.id === plan().id);

function stopPlanning() {
    settlementState().plan = null;
    switchToLayer("settlement");
}

const centerOf = (id) => hexToPixel(tileById(id), TILE_SIZE);
const pathThrough = (ids) => ids.map((id, i) => {
    const p = centerOf(id);
    return `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
}).join("");

// Tile ids from the settlement tile out along the route (and home again for a loop), with where each leg ends
function walkedPoints(t, route) {
    const ids = [t.center];
    const start = routeStart(t, route);
    if (start !== t.center) ids.push(start);
    const stops = [0];
    for (const id of route) stops.push(ids.push(id) - 1);
    if (loops(t, route) && ids[ids.length - 1] !== t.center) stops[stops.length - 1] = ids.push(t.center) - 1;
    return { ids, stops };
}
const walkedBy = (t) => walkedPoints(t, [...t.expedition.route, ...(t.expedition.loop ? [t.expedition.loop] : [])]);

let stepCache = { key: "", ids: new Set() };
const steps = () => {
    const t = planned();
    if (!t) return new Set();
    const key = t.id + ":" + plan().route.join();
    if (stepCache.key !== key) stepCache = { key, ids: nextSteps(t, plan().route) };
    return stepCache.ids;
};


//    !!! ROUTES ON THE MAP !!!

const routesScene = {
    build(el) {
        el.classList.add("exp-routes");
        el.innerHTML = `<svg width="1" height="1"><g class="exp-lines"></g><g class="exp-walkers"></g></svg>`;
    },
    update(el) {
        const t = planned();
        const out = settlements().filter(other => other.expedition);
        const key = JSON.stringify([t ? [t.id, plan().route] : null, out.map(other => walkedBy(other).ids)]);
        const lines = el.querySelector(".exp-lines");
        const walkers = el.querySelector(".exp-walkers");
        if (lines.__key !== key) {
            lines.__key = key;
            const paths = out.map(other =>
                `<path class="exp-line is-out" d="${pathThrough(walkedBy(other).ids)}"/>`);
            if (t && plan().route.length) {
                paths.push(`<path class="exp-line is-plan" d="${pathThrough(walkedPoints(t, plan().route).ids)}"/>`);
            }
            lines.innerHTML = paths.join("");
            walkers.innerHTML = out.map(() => `<circle class="exp-walker" r="7"/>`).join("");
        }
        out.forEach((other, i) => {
            const ex = other.expedition;
            const { ids, stops } = walkedBy(other);
            const spot = expeditionSpot(other);
            const along = stops[spot.index] + (stops[spot.index + 1] - stops[spot.index]) * spot.frac;
            const step = Math.min(Math.floor(along), ids.length - 2);
            const from = centerOf(ids[step]);
            const to = centerOf(ids[step + 1]);
            const frac = along - step;
            const dot = walkers.children[i];
            dot.setAttribute("cx", (from.x + (to.x - from.x) * frac).toFixed(1));
            dot.setAttribute("cy", (from.y + (to.y - from.y) * frac).toFixed(1));
            dot.classList.toggle("is-busy", ex.busy > 0);
        });
    },
};


//    !!! THE PLANNING PANEL !!!

const most = (t) => Math.max(0, Math.min(idle(t), t.pops - away(t) - 1));

const planPanel = {
    build(el) {
        el.innerHTML = `
            <div class="settle-site exp-plan">
                <div class="exp-plan-head">
                    <span class="exp-plan-title"></span>
                    <span class="exp-people">
                        <span class="exp-people-label">People</span>
                        <button class="settle-step" data-act="less">-</button>
                        <span class="task-count"></span>
                        <button class="settle-step" data-act="more">+</button>
                    </span>
                </div>
                <p class="site-text exp-prompt"></p>
                <div class="exp-plan-detail">
                    <p class="exp-line-text exp-time"></p>
                    <p class="exp-line-text exp-needs"></p>
                    <p class="exp-line-text exp-haul"></p>
                    <p class="exp-line-text exp-learn"></p>
                    <p class="exp-line-text exp-notions"></p>
                </div>
                <p class="exp-problem"></p>
                <div class="site-buttons">
                    <button class="settle-button" data-act="cancel">Cancel</button>
                    <button class="settle-button" data-act="clear">Clear route</button>
                    <button class="settle-button is-primary" data-act="send">Send them</button>
                </div>
            </div>`;
        el.addEventListener("click", (event) => {
            const act = event.target.closest("[data-act]")?.dataset.act;
            const t = planned();
            if (!t || !act) return;
            const p = plan();
            if (act === "cancel") stopPlanning();
            else if (act === "clear") p.route = [];
            else if (act === "less") p.people = Math.max(1, p.people - 1);
            else if (act === "more") p.people = Math.min(most(t), p.people + 1);
            else if (act === "send" && sendExpedition(t, p.route, p.people)) stopPlanning();
        });
    },
    update(el) {
        const panel = el.firstElementChild;
        const t = planned();
        if (plan() && !t) settlementState().plan = null;
        setDisplay(panel, !!t);
        if (!t) return;
        const p = plan();
        p.people = Math.max(1, Math.min(p.people, Math.max(1, most(t))));
        const route = p.route;

        setText(panel.querySelector(".exp-plan-title"), `Expedition from ${t.name}`);
        setText(panel.querySelector(".task-count"), formatWhole(p.people));
        panel.querySelector('[data-act="less"]').disabled = p.people <= 1;
        panel.querySelector('[data-act="more"]').disabled = p.people >= most(t);

        const looped = loops(t, route);
        const far = outside(t, route).length >= MOST_ROUTE;
        setDisplay(panel.querySelector(".exp-prompt"), route.length === 0 || (far && !looped));
        setText(panel.querySelector(".exp-prompt"), route.length === 0
            ? `Pick a tile next to ${t.name} to start the route. The expedition turns back at its end, `
                + `unless the route ends on ${t.name}'s own land.`
            : `That's as far as anyone can go. End it on ${t.name}'s land to come home another way, or they'll turn back.`);
        setDisplay(panel.querySelector(".exp-plan-detail"), route.length > 0);
        panel.querySelector('[data-act="clear"]').disabled = route.length === 0;

        if (route.length > 0) {
            const cost = expeditionCost(t, route, p.people);
            const outlook = expeditionOutlook(t, route, p.people);
            const tiles = outside(t, route).length;
            setText(panel.querySelector(".exp-time"), `${tiles} tile${tiles === 1 ? "" : "s"}, ${clockText(cost.time)} `
                + `${looped ? "around and home" : "there and back the same way"}, plus any stops`);
            setRichText(panel.querySelector(".exp-needs"), `Takes ${countText(Object.fromEntries(STOCKS.map(key => [key, cost[key]])))}`);
            setClass(panel.querySelector(".exp-needs"), "is-short", STOCKS.some(key => t[key] < cost[key]));
            setRichText(panel.querySelector(".exp-haul"), `Could carry back about ${countText({
                food: Math.round(outlook.food), materials: Math.round(outlook.materials) })}`
                + (outlook.full ? ", all they can carry" : ""));
            const learned = Object.keys(outlook.learned);
            setText(panel.querySelector(".exp-learn"), learned.length === 0 ? "Nothing new to learn along this route."
                : "Learns about " + learned.map(id => `${discoveryName(id)} `
                    + `(${Math.round(outlook.learned[id] / PROJECTS[id].work * 100)}%)`).join(", "));
            setDisplay(panel.querySelector(".exp-notions"), !!outlook.notions);
            if (outlook.notions) setRichText(panel.querySelector(".exp-notions"), `Notions: ${notionsText(outlook.notions.notions)}`
                + (outlook.notions.full ? ", all they can keep in mind" : ""));
        }

        const problem = route.length ? sendProblem(t, route, p.people) : null;
        setText(panel.querySelector(".exp-problem"), problem || "");
        setDisplay(panel.querySelector(".exp-problem"), !!problem);
        panel.querySelector('[data-act="send"]').disabled = !!problem || route.length === 0;
    },
};


//    !!! ON THE MAP !!!

contributeMapOverlay("expedition", {
    tileClass(s, tile) {
        const t = planned();
        if (!t) return "";
        const route = plan().route;
        const at = route.indexOf(tile.id);
        if (at >= 0) return at === route.length - 1 ? "exp-route exp-route-end" : "exp-route";
        return steps().has(tile.id) ? "exp-next" : "";
    },
    tooltip(s, tile) {
        const t = planned();
        if (!t) return "";
        const route = plan().route;
        const kind = tileKind(s, tile.id);
        if (route.includes(tile.id)) return route[route.length - 1] === tile.id
            ? "End of the route. Click to take it off" : "On the route. Click to turn back here instead";
        if (steps().has(tile.id) && t.tiles.includes(tile.id)) return "End here and come home this way, without turning back";
        if (steps().has(tile.id)) {
            const found = openDiscoveries(t, kind).map(discoveryName);
            return `${clockText(crossing(kind))} to cross${found.length ? `. Could learn about ${found.join(", ")}` : ""}`;
        }
        if (t.tiles.includes(tile.id)) return "";
        return crossProblem(s, tile.id) || "The route has to reach it one tile at a time";
    },
    onClick(s, tile) {
        const t = planned();
        if (!t) return false;
        const route = plan().route;
        const at = route.indexOf(tile.id);
        if (at >= 0) route.length = at === route.length - 1 ? at : at + 1;
        else if (steps().has(tile.id)) route.push(tile.id);
        else if (t.tiles.includes(tile.id)) route.length = 0;
        return true;
    },
    pulsing: () => !!planned(),
    scene: routesScene,
    hud: planPanel,
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && planned()) stopPlanning();
});
