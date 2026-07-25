// Registries external content plugs into: action handlers, weapon-damage
// contributors, Recover modes, and weapon-ability tiers.

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

// Recover modes beyond the base "full".
const RECOVER_MODES = new Map();

export function registerRefugeRecoverMode(mode) {
  if (mode?.id) RECOVER_MODES.set(String(mode.id), mode);
}

export function getRefugeRecoverModes() {
  return [...RECOVER_MODES.values()];
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
const NPC_ROLES = [{ key: "keeper", label: "Keeper" }];

export function registerRefugeNpcRoles(roles = []) {
  for (const role of roles) {
    if (!role?.key || NPC_ROLES.some((r) => r.key === role.key)) continue;
    NPC_ROLES.push(role);
  }
}

export function getRefugeNpcRoles() {
  return NPC_ROLES;
}
