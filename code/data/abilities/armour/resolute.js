import { OnAttackResultAction } from "../../mechanics/OnAttackResultAction.js";

export const RESOLUTE = new OnAttackResultAction({
  key: "armour.t1.resolute",
  weapon: "Armour", tier: 1,
  name: "Resolute",
  text: "Your anger is yours and yours alone; use it. Once per round, when you miss with an attack, you may become Ready as an immediate action.",
  result: "miss",
  rateLimit: "oncePerRound",
  when: ({ actor }) => !actor.statuses.has("ready"),
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
