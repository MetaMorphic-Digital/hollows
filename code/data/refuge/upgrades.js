// Registry for refuge upgrade definitions.

const UPGRADES = [];

export function registerRefugeUpgrades(defs = []) {
  for (const def of defs) {
    if (!def?.id || UPGRADES.some((u) => u.id === def.id)) continue;
    UPGRADES.push(def);
  }
}

export function getRefugeUpgrades() {
  return UPGRADES;
}

export function getRefugeDefaultUpgradeIds() {
  return new Set(UPGRADES.filter((u) => u.default).map((u) => u.id));
}
