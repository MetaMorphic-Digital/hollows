import { makeModifierChoices } from "../base-helpers.js";

const MODIFIER_CHOICES = makeModifierChoices("strong", "quick", "sharp");
const BASE_PROFILES = [{ defence: "Close", range: "Close", stat: "Strong" }];

export function makeSwordForm({ key, name, label, text, damage, mechanics }) {
  return Object.freeze({
    key,
    weaponType: "Sword",
    name,
    label,
    text,
    damage,
    capacity: { max: 0, value: 0 },
    healthBonus: { resolve: 3, wounds: 3 },
    modifierChoices: MODIFIER_CHOICES,
    attackProfiles: BASE_PROFILES,
    ...(mechanics?.length ? { mechanics } : {})
  });
}
