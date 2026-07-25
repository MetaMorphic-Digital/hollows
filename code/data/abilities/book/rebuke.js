import { OnAttackResultAction } from "../../mechanics/OnAttackResultAction.js";

export const REBUKE = new OnAttackResultAction({
  key: "book.t1.rebuke",
  weapon: "Book", tier: 1,
  name: "Rebuke",
  result: "hit",
  effects: [{
    type: "removeThreat",
    amount: { fromDamageType: { Wounds: 4, default: 2 } },
    zone: "selfOrAdjacent"
  }]
});
