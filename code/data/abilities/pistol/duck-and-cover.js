/**
 * Duck and Cover — Pistol T1. Once per round, when the carrier inflicts Wound
 * damage, one Hunter in their area may Take Cover as an immediate action.
 *
 * An OnAttackResultAction filtered by `damageType: "Wounds"`. The `grantManoeuvre`
 * effect (scope "zoneMate" — includes the carrier) picks the recipient and
 * routes the Take Cover manoeuvre to that Hunter's client.
 */
import { OnAttackResultAction } from "../../mechanics/OnAttackResultAction.js";

export const DUCK_AND_COVER = new OnAttackResultAction({
  key: "pistol.t1.duck-and-cover",
  weapon: "Pistol", tier: 1,
  name: "Duck and Cover",
  text: "Get your head down! Once per round, when you inflict Wound damage, one Hunter in your area may Take Cover as an immediate action.",
  result: "any",
  damageType: "Wounds",
  rateLimit: "oncePerRound",
  prompt: {
    title: "Duck and Cover",
    message: "<div>A Hunter in your area may <strong>Take Cover</strong> as an immediate action (Duck and Cover).</div>",
    acceptLabel: "Grant Take Cover",
    declineLabel: "Skip"
  },
  effects: [
    { type: "grantManoeuvre", scope: "zoneMate", manoeuvre: "take-cover" }
  ]
});
