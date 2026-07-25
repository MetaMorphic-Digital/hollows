/**
 * Satisfaction - Rifle T1. When the carrier inflicts Wound damage, gain
 * 1 Focus.
 *
 * Uses the same attack-result timing as Pistol wound-damage abilities: the
 * Hunter attack flow calculates final damage, then dispatches `damageType`
 * and `damageValue` before rendering the Apply Damage card.
 */
import { OnAttackResultAction } from "../../mechanics/OnAttackResultAction.js";

export const SATISFACTION = new OnAttackResultAction({
  key: "rifle.t1.satisfaction",
  weapon: "Rifle", tier: 1,
  name: "Satisfaction",
  text: "Nothing like spilt blood to clear the mind. When you inflict Wound damage, gain 1 Focus.",
  result: "any",
  damageType: "Wounds",
  effects: [
    { type: "adjustFocus", amount: 1, stopIfUnchanged: true },
    { type: "chatNotice", message: "<strong>{actor}</strong> gains <strong>1 Focus</strong> (Satisfaction)." }
  ]
});
