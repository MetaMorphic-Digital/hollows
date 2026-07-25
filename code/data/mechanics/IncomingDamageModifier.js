/**
 * Modifies damage RECEIVED by an actor (typically from entity attacks).
 *
 * Same zone-wide pattern as AttackRollModifier: the carrier might grant the
 * effect to other hunters with matching zone-type.
 * `scope: "targetState"` is for effects encoded directly on the damaged actor
 * (for example a temporary flag) rather than carried by a separate actor.
 *
 * `damageSource`: "entity" | "any" — only fire for matching source.
 * `delta`: { resolve, wounds } — added to incoming damage (positive = more
 *           damage to target, negative = less).
 *
 * Knife example: Blood in the Water (entity bleeding → Close hunters take
 *                 +1/+1 damage from entity).
 */
import { Mechanic } from "./Mechanic.js";
import { evalTriggers } from "./dsl/triggers.js";
import { getActorZone, isCloseZone, isRangedZone } from "../../canvas/zone.js";

function zoneTypeOf(zone) {
  if (!zone) return null;
  if (isCloseZone(zone)) return "close";
  if (isRangedZone(zone)) return "ranged";
  if (String(zone) === "Support") return "support";
  return null;
}

export class IncomingDamageModifier extends Mechanic {
  constructor(config = {}) {
    super(config);
    this.scope = config.scope || "self";
    this.zoneType = (config.zoneType || "").toLowerCase();
    this.damageSource = config.damageSource || "any";
    this.timing = config.timing || "preMitigation";
    this.delta = { resolve: 0, wounds: 0, ...(config.delta || {}) };
    this.triggers = config.triggers || {};
    this.note = config.note || "";
    this.apply = typeof config.apply === "function" ? config.apply : null;
    // Reaction key for reaction-routed modifiers (Distract): the dispatcher
    // offers the keyed Reaction instead of calling modify() directly.
    this.reaction = config.reaction || null;
  }

  active(carrier) {
    return evalTriggers(this.triggers, { actor: carrier });
  }

  appliesToTarget(carrier, target, source) {
    if (this.damageSource !== "any" && this.damageSource !== source) return false;
    if (this.scope === "self") return carrier.id === target.id;
    if (this.scope === "targetState") return carrier.id === target.id;
    if (this.scope === "zoneType") return zoneTypeOf(getActorZone(target)) === this.zoneType;
    // sceneRanged: carrier may be anywhere on the scene; the gate is that the
    // damage TARGET is in a Ranged zone (Distract — a Ready Armour hunter
    // anywhere may halve ranged damage to a Hunter). Routed via `reaction`.
    if (this.scope === "sceneRanged") return isRangedZone(getActorZone(target));
    return false;
  }

  async modify(context = {}) {
    if (this.apply) return await this.apply(context);
    const key = context.damageType === "Wounds" ? "wounds" : "resolve";
    const bump = Number(this.delta[key] || 0);
    if (!bump) return null;
    return {
      damageValue: Math.max(0, Number(context.damageValue || 0) + bump),
      note: this.note || `${this.name}: ${bump > 0 ? "+" : ""}${bump} ${context.damageType}`
    };
  }
}
