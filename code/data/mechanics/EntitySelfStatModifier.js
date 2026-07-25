/**
 * Modifies an Entity's own effective stats while active.
 *
 * Unlike EntityStatModifier, this is not hunter-carried. The entity itself is
 * the carrier: active edges and entity-enhancement items decide whether an
 * instance contributes to a stat.
 */
import { Mechanic } from "./Mechanic.js";

function normalizeStats(stat = "all") {
  return (Array.isArray(stat) ? stat : [stat])
    .map((value) => String(value).trim().toLowerCase());
}

export class EntitySelfStatModifier extends Mechanic {
  constructor(config = {}) {
    super(config);
    this.stats = normalizeStats(config.stat);
    this.delta = typeof config.delta === "function" ? config.delta : Number(config.delta ?? 0);
    this.active = typeof config.active === "function" ? config.active : null;
  }

  match(entity, { stat, context = {} } = {}) {
    const key = String(stat ?? "").trim().toLowerCase();
    if (!this.stats.includes("all") && !this.stats.includes(key)) return false;
    return this.active ? !!this.active(entity, context) : true;
  }

  value(entity, context = {}) {
    const delta = typeof this.delta === "function" ? this.delta(entity, context) : this.delta;
    return Number(delta ?? 0) || 0;
  }
}
