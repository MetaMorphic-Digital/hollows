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

/** Adjusts damage an actor receives. */
export class IncomingDamageModifier extends Mechanic {
  constructor(config = {}) {
    super(config);
    this.scope = config.scope || "self";
    this.zoneType = (config.zoneType || "").toLowerCase();
    this.damageSource = config.damageSource || "any";
    this.timing = config.timing || "preMitigation";
    this.delta = { resolve: 0, wounds: 0, ...(config.delta || {}) };
    this.note = config.note || "";
    this.apply = typeof config.apply === "function" ? config.apply : null;
    this.reaction = config.reaction || null;
  }

  active(carrier) {
    return this.when?.({ actor: carrier }) ?? true;
  }

  appliesToTarget(carrier, target, source) {
    if ((this.damageSource !== "any") && (this.damageSource !== source)) return false;
    if (this.scope === "self") return carrier.id === target.id;
    if (this.scope === "targetState") return carrier.id === target.id;
    if (this.scope === "zoneType") return zoneTypeOf(getActorZone(target)) === this.zoneType;
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
      note: this.note || `${this.name}: ${bump > 0 ? "+" : ""}${bump} ${context.damageType}`,
    };
  }
}
