// languageLayer.js
//
// Listening in on each settlement's speech and guessing what its words mean; opens with the Language innovation

import { registerLayer } from "../../../core/registry.js";
import { setText, setDisplay, setVar } from "../../../utils/dom.js";
import { settlementState, settlements, activeSettlement, borderColor } from "../systems/settlements.js";
import {
    SPEECH_STAGES, SPEECH_IDS, CONCEPTS, SCENES, MOST_GUESSES,
    languageOf, tickLanguages, wordFor, conceptOf, knows, gloss, guess, guessedWrong, canGuess, candidates, unsolved,
    speechProgress, speechMissing, currentSpeech, nextGuessIn, nextPhraseIn,
} from "../systems/language.js";

const PAGE = `
    <div class="know-page lang-page flyout-inset">
        <div class="settle-tabs"></div>
        <p class="know-empty lang-none">No one has settled yet, so there is no one to listen to.</p>
        <section class="know-card lang-speech">
            <h3><span class="lang-name"></span><span class="lang-guesses"></span></h3>
            <p class="lang-refill"></p>
            <div class="lang-stage"></div>
        </section>
        <section class="know-card lang-overheard"><h3>Overheard<span class="lang-next"></span></h3><div class="lang-log"></div></section>
        <div class="lang-side">
            <section class="know-card lang-focus"></section>
            <section class="know-card lang-lexicon"><h3>Words heard</h3><div class="lang-words"></div></section>
        </div>
    </div>`;

// The word being worked on, and how the last guess at it went
let focus = null;
const focusIn = (lang) => focus?.seed === lang.seed ? focus : {};

const secs = (s) => `${Math.ceil(s)}s`;
const word = (lang, id) => `<button class="lang-word${knows(lang, id) ? " is-known" : ""}${id === focusIn(lang).id ? " is-chosen" : ""}"
    data-word="${wordFor(lang, id)}"><span class="lang-spelling">${wordFor(lang, id)}</span><span class="lang-gloss">${gloss(lang, id)}</span></button>`;

function onClick(event) {
    const target = event.target.closest("[data-act], [data-word], [data-guess]");
    const t = activeSettlement();
    const lang = t && languageOf(t);
    if (!target) return;
    if (target.dataset.act === "tab") settlementState().activeSettlement = Number(target.dataset.index);
    if (!lang) return;
    const id = focusIn(lang).id;
    if (target.dataset.word) focus = { seed: lang.seed, id: conceptOf(lang, target.dataset.word) };
    else if (target.dataset.guess && id) {
        const right = guess(lang, id, target.dataset.guess);
        if (right !== null) focus.feedback = { right, text: right
            ? `They nod. ${wordFor(lang, id)} means ${CONCEPTS[id].name}.`
            : `Blank looks. Whatever ${wordFor(lang, id)} is, it isn't ${CONCEPTS[target.dataset.guess].name}.` };
    }
}

function renderTabs(el) {
    const s = settlementState();
    const key = JSON.stringify([settlements().map(t => t.name + t.hue), s.activeSettlement]);
    if (el.__key === key) return;
    el.__key = key;
    el.innerHTML = settlements().map((t, i) => `<button class="settle-tab${i === s.activeSettlement ? " is-active" : ""}"
        style="--hue:${borderColor(t)}" data-act="tab" data-index="${i}">${t.name}</button>`).join("");
}

function stageHtml(lang) {
    const id = currentSpeech(lang);
    if (!id) return `<span class="lang-stage-name">Fluent</span><span class="lang-stage-text">Every stage of their speech is understood.</span>`;
    const { name, need, words, text } = SPEECH_STAGES[id];
    const missing = speechMissing(lang, id);
    const count = speechProgress(lang, id);
    const next = SPEECH_STAGES[SPEECH_IDS[SPEECH_IDS.indexOf(id) + 1]];
    const keys = words ? `<div class="lang-keys"><span class="lang-keys-label">Key words${next ? `, needed before ${next.name}` : ""}</span>
        ${words.map(c => `<span class="lang-key${missing.includes(c) ? "" : " is-known"}">${CONCEPTS[c].name}</span>`).join("")}</div>` : "";
    const waiting = count >= need && missing.length > 0;
    const status = waiting ? `${count}/${need} words, ${missing.length} key word${missing.length > 1 ? "s" : ""} left` : `${count}/${need} words`;
    return `<span class="lang-stage-name">Learning ${name}</span><span class="lang-stage-status${waiting ? " is-waiting" : ""}">${status}</span>
        <div class="stat-bar"><div class="stat-fill" style="width:${100 * count / need}%"></div></div>
        ${keys}<span class="lang-stage-text">${text}</span>`;
}

function renderSpeech(el, t, lang) {
    setText(el.querySelector(".lang-name"), `${t.name} speech`);
    const whole = Math.floor(lang.guesses);
    setText(el.querySelector(".lang-guesses"), "●".repeat(whole) + "○".repeat(MOST_GUESSES - whole));
    setText(el.querySelector(".lang-refill"), whole < MOST_GUESSES
        ? `Another guess in ${secs(nextGuessIn(t, lang))}.`
        : "Guesses are full.");
    const stage = el.querySelector(".lang-stage");
    const key = JSON.stringify([t.id, lang.learned]);
    if (stage.__key === key) return;
    stage.__key = key;
    stage.innerHTML = stageHtml(lang);
}

function renderLog(el, lang) {
    const key = JSON.stringify([lang.seed, lang.log, lang.learned, focusIn(lang).id]);
    if (el.__key === key) return;
    el.__key = key;
    el.innerHTML = [...lang.log].reverse().map(({ scene, words }) => `<div class="lang-phrase">
        <span class="lang-scene">${SCENES[scene]?.text || "Someone says something"}</span>
        <span class="lang-said">${words.filter(id => CONCEPTS[id]).map(id => word(lang, id)).join("")}</span>
    </div>`).join("");
}

function renderFocus(el, lang) {
    const { id: picked, feedback } = focusIn(lang);
    const id = CONCEPTS[picked] && lang.heard[picked] ? picked : null;
    const key = JSON.stringify([lang.seed, id, lang.learned, id && lang.wrong[id], canGuess(lang), id && lang.heard[id], feedback]);
    if (el.__key === key) return;
    el.__key = key;
    const note = feedback ? `<p class="lang-feedback${feedback.right ? " is-right" : " is-wrong"}">${feedback.text}</p>` : "";
    if (!id) {
        el.innerHTML = `<h3>Working it out</h3>${note}<p class="know-empty">Pick a word someone said to guess what it means.
            What was going on when it was said is the best clue, and words built from ones you know give themselves away.</p>`;
        return;
    }
    const heard = `<ul class="lang-heard">${lang.heard[id].map(s => `<li>${SCENES[s]?.text || "Somewhere"}</li>`).join("")}</ul>`;
    const head = `<div class="lang-focus-word">${wordFor(lang, id)}<span class="lang-gloss">${gloss(lang, id)}</span></div>`;
    if (knows(lang, id)) {
        el.innerHTML = `${head}${note}<p>Means <b>${CONCEPTS[id].name}</b>. Heard when:</p>${heard}`;
        return;
    }
    const open = candidates(lang);
    const keys = speechMissing(lang, currentSpeech(lang));
    const chips = SPEECH_IDS.filter(s => open.some(c => CONCEPTS[c].stage === s)).map(s => `<div class="lang-guess-group">
        <span class="lang-guess-stage">${SPEECH_STAGES[s].name}</span>
        ${open.filter(c => CONCEPTS[c].stage === s).map(c => `<button class="lang-guess${guessedWrong(lang, id, c) ? " is-wrong" : ""}${keys.includes(c) ? " is-key" : ""}"
            data-guess="${c}"${guessedWrong(lang, id, c) || !canGuess(lang) ? " disabled" : ""}>${CONCEPTS[c].name}</button>`).join("")}
    </div>`).join("");
    el.innerHTML = `${head}${note}<p>Heard when:</p>${heard}
        <p class="lang-ask">${canGuess(lang) ? "What does it mean?" : "Out of guesses for now."}</p>${chips}`;
}

function renderLexicon(el, lang) {
    const ids = [...unsolved(lang), ...lang.learned.filter(id => CONCEPTS[id])];
    const key = JSON.stringify([lang.seed, ids, focusIn(lang).id]);
    if (el.__key === key) return;
    el.__key = key;
    el.innerHTML = ids.length ? ids.map(id => word(lang, id)).join("") : `<p class="know-empty">Nothing yet.</p>`;
}

registerLayer("language", {
    categoryId: "humanity",
    group: "settled",
    name: "Language",
    color: "#5ec4b0",
    canvasType: "static",
    canvasClass: "language-canvas",
    order: 2,
    startUnlocked: false,

    initialState: {
        seed: 0,
        languages: {},
    },

    attention: () => settlements().filter(t => {
        const lang = languageOf(t);
        return lang && lang.guesses >= MOST_GUESSES && unsolved(lang).length;
    }).map(t => t.center),

    scene: {
        build(el) {
            el.innerHTML = PAGE;
            el.firstElementChild.addEventListener("click", onClick);
        },
        update(el) {
            const t = activeSettlement();
            const lang = t && languageOf(t);
            setDisplay(el.querySelector(".settle-tabs"), !!t);
            setDisplay(el.querySelector(".lang-none"), !t);
            for (const card of el.querySelectorAll(".know-card")) setDisplay(card, !!lang);
            if (!t) return;
            renderTabs(el.querySelector(".settle-tabs"));
            if (!lang) return;
            setVar(el.querySelector(".lang-page"), "--hue", borderColor(t));
            renderSpeech(el.querySelector(".lang-speech"), t, lang);
            setText(el.querySelector(".lang-next"), `next in ${secs(nextPhraseIn(t, lang))}`);
            renderLog(el.querySelector(".lang-log"), lang);
            renderFocus(el.querySelector(".lang-focus"), lang);
            renderLexicon(el.querySelector(".lang-words"), lang);
        },
    },

    onTick(dt) {
        tickLanguages(dt);
    },
});
