/**
 * Modifies an entity action's economy (cost) while triggers hold.
 *
 * `actionType`: "interrupt" | "manoeuvre" | "attack" | "special" | "any"
 * `costDelta`: { threat?: +N, ... }
 *
 * The dispatcher (`getEntityAbilityCostDelta`) sums all matching modifiers
 * across all carrier hunters on the canvas.
 *
 * Knife example: Bloodless (entity bleeding → interrupt cost +2 Threat).
 */
import { Mechanic } from "./Mechanic.js";
import { evalTriggers } from "./dsl/triggers.js";

export class EntityAbilityModifier extends Mechanic {
  constructor(config = {}) {
    super(config);
    this.actionType = config.actionType || "any";
    this.costDelta = config.costDelta || {};
    this.triggers = config.triggers || {};
  }

  match(carrier, { entity, actionType } = {}) {
    if (this.actionType !== "any" && this.actionType !== actionType) return false;
    return evalTriggers(this.triggers, { actor: carrier, entity });
  }
}
