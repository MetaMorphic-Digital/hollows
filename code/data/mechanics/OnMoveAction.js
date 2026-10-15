import { Mechanic } from "./Mechanic.js";

/** A passive that applies effects when the carrier moves between zones. */
export class OnMoveAction extends Mechanic {
  constructor(config = {}) {
    super(config);
    this.ownerMoveOnly = config.ownerMoveOnly === true;
    this.effects = Array.isArray(config.effects) ? config.effects : [];
    this.aura = !!config.aura;
  }

  /** Apply effects for a completed move that matches this mechanic. */
  async run({ actor, fromZone, toZone, byOwner } = {}) {
    if (this.ownerMoveOnly && !byOwner) return;
    if (this.when && !this.when({ actor, fromZone, toZone })) return;
    const { applyEffects } = await import("./dsl/effects.js");
    await applyEffects(this.effects, { actor, fromZone, toZone });
  }
}
