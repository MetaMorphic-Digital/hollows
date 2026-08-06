import { Mechanic } from "./Mechanic.js";

/** A passive that fires after an entity attack against a hunter resolves a given way. */
export class OnDefenceResultAction extends Mechanic {
  constructor(config = {}) {
    super(config);
    this.result = config.result || "any";
    this.damageType = config.damageType || null;
    this.scope = config.scope || "self";
    this.reaction = config.reaction || null;
    this.redirectsDamage = !!config.redirectsDamage;
    this.effects = Array.isArray(config.effects) ? config.effects : [];
  }

  matches(ctx = {}) {
    const dmg = Number(ctx.damageValue ?? 0);
    const avoided = (ctx.avoided === true) || (dmg <= 0);
    if ((this.result === "avoided") && !avoided) return false;
    if ((this.result === "zeroDamage") && (!ctx.damageType || (dmg > 0))) return false;
    if ((this.result === "damaged") && (dmg <= 0)) return false;
    if (this.damageType && (this.damageType !== ctx.damageType)) return false;
    return true;
  }

  async run({ actor, entity } = {}) {
    const { applyEffects } = await import("./dsl/effects.js");
    await applyEffects(this.effects, { actor, entity });
  }
}
