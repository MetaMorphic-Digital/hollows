import { makeModifierChoices } from "../base-helpers.js";

const MODIFIER_CHOICES = makeModifierChoices("quick", "sharp", "hard");
const BASE_PROFILES = [
  { defence: "Close", range: "Close", stat: "Quick" },
  { defence: "Ranged", range: "Ranged", stat: "Sharp" }
];

export function makePistolForm({ key, name, label, text, damage, capacity, reload, mechanics }) {
  return Object.freeze({
    key,
    weaponType: "Pistol",
    name,
    label,
    text,
    damage,
    capacity,
    ...(reload ? { reload } : {}),
    healthBonus: { resolve: 3, wounds: 3 },
    modifierChoices: MODIFIER_CHOICES,
    attackProfiles: BASE_PROFILES,
    ...(mechanics?.length ? { mechanics } : {})
  });
}
