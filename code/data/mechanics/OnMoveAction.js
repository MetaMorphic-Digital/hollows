/**
 * Fires when the carrier Moves between zones.
 *
 * Phase:
 *   "before" — option offered before the Move resolves
 *   "after"  — option offered after the Move resolves
 *   "both"   — offered at both points (player picks one or skips)
 *
 * `ownerMoveOnly: true` restricts the trigger to moves the carrier's owner
 * performed themselves — skipped when the GM drags the token.
 *
 * Knife example: Lightning-Fast (Guard before or after Move).
 */
import { Mechanic } from "./Mechanic.js";
import { evalTriggers } from "./dsl/triggers.js";

export class OnMoveAction extends Mechanic {
  constructor(config = {}) {
    super(config);
    this.phase = config.phase || "after";
    this.ownerMoveOnly = config.ownerMoveOnly === true;
    this.triggers = config.triggers || {};
    this.effects = Array.isArray(config.effects) ? config.effects : [];
    // Aura: run for every mover (not just carriers) — a zone effect that hits
    // anyone moving. The dispatcher lifts the carriership gate.
    this.aura = !!config.aura;
  }

  async run({ actor, fromZone, toZone, phase, byOwner } = {}) {
    if (this.ownerMoveOnly && !byOwner) return;
    if (this.phase !== "both" && phase !== this.phase) return;
    if (!evalTriggers(this.triggers, { actor, fromZone, toZone })) return;
    const { applyEffects } = await import("./dsl/effects.js");
    await applyEffects(this.effects, { actor, fromZone, toZone });
  }
}
