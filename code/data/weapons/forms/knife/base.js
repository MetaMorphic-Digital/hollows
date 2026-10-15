import { makeModifierChoices } from "../base-helpers.js";

const MODIFIER_CHOICES = makeModifierChoices("quick", "sharp", "hard");
const BASE_PROFILES = [{ defence: "Close", range: "Close", stat: "Quick" }];

export function makeKnifeForm({ key, name, label, text, damage, attackProfileAdd, mechanics }) {
  const attackProfiles = attackProfileAdd
    ? [...BASE_PROFILES, attackProfileAdd]
    : BASE_PROFILES;
  return Object.freeze({
    key,
    weaponType: "Knife",
    name,
    label,
    text,
    damage,
    capacity: { max: 0, value: 0 },
    healthBonus: { resolve: 3, wounds: 3 },
    modifierChoices: MODIFIER_CHOICES,
    attackProfiles,
    ...(mechanics?.length ? { mechanics } : {}),
  });
}
