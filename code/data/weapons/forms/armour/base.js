import { makeModifierChoices } from "../base-helpers.js";

const MODIFIER_CHOICES = makeModifierChoices("hard", "strong", "wise");
const BASE_PROFILES = [{ defence: "Close", range: "Close", stat: "Hard" }];

export function makeArmourForm({ key, name, label, text, damage, attackProfileOverride, mechanics }) {
  const attackProfiles = attackProfileOverride ?? BASE_PROFILES;
  return Object.freeze({
    key,
    weaponType: "Armour",
    name,
    label,
    text,
    damage,
    capacity: { max: 0, value: 0 },
    healthBonus: { resolve: 2, wounds: 5 },
    modifierChoices: MODIFIER_CHOICES,
    attackProfiles,
    ...(mechanics?.length ? { mechanics } : {})
  });
}
