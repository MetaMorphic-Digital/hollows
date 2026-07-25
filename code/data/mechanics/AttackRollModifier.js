/**
 * Modifies an attack roll mode (advantage / disadvantage) for the ATTACKER.
 *
 * Important nuance: the carrier of the ability may differ from the attacker.
 * Some abilities grant zone-wide buffs to other hunters (e.g. Blood in the
 * Water — all Hunters in Close get attack advantage while entity bleeds).
 *
 * `scope`:
 *   "self"       — only the carrier benefits (default)
 *   "zoneType"   — any actor with matching zone-type benefits (params.zoneType)
 *
 * `triggers` always evaluated against the CARRIER. Whether to actually apply
 * is computed by the dispatcher using `appliesTo(attacker)`.
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

export class AttackRollModifier extends Mechanic {
  constructor(config = {}) {
    super(config);
    this.scope = config.scope || "self";
    this.zoneType = (config.zoneType || "").toLowerCase();
    this.rollMode = config.rollMode || "adv";       // "adv" | "dis"
    this.triggers = config.triggers || {};
  }

  active(carrier, context = {}) {
    return evalTriggers(this.triggers, { ...context, actor: carrier });
  }

  appliesTo(attacker, _context = {}) {
    if (this.scope === "self") return false;
    if (this.scope === "zoneType") return zoneTypeOf(getActorZone(attacker)) === this.zoneType;
    return false;
  }
}
