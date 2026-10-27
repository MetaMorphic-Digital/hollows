// Registries external content plugs into: action handlers, weapon-damage
// contributors and weapon-ability tiers.

const HANDLERS = new Map();

export function registerRefugeActionHandler(type, fn) {
  if (type && typeof fn === "function") HANDLERS.set(String(type), fn);
}

export function getRefugeActionHandler(type) {
  return HANDLERS.get(String(type || "")) || null;
}

const WEAPON_BONUS = [];

export function registerRefugeWeaponBonus(fn) {
  if (typeof fn === "function") WEAPON_BONUS.push(fn);
}

export function getRefugeWeaponBonusProviders() {
  return WEAPON_BONUS;
}

// Weapon-ability tiers a refuge grants beyond Tier 1.
const WEAPON_TIERS = [];

export function registerRefugeWeaponTiers(fn) {
  if (typeof fn === "function") WEAPON_TIERS.push(fn);
}

export function getRefugeWeaponTierProviders() {
  return WEAPON_TIERS;
}

// NPC roles surfaced on the refuge sheet.
const NPC_ROLES = [
  { key: "keeper", label: "Keeper" },
  { key: "doctor", label: "Doctor" },
  { key: "apprentice", label: "Apprentice" },
  { key: "smith", label: "Smith" },
  { key: "magus", label: "Magus" },
];

export function getRefugeNpcRoles() {
  return NPC_ROLES;
}
