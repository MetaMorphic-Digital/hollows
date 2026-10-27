// Side-effect-free refuge reads shared by the attack pipeline, echo, and the
// mechanic registry.
import { getRefugeUpgrades, getRefugeDefaultUpgradeIds } from "./upgrades.js";
import { getRefugeWeaponBonusProviders, getRefugeWeaponTierProviders } from "./action-handlers.js";

export function getPrimaryRefugeActor() {
  const refuges = game.actors.contents.filter(a => a.type === "refuge");
  if (!refuges.length) return null;
  const named = refuges.find(a => String(a.name || "").toLowerCase() === "refuge");
  return named || refuges[0];
}

export function getUpgradeRank(refugeActor, upgradeId) {
  const raw = Number(refugeActor?.system?.upgrades?.[upgradeId] ?? 0);
  return Number.isNaN(raw) ? 0 : Math.max(0, raw);
}

export function getInstalledUpgradeSet(refugeActor) {
  const defaults = getRefugeDefaultUpgradeIds();
  const installed = new Set();
  for (const u of getRefugeUpgrades()) {
    if (defaults.has(u.id) || getUpgradeRank(refugeActor, u.id) > 0) installed.add(u.id);
  }
  return installed;
}

// Weapon-ability tiers the refuge grants; base system allows Tier 1 only.
export function getRefugeAllowedWeaponTiers(refugeActor) {
  const tiers = new Set([1]);
  for (const provider of getRefugeWeaponTierProviders()) {
    for (const tier of provider(refugeActor) || []) tiers.add(Number(tier));
  }
  return [...tiers].sort((a, b) => a - b);
}

// Weapon damage bonus from installed refuge upgrades; base system has none.
export function getRefugeWeaponDamageBonus(weapon, refugeActor) {
  const bonus = { resolve: 0, wounds: 0 };
  if (!weapon || !refugeActor) return bonus;
  for (const provider of getRefugeWeaponBonusProviders()) {
    const b = provider(weapon, refugeActor) || {};
    bonus.resolve += Number(b.resolve || 0);
    bonus.wounds += Number(b.wounds || 0);
  }
  return bonus;
}
