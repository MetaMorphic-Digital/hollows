import { ActivatedAbility } from "../../mechanics/ActivatedAbility.js";

export const ARMS_REACH = new ActivatedAbility({
  key: "spear.core.arms-reach",
  weapon: "Spear", tier: 0,
  name: "Arms Reach",
  rateLimit: "oncePerRound",
  effects: [
    {
      type: "pickAmount",
      requireMyTurn: true,
      maxResolve: true,
      maxZoneThreat: true,
      ctxKey: "_armsReachSpend",
      title: "Arms Reach",
      label: "Spend Resolve",
      description: "Spend Resolve to remove equal Threat in your area."
    },
    { type: "spendResolve", amount: { fromCtx: "_armsReachSpend" } },
    { type: "removeThreat", zone: "self", amount: { fromCtx: "_armsReachSpend" } }
  ]
});
