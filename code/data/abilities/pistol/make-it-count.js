import { OnAttackResultAction } from "../../mechanics/OnAttackResultAction.js";
import { getFocusCount } from "../../../documents/actor/resources.js";

export const MAKE_IT_COUNT = new OnAttackResultAction({
  key: "pistol.t1.make-it-count",
  weapon: "Pistol", tier: 1,
  name: "Make It Count",
  text: "Hit it where it hurts. When you inflict Resolve damage with an attack, you may spend Focus to inflict 1 Wound damage on the Entity.",
  result: "any",
  damageType: "Resolve",
  when: ({ actor }) => getFocusCount(actor) >= 1,
  prompt: {
    title: "Make It Count",
    message: "<div>Spend <strong>Focus</strong> to inflict <strong>1 Wound</strong> on the Entity (Make It Count)?</div>",
    acceptLabel: "Spend Focus",
    declineLabel: "Skip"
  },
  effects: [
    { type: "adjustFocus", amount: -1 },
    { type: "damageEntity", wounds: 1, label: "Make It Count" }
  ]
});
