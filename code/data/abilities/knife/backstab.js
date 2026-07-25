import { AttackDamageChange } from "../../mechanics/AttackDamageChange.js";

export const BACKSTAB = new AttackDamageChange({
  key: "knife.t1.backstab",
  weapon: "Knife", tier: 1,
  name: "Backstab",
  text: "They left themselves open; it's more their fault than yours. While you are in Rear, inflict +1/+1 damage.",
  triggers: {
    actorInZones: ["Rear"]
  },
  delta: { resolve: 1, wounds: 1 }
});
