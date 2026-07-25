/**
 * Fires after an Entity attack against a Hunter resolves, keyed on the
 * outcome. The defence counterpart of OnAttackResultAction.
 *
 * `result`:  "avoided"    — no damage taken (great defence, or final damage 0)
 *            "zeroDamage" — the attack connected (a damage type was assigned)
 *                           but final damage is 0 (Better Lucky: "take 0 damage")
 *            "damaged"    — final damage > 0
 *            "any"
 * `damageType`: "Resolve" | "Wounds" | null — extra filter for "damaged"
 * `scope`:   "self"     — ability carried by the damaged Hunter
 *            "zoneMate" — ability carried by another Hunter in the same area
 * `triggers`: predicates evaluated against the carrier
 * `reaction`: name of a Reaction to offer (Counterattack, Martyr); the
 *             Reaction does the prompt + apply. Mutually exclusive with effects.
 * `effects`:  declarative DSL effects (Implacable: chat notice). Mutually
 *             exclusive with reaction.
 * `redirectsDamage`: when true, a truthy reaction choice means the incoming
 *             damage was redirected — the caller should skip its own apply.
 *
 * Dispatched by runOnDefenceResult() from the hunter damage-intake flow.
 */
import { Mechanic } from "./Mechanic.js";

export class OnDefenceResultAction extends Mechanic {
  constructor(config = {}) {
    super(config);
    this.result = config.result || "any";          // "avoided" | "damaged" | "any"
    this.damageType = config.damageType || null;    // "Resolve" | "Wounds" | null
    this.scope = config.scope || "self";            // "self" | "zoneMate"
    this.triggers = config.triggers || {};
    this.reaction = config.reaction || null;        // Reaction export name
    this.redirectsDamage = !!config.redirectsDamage;
    this.effects = Array.isArray(config.effects) ? config.effects : [];
  }

  matches(ctx = {}) {
    const dmg = Number(ctx.damageValue ?? 0);
    // "avoided" — caller passed an explicit avoided flag (great defence roll,
    // no damage path) OR the final damage came out at zero.
    const avoided = ctx.avoided === true || dmg <= 0;
    if (this.result === "avoided" && !avoided) return false;
    // "zeroDamage" — the attack connected (a damage type was assigned) but the
    // final damage is 0; distinct from a great-defence avoid (no damage type).
    if (this.result === "zeroDamage" && (!ctx.damageType || dmg > 0)) return false;
    if (this.result === "damaged" && dmg <= 0) return false;
    if (this.damageType && this.damageType !== ctx.damageType) return false;
    return true;
  }

  async run({ actor, entity } = {}) {
    const { applyEffects } = await import("./dsl/effects.js");
    await applyEffects(this.effects, { actor, entity });
  }
}
