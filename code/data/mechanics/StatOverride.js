import { Mechanic } from "./Mechanic.js";

/** Substitutes the stat an attack or defence roll uses, for a cost. */
export class StatOverride extends Mechanic {
  constructor(config = {}) {
    super(config);
    this.scope = config.scope || "attack";
    this.newStat = String(config.newStat || "quick").toLowerCase();
    this.cost = config.cost || null;
    this.rateLimit = config.rateLimit || null;
    this.onSuccessEffects = Array.isArray(config.onSuccessEffects) ? config.onSuccessEffects : [];
    this.label = config.label || this.name;
    this.successCondition = config.successCondition || null;
  }

  available(actor) {
    return this.when?.({ actor }) ?? true;
  }
}
