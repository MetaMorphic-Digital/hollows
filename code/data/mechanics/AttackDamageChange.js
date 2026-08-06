import { Mechanic } from "./Mechanic.js";

/** Passive damage modifier applied to the carrier's attacks. */
export class AttackDamageChange extends Mechanic {
  constructor(config = {}) {
    super(config);
    this.weaponType = config.weaponType || null;
    this.mode = config.mode || "add";
    this.delta = typeof config.delta === "function"
      ? config.delta
      : { resolve: 0, wounds: 0, ...(config.delta || {}) };
    this.value = config.value ? { resolve: 0, wounds: 0, ...config.value } : null;
    this.active = typeof config.active === "function" ? config.active : null;
    this.aura = !!config.aura;
  }

  match(actor, context = {}) {
    if (this.weaponType && (String(context.weaponType || "") !== this.weaponType)) return false;
    if (this.active && !this.active(actor, context)) return false;
    return this.when?.({ actor }) ?? true;
  }

  getDelta(actor, context = {}) {
    const delta = typeof this.delta === "function" ? this.delta(actor, context) : this.delta;
    return {
      resolve: Number(delta?.resolve || 0),
      wounds: Number(delta?.wounds || 0),
    };
  }
}
