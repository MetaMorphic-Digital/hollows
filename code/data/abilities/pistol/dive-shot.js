/**
 * Dive Shot — Pistol T1. Once per round, when the carrier misses with an
 * attack, they may claim a terrain tag (no test).
 *
 * An OnAttackResultAction on `result: "miss"` — fires from the hunter attack
 * flow's runOnAttackResult dispatcher. The `claimTerrainTag` effect runs the
 * Elevated / Sheltered picker.
 */
import { OnAttackResultAction } from "../../mechanics/OnAttackResultAction.js";

export const DIVE_SHOT = new OnAttackResultAction({
  key: "pistol.t1.dive-shot",
  weapon: "Pistol", tier: 1,
  name: "Dive Shot",
  text: "Serves you right for showing off; at least you landed somewhere safe. Once per round, when you miss with an attack, you may claim a terrain tag.",
  result: "miss",
  rateLimit: "oncePerRound",
  effects: [
    { type: "claimTerrainTag", label: "Dive Shot" }
  ]
});
