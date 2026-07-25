/**
 * Resolute — Armour T1. Once per round, on attack miss, may become Ready.
 *
 * Implemented as an OnAttackResultAction triggered from the hunter attack
 * flow (runOnAttackResult(actor, "miss")). The mechanic itself just adds the
 * Ready condition and posts a chat notice; the prompt to spend the use is
 * surfaced by the dispatcher's rateLimit gating.
 */
import { OnAttackResultAction } from "../../mechanics/OnAttackResultAction.js";

export const RESOLUTE = new OnAttackResultAction({
  key: "armour.t1.resolute",
  weapon: "Armour", tier: 1,
  name: "Resolute",
  text: "Your anger is yours and yours alone; use it. Once per round, when you miss with an attack, you may become Ready as an immediate action.",
  result: "miss",
  rateLimit: "oncePerRound",
  triggers: { actorMissingCondition: "ready" },
  prompt: {
    title: "Resolute",
    message: "<div>Become <strong>Ready</strong> (Resolute)?</div>",
    acceptLabel: "Become Ready",
    declineLabel: "Skip"
  },
  effects: [
    { type: "addCondition", key: "ready" },
    { type: "chatNotice", message: "<strong>{actor}</strong> becomes <strong>Ready</strong> (Resolute)." }
  ]
});
