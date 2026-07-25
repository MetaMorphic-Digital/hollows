// Registry for refuge upgrade and action definitions.

const UPGRADES = [];
const ACTIONS = [];

export function registerRefugeUpgrades(defs = []) {
  for (const def of defs) {
    if (!def?.id || UPGRADES.some((u) => u.id === def.id)) continue;
    UPGRADES.push(def);
  }
}

export function registerRefugeActions(defs = []) {
  for (const def of defs) {
    if (!def?.id || ACTIONS.some((a) => a.id === def.id)) continue;
    ACTIONS.push(def);
  }
}

export function getRefugeUpgrades() {
  return UPGRADES;
}

export function getRefugeActions() {
  return ACTIONS;
}

export function getRefugeDefaultUpgradeIds() {
  return new Set(UPGRADES.filter((u) => u.default).map((u) => u.id));
}
