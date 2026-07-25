import { makeModifierChoices } from "../base-helpers.js";

const MODIFIER_CHOICES = makeModifierChoices("wise", "sharp", "strong");
const BASE_PROFILES = [
  { defence: "Wyrd", range: "Close", stat: "Wise" },
  { defence: "Wyrd", range: "Ranged", stat: "Wise" }
];

export function makeBookForm({ key, name, label, text, damage, mechanics }) {
  return Object.freeze({
    key,
    weaponType: "Book",
    name,
    label,
    text,
    damage,
    capacity: { max: 0, value: 0 },
    healthBonus: { resolve: 3, wounds: 4 },
    modifierChoices: MODIFIER_CHOICES,
    attackProfiles: BASE_PROFILES,
    ...(mechanics?.length ? { mechanics } : {})
  });
}
