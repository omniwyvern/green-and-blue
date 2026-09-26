// ecologyLayer.js
//
// The page for challenges.js: what each takes away, asks for, and rewards

import { registerLayer } from "../../../core/registry.js";
import { getLayerState, layerUnlocked } from "../../../core/state.js";
import { formatNumber } from "../../../utils/format.js";
import { setText, setDisplay, setWidth } from "../../../utils/dom.js";
import {
    CHALLENGES, CHALLENGE_IDS, MODS, BLOCKS,
    activeChallenge, challengeDone, challengeOpen, completedCount,
    resetNames, goalParts, lockNotes, boostParts, enterChallenge, leaveChallenge, MOD_RESOURCES,
    challengeReady, claimChallenge,
} from "../systems/challenges.js";
import { pointsOnAdapt, runAdaptation } from "./adaptationLayer.js";


//    !!! READING A CHALLENGE !!!

// Entering or exiting a challenge counts as an adaptation reset as well, so you can change cards
const adaptOnCrossing = (id, cross) => {
    if (!layerUnlocked("adaptation") || CHALLENGES[id]?.keepsAdaptation) return cross();
    const gain = pointsOnAdapt();
    if (!cross()) return false;
    runAdaptation(gain);
    return true;
};

const modText = (key, value) => {
    const mod = MODS[key];
    if (value === 0) return mod.none || `No ${mod.name}`;
    if (value < 0.01) return `${mod.name} ÷${formatNumber(1 / value)}`;
    return value < 1
        ? `${mod.name} down to ${Math.round(value * 100)}%`
        : `${mod.name} x${formatNumber(value)}`;
};

// A mod that turns something off reads as a restriction, the same as a block does
const modClass = (value) => (value < 1 ? "rule-off" : "rule-up");

function ruleList(def) {
    const parts = def.blocks.map(key => `<li class="rule-off">${BLOCKS[key]}</li>`);
    for (const key in def.mods) {
        parts.push(`<li class="${modClass(def.mods[key])}">${modText(key, def.mods[key])}</li>`);
    }
    return parts.join("");
}

const lockList = (id) => lockNotes(id).map(note => `<li>${note}</li>`).join("");

const resetList = (id) => resetNames(id).map(name => `<li>${name}</li>`).join("");

const goalText = (id) => goalParts(id).map(part => part.short).join(" and ");

function goalRows(id) {
    return goalParts(id).map(part => `
        <div class="goal-row" data-goal="${part.key}">
            <div class="goal-line">
                <span class="goal-name">${part.name}</span>
                <span class="goal-amount"></span>
            </div>
            <div class="goal-track"><div class="goal-fill"></div></div>
        </div>`).join("");
}

function cardMarkup(id) {
    const def = CHALLENGES[id];
    const done = challengeDone(id);
    const open = challengeOpen(id);
    const running = activeChallenge() === id;
    const ready = running && challengeReady();
    const tag = done ? "Completed" : ready ? "Goal reached" : running ? "Running" : open ? "" : "Locked";
    const state = done ? "done" : running ? "running" : open ? "" : "locked";

    const head = `
        <div class="card-head">
            <span class="card-name">${def.name}</span>
            ${tag ? `<span class="card-tag">${tag}</span>` : ""}
        </div>`;

    // A finished one keeps only what it is and what it gave
    if (done) {
        return `
    <article class="challenge-card done" style="--card-color:${def.color}" data-card="${id}">
        ${head}
        <div class="card-text">${def.text}</div>
        <div class="card-reward">
            <span class="reward-title">${def.reward.title}</span>
            <span class="reward-text">${def.reward.text}</span>
            ${boostText(id) ? `<span class="reward-boost">${boostText(id)}</span>` : ""}
        </div>
    </article>`;
    }

    // A locked one gives nothing away but its name and what it is still waiting for
    if (!open && !running) {
        return `
    <article class="challenge-card locked" style="--card-color:${def.color}" data-card="${id}">
        ${head}
        <div class="card-block card-locks">
            <span class="challenge-label">Waiting on</span>
            <ul class="card-lock-list">${lockList(id)}</ul>
        </div>
    </article>`;
    }

    return `
    <article class="challenge-card ${state}" style="--card-color:${def.color}" data-card="${id}">
        ${head}
        <div class="card-text">${def.text}</div>
        <div class="card-block">
            <span class="challenge-label">While it runs</span>
            <ul class="card-rules">${ruleList(def)}</ul>
        </div>
        <div class="card-block">
            <span class="challenge-label">It resets</span>
            <ul class="card-resets">${resetList(id)}</ul>
        </div>
        <div class="card-goal"><span class="challenge-label">Goal</span> ${goalText(id)}</div>
        <div class="card-reward">
            <span class="reward-title">${def.reward.title}</span>
            <span class="reward-text">${def.reward.text}</span>
            ${boostText(id) ? `<span class="reward-boost">${boostText(id)}</span>` : ""}
        </div>
        <button class="card-start" data-start="${id}">Start</button>
    </article>`;
}

// The permanent multiplier finishing it leaves behind
const boostText = (id) => boostParts(id)
    .map(([resourceId, value]) => `${MODS[resourceId].name} x${value} for good`)
    .join(", ");


//    !!! THE ORDER ON THE PAGE !!!

// The tall ones sit in a row of their own, above the short locked and finished ones
const openOrder = () => CHALLENGE_IDS.filter(id =>
    activeChallenge() === id || (!challengeDone(id) && challengeOpen(id)));

const restOrder = () => [
    ...CHALLENGE_IDS.filter(id => activeChallenge() !== id && !challengeDone(id) && !challengeOpen(id)),
    ...CHALLENGE_IDS.filter(id => challengeDone(id)),
];

const cardSignature = () => CHALLENGE_IDS
    .map(id => `${id}:${challengeDone(id) ? "d" : ""}${challengeOpen(id) ? "o" : ""}${activeChallenge() === id ? (challengeReady() ? "R" : "r") : ""}`)
    .join("|");


//    !!! THE PAGE !!!

const PAGE = `
    <div class="challenge-head">
        <div class="challenge-score">
            <span class="score-value"></span>
            <span class="score-label">Completed</span>
        </div>
        <div class="challenge-head-note"></div>
    </div>

    <section class="challenge-active">
        <div class="active-head">
            <span class="active-name"></span>
            <span class="active-tag"></span>
        </div>
        <div class="active-body">
            <div class="active-rules">
                <span class="challenge-label">Holding</span>
                <ul class="active-rule-list"></ul>
            </div>
            <div class="active-goals">
                <span class="challenge-label">Goal</span>
                <div class="goal-list"></div>
            </div>
        </div>
        <button class="active-claim">Complete Challenge</button>
        <button class="active-leave">Give up</button>
    </section>

    <div class="challenge-lists">
        <div class="challenge-list" data-list="open"></div>
        <div class="challenge-list" data-list="rest"></div>
    </div>

`;

const CONFIRM = `
    <div class="challenge-confirm">
        <div class="confirm-box">
            <div class="confirm-head"></div>
            <div class="confirm-warn">Starting this resets the following, right now:</div>
            <ul class="confirm-resets"></ul>
            <div class="confirm-note">Nothing else is touched. Giving up resets the same things
                again, so nothing earned inside comes back out with you. Reaching the goal does
                not, so finish it and you keep everything you made getting there.</div>
            <div class="confirm-note confirm-on-claim"></div>
            <div class="confirm-note confirm-adapts">Crossing either way counts as an adaptation: you are paid
                the points the map is worth, and your equipped cards come off their lock to be
                picked again for the rules you are going in under.</div>
            <div class="confirm-buttons">
                <button class="confirm-cancel">Cancel</button>
                <button class="confirm-go">Start it</button>
            </div>
        </div>
    </div>
`;

const headNote = (id) => {
    const done = completedCount();
    if (id && challengeReady()) {
        return `${CHALLENGES[id].name} is done. Finish it whenever you like, as nothing you made inside is lost.`;
    }
    if (id) return `${CHALLENGES[id].name} is running. Reach its goal, or give up, to end it.`;
    if (done === CHALLENGE_IDS.length) return "Every challenge is done. The world keeps what they gave it.";
    return "One at a time. Each one takes things away, then hands something back for good.";
};

function renderGoals(host, id) {
    if (host.dataset.key !== id) {
        host.dataset.key = id;
        host.innerHTML = goalRows(id);
    }
    for (const part of goalParts(id)) {
        const row = host.querySelector(`[data-goal="${part.key}"]`);
        setText(row.querySelector(".goal-amount"), part.text);
        setWidth(row.querySelector(".goal-fill"), part.fraction);
        row.classList.toggle("met", part.met);
    }
}


//    !!! THE SCENE !!!

const CHALLENGE_SCENE = {
    build(el, s, layer) {
        el.className = "static-scene challenge-scene";
        el.innerHTML = `<div class="challenge-page">${PAGE}</div>${CONFIRM}`;

        el.querySelector(".challenge-lists").addEventListener("click", (event) => {
            const button = event.target.closest("[data-start]");
            if (!button || button.disabled) return;
            getLayerState(layer.stateKey).confirming = button.dataset.start;
        });

        el.querySelector(".confirm-cancel").addEventListener("click", () => {
            getLayerState(layer.stateKey).confirming = null;
        });

        el.querySelector(".confirm-go").addEventListener("click", () => {
            const state = getLayerState(layer.stateKey);
            if (state.confirming) adaptOnCrossing(state.confirming, () => enterChallenge(state.confirming));
            state.confirming = null;
        });

        const claim = el.querySelector(".active-claim");
        claim.addEventListener("click", () => {
            if (CHALLENGES[activeChallenge()]?.onClaim && !claim.dataset.armed) { claim.dataset.armed = "1"; return; }
            delete claim.dataset.armed;
            claimChallenge();
        });

        const leave = el.querySelector(".active-leave");
        leave.addEventListener("click", () => {
            if (!leave.dataset.armed) { leave.dataset.armed = "1"; return; }
            delete leave.dataset.armed;
            adaptOnCrossing(activeChallenge(), leaveChallenge);
        });
    },

    update(el, s) {
        const id = activeChallenge();

        setText(el.querySelector(".score-value"), `${completedCount()} of ${CHALLENGE_IDS.length}`);
        setText(el.querySelector(".challenge-head-note"), headNote(id));

        const active = el.querySelector(".challenge-active");
        const leave = active.querySelector(".active-leave");
        const claim = active.querySelector(".active-claim");
        const ready = challengeReady();
        setDisplay(active, !!id);
        setDisplay(claim, ready);
        setDisplay(leave, !!id && !ready);
        if (id) {
            const def = CHALLENGES[id];
            setText(active.querySelector(".active-tag"), ready ? "Goal reached" : "Running");
            active.classList.toggle("ready", ready);
            active.style.setProperty("--card-color", def.color);
            setText(active.querySelector(".active-name"), def.name);
            const rules = active.querySelector(".active-rule-list");
            if (rules.dataset.key !== id) {
                rules.dataset.key = id;
                rules.innerHTML = ruleList(def);
            }
            renderGoals(active.querySelector(".goal-list"), id);
            setText(leave, leave.dataset.armed ? "Give up? This resets it all again" : "Give up");
            setText(claim, claim.dataset.armed ? `Complete? ${def.onClaim}` : "Complete Challenge");
        } else {
            delete leave.dataset.armed;
            delete claim.dataset.armed;
        }

        const lists = el.querySelector(".challenge-lists");
        const signature = cardSignature();
        if (lists.dataset.key !== signature) {
            lists.dataset.key = signature;
            for (const [name, order] of [["open", openOrder()], ["rest", restOrder()]]) {
                const list = lists.querySelector(`[data-list="${name}"]`);
                list.innerHTML = order.map(cardMarkup).join("");
                setDisplay(list, order.length > 0);
            }
            for (const button of lists.querySelectorAll("[data-start]")) {
                const cardId = button.dataset.start;
                button.disabled = !!id || challengeDone(cardId) || !challengeOpen(cardId);
            }
        }

        const confirming = CHALLENGES[s.confirming] ? s.confirming : null;
        const box = el.querySelector(".challenge-confirm");
        setDisplay(box, !!confirming && !id);
        if (confirming) {
            setText(box.querySelector(".confirm-head"), `Start ${CHALLENGES[confirming].name}?`);
            setDisplay(box.querySelector(".confirm-adapts"), !CHALLENGES[confirming].keepsAdaptation);
            setText(box.querySelector(".confirm-on-claim"), CHALLENGES[confirming].onClaim || "");
            setDisplay(box.querySelector(".confirm-on-claim"), !!CHALLENGES[confirming].onClaim);
            const resets = box.querySelector(".confirm-resets");
            if (resets.dataset.key !== confirming) {
                resets.dataset.key = confirming;
                resets.innerHTML = resetList(confirming);
            }
        }
    },
};


//    !!! THE LAYER !!!

registerLayer("challenges", {
    categoryId: "main",
    group: "world",
    name: "Ecology",
    color: "#5e0fdc",
    canvasType: "static",
    canvasClass: "challenge-canvas",
    order: 1,
    startUnlocked: false,

    resources: MOD_RESOURCES,

    initialState: {
        active: null,
        completed: {},
        confirming: null,
    },

    scene: CHALLENGE_SCENE,

    // Stays lit from the moment a challenge's goal is met until it is finished by hand
    stickyAttention: true,
    attention: () => (challengeReady() ? [activeChallenge()] : []),

    // A marker on the sidebar tab while a challenge is running
    tabMark: () => {
        const id = activeChallenge();
        return id ? { text: "●", color: CHALLENGES[id].color } : null;
    },

    upgrades: {},
});
