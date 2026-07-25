/**
 * Modifies an entity's defence (or other stat) while triggers hold.
 *
 * `stat`: "all" | "hard" | "strong" | "quick" | "sharp" | "wise" | "wyrd"
 * `delta`: number (negative for debuffs).
 *
 * Dispatcher iterates carriers and sums deltas matching the requested stat.
 *
 * Knife example: Sigils Carved in Skin (entity bleeding → all defences -2).
 */
import { Mechanic } from "./Mechanic.js";
import { evalTriggers } from "./dsl/triggers.js";

export class EntityStatModifier extends Mechanic {
  constructor(config = {}) {
    super(config);
    this.stat = (config.stat || "all").toLowerCase();
    this.delta = Number(config.delta || 0);
    this.triggers = config.triggers || {};
  }

  match(carrier, { entity, stat } = {}) {
    if (this.stat !== "all" && this.stat !== String(stat || "").toLowerCase()) return false;
    return evalTriggers(this.triggers, { actor: carrier, entity });
  }
}
