const CYPHER_ART = "systems/hollows/assets/cypher.webp";

export function activeRelicEffect(relic) {
  const system = relic?.system || {};
  return system.upgraded ? (system.cypher || {}) : system;
}

// Upgrade only the hunter's copy; the world relic remains the template.
export async function upgradeRelicToCypher(relic) {
  if (!game.user?.isGM) return false;
  if (!relic || relic.type !== "relic" || !relic.isEmbedded || relic.system?.upgraded) return false;
  const update = { "system.upgraded": true, img: CYPHER_ART };
  const cypherName = String(relic.system?.cypherName || "").trim();
  if (cypherName) update.name = cypherName;
  await relic.update(update);
  return true;
}

function isPendingCypher(item) {
  return item?.type === "relic" && !!item.system?.cypherUpgradable && !item.system?.upgraded;
}

function* upgradableRelics() {
  for (const actor of (game.actors?.contents || [])) {
    if (actor.type !== "hunter") continue;
    for (const item of (actor.items?.contents || [])) {
      if (isPendingCypher(item)) yield item;
    }
  }
}

export async function checkCypherUpgrades(trigger, targetId) {
  if (!game.user?.isGM) return;
  const triggerKey = String(trigger || "");
  const targetKey = String(targetId || "");
  if (!triggerKey || !targetKey) return;
  for (const relic of upgradableRelics()) {
    if (String(relic.system?.cypherTrigger || "") !== triggerKey) continue;
    if (String(relic.system?.cypherTriggerTargetId || "") !== targetKey) continue;
    await upgradeRelicToCypher(relic);
  }
}
