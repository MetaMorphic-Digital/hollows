/**
 * Activated maneuver that targets one or more zone-mates and applies a DSL
 * effect to each. Generalization of patterns like:
 *   - Bulwark: expend Ready → grant Guard to an ally in your zone
 *   - Control: expend Ready → grant Reload/Take-Cover/Move to an ally
 *   - Future: "heal all hunters in your zone", "give condition to ally", etc.
 *
 * Config:
 *   targetSelection: {
 *     scope:      "ally" | "any" | "self"          — who can be picked
 *     zoneScope:  "sameZone" | "adjacent" | "anyZone"
 *     count:      1 | "all"                         — pick-one vs apply-to-all
 *   }
 *   cost:           { condition: "ready" } | { resource: "resolve", amount: N } | null
 *   rateLimit:      "oncePerRound" | "oncePerTurn" | null
 *   triggers:       gating predicates (DSL)
 *   effects:        DSL effects applied to each chosen target
 *   subSelect:      optional extra picker shown in the activation dialog —
 *                   { name, label, options: [{ value, label }] }; the chosen
 *                   value is passed to effects via ctx.payload[name].
 *   buttonAction:   optional data-action attribute if surfaced as a sheet button
 *
 * Effects receive `ctx = { actor, target }` so they can act on the chosen
 * zone-mate rather than the activator. The `grantReaction` effect type
 * dispatches a Reaction to the target's owner.
 */
import { Mechanic } from "./Mechanic.js";
import { evalTriggers } from "./dsl/triggers.js";

export class ApplyToZone extends Mechanic {
  constructor(config = {}) {
    super(config);
    this.buttonAction = config.buttonAction || null;
    this.cost = config.cost || null;
    this.rateLimit = config.rateLimit || null;
    this.triggers = config.triggers || {};
    this.targetSelection = {
      scope: "ally",
      zoneScope: "sameZone",
      count: 1,
      ...(config.targetSelection || {})
    };
    this.subSelect = config.subSelect || null;
    // `name` must match the seed ability name (hasWeaponAbility matching);
    // `label` is the human-facing text for activation dialogs.
    this.label = config.label || this.name;
    this.effects = Array.isArray(config.effects) ? config.effects : [];
  }

  available(actor) {
    return evalTriggers(this.triggers, { actor });
  }
}
