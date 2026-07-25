/**
 * Stoic — Armour T1. While Ready, restore 1 Resolve at start of own turn.
 */
import { StartOfTurnAction } from "../../mechanics/StartOfTurnAction.js";

export const STOIC = new StartOfTurnAction({
  key: "armour.t1.stoic",
  weapon: "Armour", tier: 1,
  name: "Stoic",
  text: "You can endure anything. While you are Ready, when your turn starts, restore 1 Resolve.",
  triggers: { actorHasCondition: "ready" },
  effects: [
    { type: "restoreResolve", amount: 1 },
    { type: "chatNotice", message: "<strong>{actor}</strong> restores <strong>1 Resolve</strong> (Stoic)." }
  ]
});
