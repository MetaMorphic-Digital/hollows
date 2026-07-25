/**
 * End-of-turn passive: when the carrier's turn ends and triggers match,
 * apply effects.
 *
 * Knife examples: Anointed (in Close + entity bleeding → restore 2 Resolve),
 *                 Blood in the Eyes (entity bleeding → remove threat).
 */
import { Mechanic } from "./Mechanic.js";
import { evalTriggers } from "./dsl/triggers.js";

export class EndOfTurnAction extends Mechanic {
  constructor(config = {}) {
    super(config);
    this.triggers = config.triggers || {};
    this.effects = Array.isArray(config.effects) ? config.effects : [];
  }

  async run(actor) {
    if (!evalTriggers(this.triggers, { actor })) return;
    const { applyEffects } = await import("./dsl/effects.js");
    await applyEffects(this.effects, { actor });
  }
}
