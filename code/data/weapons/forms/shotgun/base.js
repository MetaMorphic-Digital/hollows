import { makeModifierChoices } from "../base-helpers.js";

const MODIFIER_CHOICES = makeModifierChoices("hard", "sharp", "strong");
const BASE_PROFILES = [
  { defence: "Close", range: "Close", stat: "Sharp" },
  { defence: "Ranged", range: "Ranged", stat: "Sharp" }
];

export function makeShotgunForm({ key, name, label, text, damage, mechanics }) {
  return Object.freeze({
    key,
    weaponType: "Shotgun",
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
