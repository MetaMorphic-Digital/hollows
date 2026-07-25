/**
 * Drill — Rifle T1. Once per round, when the carrier misses with an attack,
 * they may Reload as an immediate action.
 *
 * Uses the existing manoeuvre registry: `grantManoeuvre` with
 * `manoeuvre:"reload"` routes to `actions/reload.js` via runManoeuvre.
 */
import { OnAttackResultAction } from "../../mechanics/OnAttackResultAction.js";

export const DRILL = new OnAttackResultAction({
  key: "rifle.t1.drill",
  weapon: "Rifle", tier: 1,
  name: "Drill",
  text: "Do. It. Again. Once per round, when you miss with an attack, you may Reload as an immediate action.",
  result: "miss",
  rateLimit: "oncePerRound",
  effects: [
    { type: "grantManoeuvre", scope: "self", manoeuvre: "reload" }
  ]
});
