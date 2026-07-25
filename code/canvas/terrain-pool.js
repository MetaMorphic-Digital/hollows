import { getActiveEntityActor, getActorZone } from "./zone.js";
import { runGMQuery } from "../helpers/queries.js";

function readEntityTerrain(entity) {
  const t = entity?.system?.terrain || {};
  return {
    elevated: Math.max(0, Number(t.elevated ?? 0) || 0),
    sheltered: Math.max(0, Number(t.sheltered ?? 0) || 0)
  };
}

function terrainTagOrder(tag, primary) {
  const key = String(tag || "any");
  if (key === "elevated" || key === "sheltered") return [key];
  return primary.sheltered >= primary.elevated ? ["sheltered", "elevated"] : ["elevated", "sheltered"];
}

/**
 * GM-side terrain-on-Entity mutation. 
 */
export async function applyEntityTerrainAdjustGM(entity, tag, delta, opts = {}) {
  if (!entity || entity.type !== "entity") return 0;
  const d = Math.trunc(Number(delta || 0));
  if (!d) return 0;
  const fromPool = opts.fromPool !== false;
  const terrain = readEntityTerrain(entity);
  const pool = {
    elevated: Math.max(0, Number(entity.system?.terrainPool?.elevated ?? 0) || 0),
    sheltered: Math.max(0, Number(entity.system?.terrainPool?.sheltered ?? 0) || 0)
  };
  // Place draws from the type with the most pool stock first; destroy takes from
  // the type the Entity holds most of first. "any" spills into the other type.
  const order = terrainTagOrder(tag, d > 0 ? pool : terrain);
  const update = {};
  let changed = 0;
  let remaining = Math.abs(d);
  for (const key of order) {
    if (remaining <= 0) break;
    if (d > 0) {
      const placed = Math.min(remaining, fromPool ? pool[key] : remaining);
      if (placed <= 0) continue;
      update[`system.terrain.${key}`] = terrain[key] + placed;
      if (fromPool) update[`system.terrainPool.${key}`] = Math.max(0, pool[key] - placed);
      changed += placed;
      remaining -= placed;
    } else {
      const removed = Math.min(remaining, terrain[key]);
      if (removed <= 0) continue;
      update[`system.terrain.${key}`] = Math.max(0, terrain[key] - removed);
      if (fromPool) update[`system.terrainPool.${key}`] = pool[key] + removed;
      changed += removed;
      remaining -= removed;
    }
  }
  if (!changed) return 0;
  await entity.update(update);
  if (d < 0 && opts.byHunter && changed > 0) {
    const { triggerEntityTriggeredAbilities } = await import("../data/entity/actions/entity-special.js");
    const hunter = opts.hunterId ? game.actors?.get(String(opts.hunterId)) : null;
    await triggerEntityTriggeredAbilities(entity, "entityTerrainDestroyed", {
      targetActor: hunter,
      targetZone: hunter ? getActorZone(hunter) : ""
    });
  }
  return changed;
}

/**
 * Place (`delta > 0`) or destroy/return (`delta < 0`) terrain tags on the Entity.
 * Self-routes player→GM through the query bus. `tag` may be "elevated",
 * "sheltered" or "any". `fromPool` (default true) debits/credits the pool.
 */
export async function adjustEntityTerrain(entity, tag, delta, opts = {}) {
  const ent = entity || getActiveEntityActor();
  if (!ent || ent.type !== "entity") return 0;
  if (game.user?.isGM || ent.testUserPermission?.(game.user, "OWNER")) {
    return applyEntityTerrainAdjustGM(ent, tag, delta, opts);
  }
  try {
    return await runGMQuery("hollows.entityTerrainAdjust", {
      entityId: ent.id,
      tag: String(tag || "any"),
      delta: Math.trunc(Number(delta || 0)),
      fromPool: opts.fromPool !== false,
      byHunter: !!opts.byHunter,
      hunterId: opts.hunterId || ""
    });
  } catch (err) {
    console.warn("Hollows | adjustEntityTerrain query failed", { tag, delta }, err);
    return 0;
  }
}

export function getAvailableTerrainTags(entity, delta, fromPool = false) {
  const d = Math.trunc(Number(delta || 0));
  const types = ["elevated", "sheltered"];
  if (!entity || !d) return [];
  if (d > 0) {
    if (!fromPool) return types.slice();
    const pool = entity.system?.terrainPool || {};
    return types.filter((k) => Math.max(0, Number(pool[k] ?? 0) || 0) > 0);
  }
  const terrain = entity.system?.terrain || {};
  return types.filter((k) => Math.max(0, Number(terrain[k] ?? 0) || 0) > 0);
}

export function getTerrainPoolValue(tagKey) {
  const entity = getActiveEntityActor();
  if (!entity) return null;
  const pool = entity.system?.terrainPool ?? {};
  if (!(tagKey in pool)) return null;        
  const raw = Number(entity.system?.terrainPool?.[tagKey] ?? 0);
  if (Number.isNaN(raw)) return 0;
  return Math.max(0, raw);
}

export async function updateTerrainPool(tagKey, delta) {
  if (!tagKey) return false;
  const entity = getActiveEntityActor();
  if (!entity) return false;
  if (!(tagKey in (entity.system?.terrainPool ?? {}))) return false;
  const raw = Number(entity.system?.terrainPool?.[tagKey] ?? 0);
  const current = Number.isNaN(raw) ? 0 : Math.max(0, raw);
  const next = Math.max(0, current + Number(delta ?? 0));
  const update = { [`system.terrainPool.${tagKey}`]: next };
  if (game.user?.isGM || entity.testUserPermission(game.user, "OWNER")) {
    try {
      await entity.update(update);
    } catch (err) {
      console.warn("Hollows | updateTerrainPool failed", { tagKey, current, next }, err);
      ui.notifications?.error?.(`Hollows: failed to update terrain pool (${tagKey}). See console.`);
      return false;
    }
    return true;
  }
  try {
    await runGMQuery("hollows.actorMutation", {
      actorId: entity.id,
      type: "update",
      payload: { update }
    });
    return true;
  } catch (err) {
    console.warn("Hollows | updateTerrainPool query failed", { tagKey, current, next }, err);
    ui.notifications?.error?.(`Hollows: failed to update terrain pool (${tagKey}). See console.`);
    return false;
  }
}

export async function spendTerrainPoolTag(tagKey, amount = 1) {
  const delta = Math.max(0, Number(amount ?? 0));
  if (!delta) return true;
  const current = getTerrainPoolValue(tagKey);
  if (current !== null && current < delta) return false;
  return updateTerrainPool(tagKey, -delta);
}

export async function addTerrainPoolTag(tagKey, amount = 1) {
  const delta = Math.max(0, Number(amount ?? 0));
  if (!delta) return true;
  return updateTerrainPool(tagKey, delta);
}
