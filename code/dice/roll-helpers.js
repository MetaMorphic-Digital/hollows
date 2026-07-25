import { evaluateResult } from "./roll-outcome.js";

export function normalizeRollModeValue(mode) {
  return mode === "adv" || mode === "dis" ? mode : "normal";
}

export function resolveSuggestedRollMode({ advantages = [], disadvantages = [], fallback = "normal" } = {}) {
  const hasAdvantage = advantages.some(Boolean);
  const hasDisadvantage = disadvantages.some(Boolean);
  if (hasAdvantage && hasDisadvantage) return "normal";
  if (hasAdvantage) return "adv";
  if (hasDisadvantage) return "dis";
  return normalizeRollModeValue(fallback);
}

export function normalizeRange(value) {
  const v = String(value || "").toLowerCase();
  if (v.includes("close")) return "Close";
  if (v.includes("ranged")) return "Ranged";
  return null;
}

export function evaluateRollOutcome(value, statValue, tn = null) {
  const v = Number(value ?? 0);
  const stat = Number(statValue ?? 0);
  const target = tn === undefined ? null : tn;
  return evaluateResult(v, stat, target);
}
