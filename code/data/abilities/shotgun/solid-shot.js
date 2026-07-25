/**
 * Solid Shot — Shotgun T1. The carrier's Shotgun attacks inflict +0/+1 damage.
 *
 * An AttackDamageChange gated by `weaponType` — applies only to attacks made
 * with a Shotgun (the attack's weaponType is matched in applyAttackDamageChanges).
 */
import { AttackDamageChange } from "../../mechanics/AttackDamageChange.js";

export const SOLID_SHOT = new AttackDamageChange({
  key: "shotgun.t1.solid-shot",
  weapon: "Shotgun", tier: 1,
  name: "Solid Shot",
  text: "Thumb-sized slugs that tear and tumble. When you attack with the Shotgun, inflict +0/+1 damage.",
  weaponType: "Shotgun",
  delta: { resolve: 0, wounds: 1 }
});
