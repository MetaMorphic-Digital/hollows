/**
 * Seeing Red — Shotgun T1. While the carrier is Broken (Resolve 0) they
 * inflict +1/+1 damage with any weapon.
 */
import { AttackDamageChange } from "../../mechanics/AttackDamageChange.js";

export const SEEING_RED = new AttackDamageChange({
  key: "shotgun.t1.seeing-red",
  weapon: "Shotgun", tier: 1,
  name: "Seeing Red",
  text: "Time to die. While you are Broken, you inflict +1/+1 damage.",
  triggers: { actorBroken: true },
  delta: { resolve: 1, wounds: 1 }
});
