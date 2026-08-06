import { Mechanic } from "./Mechanic.js";

/** Adjusts what an entity action costs while the carrier's predicate holds. */
export class EntityAbilityModifier extends Mechanic {
  constructor(config = {}) {
    super(config);
    this.actionType = config.actionType || "any";
    this.costDelta = config.costDelta || {};
  }

  match(carrier, { entity, actionType } = {}) {
    if ((this.actionType !== "any") && (this.actionType !== actionType)) return false;
    return this.when?.({ actor: carrier, entity }) ?? true;
  }
}
