import { OnMoveAction } from "../../mechanics/OnMoveAction.js";
import { isCloseZone } from "../../../canvas/zone.js";

export const CHARGE = new OnMoveAction({
  key: "sword.t1.charge",
  weapon: "Sword", tier: 1,
  name: "Charge",
  text: "Lead from the front. When you Move into Close, the Entity suffers 1 Resolve.",
  phase: "after",
  ownerMoveOnly: true,
  when: ({ toZone }) => isCloseZone(toZone),
  effects: [
    { type: "damageEntity", resolve: 1, label: "Charge" }
  ]
});
