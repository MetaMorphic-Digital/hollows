import { Mechanic } from "./Mechanic.js";
import { getActorZone, isCloseZone, isRangedZone } from "../../canvas/zone.js";

/** Classify a zone as close, ranged or support. */
function zoneTypeOf(zone) {
  if (!zone) return null;
  if (isCloseZone(zone)) return "close";
  if (isRangedZone(zone)) return "ranged";
  if (String(zone) === "Support") return "support";
  return null;
}

/** Shifts an attack roll to advantage or disadvantage. */
export class AttackRollModifier extends Mechanic {
  constructor(config = {}) {
    super(config);
    this.scope = config.scope || "self";
    this.zoneType = (config.zoneType || "").toLowerCase();
    this.rollMode = config.rollMode || "adv";
  }

  active(carrier, context = {}) {
    return this.when?.({ ...context, actor: carrier }) ?? true;
  }

  appliesTo(attacker) {
    if (this.scope === "self") return false;
    if (this.scope === "zoneType") return zoneTypeOf(getActorZone(attacker)) === this.zoneType;
    return false;
  }
}
