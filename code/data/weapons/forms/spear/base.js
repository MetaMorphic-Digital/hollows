import { makeModifierChoices } from "../base-helpers.js";

const MODIFIER_CHOICES = makeModifierChoices("quick", "strong", "wise");
const BASE_PROFILES = [{ defence: "Close", range: "Close", stat: "Strong" }];

export function makeSpearForm({ key, name, label, text, damage, attackProfileOverride, modifiers, mechanics }) {
  const attackProfiles = attackProfileOverride ?? BASE_PROFILES;
  return Object.freeze({
    key,
    weaponType: "Spear",
    name,
    label,
    text,
    damage,
    capacity: { max: 0, value: 0 },
    healthBonus: { resolve: 3, wounds: 4 },
    ...(modifiers ? { modifiers } : {}),
    modifierChoices: MODIFIER_CHOICES,
    attackProfiles,
    ...(mechanics?.length ? { mechanics } : {})
  });
}
