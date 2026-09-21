// biomass.js
//
// What biomass is worth, kept apart from the pond that makes it

import { getLayerState } from "../../../core/state.js";
import { registerBoost } from "../../../core/boosts.js";
import { D } from "../../../utils/decimal.js";
import { formatNumber } from "../../../utils/format.js";

// How biomass scales, before and after the softcap
const MULT_PER_DECADE = 0.8;
const MULT_ACCEL = 2;
const SOFTCAP_BONUS = 60;
const SOFTCAP_SCALE = 120;
const SOFTCAP_POWER = 0.75;

export function biomassMultiplier() {
    const biomass = D(getLayerState("pond").resources.biomass || 0);
    if (biomass.lte(1)) return D(1);

    const raw = biomass.log10().pow(MULT_ACCEL).mul(MULT_PER_DECADE);
    if (raw.lte(SOFTCAP_BONUS)) return D(1).add(raw);

    const excess = raw.sub(SOFTCAP_BONUS);
    const damped = excess.div(SOFTCAP_SCALE).add(1).pow(SOFTCAP_POWER).sub(1).mul(SOFTCAP_SCALE);
    return D(1).add(SOFTCAP_BONUS).add(damped);
}

// What the multiplier is worth right now, for the readout on the Biomass chip
export const biomassNote = () => `x${formatNumber(biomassMultiplier())} to all essence production`;

const ESSENCES = new Set(["greenEssence", "blueEssence"]);
registerBoost("Biomass", (resourceId) => ESSENCES.has(resourceId) ? biomassMultiplier() : 1);
