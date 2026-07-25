import { OnAttackResultAction } from "../../mechanics/OnAttackResultAction.js";

export const BRAND = new OnAttackResultAction({
  key: "book.t1.brand",
  weapon: "Book", tier: 1,
  name: "Brand",
  result: "hit",
  effects: [{ type: "grantManoeuvre", manoeuvre: "focus", scope: "allyInZoneOrAdjacent" }]
});
