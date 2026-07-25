/**
 * Passive attack damage modifier. When the carrier attacks and triggers match,
 * either adds static/dynamic delta to base damage values or sets a temporary
 * override that later additive modifiers build on.
 *
 * Trigger context extras for attack: `attackerZone` (already covered by
 * triggers/actorInZones via the actor); plus `targetType`, `targetZone`, etc.
 * passed as part of the trigger context for future extensions.
 *
 * Knife example: Backstab (Rear → +1/+1).
 */
import { Mechanic } from "./Mechanic.js";
import { evalTriggers } from "./dsl/triggers.js";

export class AttackDamageChange extends Mechanic {
  constructor(config = {}) {
    super(config);
    this.triggers = config.triggers || {};
    // When set, the bonus applies only to attacks made with this weapon type.
    this.weaponType = config.weaponType || null;
    this.mode = config.mode || "add";
    this.delta = typeof config.delta === "function"
      ? config.delta
      : { resolve: 0, wounds: 0, ...(config.delta || {}) };
    this.value = config.value ? { resolve: 0, wounds: 0, ...config.value } : null;
    this.active = typeof config.active === "function" ? config.active : null;
    // Aura abilities apply to any actor whose `active`/`triggers`/`match` pass,
    // regardless of carriership. The dispatcher lifts the `carries()` gate so a
    // bonus can reach receivers who do not own the ability themselves (Massive
    // Damage zone aura, future Got Your Back-style auras).
    this.aura = !!config.aura;
  }

  match(actor, context = {}) {
    if (this.weaponType && String(context.weaponType || "") !== this.weaponType) return false;
    if (this.active && !this.active(actor, context)) return false;
    return evalTriggers(this.triggers, { actor });
  }

  getDelta(actor, context = {}) {
    const delta = typeof this.delta === "function" ? this.delta(actor, context) : this.delta;
    return {
      resolve: Number(delta?.resolve || 0),
      wounds: Number(delta?.wounds || 0)
    };
  }
}
