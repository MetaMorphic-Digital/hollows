import { chooseRollResult } from "./roll-outcome.js";
import { normalizeRollModeValue } from "./roll-helpers.js";

function extractRollResults(roll) {
  let results = roll?.terms?.[0]?.results?.map(r => r.result);
  if (!Array.isArray(results) || !results.length) {
    const fallback = Number(roll?.total ?? roll?.result ?? 0);
    results = [Number.isNaN(fallback) ? 0 : fallback];
  }
  return results;
}

export async function resolveD20ModeRoll(mode = "normal") {
  const effectiveMode = normalizeRollModeValue(mode);
  const formula = effectiveMode === "normal" ? "1d20" : "2d20";
  const roll = await new Roll(formula).evaluate();
  const results = extractRollResults(roll);
  let value = results[0] ?? 0;
  if (effectiveMode === "adv") {
    value = Math.max(...results);
  } else if (effectiveMode === "dis") {
    value = Math.min(...results);
  }
  return { roll, results, value, effectiveMode };
}

export async function resolveHunterStatRoll({
  statValue,
  tn,
  mode,
  useFocus = false,
  focusCount = 0,
  spendFocus = null
} = {}) {
  const focusActive = !!useFocus && Number(focusCount) > 0;
  const { roll, results, effectiveMode } = await resolveD20ModeRoll(mode);
  const { chosen } = chooseRollResult(results, statValue, tn, effectiveMode);
  if (focusActive && typeof spendFocus === "function") {
    await spendFocus();
  }
  return { roll, results, chosen, useFocus: focusActive, effectiveMode };
}
