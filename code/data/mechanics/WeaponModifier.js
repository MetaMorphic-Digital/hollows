import { Mechanic } from "./Mechanic.js";

/** A persistent additive change to a weapon stat, contributed by an ability its carrier holds. */
export class WeaponModifier extends Mechanic {
  constructor(config = {}) {
    super(config);
    this.weaponStat = String(config.weaponStat || "");
    this.compute = typeof config.delta === "function" ? config.delta : null;
    this.fixedDelta = this.compute ? 0 : Number(config.delta || 0);
  }

  value(weapon, statKey) {
    if (String(statKey) !== this.weaponStat) return 0;
    if (this.weapon && (String(weapon?.system?.weaponType || "") !== this.weapon)) return 0;
    const actor = weapon?.actor;
    if (!actor) return 0;
    if (this.when && !this.when({ actor })) return 0;
    return this.compute ? Number(this.compute(weapon) || 0) : this.fixedDelta;
  }
}
