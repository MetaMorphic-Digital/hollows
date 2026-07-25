import { OnAttackResultAction } from "../../mechanics/OnAttackResultAction.js";

export const SCRAMBLE = new OnAttackResultAction({
  key: "knife.t1.scramble",
  weapon: "Knife", tier: 1,
  name: "Scramble",
  text: "Nothing can stop you from getting where you need to be. Once per round, when you miss with an attack, you may Move as an immediate action.",
  result: "miss",
  rateLimit: "oncePerRound",
  effects: [
    { type: "chatNotice", message: "<strong>{actor}</strong> may Move as an immediate action (Scramble)." }
  ]
});
