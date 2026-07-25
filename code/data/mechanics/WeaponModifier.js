import { Mechanic } from "./Mechanic.js";
import { evalTriggers } from "./dsl/triggers.js";

/**
 * Passive weapon-stat modifier — a persistent additive change to one of a
 * weapon's effective stats (e.g. Capacity), contributed by an ability the
 * weapon's carrier holds. The actor-stat counterpart is StatModifier; this is
 * its weapon-stat mirror, summed by getWeaponModifier(weapon, statKey).
 *
 *   weaponStat: "capacity"        — which weapon stat this affects.
 *   weapon:     "Pistol"          — only applies to this weapon type (from Mechanic).
 *   delta:      number | (weapon) => number   — fixed or computed bonus.
 *   triggers:   evaluated against the carrier (optional).
 *
 * A weapon with no carrier is a dead path (compendium item) — value() returns 0.
 */
export class WeaponModifier extends Mechanic {
  constructor(config = {}) {
    super(config);
    this.weaponStat = String(config.weaponStat || "");
    this.triggers = config.triggers || {};
    this.compute = typeof config.delta === "function" ? config.delta : null;
    this.fixedDelta = this.compute ? 0 : Number(config.delta || 0);
  }

  value(weapon, statKey) {
    if (String(statKey) !== this.weaponStat) return 0;
    if (this.weapon && String(weapon?.system?.weaponType || "") !== this.weapon) return 0;
    const actor = weapon?.actor;
    if (!actor) return 0;
    if (!evalTriggers(this.triggers, { actor })) return 0;
    return this.compute ? Number(this.compute(weapon) || 0) : this.fixedDelta;
  }
}
