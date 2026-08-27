// precipitationSublayer.js
//
// The cloud, and the game of filling it. Charge builds while the band covers the mark and
// Stability drains while it does; run Stability out and the cloud bursts early for a fraction
// of what it held. Releasing picks an intensity and a tile.
//
// The cloud is this layer's. The event it turns into belongs to the world, where the tile is.

import { registerLayer } from "../../core/registry.js";
import { getLayerState } from "../../core/state.js";
import { spend, getLevel } from "../../core/resources.js";
import { D } from "../../utils/decimal.js";
import { setText, setWidth } from "../../utils/dom.js";
import { setRichText } from "../../render/richText.js";
import { formatNumber } from "../../utils/format.js";
import { cardBonus, cardActive } from "./cards.js";
import {
    PRECIPITATION, PRECIPITATION_KINDS, PRECIPITATION_SECONDS, PRODUCTION_BOOST, TERRAIN,
    DRYING_SECONDS, ORIGIN_TILE, worldState, isPrecipitating, precipitationKind, setPrecipitationKind,
    fallingKind, buildupOn, isClaimed, tileKind, grassOn, claimedTiles, shedsPrecipitation,
    startPrecipitation, stopPrecipitation, chargeCost, soakScale, soakScaleForKind, wetnessFactor,
} from "./worldMap.js";
import { switchToLayer } from "../../render/canvasRouter.js";

const environmentBought = () => !!getLayerState("cores").purchasedUpgrades.environment;
const cloudState = () => getLayerState("precipitation");
const level = (id) => getLevel(cloudState(), id);


const BASE_CAPACITY = 1;
const CAPACITY_PER_LEVEL = 0.2;

const CHARGE_PER_SECOND = 0.045;
const CHARGE_RAMP = 1.5;
const CHARGE_PER_LEVEL = 0.15;

const STABILITY_DECAY = 0.05;
const DECAY_RAMP = 3;
const STABILITY_RECOVERY = 0.06;
const RECOVERY_PER_LEVEL = 0.2;
const PRESSURE = 0.12;              // Lost per second per fill past what it can hold
const TOLERANCE = 0.5;              // How full it can sit without any loss
const TOLERANCE_PER_LEVEL = 0.06;

const BURST_SHARE = 0.45;
const BURST_STABILITY = 0.35;

const BAND_HALF = 0.09;
const BAND_PER_LEVEL = 0.02;
const LIFT = 3;
const GRAVITY = 1.5;
const DRAG = 2;

const MARK_FLOOR = 0.2;

const GRACE_SECONDS = 0.75;

const POWER_PER_LEVEL = 0.25;       // Per level of an intensity's own upgrade
const RUNOFF_PER_LEVEL = 0.08;      // Water the light intensities stop leaving behind
const MIN_RUNOFF = 0.4;
const DELUGE_PER_LEVEL = 0.15;      // Extra water a downpour adds

const DRIFTING_CHARGE = 0.4;        // What a cloud that wasn't built is worth (the rain dance card)

const IDLE_AFTER_MS = 250;          // How long without a frame before the tick takes the cloud over

// How much of its duration a release keeps, by the Stability it was let go at.
const DURATION_FLOOR = 1 / 3;       // What's left of it with no stability
const durationFactor = (stability) => DURATION_FLOOR + (1 - DURATION_FLOOR) * stability;

// "soak" is what one full-charge release at full stability leaves 
export const INTENSITIES = [
    {
        id: "light", at: 0.25, power: 0.6, soak: 0.1, seconds: 0.8, upgrade: "fineMist",
        names: { rain: "Drizzle", snow: "Flurry" },
    },
    {
        id: "steady", at: 0.5, power: 1, soak: 0.4, seconds: 1, upgrade: "steadyFall",
        names: { rain: "Rain", snow: "Snow" },
    },
    {
        id: "heavy", at: 0.75, power: 1.8, soak: 0.8, seconds: 1.2, upgrade: "cloudburst",
        names: { rain: "Downpour", snow: "Heavy Snow" },
    },
];

export const intensityName = (intensity, kind) => intensity.names[kind] || intensity.names.rain;



export const capacity = () => BASE_CAPACITY * (1 + CAPACITY_PER_LEVEL * level("deeperClouds"));
export const chargeHeld = (s = cloudState()) => s.charge || 0;
// How much of what's in the cloud has already been paid for.
const paidFor = (s = cloudState()) => s.paidCharge || 0;
export const fillOf = (s = cloudState()) => Math.min(1, chargeHeld(s) / capacity());
export const stabilityOf = (s = cloudState()) => (s.stability === undefined ? 1 : s.stability);

const chargeRate = (fill) => CHARGE_PER_SECOND * (1 + CHARGE_RAMP * fill)
    * (1 + CHARGE_PER_LEVEL * level("updraft")) * (1 + cardBonus("rainCharge"));

const decayRate = (fill) => STABILITY_DECAY * (1 + DECAY_RAMP * fill * fill);

const recoveryRate = (fill) =>
    STABILITY_RECOVERY * (1 + RECOVERY_PER_LEVEL * level("calmAir"))
    - PRESSURE * Math.max(0, fill - tolerance());

const tolerance = () => Math.min(1, TOLERANCE + TOLERANCE_PER_LEVEL * level("pressureTolerance"));

const bandHalf = () => BAND_HALF + BAND_PER_LEVEL * level("broadFront");

// Everything drawn on the bar goes through this.
export const trackAt = (fill) => MARK_FLOOR + fill * (1 - MARK_FLOOR);
const covers = (at, fill) => Math.abs(at - trackAt(fill)) <= bandHalf();

// -1 is a cloud that isn't worth releasing yet.
export const readyIndex = (s = cloudState()) => {
    const fill = fillOf(s);
    let best = -1;
    for (let i = 0; i < INTENSITIES.length; i++) if (fill >= INTENSITIES[i].at) best = i;
    return best;
};

export const pickedIndex = (s = cloudState()) =>
    Math.max(0, Math.min(INTENSITIES.length - 1, Number(s.intensity) || 0));

export const pickedIntensity = (s = cloudState()) => INTENSITIES[pickedIndex(s)];

export function setIntensity(index) {
    if (!INTENSITIES[index]) return false;
    cloudState().intensity = index;
    return true;
}

export const targetTile = (world = worldState()) =>
    world.selectedTile && isClaimed(world, world.selectedTile) ? world.selectedTile : null;

export const canRelease = (s = cloudState(), world = worldState()) =>
    !isPrecipitating(world) && !!targetTile(world) && readyIndex(s) >= pickedIndex(s);


function eventFor(world, id, intensity, charge, stability) {
    const kind = precipitationKind(world);
    const power = intensity.power * (1 + POWER_PER_LEVEL * level(intensity.upgrade));
    const water = intensity.soak * runoff(intensity)
        * (1 + cardBonus("moistureRate") + (grassOn(world, id) ? 0 : cardBonus("rainSoak")))
        * (cardActive("soakDuration") ? 1 + cardBonus("rainDuration") : 1);
    const lasting = durationFactor(stability);

    return {
        strength: charge * power * wetnessFactor(world, id, kind) * (1 + cardBonus("rainBoost")),
        seconds: PRECIPITATION_SECONDS * intensity.seconds * lasting * (1 + cardBonus("rainDuration")),
        // Off the grass the soak numbers are quoted against, and onto whatever is being rained on
        soak: charge * water * lasting * soakScaleForKind("grass") / soakScale(world, id),
    };
}

const runoff = (intensity) => intensity.id === "heavy"
    ? 1 + DELUGE_PER_LEVEL * level("deluge")
    : Math.max(MIN_RUNOFF, 1 - RUNOFF_PER_LEVEL * level("lightTouch"));

// With no tile picked this reads off the origin
export const previewOf = (world, id, intensity, charge, stability) => {
    const event = eventFor(world, id || ORIGIN_TILE, intensity, charge, stability);
    return { boost: PRODUCTION_BOOST * event.strength, seconds: event.seconds, soak: event.soak };
};

// A cloud that just Appears, for the rain dance card
export function driftingEvent(world, id) {
    return eventFor(world, id, INTENSITIES[0], capacity() * DRIFTING_CHARGE, 1);
}

export function addCharge(fraction) {
    const s = cloudState();
    s.charge = Math.min(capacity(), chargeHeld(s) + fraction * capacity());
    // A cloud that blew in on its own is already paid for
    s.paidCharge = Math.max(paidFor(s), s.charge);
}

export function releaseCloud(layer) {
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

// If stability hits zero, the cloud falls for part of what it held so it's not a complete waste
// If rain is already falling and it bursts, I think it just doesn't do anything?
function burst(s) {
    const world = worldState();
    const index = readyIndex(s);
    const id = targetTile(world);
    if (index >= 0 && id && !isPrecipitating(world)) {
        startPrecipitation(world, id,
            eventFor(world, id, INTENSITIES[index], chargeHeld(s) * BURST_SHARE, BURST_STABILITY));
        s.paidCharge = Math.max(0, paidFor(s) - chargeHeld(s) * BURST_SHARE);
    }
    s.charge = 0;
    s.stability = BURST_STABILITY;
    burstAt = performance.now();
}


let band = BAND_HALF;
let bandVelocity = 0;
let holding = false;
let sinceHeld = GRACE_SECONDS;
let starved = false;        // Charging stalled because there was no Blue Essence for it
let burstAt = 0;
let live = null;            // The scene currently on screen, if any
let frameHandle = 0;
let lastFrameAt = 0;
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

function stepCloud(dt, layer) {
    const s = cloudState();
    stepBand(dt);
    if (dt <= 0) return;

    sinceHeld = holding ? 0 : sinceHeld + dt;
    const fill = fillOf(s);

    const taking = charging(fill);
    if (taking) gatherCharge(s, dt, layer);
    else starved = false;

    if (taking || holding) s.stability = stabilityOf(s) - decayRate(fill) * dt;
    else s.stability = Math.min(1, stabilityOf(s) + recoveryRate(fill) * dt);

    if (s.stability <= 0) burst(s);
}

// Charge is billed against a receipt rather than per drop gathered
function gatherCharge(s, dt, layer) {
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

// The bar runs off the render loop so it moves at the screen's rate
function startFrames() {
    if (frameHandle) return;
    lastFrameAt = 0;
    frameHandle = requestAnimationFrame(runFrame);
}

function runFrame(now) {
    frameHandle = 0;
    if (!live || !live.el.isConnected || live.el.offsetParent === null) {
        holding = false;
        return;
    }

    const dt = lastFrameAt ? Math.min(0.1, (now - lastFrameAt) / 1000) : 0;
    lastFrameAt = now;
    lastLiveStep = now;

    stepCloud(dt, live.layer);
    paintCloud(live.el);
    frameHandle = requestAnimationFrame(runFrame);
}

window.addEventListener("pointerup", () => { holding = false; });
window.addEventListener("pointercancel", () => { holding = false; });
window.addEventListener("blur", () => { holding = false; });


export const PRECIPITATION_RESOURCES = ["greenEssence", "blueEssence"];

export const PRECIPITATION_VIEW = {
    name: "Precipitation",
    color: "#4a90d9",
    canvasType: "static",

    scene: {
        build(el, s, layer) {
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
                            <div class="charge-track">
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
                releaseCloud(layer);
            });

            el.querySelector(".map-button").addEventListener("click", () => switchToLayer("world"));

            el.__switch = null;
            el.__intensities = null;
        },

        update(el, s, layer) {
            live = { el, layer };
            startFrames();

            const world = worldState();

            // Snow only matters once the ground can hold it
            const choosable = environmentBought();
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
                    btn.classList.toggle("active", picked);
                    btn.classList.toggle("inactive", falling && !picked);
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
                    description: "Charge builds faster, so less of the cloud's Stability is spent getting there.",
                    max: 10,
                    cost: (s, lvl) => ({ blueEssence: D(1e7).mul(D(1.8).pow(lvl)) }),
                },
                calmAir: {
                    title: "Calm Air",
                    description: "Stability comes back faster whenever the cloud is left alone.",
                    max: 4,
                    cost: (s, lvl) => ({ blueEssence: D(2e7).mul(D(1.9).pow(lvl)) }),
                },
                pressureTolerance: {
                    title: "Pressure Tolerance",
                    description: "The cloud can sit fuller before the weight of it starts costing Stability by itself.",
                    max: 6,
                    cost: (s, lvl) => ({ blueEssence: D(8e6).mul(D(2.2).pow(lvl)) }),
                },
                broadFront: {
                    title: "Broad Front",
                    description: "Widens the band, so the mark is easier to hold on to.",
                    max: 5,
                    cost: (s, lvl) => ({ blueEssence: D(5e6).mul(D(2.4).pow(lvl)) }),
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
                    cost: (s, lvl) => ({ blueEssence: D(1e7).mul(D(1.7).pow(lvl)) }),
                },
                steadyFall: {
                    title: "Steady Fall",
                    description: "The middle intensity is worth more for the charge it spends.",
                    max: 5,
                    cost: (s, lvl) => ({ blueEssence: D(1e7).mul(D(1.8).pow(lvl)) }),
                },
                cloudburst: {
                    title: "Cloudburst",
                    description: "The heaviest intensity is worth more for the charge it spends.",
                    max: 5,
                    cost: (s, lvl) => ({ blueEssence: D(1e7).mul(D(2).pow(lvl)) }),
                },
                lightTouch: {
                    title: "Light Touch",
                    description: "The two lighter intensities leave less water behind, so the same ground takes them for longer.",
                    max: 5,
                    cost: (s, lvl) => ({ blueEssence: D(1e7).mul(D(2.1).pow(lvl)) }),
                },
                deluge: {
                    title: "Deluge",
                    description: "The heaviest intensity drives water far deeper, for ground you mean to change rather than keep.",
                    max: 5,
                    cost: (s, lvl) => ({ blueEssence: D(1e7).mul(D(2.1).pow(lvl)) }),
                },
            },
        },
    },
};

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

    onTick(dt, layer) {
        if (performance.now() - lastLiveStep < IDLE_AFTER_MS) return;
        holding = false;
        stepCloud(dt, layer);
    },

    ...PRECIPITATION_VIEW,
});



function paintCloud(el) {
    const s = cloudState();
    const fill = fillOf(s);
    const stability = stabilityOf(s);

    const track = el.querySelector(".charge-track");
    setVar(track, "--floor", String(MARK_FLOOR));
    setVar(track, "--mark", trackAt(fill).toFixed(4));
    setVar(track, "--band-pos", band.toFixed(4));
    setVar(track, "--band-size", (bandHalf() * 2).toFixed(4));
    track.classList.toggle("on-mark", charging(fill));
    track.classList.toggle("holding", holding);

    const meters = el.querySelectorAll(".cloud-meter");
    setWidth(meters[0].querySelector(".meter-fill"), fill);
    setText(meters[0].querySelector(".meter-value"), `${Math.round(fill * 100)}%`);
    setWidth(meters[1].querySelector(".meter-fill"), stability);
    setText(meters[1].querySelector(".meter-value"), `${Math.round(stability * 100)}%`);
    meters[1].dataset.state = stability < 0.25 ? "low" : stability < 0.55 ? "watch" : "fine";

    el.querySelector(".weather-page").classList.toggle("just-burst", performance.now() - burstAt < 700);
    setRichText(el.querySelector(".charge-hint"), hint(fill));
}

function hint(fill) {
    if (starved) return "Not enough Blue Essence to keep charging.";
    if (charging(fill)) return "Charging";
    if (holding) return "Off the mark - the cloud is straining for nothing.";
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
        ? `Nothing worth dropping yet - ${Math.round(INTENSITIES[0].at * 100)}% is the first intensity.`
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
        card.classList.toggle("active", index === picked);
        card.classList.toggle("locked", index > ready);

        if (index > ready) {
            setText(card.querySelector(".intensity-effect"), `Needs ${Math.round(intensity.at * 100)}% charge`);
            setText(card.querySelector(".intensity-water"), "");
            continue;
        }

        const preview = previewOf(world, id, intensity, chargeHeld(s), stabilityOf(s));
        setText(card.querySelector(".intensity-effect"),
            `+${percent(preview.boost)} output for ${Math.round(preview.seconds)}s`);
        // Capped, since anything past a full tile floods it and runs off rather than counting
        setText(card.querySelector(".intensity-water"), !environmentBought()
            ? ""
            : id ? `+${percent(Math.min(1, preview.soak))} ${buildupNoun(kind)} on the tile`
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

    button.classList.toggle("inactive", !ready);
    setText(button, breaking ? "Call it off"
        : falling ? "Still falling"
        : `Release ${intensityName(intensity, kind).toLowerCase()}`);

    setText(el.querySelector(".release-target"), isPrecipitating(world)
        ? `${PRECIPITATION[fallingKind(world)].name} is already falling on ${world.weatherTile}, for ${Math.ceil(world.weatherSeconds)} more seconds.`
        : !id ? "No target. Pick a tile over on the World map."
        : `Target ${id} - ${TERRAIN[tileKind(world, id)].name.toLowerCase()}`
            + `, ${Math.round(buildupOn(world, id, kind) * 100)}% ${PRECIPITATION[kind].makes === "ice" ? "buried" : "soaked"}.`
            + (shedsPrecipitation(world, id, kind)
                ? ` That ground sheds ${PRECIPITATION[kind].name.toLowerCase()} - it would take nothing.` : ""));
}

function summary(world, s, kind) {
    if (isPrecipitating(world)) {
        const left = Math.ceil(world.weatherSeconds);
        return `${PRECIPITATION[fallingKind(world)].name} is falling on ${world.weatherTile} for another ${left}s,`
            + ` worth +${percent(PRODUCTION_BOOST * (world.weatherPower || 0))} on what that tile produces`
            + `${PRECIPITATION[fallingKind(world)].growsGrass ? " and faster growth under it" : ""}.`;
    }

    const cost = chargeCost(world).mul(capacity());
    const opening = `A cloud of this size costs ${formatNumber(cost)} Blue Essence to fill.`

    if (!environmentBought()) return `${opening} Aim it at a grassy tile to speed its growth,`
        + ` and for a blue multiplier off that grass while it's falling.`;

    const wettest = wettestTile(world, kind);
    const held = PRECIPITATION[kind].makes === "ice" ? "buried" : "soaked";
    return `${opening} Grass with weather above it as well as ${held} tiles will give a blue multiplier as well.`
        + ` Duration is based on the cloud's current stability. Ground already ${held} gets less of a boost.`
        + ` If a tile becomes 100% ${held}, it will turn into`
        + ` ${TERRAIN[PRECIPITATION[kind].becomes].name.toLowerCase()}.`
        + ` Ground left alone gives up a full tile's worth every`
        + ` ${(DRYING_SECONDS / 60).toFixed(1)} minutes, quicker the drier it gets.`
}

function wettestTile(world, kind) {
    let best = null;
    for (const id of claimedTiles(world)) {
        if (shedsPrecipitation(world, id, kind)) continue;
        const at = buildupOn(world, id, kind);
        if (at > 0 && (!best || at > best.at)) best = { id, at };
    }
    return best;
}


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

function setVar(el, name, value) {
    if (el.style.getPropertyValue(name) !== value) el.style.setProperty(name, value);
}
