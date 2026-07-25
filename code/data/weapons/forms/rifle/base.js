import { makeModifierChoices } from "../base-helpers.js";

const MODIFIER_CHOICES = makeModifierChoices("sharp", "wise", "quick");
const BASE_PROFILES = [
  { defence: "Close", range: "Close", stat: "Sharp" },
  { defence: "Ranged", range: "Ranged", stat: "Sharp" }
];

export function makeRifleForm({ key, name, label, text, damage, capacity = { max: 1, value: 1 }, modifiers, mechanics }) {
  return Object.freeze({
    key,
    weaponType: "Rifle",
    name,
    label,
    text,
    damage,
    capacity,
    ...(modifiers ? { modifiers } : {}),
    healthBonus: { resolve: 3, wounds: 3 },
    modifierChoices: MODIFIER_CHOICES,
    attackProfiles: BASE_PROFILES,
    ...(mechanics?.length ? { mechanics } : {})
  });
}
