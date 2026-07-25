/**
 * Momentum — Pistol T1. Once per round, when the carrier inflicts Wound
 * damage, restore 2 Resolve.
 *
 * An OnAttackResultAction filtered by `damageType: "Wounds"` — fires from the
 * hunter attack flow once the attack's damage is known. No prompt: the rule
 * restores Resolve outright.
 */
import { OnAttackResultAction } from "../../mechanics/OnAttackResultAction.js";

export const MOMENTUM = new OnAttackResultAction({
  key: "pistol.t1.momentum",
  weapon: "Pistol", tier: 1,
  name: "Momentum",
  text: "Feels good, doesn't it? Once per round, when you inflict Wound damage, restore 2 Resolve.",
  result: "any",
  damageType: "Wounds",
  rateLimit: "oncePerRound",
  effects: [
    { type: "restoreResolve", amount: 2 },
    { type: "chatNotice", message: "<strong>{actor}</strong> restores <strong>2 Resolve</strong> (Momentum)." }
  ]
});
