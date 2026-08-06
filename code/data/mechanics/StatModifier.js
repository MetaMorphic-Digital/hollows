import { Mechanic } from "./Mechanic.js";

const STAT_KEYS = ["strong", "hard", "quick", "sharp", "wise"];

/** Expand a config into a per-stat delta map. */
function normalizeModifiers(config) {
  if (config.modifiers && (typeof config.modifiers === "object")) {
    const out = {};
    for (const stat of STAT_KEYS) out[stat] = Number(config.modifiers[stat] || 0);
    return out;
  }
  const stats = Array.isArray(config.stats) ? config.stats.map((s) => String(s).toLowerCase()) : [];
  const delta = Number(config.delta || 0);
  const out = {};
  for (const stat of STAT_KEYS) {
    out[stat] = (stats.includes(stat) || stats.includes("*")) ? delta : 0;
  }
  return out;
}

/** A persistent additive change to the carrier's stats. */
export class StatModifier extends Mechanic {
  constructor(config = {}) {
    super(config);
    this.compute = typeof config.delta === "function" ? config.delta : null;
    this.stats = Array.isArray(config.stats)
      ? config.stats.map((s) => String(s).toLowerCase())
      : [];
    this.modifiers = this.compute ? null : normalizeModifiers(config);
  }

  value(actor, statKey) {
    if (this.when && !this.when({ actor })) return 0;
    const key = String(statKey || "").toLowerCase();
    if (this.compute) {
      if (!this.stats.includes(key) && !this.stats.includes("*")) return 0;
      return Number(this.compute(actor) || 0);
    }
    return Number(this.modifiers[key] || 0);
  }
}
