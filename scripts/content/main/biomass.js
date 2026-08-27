// biomass.js
//
// What biomass is worth wherever it's held, kept apart from the pond that produces it.

import { getLayerState } from "../../core/state.js";
import { registerBoost } from "../../core/boosts.js";
import { D } from "../../utils/decimal.js";
import { formatNumber } from "../../utils/format.js";

// Biomass bonuses (what it affects, how much bonus)
const MULT_PER_DECADE = 0.5;
const MULT_ACCEL = 1.5;      // >1, so later decades are worth more than earlier ones
const SOFTCAP_BONUS = 6;      // Where the curve bends (around 5e9 biomass)
const SOFTCAP_SCALE = 6;      // How much excess is worth one "unit" past the bend
const SOFTCAP_POWER = 0.35;   // How hard it's damped past bend

export function biomassMultiplier() {
    const biomass = D(getLayerState("pond").resources.biomass || 0);
    if (biomass.lte(1)) return D(1);

    const raw = biomass.log10().pow(MULT_ACCEL).mul(MULT_PER_DECADE);
    if (raw.lte(SOFTCAP_BONUS)) return D(1).add(raw);

    const excess = raw.sub(SOFTCAP_BONUS);
    const damped = excess.div(SOFTCAP_SCALE).add(1).pow(SOFTCAP_POWER).sub(1).mul(SOFTCAP_SCALE);
    return D(1).add(SOFTCAP_BONUS).add(damped);
}

// What the multiplier is worth right now, for the readout on the Biomass chip.
export const biomassNote = () => `x${formatNumber(biomassMultiplier())} to all essence production`;

// Essence only - biomass boosting itself would run away with the whole game.
const ESSENCES = new Set(["greenEssence", "blueEssence"]);
registerBoost("Biomass", (resourceId) => ESSENCES.has(resourceId) ? biomassMultiplier() : 1);
