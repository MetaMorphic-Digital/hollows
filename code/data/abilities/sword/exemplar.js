import { ActivatedAbility } from "../../mechanics/ActivatedAbility.js";

export const EXEMPLAR = new ActivatedAbility({
  key: "sword.t1.exemplar",
  weapon: "Sword", tier: 1,
  name: "Exemplar",
  text: "Show them how it's done. Once per round, while there is Threat in your area, spend 1 Resolve to Focus.",
  buttonAction: "sword-exemplar",
  buttonLabel: "Exemplar",
  cost: { resource: "resolve", amount: 1 },
  rateLimit: "oncePerRound",
  triggers: {
    actorWeaponEquipped: "Sword",
    actorZoneHasThreat: true
  },
  effects: [
    {
      type: "confirm",
      title: "Exemplar",
      message: "Spend <strong>1 Resolve</strong> to Focus?",
      yesLabel: "Spend Resolve"
    },
    { type: "focus", stopIfUnchanged: true },
    { type: "chatNotice", message: "<strong>{actor}</strong> spends <strong>1 Resolve</strong> to Focus (Exemplar)." }
  ]
});
