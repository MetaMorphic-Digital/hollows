import { Mechanic } from "./Mechanic.js";

/** Adjusts an entity stat while the carrier's predicate holds. */
export class EntityStatModifier extends Mechanic {
  constructor(config = {}) {
    super(config);
    this.stat = (config.stat || "all").toLowerCase();
    this.delta = Number(config.delta || 0);
  }

  match(carrier, { entity, stat } = {}) {
    if ((this.stat !== "all") && (this.stat !== String(stat || "").toLowerCase())) return false;
    return this.when?.({ actor: carrier, entity }) ?? true;
  }
}
