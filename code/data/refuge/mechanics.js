// Aura that applies the refuge weapon-damage bonus on every attack.
import { AttackDamageChange } from "../mechanics/AttackDamageChange.js";
import { getPrimaryRefugeActor, getRefugeWeaponDamageBonus } from "./resolvers.js";

export const REFUGE_WEAPON_DAMAGE = new AttackDamageChange({
  key: "refuge.weapon-damage",
  name: "Refuge Armoury",
  aura: true,
  active: (_actor, context = {}) =>
    !context.suppressItemBonuses && !!context.weapon,
  delta: (_actor, context = {}) => {
    const refuge = getPrimaryRefugeActor();
    return getRefugeWeaponDamageBonus(context.weapon, refuge);
  }
});
