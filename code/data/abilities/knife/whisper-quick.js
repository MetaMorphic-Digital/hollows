import { StatOverride } from "../../mechanics/StatOverride.js";

export const WHISPER_QUICK = new StatOverride({
  key: "knife.t1.whisper-quick",
  weapon: "Knife", tier: 1,
  name: "Whisper-Quick",
  text: "Kill them before they can hurt you. As an immediate action, spend 1 Resolve to make your next attack with Quick instead of any other stat. If this attack inflicts Wound damage, restore 2 Resolve.",
  scope: "attack",
  newStat: "quick",
  cost: { resource: "resolve", amount: 1 },
  rateLimit: null,
  label: "Spend 1 Resolve to attack with Quick (Whisper-Quick)",
  successCondition: { type: "damageType", damageType: "Wounds" },
  onSuccessEffects: [
    { type: "restoreResolve", amount: 2 },
    { type: "chatNotice", message: "<strong>{actor}</strong> restores <strong>2 Resolve</strong> (Whisper-Quick)." }
  ]
});
