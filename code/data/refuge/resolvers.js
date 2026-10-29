// Side-effect-free Refuge reads for weapon bonuses, upgrades, and NPC roles.

export function getPrimaryRefugeActor() {
  const refuges = game.actors.contents.filter(a => a.type === "refuge");
  if (!refuges.length) return null;
  const named = refuges.find(a => String(a.name || "").toLowerCase() === "refuge");
  return named || refuges[0];
}

/** Weapon-ability tiers granted by available upgrades, including the base Tier 1. */
export function getRefugeAllowedWeaponTiers(refugeActor) {
  const tiers = new Set([1]);
  for (const item of refugeActor?.system.upgradeItems ?? []) {
    if (item.system.isAvailable(refugeActor)) {
      for (const tier of item.system.weaponTiers) tiers.add(tier);
    }
  }
  return [...tiers].sort((a, b) => a - b);
}

/** Sum the available upgrades that grant damage to this weapon type. */
export function getRefugeWeaponDamageBonus(weapon, refugeActor) {
  const bonus = { resolve: 0, wounds: 0 };
  if (!weapon || !refugeActor) return bonus;
  for (const item of refugeActor.system.upgradeItems) {
    if (!item.system.isAvailable(refugeActor)) continue;
    const damage = item.system.weaponDamage;
    if (!damage.types.has(weapon.system.weaponType)) continue;
    bonus.resolve += damage.resolve;
    bonus.wounds += damage.wounds;
  }
  return bonus;
}

// NPC roles surfaced on the refuge sheet.
export const NPC_ROLES = [
  { key: "keeper", label: "HOLLOWS.REFUGE.npcRoles.keeper" },
  { key: "doctor", label: "HOLLOWS.REFUGE.npcRoles.doctor" },
  { key: "apprentice", label: "HOLLOWS.REFUGE.npcRoles.apprentice" },
  { key: "smith", label: "HOLLOWS.REFUGE.npcRoles.smith" },
  { key: "magus", label: "HOLLOWS.REFUGE.npcRoles.magus" },
];
