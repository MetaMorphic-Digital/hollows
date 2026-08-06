import { Mechanic } from "./Mechanic.js";

/** A passive that applies effects when the carrier's turn ends. */
export class EndOfTurnAction extends Mechanic {
  constructor(config = {}) {
    super(config);
    this.effects = Array.isArray(config.effects) ? config.effects : [];
  }

  async run(actor) {
    if (this.when && !this.when({ actor })) return;
    const { applyEffects } = await import("./dsl/effects.js");
    await applyEffects(this.effects, { actor });
  }
}
