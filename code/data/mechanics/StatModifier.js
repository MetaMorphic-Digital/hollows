/**
 * Passive actor stat modifier — a persistent additive change (positive or
 * negative) to one or more of the carrier's stats, gated by optional triggers.
 *
 * `delta` may be a number (fixed bonus) or a function `(actor) => number`
 * (dynamic bonus recomputed at read time, e.g. Deadeye: +1 Sharp per Focus).
 * `stats` lists the affected stat keys ("*" for all); alternatively a fixed
 * per-stat `modifiers` map may be supplied directly.
 */
import { Mechanic } from "./Mechanic.js";
import { evalTriggers } from "./dsl/triggers.js";

const STAT_KEYS = ["strong", "hard", "quick", "sharp", "wise"];

function normalizeModifiers(config) {
  if (config.modifiers && typeof config.modifiers === "object") {
    const out = {};
    for (const stat of STAT_KEYS) out[stat] = Number(config.modifiers[stat] || 0);
    return out;
  }
  const stats = Array.isArray(config.stats) ? config.stats.map((s) => String(s).toLowerCase()) : [];
  const delta = Number(config.delta || 0);
  const out = {};
  for (const stat of STAT_KEYS) {
    out[stat] = stats.includes(stat) || stats.includes("*") ? delta : 0;
  }
  return out;
}

export class StatModifier extends Mechanic {
  constructor(config = {}) {
    super(config);
    this.triggers = config.triggers || {};
    // A function `delta` makes the bonus dynamic — computed per-actor each read.
    this.compute = typeof config.delta === "function" ? config.delta : null;
    this.stats = Array.isArray(config.stats)
      ? config.stats.map((s) => String(s).toLowerCase())
      : [];
    this.modifiers = this.compute ? null : normalizeModifiers(config);
  }

  value(actor, statKey) {
    if (!evalTriggers(this.triggers, { actor })) return 0;
    const key = String(statKey || "").toLowerCase();
    if (this.compute) {
      if (!this.stats.includes(key) && !this.stats.includes("*")) return 0;
      return Number(this.compute(actor) || 0);
    }
    return Number(this.modifiers[key] || 0);
  }
}
