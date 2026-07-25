/**
 * Weapon document logic — runtime helpers over weapon items, the documents/
 * counterpart to documents/actor and documents/entity. Currently holds the
 * weapon's Capacity resource logic; future home of weapon form / form-switch
 * logic when weapons are refactored out of the sheets.
 */
import { getEffectiveWeaponCapacity } from "../../data/weapons/index.js";
import { getWeaponModifier } from "../../helpers/weapon-abilities/dispatchers.js";

/**
 * Effective max Capacity of a weapon: its stored capacity.max plus passive
 * Capacity bonuses contributed by the carrier's weapon abilities (generic
 * WeaponModifier mechanics — e.g. Come Out Shooting +1).
 */
export function getEffectiveCapacity(weapon) {
  return Number(getEffectiveWeaponCapacity(weapon).max ?? 0) + getWeaponModifier(weapon, "capacity");
}
