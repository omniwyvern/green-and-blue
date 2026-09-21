// iceFieldSublayer.js
//
// The cut is the click target, with the stake, a plate per bed, and one readout

import { stepNote } from "../../../core/resources.js";
import { D } from "../../../utils/decimal.js";
import { setText, setVar, setClass } from "../../../utils/dom.js";
import { fitWide, fitText, textBox } from "../../../render/fit.js";
import { setRichText, upgradeDescription, rateText } from "../../../render/richText.js";
import { formatNumber, formatPercent } from "../../../utils/format.js";
import {
    STRATA, RELIEF, iceState, fieldTiles, fieldIsBare, fieldScale, isSnowing, packOf, packTotal,
    loadOn, loadBonus, looseSnow, looseCapacity, looseFraction, looseFull, snowfallRate,
    pressureOf, workFloor, windowLow, windowHigh, inWindow, activeStep, overloaded,
    stratumUnitYield, fieldProduction, spillIfCollapsed, isSettling, settlingLeft, pressPack,
    canEase, easeOff, easeOpen, CREEP_LOAD, SNOWFALL_PER_LEVEL, CORNICE_PER_LEVEL,
    SHELTER_PER_LEVEL, SHOVEL_PER_LEVEL, CREEP_PER_LEVEL, TAMP_PER_LEVEL, EVEN_LOAD_PER_LEVEL,
    ANNEAL_PER_LEVEL, CRUST_PER_LEVEL, SLAB_PER_LEVEL, FRACTURE_PER_LEVEL,
    GRAIN_PER_LEVEL, SINTER_STEP_PER_LEVEL, OVERBURDEN_PER_LEVEL, GLACIAL_PER_LEVEL,
    BEARING_PER_LEVEL, spreadShare,
} from "../systems/iceField.js";

const mass = (value) => value >= 1000 ? formatNumber(value) : value.toFixed(1);


export const ICE_FIELD_VIEW = {
    name: "Ice Field",
    color: "#8fd0e8",
    canvasType: "static",
    canvasClass: "ice-canvas",

    scene: {
        build(el) {
            el.className = "static-scene ice-scene";
            el.innerHTML = `
                <div class="ice-cut" role="button" tabindex="0" title="Press the snowpack">
                    <div class="ice-sky">
                        <span class="ice-fall"></span>
                        <span class="ice-fall far"></span>
                    </div>
                    <div class="ice-body">
                        <span class="ice-drift"></span>
                        <div class="ice-strata">
                            ${STRATA.map((stratum, index) => `
                                <div class="ice-stratum" data-stratum="${index}"
                                    style="--stratum: ${stratum.color}; --depth: ${index / (STRATA.length - 1)}">
                                    <span class="ice-bed">
                                        <span class="ice-bed-mass"></span>
                                        <span class="ice-bed-name">${stratum.name}</span>
                                    </span>
                                </div>`).join("")}
                        </div>
                        <span class="ice-rock"></span>
                        <span class="ice-puff"></span>
                    </div>
                </div>

                <div class="ice-hud">
                    <div class="ice-over">
                        <div class="ice-caption"></div>

                        <div class="ice-panel">
                            <div class="ice-slate-name"></div>
                            <div class="ice-slate-blurb"></div>
                            <div class="ice-slate-load"></div>
                            <div class="ice-slate-pay"></div>
                        </div>
                    </div>

                    <div class="ice-stake">
                        <div class="ice-stake-track">
                            <div class="ice-stake-bands">
                                ${STRATA.slice(1).map((stratum, step) => `
                                    <div class="ice-stake-band" data-step="${step}"
                                        style="--stratum: ${stratum.color}"
                                        title="Where ${STRATA[step].name} gives into ${stratum.name}">
                                        <div class="ice-stake-window"></div>
                                    </div>`).join("")}
                            </div>
                            <div class="ice-stake-fill"></div>
                            <div class="ice-stake-floor"></div>
                            <div class="ice-stake-mark"></div>
                        </div>
                        <div class="ice-stake-label">
                            <span class="ice-stake-value"></span> on the pack
                        </div>
                        <button class="ice-ease" type="button">Ease off</button>
                    </div>

                </div>
            `;

            const cutEl = el.querySelector(".ice-cut");
            const press = () => {
                if (!pressPack()) return;
                cutEl.classList.remove("puffed");
                void cutEl.offsetWidth;
                cutEl.classList.add("puffed");
                paint(el);
            };

            cutEl.addEventListener("pointerdown", (e) => { e.preventDefault(); press(); });
            cutEl.addEventListener("keydown", (e) => {
                if (e.key === " " || e.key === "Enter") { e.preventDefault(); press(); }
            });

            el.__reading = -1;
            el.querySelectorAll(".ice-stratum").forEach((bed, index) => {
                bed.addEventListener("pointerenter", () => { el.__reading = index; paint(el); });
                bed.addEventListener("pointerleave", () => {
                    if (el.__reading === index) { el.__reading = -1; paint(el); }
                });
            });

            el.querySelector(".ice-ease").addEventListener("click", (e) => {
                e.stopPropagation();
                if (easeOff()) paint(el);
            });
        },

        update: paint,
    },

    drawers: {
        snowfall: {
            label: "Snowfall",
            color: "#bcdff2",
            upgrades: {
                snowfall: {
                    title: "Heavier Falls",
                    max: 15,
                    description: (s, lvl) => upgradeDescription(
                        `Snow gathers on the field ${formatPercent(SNOWFALL_PER_LEVEL * lvl)} faster, snowing or not.`,
                        stepNote(lvl, 15, `+${formatPercent(SNOWFALL_PER_LEVEL)}`)),
                    cost: (s, lvl) => ({ blueEssence: D(1e29).mul(D(2.4).pow(lvl)) }),
                },

                cornice: {
                    title: "Taller Drifts",
                    description: (s, lvl) => upgradeDescription(
                        `The field holds ${formatPercent(CORNICE_PER_LEVEL * lvl)} more loose snow.`,
                        stepNote(lvl, 10, `+${formatPercent(CORNICE_PER_LEVEL)}`)),
                    max: 10,
                    cost: (s, lvl) => ({ blueEssence: D(1.6e29).mul(D(3.4).pow(lvl)) }),
                },
                shelter: {
                    title: "Wind Shadow",
                    description: (s, lvl) => upgradeDescription(
                        "Wind blows away"
                        + ` ${formatPercent(Math.min(1, SHELTER_PER_LEVEL * lvl))} less loose snow.`,
                        stepNote(lvl, 5, `+${formatPercent(SHELTER_PER_LEVEL)}`)),
                    max: 5,
                    cost: (s, lvl) => ({ blueEssence: D(4e29).mul(D(10).pow(lvl)) }),
                },
                shoveling: {
                    title: "Broad Shovel",
                    description: (s, lvl) => upgradeDescription(
                        "Each press loads"
                        + ` ${formatPercent(SHOVEL_PER_LEVEL * lvl)} more snow onto the pack.`,
                        stepNote(lvl, 12, `+${formatPercent(SHOVEL_PER_LEVEL)}`)),
                    max: 12,
                    cost: (s, lvl) => ({ blueEssence: D(2e29).mul(D(2.85).pow(lvl)) }),
                },
            },
        },

        pressure: {
            label: "Pressure",
            color: "#7fc4e2",
            upgrades: {
                coldCreep: {
                    title: "Slow Bleed",
                    description: (s, lvl) => upgradeDescription(
                        "Pressure drains"
                        + ` ${formatPercent(Math.min(0.75, CREEP_PER_LEVEL * lvl))} slower, so deep windows need fewer presses.`,
                        stepNote(lvl, 6, `+${formatPercent(CREEP_PER_LEVEL)}`)),
                    max: 6,
                    cost: (s, lvl) => ({ blueEssence: D(3e29).mul(D(8).pow(lvl)) }),
                },
                tamping: {
                    title: "Heavier Presses",
                    description: (s, lvl) => upgradeDescription(
                        "Each press adds"
                        + ` ${formatPercent(TAMP_PER_LEVEL * lvl)} more pressure.`,
                        stepNote(lvl, 6, `+${formatPercent(TAMP_PER_LEVEL)}`)),
                    max: 6,
                    cost: (s, lvl) => ({ blueEssence: D(4e29).mul(D(8).pow(lvl)) }),
                },
                evenLoad: {
                    title: "Even Load",
                    description: (s, lvl) => upgradeDescription(
                        `Every window starts ${(Math.min(0.5, EVEN_LOAD_PER_LEVEL * lvl) * 100).toFixed(1)}% lower on the meter.`,
                        stepNote(lvl, 8, `+${(EVEN_LOAD_PER_LEVEL * 100).toFixed(1)}%`)),
                    max: 8,
                    cost: (s, lvl) => ({ blueEssence: D(1e30).mul(D(4).pow(lvl)) }),
                },
                annealing: {
                    title: "Forgiving Press",
                    description: (s, lvl) => upgradeDescription(
                        "Overshooting a window wastes"
                        + ` ${formatPercent(Math.min(0.8, ANNEAL_PER_LEVEL * lvl))} less snow.`,
                        stepNote(lvl, 5, `+${formatPercent(ANNEAL_PER_LEVEL)}`)),
                    max: 5,
                    cost: (s, lvl) => ({ blueEssence: D(2e30).mul(D(10).pow(lvl)) }),
                },
                loadSpread: {
                    title: "Load Spread",
                    description: (s, lvl) => upgradeDescription(
                        "A press also works"
                        + ` ${formatPercent(spreadShare(lvl))} of the step above its window.`,
                        stepNote(lvl, 8, `+${formatPercent(spreadShare(lvl + 1) - spreadShare(lvl))}`)),
                    max: 8,
                    cost: (s, lvl) => ({ blueEssence: D(2e30).mul(D(4).pow(lvl)) }),
                },
                windCrust: {
                    title: "Wind Crust",
                    description: (s, lvl) => upgradeDescription(
                        "Pressing high on the meter throws off"
                        + ` ${formatPercent(Math.min(0.8, CRUST_PER_LEVEL * lvl))} less Fresh Snow.`,
                        stepNote(lvl, 5, `+${formatPercent(CRUST_PER_LEVEL)}`)),
                    max: 5,
                    cost: (s, lvl) => ({ blueEssence: D(1e30).mul(D(10).pow(lvl)) }),
                },
                windScour: {
                    title: "Pressure Release",
                    description: "Opens Ease off, which dumps "
                        + `${formatPercent(RELIEF)} of the pressure at once. Use it to drop back to a lower`
                        + " window or recover from an overshoot.",
                    max: 1,
                    cost: () => ({ blueEssence: D(2e30) }),
                },
                settlingCreep: {
                    title: "Slow Churn",
                    description: (s, lvl) => upgradeDescription(
                        "The field loads and presses snow on its own, up to the first window:"
                        + ` ${(CREEP_LOAD * lvl).toFixed(2)} snow a second.`,
                        stepNote(lvl, 5, `+${CREEP_LOAD.toFixed(2)}`)),
                    max: 5,
                    cost: (s, lvl) => ({ blueEssence: D(2e31).mul(D(7).pow(lvl)) }),
                },
            },
        },

        compaction: {
            label: "Compaction",
            color: "#6fb3dd",
            upgrades: {
                grainGrowth: {
                    title: "Light Squeeze",
                    description: (s, lvl) => upgradeDescription(
                        `In the ${formatPercent(windowLow(0))}-${formatPercent(windowHigh(0))} window,`
                        + ` presses turn Fresh Snow into Packed Snow faster by ${formatPercent(GRAIN_PER_LEVEL * lvl)}.`,
                        stepNote(lvl, 10, `+${formatPercent(GRAIN_PER_LEVEL)}`)),
                    max: 10,
                    cost: (s, lvl) => ({ blueEssence: D(1.2e29).mul(D(3.3).pow(lvl)) }),
                },
                recrystallize: {
                    title: "Hard Squeeze",
                    description: (s, lvl) => upgradeDescription(
                        `In the ${formatPercent(windowLow(1))}-${formatPercent(windowHigh(1))} window,`
                        + ` presses turn Packed Snow into Dense Snow faster by ${formatPercent(SINTER_STEP_PER_LEVEL * lvl)}.`,
                        stepNote(lvl, 10, `+${formatPercent(SINTER_STEP_PER_LEVEL)}`)),
                    max: 10,
                    cost: (s, lvl) => ({ blueEssence: D(1e30).mul(D(3).pow(lvl)) }),
                },
                overburden: {
                    title: "Deep Squeeze",
                    description: (s, lvl) => upgradeDescription(
                        `In the ${formatPercent(windowLow(2))}-${formatPercent(windowHigh(2))} window,`
                        + ` presses turn Dense Snow into Firn faster by ${formatPercent(OVERBURDEN_PER_LEVEL * lvl)}.`,
                        stepNote(lvl, 10, `+${formatPercent(OVERBURDEN_PER_LEVEL)}`)),
                    max: 10,
                    cost: (s, lvl) => ({ blueEssence: D(4e30).mul(D(2.8).pow(lvl)) }),
                },
                glacialPress: {
                    title: "Glacial Press",
                    description: (s, lvl) => upgradeDescription(
                        `In the ${formatPercent(windowLow(3))}-${formatPercent(windowHigh(3))} window,`
                        + ` presses turn Firn into Ice faster by ${formatPercent(GLACIAL_PER_LEVEL * lvl)}.`,
                        stepNote(lvl, 10, `+${formatPercent(GLACIAL_PER_LEVEL)}`)),
                    max: 10,
                    cost: (s, lvl) => ({ blueEssence: D(1e31).mul(D(2.6).pow(lvl)) }),
                },
                firnLine: {
                    title: "Bearing Down",
                    description: (s, lvl) => upgradeDescription(
                        `Snow on top of a layer boosts it ${formatPercent(BEARING_PER_LEVEL * lvl)} more.`,
                        stepNote(lvl, 8, `+${formatPercent(BEARING_PER_LEVEL)}`)),
                    max: 8,
                    cost: (s, lvl) => ({ blueEssence: D(2e30).mul(D(4).pow(lvl)) }),
                },
                slabBonding: {
                    title: "Holds Together",
                    description: (s, lvl) => upgradeDescription(
                        `A collapse loses ${formatPercent(Math.min(1, SLAB_PER_LEVEL * lvl))} less of the pack.`,
                        stepNote(lvl, 5, `+${formatPercent(SLAB_PER_LEVEL)}`)),
                    max: 5,
                    cost: (s, lvl) => ({ blueEssence: D(6e29).mul(D(10).pow(lvl)) }),
                },
                fractureLines: {
                    title: "Quick Recovery",
                    description: (s, lvl) => upgradeDescription(
                        "After a collapse, the pack settles"
                        + ` ${formatPercent(Math.min(0.8, FRACTURE_PER_LEVEL * lvl))} faster.`,
                        stepNote(lvl, 5, `+${formatPercent(FRACTURE_PER_LEVEL)}`)),
                    max: 5,
                    cost: (s, lvl) => ({ blueEssence: D(4e29).mul(D(10).pow(lvl)) }),
                },
            },
        },
    },
};


//    !!! PAINTING !!!

function paint(el) {
    const s = iceState();
    const bare = fieldIsBare();
    const step = bare ? -1 : activeStep(s);

    paintCut(el, s, bare, step);
    paintStake(el, s, bare);
    const said = caption(s, bare);
    const captionEl = el.querySelector(".ice-caption");
    setRichText(captionEl, said);
    fitText(captionEl, said);
    squareToCaption(el.querySelector(".ice-over"), captionEl);

    const ease = el.querySelector(".ice-ease");
    ease.hidden = !easeOpen();
    setClass(ease, "inactive", !canEase(s));

    paintSlate(el, s, bare);
}

function paintCut(el, s, bare, step) {
    const pack = packOf(s);
    const total = packTotal(s);
    const strata = el.querySelectorAll(".ice-stratum");

    // Every bed keeps a sliver of the cut so a thin one still reads, and the shares are normalized to fill it
    const shares = pack.map(m => 0.08 + 0.92 * (total > 0 ? m / total : 0));
    const spread = shares.reduce((sum, share) => sum + share, 0);

    for (let i = 0; i < strata.length; i++) {
        setVar(strata[i], "--share", (shares[i] / spread).toFixed(4));
        setClass(strata[i], "empty", pack[i] <= 0);
        setClass(strata[i], "working", i === step);
        setClass(strata[i], "reading", i === el.__reading);
        setText(strata[i].querySelector(".ice-bed-mass"), pack[i] > 0 ? mass(pack[i]) : "-");
    }

    setClass(el.querySelector(".ice-sky"), "snowing", isSnowing());

    const drift = el.querySelector(".ice-drift");
    setVar(drift, "--drift", looseFraction(s).toFixed(4));
    setClass(drift, "full", looseFull(s));

    const cutEl = el.querySelector(".ice-cut");
    setClass(cutEl, "settling", isSettling(s));
    setClass(cutEl, "bare", bare);
}

function paintStake(el, s, bare) {
    const track = el.querySelector(".ice-stake-track");
    const bands = track.querySelectorAll(".ice-stake-band");

    for (let i = 0; i < bands.length; i++) {
        setVar(bands[i], "--low", windowLow(i).toFixed(4));
        setVar(bands[i], "--high", windowHigh(i).toFixed(4));
        setClass(bands[i], "lit", !bare && inWindow(i, s));
    }

    const at = pressureOf(s);
    const over = overloaded(s);
    setVar(track, "--at", at.toFixed(4));
    setVar(track, "--floor", workFloor().toFixed(4));
    setClass(track, "over", over);
    setClass(el.querySelector(".ice-stake-label"), "over", over);

    setText(el.querySelector(".ice-stake-value"), formatPercent(at));
}

function caption(s, bare) {
    if (bare) return "There is nothing here to lean on.";
    if (isSettling(s)) {
        return `The pack is broken and settling, ${settlingLeft(s).toFixed(1)}s of it left.`;
    }
    if (overloaded(s)) {
        return `Leaning harder than any of it will take. If the pack goes, ${mass(spillIfCollapsed(s))}`
            + " of it slides off the field.";
    }

    const step = activeStep(s);
    if (step >= 0) {
        return `The weight is sitting where ${STRATA[step].name} gives, and it is turning into`
            + ` ${STRATA[step + 1].name}.`;
    }
    if (pressureOf(s) < workFloor()) {
        return `Too slack to shift anything. The snow starts giving at ${formatPercent(workFloor())}.`;
    }
    return "The weight is standing between depths, and nothing down there is giving.";
}

const payLines = (output, none, amount = 1) => {
    const lines = Object.keys(output).map(id => rateText(id, output[id].mul(amount)));
    return lines.length ? lines.join("\n") : none;
};

function paintSlate(el, s, bare) {
    const index = el.__reading;
    const lines = index >= 0 && !bare ? bedSlate(index, s) : fieldSlate(s, bare);

    const nameEl = el.querySelector(".ice-slate-name");
    setText(nameEl, lines[0]);
    fitWide(nameEl, lines[0]);

    // The numbers keep their size and their place, so only the flavor gives ground
    const blurb = el.querySelector(".ice-slate-blurb");
    setRichText(blurb, lines[1]);
    fitText(blurb, lines[1]);

    setRichText(el.querySelector(".ice-slate-load"), lines[2]);
    setRichText(el.querySelector(".ice-slate-pay"), lines[3]);
}

// The readout is cut to the width of the words stood over it, so it never sprawls wider than what it answers
function squareToCaption(over, caption) {
    const wanted = Math.ceil(textBox(caption).width / 8) * 8;
    setVar(over, "--slate-fit", `${wanted}px`);
}

function bedSlate(index, s) {
    const held = packOf(s)[index];
    return [
        `${STRATA[index].name}, ${mass(held)}`,
        STRATA[index].blurb,
        `x${loadBonus(index, s).toFixed(2)} from ${mass(loadOn(index, s))} on top`,
        payLines(stratumUnitYield(index), "Paying nothing", held),
    ];
}

function fieldSlate(s, bare) {
    if (bare) {
        return ["No ice field", "Bury a tile in snow on the World map and it will show up here.",
            "", ""];
    }

    const tiles = fieldTiles();

    return [
        `${tiles} tile${tiles === 1 ? "" : "s"} of ice field`,
        `A drift of ${mass(looseSnow(s))} of ${mass(looseCapacity())} stands on the pack,`
            + ` gathering ${snowfallRate().toFixed(2)}/s${isSnowing() ? " as snow falls" : ""}.`,
        `x${formatNumber(fieldScale())} on the pack`,
        payLines(fieldProduction(s), "Paying nothing yet"),
    ];
}
