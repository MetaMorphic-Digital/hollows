import { StatOverride } from "../../mechanics/StatOverride.js";

export const DODGE = new StatOverride({
  key: "knife.t1.dodge",
  weapon: "Knife", tier: 1,
  name: "Dodge",
  text: "They're going to wish they'd killed you sooner. Once per round, when an Entity attacks you, you may spend 1 Resolve to defend with Quick instead of any other stat. If you roll under your Quick on this defence roll, you may Move to any adjacent area as an immediate action.",
  scope: "defence",
  newStat: "quick",
  cost: { resource: "resolve", amount: 1 },
  rateLimit: "oncePerRound",
  label: "Spend 1 Resolve to Dodge (defend with Quick)",
  successCondition: { type: "rolledUnder", stat: "quick" },
  onSuccessEffects: [
    { type: "chatNotice", message: "<strong>{actor}</strong> may Move to an adjacent area as an immediate action (Dodge)." }
  ]
});
