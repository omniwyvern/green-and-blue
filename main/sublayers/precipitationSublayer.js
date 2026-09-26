// precipitationSublayer.js
//
// Hold the band over the mark to charge the cloud, then release it on a tile

import { registerLayer } from "../../../core/registry.js";
import { getLayerState } from "../../../core/state.js";
import { spend, levelsIn } from "../../../core/resources.js";
import { D } from "../../../utils/decimal.js";
import { setText, setWidth, setVar, setAttr, setClass, frameLoop, onRelease } from "../../../utils/dom.js";
import { clamp } from "../../../utils/math.js";
import { setRichText } from "../../../render/richText.js";
import { formatNumber } from "../../../utils/format.js";
import { cardBonus, cardActive } from "../systems/cards.js";
import { traitBonus } from "../systems/evolutionTraits.js";
import { challengeBlocks, challengeDone, challengeMod } from "../systems/challenges.js";
import {
    PRECIPITATION, PRECIPITATION_KINDS, PRECIPITATION_SECONDS, PRODUCTION_BOOST, TERRAIN,
    DRYING_SECONDS, ORIGIN_TILE, worldState, isPrecipitating, precipitationKind, setPrecipitationKind,
    fallingKind, buildupOn, isClaimed, tileKind, grassOn, shedsPrecipitation,
    startPrecipitation, stopPrecipitation, chargeCost, soakScale, soakScaleForKind, wetnessFactor,
} from "../systems/worldMap.js";
import { switchToLayer } from "../../../render/canvasRouter.js";
import { coreNodeBought } from "../../../core/nodes.js";
import { biomeOpen } from "./ecosystemSublayer.js";

const cloudState = () => getLayerState("precipitation");
const level = levelsIn("precipitation");

const LIFT = 3;
const GRAVITY = 1.5;
const DRAG = 2;

const MARK_FLOOR = 0.2;

const GRACE_SECONDS = 0.75;

const durationFactor = (stability) => .333 + .666 * stability;


//    !!! HOW HARD IT FALLS !!!

// "soak" is what one full-charge release at full stability leaves, "ceiling" is as full as it can take a tile
export const INTENSITIES = [
    {
        id: "light", at: 0.25, power: 0.6, soak: 0.1, seconds: 0.8, upgrade: "fineMist",
        names: { rain: "Drizzle", snow: "Flurry" },
    },
    {
        id: "steady", at: 0.5, power: 1, soak: 0.7, ceiling: 0.9, seconds: 1, upgrade: "steadyFall",
        names: { rain: "Rain", snow: "Snow" },
    },
    {
        id: "heavy", at: 0.75, power: 1.8, soak: 0.8, seconds: 1.2, upgrade: "cloudburst",
        names: { rain: "Downpour", snow: "Heavy Snow" },
    },
];

export const intensityName = (intensity, kind) => intensity.names[kind] || intensity.names.rain;


//    !!! WHAT THE CLOUD HOLDS !!!

export const capacity = () => 1 + 0.2 * level("deeperClouds");
const chargeHeld = (s = cloudState()) => s.charge || 0;
// How much of what's in the cloud has already been paid for
const paidFor = (s = cloudState()) => s.paidCharge || 0;
export const fillOf = (s = cloudState()) => Math.min(1, chargeHeld(s) / capacity());
export const stabilityOf = (s = cloudState()) => s.stability ?? 1;

const chargeRate = (fill) => 0.045 * (1 + 1.5 * fill)
    * (1 + 0.15 * level("updraft")) * (1 + cardBonus("rainCharge")) * (coreNodeBought("rainRisingAir") && fill < 0.5 ? 1.35 : 1);

const decayRate = (fill) => 0.05 * (1 + 3 * fill * fill);

const recoveryRate = (fill) =>
    0.06 * (1 + 0.12 * level("calmAir"))
    - 0.25 * Math.max(0, fill - tolerance());

const tolerance = () => Math.min(1, 0.5 + 0.06 * level("pressureTolerance"));

const bandHalf = () => 0.09 + 0.02 * level("broadFront");

// Everything drawn on the bar goes through this
const trackAt = (fill) => MARK_FLOOR + fill * (1 - MARK_FLOOR);
const covers = (at, fill) => Math.abs(at - trackAt(fill)) <= bandHalf();


//    !!! PICKING AN INTENSITY !!!

// -1 is a cloud that isn't worth releasing yet
export const readyIndex = (s = cloudState()) => {
    const fill = fillOf(s);
    let best = -1;
    for (let i = 0; i < INTENSITIES.length; i++) if (fill >= INTENSITIES[i].at) best = i;
    return best;
};

const pickedIndex = (s = cloudState()) => clamp(Number(s.intensity) || 0, 0, INTENSITIES.length - 1);

export const pickedIntensity = (s = cloudState()) => INTENSITIES[pickedIndex(s)];

export function setIntensity(index) {
    if (!INTENSITIES[index]) return false;
    cloudState().intensity = index;
    return true;
}


//    !!! RELEASING ON A TILE !!!

const targetTile = (world = worldState()) =>
    world.selectedTile && isClaimed(world, world.selectedTile) ? world.selectedTile : null;

export const canRelease = (s = cloudState(), world = worldState()) =>
    !challengeBlocks("precipitation")
    && !isPrecipitating(world) && !!targetTile(world) && readyIndex(s) >= pickedIndex(s);

function eventFor(world, id, intensity, charge, stability) {
    const kind = precipitationKind(world);
    const power = intensity.power * (1 + 0.25 * level(intensity.upgrade));
    const water = intensity.soak * runoff(intensity)
        * (1 + cardBonus("moistureRate") + (grassOn(world, id) ? 0 : cardBonus("rainSoak")))
        * (kind === "snow" ? challengeMod("snowfall") : 1);
    const lasting = durationFactor(stability);

    return {
        strength: charge * power * wetnessFactor(world, id, kind) * (1 + cardBonus("rainBoost")) * (1 + traitBonus("rainStrength"))
            * (coreNodeBought("rainHeavy") ? 1.12 : 1),
        seconds: PRECIPITATION_SECONDS * intensity.seconds * lasting * (1 + cardBonus("rainDuration")) * (1 + traitBonus("rainDuration")),
        // Off the grass the soak numbers are quoted against, and onto whatever is being rained on
        soak: charge * water * lasting * soakScaleForKind("grass") / soakScale(world, id),
        ceiling: ceilingOf(intensity),
    };
}


//    !!! SOAKING AND RUNOFF !!!

const SOAK_CEILING_PER_LEVEL = 0.01;
const ceilingOf = (intensity) => intensity.ceiling
    ? Math.min(0.99, intensity.ceiling + SOAK_CEILING_PER_LEVEL * level("soakingRain")) : 1;

const runoff = (intensity) => intensity.id === "heavy"
    ? 1 + 0.15 * level("deluge")
    : Math.max(0.4, 1 - 0.08 * level("lightTouch"));

// With no tile picked this reads off the origin
export const previewOf = (world, id, intensity, charge, stability) => {
    const event = eventFor(world, id || ORIGIN_TILE, intensity, charge, stability);
    return {
        boost: PRODUCTION_BOOST * event.strength, seconds: event.seconds, soak: event.soak, ceiling: event.ceiling,
    };
};

// A cloud that just Appears, for the rain dance card
export function driftingEvent(world, id) {
    return eventFor(world, id, INTENSITIES[0], capacity() * 0.4, 1);
}


//    !!! CHARGING AND BURSTING !!!

export function addCharge(fraction) {
    const s = cloudState();
    s.charge = Math.min(capacity(), chargeHeld(s) + fraction * capacity());
    // A cloud that blew in on its own is already paid for
    s.paidCharge = Math.max(paidFor(s), s.charge);
}

export function releaseCloud() {
    const s = cloudState();
    const world = worldState();
    if (!canRelease(s, world)) return false;

    const id = targetTile(world);
    startPrecipitation(world, id,
        eventFor(world, id, pickedIntensity(s), chargeHeld(s), stabilityOf(s)));
    s.charge = 0;
    s.paidCharge = 0;
    return true;
}

// At zero Stability the cloud falls for part of what it held, or for nothing if something is already falling
function burst(s) {
    const world = worldState();
    const index = readyIndex(s);
    const id = targetTile(world);
    if (index >= 0 && id && !isPrecipitating(world)) {
        startPrecipitation(world, id,
            eventFor(world, id, INTENSITIES[index], chargeHeld(s) * 0.45, 0.35));
        s.paidCharge = Math.max(0, paidFor(s) - chargeHeld(s) * 0.45);
    }
    s.charge = 0;
    s.stability = 0.35;
    burstAt = performance.now();
}


//    !!! THE BAND WHILE THE PAGE IS OPEN !!!

let band = 0.09;
let bandVelocity = 0;
let holding = false;
let sinceHeld = GRACE_SECONDS;
let starved = false;        // Charging stalled because there was no Blue Essence for it
let burstAt = 0;
let live = null;            // The scene currently on screen, if any
let lastLiveStep = 0;

function stepBand(dt) {
    const half = bandHalf();
    bandVelocity += ((holding ? LIFT : 0) - GRAVITY) * dt;
    bandVelocity -= bandVelocity * Math.min(1, DRAG * dt);
    band += bandVelocity * dt;

    if (band <= half) { band = half; bandVelocity = Math.max(0, bandVelocity); }
    if (band >= 1 - half) { band = 1 - half; bandVelocity = Math.min(0, bandVelocity); }
}

const charging = (fill) => sinceHeld < GRACE_SECONDS && covers(band, fill);

function stepCloud(dt) {
    const s = cloudState();
    stepBand(dt);
    if (dt <= 0) return;

    sinceHeld = holding ? 0 : sinceHeld + dt;
    const fill = fillOf(s);

    const taking = charging(fill);
    if (taking) gatherCharge(s, dt);
    else starved = false;

    if (taking || holding) s.stability = stabilityOf(s) - decayRate(fill) * dt;
    else s.stability = Math.min(1, stabilityOf(s) + recoveryRate(fill) * dt);

    if (s.stability <= 0) burst(s);
}

// worldMap asks, because how fast ground dries is its to decide
export const soakHold = () => 1 / (1 + 0.2 * level("standingWater"));

// Charge is billed against a receipt rather than per drop gathered
function gatherCharge(s, dt) {
    if (challengeBlocks("precipitation")) return;
    const room = capacity() - chargeHeld(s);
    if (room <= 0) return;

    const gained = Math.min(room, chargeRate(fillOf(s)) * capacity() * dt);
    const billable = Math.max(0, chargeHeld(s) + gained - paidFor(s));
    if (billable > 0 && !spend({ blueEssence: chargeCost(worldState()).mul(billable) })) {
        starved = true;
        return;
    }
    starved = false;
    s.charge = chargeHeld(s) + gained;
    s.paidCharge = Math.max(paidFor(s), s.charge);
}

const letGo = () => { holding = false; };
onRelease(letGo);

// The bar runs off the render loop so it moves at the screen's rate
const startFrames = frameLoop(() => live, (dt, now) => {
    lastLiveStep = now;
    stepCloud(dt);
    paintCloud(live);
    return true;
}, letGo);


//    !!! THE PAGE !!!

export const PRECIPITATION_RESOURCES = ["greenEssence", "blueEssence"];

export const PRECIPITATION_VIEW = {
    name: "Precipitation",
    color: "#4a90d9",
    canvasType: "static",

    // Shut during a drought, but still listed since the challenge is why
    blocked: () => challengeBlocks("precipitation"),

    scene: {
        build(el) {
            el.className = "static-scene weather-scene";
            el.innerHTML = `
                <div class="weather-page flyout-inset">
                    <div class="cloud-row">
                        <div class="weather-switch"></div>

                        <div class="cloud-stage">
                            <div class="cloud-art"></div>
                            <div class="cloud-stage-name"></div>
                            <div class="cloud-stage-note"></div>
                        </div>

                        <div class="charge-bar">
                            <div class="charge-track" style="--floor: ${MARK_FLOOR}">
                                <div class="charge-base"></div>
                                <div class="charge-column"></div>
                                ${INTENSITIES.map(i => tickMarkup(i.at)).join("")}
                                ${tickMarkup(1)}
                                <div class="charge-mark"></div>
                                <div class="charge-band"></div>
                            </div>
                            <div class="charge-hint"></div>
                        </div>
                    </div>

                    <div class="cloud-meters">
                        <div class="cloud-meter" data-meter="charge">
                            <span class="meter-label">Charge</span>
                            <div class="meter-track"><div class="meter-fill"></div></div>
                            <span class="meter-value"></span>
                        </div>
                        <div class="cloud-meter" data-meter="stability">
                            <span class="meter-label">Stability</span>
                            <div class="meter-track"><div class="meter-fill"></div></div>
                            <span class="meter-value"></span>
                        </div>
                    </div>

                    <div class="release-row">
                        <div class="release-target"></div>
                        <button class="map-button" type="button">World map</button>
                        <button class="release-button" type="button">Release</button>
                    </div>

                    <div class="cards-heading">Intensity</div>
                    <div class="intensity-row"></div>

                    <div class="weather-summary"></div>
                </div>
            `;

            const switcher = el.querySelector(".weather-switch");
            switcher.hidden = true;
            for (const kind of PRECIPITATION_KINDS) {
                const btn = document.createElement("button");
                btn.className = "weather-choice";
                btn.dataset.kind = kind;
                btn.textContent = PRECIPITATION[kind].name;
                btn.addEventListener("click", () => setPrecipitationKind(worldState(), kind));
                switcher.appendChild(btn);
            }

            const track = el.querySelector(".charge-track");
            track.addEventListener("pointerdown", (e) => {
                e.preventDefault();
                holding = true;
                startFrames();
            });

            el.querySelector(".intensity-row").addEventListener("click", (e) => {
                const card = e.target.closest("[data-index]");
                if (card) setIntensity(Number(card.dataset.index));
            });

            el.querySelector(".release-button").addEventListener("click", () => {
                if (isPrecipitating(worldState())) {
                    if (cardActive("cloudBreak")) stopPrecipitation(worldState());
                    return;
                }
                releaseCloud();
            });

            el.querySelector(".map-button").addEventListener("click", () => switchToLayer("world"));
        },

        update(el, s) {
            live = el;
            startFrames();

            const world = worldState();

            // Snow only matters once there's an ice field to build
            const choosable = biomeOpen("iceField");
            if (!choosable && precipitationKind(world) !== "rain") setPrecipitationKind(world, "rain");
            const switcher = el.querySelector(".weather-switch");
            if (switcher.hidden === choosable) switcher.hidden = !choosable;

            const kind = precipitationKind(world);
            paintCloud(el);
            updateStage(el, s, kind);

            // Changing kind mid-fall would rewrite what's already coming down, so it waits
            const falling = isPrecipitating(world);
            const switchSignature = `${kind}:${falling}:${choosable}`;
            if (el.__switch !== switchSignature) {
                el.__switch = switchSignature;
                for (const btn of el.querySelectorAll(".weather-choice")) {
                    const picked = btn.dataset.kind === kind;
                    setClass(btn, "active", picked);
                    setClass(btn, "inactive", falling && !picked);
                    btn.title = picked ? "Loaded"
                        : falling ? "Wait for the cloud to clear"
                        : `Load the cloud with ${PRECIPITATION[btn.dataset.kind].name.toLowerCase()}`;
                }
            }

            updateIntensities(el, s, world, kind);
            updateRelease(el, s, world, kind);
            setRichText(el.querySelector(".weather-summary"), summary(world, s, kind));
        },
    },

    drawers: {
        cloud: {
            label: "Cloud",
            color: "#7fc8ff",
            upgrades: {
                updraft: {
                    title: "Updraft",
                    description: "Charge builds faster, so less Stability is spent.",
                    max: 10,
                    cost: (s, lvl) => ({ blueEssence: D(1e7).mul(D(2.1).pow(lvl)) }),
                },
                calmAir: {
                    title: "Calm Air",
                    description: "Stability comes back faster whenever the cloud is left alone.",
                    max: 4,
                    cost: (s, lvl) => ({ blueEssence: D(2e7).mul(D(2.4).pow(lvl)) }),
                },
                pressureTolerance: {
                    title: "Pressure Tolerance",
                    description: "The cloud can hold more charge before it starts losing Stability.",
                    max: 6,
                    cost: (s, lvl) => ({ blueEssence: D(8e6).mul(D(2.7).pow(lvl)) }),
                },
                broadFront: {
                    title: "Broad Front",
                    description: "Widens the band, so the mark is easier to hold on to.",
                    max: 5,
                    cost: (s, lvl) => ({ blueEssence: D(5e6).mul(D(3).pow(lvl)) }),
                },
            },
        },

        fall: {
            label: "Precipitation",
            color: "#58a8e8",
            upgrades: {
                fineMist: {
                    title: "Fine Mist",
                    description: "The lightest intensity is worth more for the charge it spends.",
                    max: 5,
                    cost: (s, lvl) => ({ blueEssence: D(1e7).mul(D(2.4).pow(lvl)) }),
                },
                steadyFall: {
                    title: "Steady Fall",
                    description: "The middle intensity is worth more for the charge it spends.",
                    max: 5,
                    cost: (s, lvl) => ({ blueEssence: D(1e7).mul(D(2.5).pow(lvl)) }),
                },
                cloudburst: {
                    title: "Cloudburst",
                    description: "The heaviest intensity is worth more for the charge it spends.",
                    max: 5,
                    cost: (s, lvl) => ({ blueEssence: D(1e7).mul(D(2.6).pow(lvl)) }),
                },
                lightTouch: {
                    title: "Light Touch",
                    description: "The two lighter intensities soak the ground less, so they can fall on it for longer.",
                    max: 5,
                    hidden: () => !coreNodeBought("environment"),
                    cost: (s, lvl) => ({ blueEssence: D(1e7).mul(D(2.7).pow(lvl)) }),
                },
                deluge: {
                    title: "Deluge",
                    description: "The heaviest intensity soaks the ground much faster. Good for transforming tiles.",
                    max: 5,
                    hidden: () => !coreNodeBought("environment"),
                    cost: (s, lvl) => ({ blueEssence: D(1e7).mul(D(2.7).pow(lvl)) }),
                },
                soakingRain: {
                    title: "Soaking Rain",
                    description: (s) => `The middle intensity can fill ground up to ${Math.round(100 * ceilingOf(INTENSITIES[1]))}% instead of stopping at 90%.`,
                    max: 9,
                    hidden: () => !coreNodeBought("rainSoak"),
                    cost: (s, lvl) => ({ blueEssence: D(1e11).mul(D(1.8).pow(lvl)) }),
                },
                standingWater: {
                    title: "Standing Water",
                    description: "Ground stays wet 20% longer per level.",
                    max: 3,
                    hidden: () => !challengeDone("drought"),
                    cost: (s, lvl) => ({ blueEssence: D(4e8).mul(D(3).pow(lvl)) }),
                },
            },
        },
    },
};


//    !!! THE LAYER !!!

registerLayer("precipitation", {
    categoryId: "main",
    group: "world",
    order: 3,
    startUnlocked: false,
    absorbedBy: "environment",

    resources: PRECIPITATION_RESOURCES,

    initialState: {
        charge: 0,
        paidCharge: 0,  // What the cloud has been billed for, so a burst isn't paid for twice
        stability: 1,
        intensity: 1,   // The middle one, which is the kind the cloud is named after
    },

    onTick(dt) {
        if (performance.now() - lastLiveStep < 250) return;
        holding = false;
        stepCloud(dt);
    },

    ...PRECIPITATION_VIEW,
});


//    !!! PAINTING THE PAGE !!!

function paintCloud(el) {
    const s = cloudState();
    const fill = fillOf(s);
    const stability = stabilityOf(s);

    const track = el.querySelector(".charge-track");
    setVar(track, "--mark", trackAt(fill).toFixed(4));
    setVar(track, "--band-pos", band.toFixed(4));
    setVar(track, "--band-size", (bandHalf() * 2).toFixed(4));
    setClass(track, "on-mark", charging(fill));
    setClass(track, "holding", holding);

    const meters = el.querySelectorAll(".cloud-meter");
    setWidth(meters[0].querySelector(".meter-fill"), fill);
    setText(meters[0].querySelector(".meter-value"), `${Math.round(fill * 100)}%`);
    setWidth(meters[1].querySelector(".meter-fill"), stability);
    setText(meters[1].querySelector(".meter-value"), `${Math.round(stability * 100)}%`);
    setAttr(meters[1], "data-state", stability < 0.25 ? "low" : stability < 0.55 ? "watch" : "fine");

    setClass(el.querySelector(".weather-page"), "just-burst", performance.now() - burstAt < 700);
    setRichText(el.querySelector(".charge-hint"), hint(fill));
}

function hint(fill) {
    if (starved) return "Not enough Blue Essence to keep charging.";
    if (charging(fill)) return "Charging";
    if (holding) return "Off the mark, so the cloud is straining for nothing.";
    if (recoveryRate(fill) < 0) return "Too full to settle. Release it before it tears.";
    return fill > 0 ? "Resting. Stability is coming back." : "Hold the bar to charge.";
}

function updateStage(el, s, kind) {
    const index = readyIndex(s);
    const name = index < 0 ? "Wisps" : intensityName(INTENSITIES[index], kind);

    const art = el.querySelector(".cloud-art");
    const signature = `${kind}:${index}`;
    if (art.__signature !== signature) {
        art.__signature = signature;
        art.innerHTML = cloudArt(kind, index);
    }

    setText(el.querySelector(".cloud-stage-name"), name);
    setText(el.querySelector(".cloud-stage-note"), index < 0
        ? `Nothing worth dropping yet. ${Math.round(INTENSITIES[0].at * 100)}% is the first intensity.`
        : `Holding ${chargeHeld(s).toFixed(2)} of ${capacity().toFixed(2)} charge.`);
}

function updateIntensities(el, s, world, kind) {
    const row = el.querySelector(".intensity-row");
    const picked = pickedIndex(s);
    const ready = readyIndex(s);
    const id = targetTile(world);

    const signature = `${kind}::${INTENSITIES.map(i => level(i.upgrade)).join(",")}`
        + `::${level("lightTouch")}:${level("deluge")}`;
    if (el.__intensities !== signature) {
        el.__intensities = signature;
        row.innerHTML = INTENSITIES.map((intensity, index) => `
            <button class="intensity-choice" type="button" data-index="${index}">
                <span class="intensity-name">${intensityName(intensity, kind)}</span>
                <span class="intensity-effect"></span>
                <span class="intensity-water"></span>
            </button>`).join("");
    }

    const cards = row.querySelectorAll(".intensity-choice");
    for (let index = 0; index < INTENSITIES.length; index++) {
        const intensity = INTENSITIES[index];
        const card = cards[index];
        setClass(card, "active", index === picked);
        setClass(card, "locked", index > ready);

        if (index > ready) {
            setText(card.querySelector(".intensity-effect"), `Needs ${Math.round(intensity.at * 100)}% charge`);
            setText(card.querySelector(".intensity-water"), "");
            continue;
        }

        const preview = previewOf(world, id, intensity, chargeHeld(s), stabilityOf(s));
        setText(card.querySelector(".intensity-effect"),
            `+${percent(preview.boost)} output for ${Math.round(preview.seconds)}s`);
        // Capped, since anything past a full tile floods it and runs off rather than counting
        const room = id ? Math.max(0, preview.ceiling - buildupOn(world, id, kind)) : 1;
        setText(card.querySelector(".intensity-water"), !coreNodeBought("environment")
            ? ""
            : id ? `+${percent(Math.min(1, room, preview.soak))} ${buildupNoun(kind)} on the tile`
                + (preview.ceiling < 1 ? `, up to ${percent(preview.ceiling)}` : "")
            : preview.ceiling < 1 ? `Never takes the ground past ${percent(preview.ceiling)}`
            : `Settles in by how much the ground can take`);
    }
}

function updateRelease(el, s, world, kind) {
    const id = targetTile(world);
    const intensity = pickedIntensity(s);
    const button = el.querySelector(".release-button");
    const falling = isPrecipitating(world);
    const breaking = falling && cardActive("cloudBreak");
    const ready = breaking || canRelease(s, world);

    setClass(button, "inactive", !ready);
    setText(button, breaking ? "Call it off"
        : falling ? "Still falling"
        : `Release ${intensityName(intensity, kind).toLowerCase()}`);

    // While falling, report the tile and kind coming down rather than what the picker is on
    const onNow = fallingKind(world);
    const soaks = coreNodeBought("environment");
    setText(el.querySelector(".release-target"), falling
        ? `${PRECIPITATION[onNow].name} is already falling on ${world.weatherTile}, for ${Math.ceil(world.weatherSeconds)} more seconds.`
            + (soaks ? ` It's ${Math.round(buildupOn(world, world.weatherTile, onNow) * 100)}% ${buildupState(onNow)}.` : "")
        : !id ? "No target. Pick a tile over on the World map."
        : `Target ${id} is ${TERRAIN[tileKind(world, id)].name.toLowerCase()}`
            + (soaks ? `, ${Math.round(buildupOn(world, id, kind) * 100)}% ${buildupState(kind)}.` : ".")
            + (soaks && shedsPrecipitation(world, id, kind)
                ? ` That ground can't take ${PRECIPITATION[kind].name.toLowerCase()}.` : ""));
}

function summary(world, s, kind) {
    if (isPrecipitating(world)) {
        const onNow = PRECIPITATION[fallingKind(world)];
        return `${onNow.name} is falling on ${world.weatherTile} for another ${Math.ceil(world.weatherSeconds)}s,`
            + ` giving that tile +${percent(PRODUCTION_BOOST * (world.weatherPower || 0))} production`
            + `${onNow.growsGrass ? " and faster growth under it" : ""}.`;
    }

    const cost = chargeCost(world).mul(capacity());
    const opening = `A cloud of this size costs ${formatNumber(cost)} Blue Essence to fill.`;

    if (!coreNodeBought("environment")) return `${opening} Aim it at a grassy tile to speed up its growth`
        + ` and get a Blue Essence multiplier while it falls.`;

    const held = buildupState(kind);
    return `${opening} Grass under weather and ${held} tiles give a Blue Essence multiplier.`
        + ` Duration depends on the cloud's stability. Ground that's already ${held} gets less of a boost.`
        + ` A tile that reaches 100% ${held} turns into`
        + ` ${TERRAIN[PRECIPITATION[kind].becomes].name.toLowerCase()}.`
        + ` Ground dries out fully in about`
        + ` ${(DRYING_SECONDS / 60).toFixed(1)} minutes, faster as it gets drier.`;
}


//    !!! MARKUP AND ART !!!

const tickMarkup = (fill) => `
    <div class="charge-tick" style="--at: ${trackAt(fill).toFixed(4)}">
        <span>${Math.round(fill * 100)}</span>
    </div>`;

function cloudArt(kind, index) {
    const drops = [];
    const columns = [[30, 0], [56, -6], [82, -2], [43, 8], [69, 6], [17, 10]];
    const count = index < 0 ? 0 : (index + 1) * 2;

    for (let i = 0; i < count; i++) {
        const [x, offset] = columns[i];
        drops.push(kind === "snow"
            ? `<circle class="cloud-flake" cx="${x}" cy="${74 + offset}" r="3.2" style="--delay: ${i * 0.22}s"/>`
            : `<path class="cloud-drop" d="M${x} ${68 + offset} L${x - 2} ${82 + offset}" style="--delay: ${i * 0.18}s"/>`);
    }

    return `
        <svg class="cloud-svg" viewBox="0 0 112 104" data-stage="${index}" aria-hidden="true">
            <g class="cloud-body">
                <circle cx="34" cy="40" r="16"/>
                <circle cx="58" cy="31" r="21"/>
                <circle cx="80" cy="41" r="14"/>
                <rect x="18" y="40" width="76" height="18" rx="9"/>
            </g>
            ${drops.join("")}
        </svg>`;
}

const percent = (value) => `${(value * 100).toFixed(value < 0.1 ? 1 : 0)}%`;

// What's piling up on the tile, so a Flurry doesn't promise water
const buildupNoun = (kind) => PRECIPITATION[kind].makes === "ice" ? "snow" : "water";
const buildupState = (kind) => PRECIPITATION[kind].makes === "ice" ? "buried" : "soaked";

