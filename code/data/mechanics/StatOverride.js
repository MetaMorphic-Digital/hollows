/**
 * Substitute a stat for attack or defence, with a cost and rate limit.
 *
 * Scopes:
 *   "attack"  — surfaces as an option in the attack dialog; on activation,
 *               attack roll uses `newStat` instead of weapon's normal stat.
 *   "defence" — surfaces in the defence dialog; on activation, defence roll
 *               uses `newStat`.
 *
 * Rate-limit:
 *   "oncePerRound" | "oncePerTurn" | null
 *   Flag key: `${key}.usedAt` on actor — { combatId, round?, turnId? }.
 *
 * Optional `onSuccessEffects` — fire AFTER the roll resolves if the player
 * succeeded (Dodge: rolled under Quick → "may Move"; Whisper-Quick: attack
 * dealt Wounds → restore 2 Resolve).
 *
 * Cost: `{ resource: "resolve"|"wounds", amount: N }` — paid on activation.
 */
import { Mechanic } from "./Mechanic.js";
import { evalTriggers } from "./dsl/triggers.js";

export class StatOverride extends Mechanic {
  constructor(config = {}) {
    super(config);
    this.scope = config.scope || "attack";       // "attack" | "defence"
    this.newStat = String(config.newStat || "quick").toLowerCase();
    this.cost = config.cost || null;             // { resource, amount }
    this.rateLimit = config.rateLimit || null;   // "oncePerRound" | "oncePerTurn"
    this.triggers = config.triggers || {};
    this.onSuccessEffects = Array.isArray(config.onSuccessEffects) ? config.onSuccessEffects : [];
    this.label = config.label || this.name;
    this.successCondition = config.successCondition || null;
    // successCondition: { type: "rolledUnder", stat: "quick" } | { type: "damageType", damageType: "Wounds" } | etc.
  }

  available(actor) {
    return evalTriggers(this.triggers, { actor });
  }
}
