const TERRAIN_DISCARD_PROVIDERS = [];

export function registerTerrainDiscardProvider(provider, { priority = 0 } = {}) {
  if (typeof provider !== "function") return;
  if (TERRAIN_DISCARD_PROVIDERS.some((entry) => entry.provider === provider)) return;
  TERRAIN_DISCARD_PROVIDERS.push({ provider, priority: Number(priority || 0) });
  TERRAIN_DISCARD_PROVIDERS.sort((a, b) => b.priority - a.priority);
}

export async function resolveTerrainDiscardOptions(actor, key, context = {}) {
  for (const entry of TERRAIN_DISCARD_PROVIDERS) {
    const option = await entry.provider(actor, key, context);
    if (!option) continue;
    const handled = await option?.handle?.(actor, key, context);
    if (handled) return true;
  }
  return false;
}
