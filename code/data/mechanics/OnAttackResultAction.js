/**
 * Fires after an attack resolves with a specific result.
 *
 * `result` values: "hit" | "miss" | "crit" | "any".
 * Optional `damageType` ("Wounds" | "Resolve") — only fire when the attack
 *   actually inflicted that damage type (e.g. Momentum: on Wound damage).
 * Optional `scope` ("self" | "zoneMate") — "self" (default) fires on the
 *   attacker; "zoneMate" fires on carriers sharing the attacker's area
 *   (e.g. Keep Up the Pressure: react to an ally's miss).
 * Optional `reaction` — name of a Reaction to offer (zoneMate scope only):
 *   each carrier's owner is prompted via the Reaction instead of running
 *   effects locally. Mirrors OnDefenceResultAction's reaction routing.
 * Optional `rateLimit` ("oncePerRound" | "oncePerTurn") tracked via flag.
 * Optional `prompt` — when present, ask the actor before applying effects
 *                     (used for state-changing options like Resolute → Ready).
 *
 * Examples: Scramble (miss → may Move, 1/round),
 *           Ghostly (hit, after entity places threat → may Move),
 *           Resolute (miss → prompt → become Ready, 1/round),
 *           Momentum (hit, Wound damage → restore 2 Resolve, 1/round).
 */
import { Mechanic } from "./Mechanic.js";
import { evalTriggers } from "./dsl/triggers.js";

export class OnAttackResultAction extends Mechanic {
  constructor(config = {}) {
    super(config);
    this.result = config.result || "any";        // "hit" | "miss" | "crit" | "any"
    this.damageType = config.damageType || null;  // "Wounds" | "Resolve" | null
    this.weaponType = config.weaponType || null;  // only fire for this weapon type
    this.scope = config.scope || "self";          // "self" | "zoneMate"
    this.reaction = config.reaction || null;      // Reaction export name (zoneMate)
    this.timing = config.timing || "immediate";  // "immediate" | "afterThreatPlacement"
    this.rateLimit = config.rateLimit || null;
    this.triggers = config.triggers || {};
    this.prompt = config.prompt || null;          // { title, message, acceptLabel?, declineLabel? }
    this.effects = Array.isArray(config.effects) ? config.effects : [];
    // Direct handler invoked after prompt and before DSL effects. Use for
    // ability-specific work that does not fit a generic effect (multi-actor
    // flag write, runtime state checks). Mirrors EntityActionPause.handler —
    // keeps ability-specific logic out of the DSL switch.
    this.handler = typeof config.handler === "function" ? config.handler : null;
    // (attacker, context) => carrier | null — ability-provided carry check
    // for cases where the carrier is not the attacker.
    // When set, bypasses the standard carries() check. GM-only.
    this.matchCarrier = typeof config.matchCarrier === "function" ? config.matchCarrier : null;
    // Aura actions apply to any attacker whose `active` passes (mirrors AttackDamageChange).
    this.active = typeof config.active === "function" ? config.active : null;
    this.aura = !!config.aura;
  }

  matchActive(actor, context = {}) {
    return this.active ? !!this.active(actor, context) : true;
  }

  matchResult(actualResult) {
    if (this.result === "any") return true;
    return this.result === actualResult;
  }

  // When `damageType` is set, the attack must have inflicted that type.
  matchDamage({ damageType, damageValue } = {}) {
    if (!this.damageType) return true;
    return String(damageType) === String(this.damageType) && Number(damageValue) > 0;
  }

  async run(context = {}) {
    const { actor, entity } = context;
    if (!evalTriggers(this.triggers, { actor, entity })) return false;
    if (this.prompt) {
      const confirm = await foundry.applications.api.DialogV2.wait({
        window: { title: this.prompt.title || this.name },
        content: `<div class="hollows-roll-dialog">${this.prompt.message || ""}</div>`,
        rejectClose: false,
        buttons: [
          { action: "yes", label: this.prompt.acceptLabel || "Apply", default: true, callback: () => true },
          { action: "no", label: this.prompt.declineLabel || "Skip", callback: () => false }
        ]
      });
      if (!confirm) return false;
    }
    const ctx = { ...context, actor, entity };
    let out = {};
    if (this.handler) {
      out = (await this.handler(actor, ctx)) || {};
      if (out.cancelled) return false;
    }
    const { applyEffects } = await import("./dsl/effects.js");
    await applyEffects(this.effects, ctx);
    if (ctx._cancelled) return false;
    return out;
  }
}
