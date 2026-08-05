import { HOLLOWS_CONDITIONS } from "../../data/_module.mjs";
import { isShotgunWeapon, isShotgunLoaded } from "../../helpers/weapon-utils.js";
import { setActorFlagSafe } from "../../utils/flag-utils.js";
import { addTerrainPoolTag } from "../../canvas/terrain-pool.js";
import { runGMQuery } from "../../helpers/queries.js";
import { getEffectiveWeaponCapacity } from "../../data/weapons/index.js";
import { getActiveEntityActor } from "../../canvas/zone.js";
import { registerManoeuvreAvailabilityProvider } from "../../data/actions/manoeuvre-availability.js";

const TERRAIN_TAG_KEYS = Object.freeze(
  Object.entries(HOLLOWS_CONDITIONS).filter(([, cfg]) => cfg?.terrain).map(([key]) => key),
);

export function getConditionEffects(actor, key) {
  const cfg = HOLLOWS_CONDITIONS[key];
  if (!cfg) return [];
  return actor.effects.filter(effect =>
    (effect.getFlag(hollows.id, "conditionKey") === key)
    || effect.statuses.has(cfg.id),
  );
}

export function getConditionEffect(actor, key) {
  return getConditionEffects(actor, key)[0] || null;
}

export async function removeCoreDeadCondition(actor) {
  const ids = actor.effects.filter(effect => effect.statuses.has("dead")).map(effect => effect.id);
  await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
}

export async function addCondition(actor, key) {
  const cfg = HOLLOWS_CONDITIONS[key];
  if (!cfg) return;
  const existing = getConditionEffects(actor, key);
  if (existing.length) {
    const primary = existing[0];
    if (primary.disabled) await primary.update({ disabled: false });
    const extras = existing.slice(1);
    const ids = extras.map(e => e.id);
    await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
    return;
  }
  if (key === "dead") {
    await removeCoreDeadCondition(actor);
    if ((actor.type === "hunter") && game.user.isGM) {
      const cur = actor.system.corruption.value;
      await actor.update({ "system.corruption.value": cur + 1 });
    }
  }
  const effect = await actor.toggleStatusEffect(cfg.id, { active: true });
  if (effect && (typeof effect.update === "function")) {
    await effect.update({ "flags.hollows.conditionKey": key });
  }
}

export async function removeCondition(actor, key, opts = {}) {
  const existing = getConditionEffects(actor, key);
  if (!existing.length) return;

  const ids = existing.map(e => e.id);
  await actor.deleteEmbeddedDocuments("ActiveEffect", ids);

  if (isTerrainTag(key)) {
    const wasFree = isFreeTerrainTag(actor, key);
    await setFreeTerrainTag(actor, key, false);
    if (!opts.skipPoolRefund && !wasFree && isPooledTerrainTag(key)) {
      await addTerrainPoolTag(key, 1);
    }
  }
  if (!opts.skipReactionDispatch && (actor?.type === "hunter") && actor.isOwner) {
    try {
      const { runOnConditionRemoved } = await import("../../helpers/weapon-abilities/dispatchers.js");
      await runOnConditionRemoved(actor, key);
    } catch (err) {
      console.warn("Hollows | runOnConditionRemoved failed", err);
    }
  }
}

export async function toggleCondition(actor, key, force = null) {
  if (!actor) return false;
  const active = actor.statuses.has(key);
  const next = (force === null) ? !active : !!force;
  if (next === active) return active;
  if (next) await addCondition(actor, key);
  else await removeCondition(actor, key);
  return next;
}

const SPECIAL_BLOCK_KEYS = { move: "blocksMovement", "take-cover": "blocksTakeCover", focus: "blocksFocus" };

export function getHunterSpecialConditions(actor) {
  const map = actor.getFlag(hollows.id, "specialConditions") ?? {};
  return Object.values(map).filter((c) => c && (typeof c === "object"));
}

export async function applySpecialConditionSlot(actor, config) {
  if (!config?.slot) return;
  const map = { ...(actor.getFlag("hollows", "specialConditions") || {}) };
  map[config.slot] = config;
  await setActorFlagSafe(actor, "specialConditions", map);
}

export async function removeSpecialConditionSlot(actor, slot = null) {
  const map = { ...(actor.getFlag("hollows", "specialConditions") || {}) };
  if (!Object.keys(map).length) return false;
  if (slot) {
    if (!map[slot]) return false;
    delete map[slot];
  } else {
    for (const key of Object.keys(map)) delete map[key];
  }
  await setActorFlagSafe(actor, "specialConditions", map);
  return true;
}

export function specialConditionBlocks(actor, manoeuvreKey) {
  const flag = SPECIAL_BLOCK_KEYS[String(manoeuvreKey || "")];
  if (!flag) return false;
  return getHunterSpecialConditions(actor).some((c) => c[flag]);
}

export function getSpecialConditionStatDelta(actor, statKey) {
  return getHunterSpecialConditions(actor).reduce(
    (sum, c) => sum + (c.statMod?.stat === statKey ? Number(c.statMod.amount || 0) : 0), 0,
  );
}

export function getSpecialConditionRollMods(actor) {
  const conds = getHunterSpecialConditions(actor);
  return {
    disadvAttacks: conds.some((c) => c.disadvAttacks),
    disadvDefence: conds.some((c) => c.disadvDefence),
    disadvTests: conds.some((c) => c.disadvTests),
    tnMod: conds.reduce((sum, c) => sum + Number(c.tnMod || 0), 0),
  };
}

registerManoeuvreAvailabilityProvider((actor, manoeuvre) => {
  if (actor?.type !== "hunter") return null;
  return specialConditionBlocks(actor, manoeuvre) ? { available: false, reason: "Special Condition" } : null;
});

export async function setConditionSafe(actor, key, active) {
  if (!actor || !key) return false;
  if (game.user?.isGM) {
    if (active) await addCondition(actor, key);
    else await removeCondition(actor, key);
    return true;
  }
  if (actor.testUserPermission(game.user, "OWNER")) {
    if (active) await addCondition(actor, key);
    else await removeCondition(actor, key);
    return true;
  }
  try {
    await runGMQuery("hollows.actorMutation", {
      actorId: actor.id,
      type: "condition",
      payload: { key, active: !!active },
    });
    return true;
  } catch (err) {
    console.warn("Hollows | Failed to set condition via query", err);
    return false;
  }
}

export function getTerrainTagKeys() {
  return [...TERRAIN_TAG_KEYS];
}

export function isTerrainTag(key) {
  return TERRAIN_TAG_KEYS.includes(String(key));
}

export function isPooledTerrainTag(key) {
  return !!HOLLOWS_CONDITIONS[key]?.pooled;
}

export function getActorTerrainTags(actor) {
  if (!actor) return [];
  return TERRAIN_TAG_KEYS.filter((t) => actor.statuses.has(t));
}

export function destroyTerrainConditionsOnActor(actor) {
  return Promise.all(TERRAIN_TAG_KEYS.map(async (key) => {
    if (!actor.statuses.has(key)) return null;
    await removeCondition(actor, key, { skipPoolRefund: true });
    return HOLLOWS_CONDITIONS[key]?.label || key;
  })).then((removed) => removed.filter(Boolean));
}

export async function destroyTerrainCondition(actor, key, zoneOverride = "") {
  if (!actor) return false;
  if (!isTerrainTag(key)) return false;
  if (!actor.statuses.has(key)) return false;
  await removeCondition(actor, key, { skipPoolRefund: true });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `
      <div class="hollows-chat">
        <strong>${actor.name}</strong> destroys <strong>${HOLLOWS_CONDITIONS[key]?.label || key}</strong>.
        ${isPooledTerrainTag(key) ? `<span class="hollows-terrain-event" data-terrain-event="destroy" data-terrain-tag="${key}" data-zone="${foundry.utils.escapeHTML(String(zoneOverride || ""))}"></span>` : ""}
      </div>
    `,
  });
  return true;
}

export async function discardTerrainCondition(actor, key, zoneOverride = "", opts = {}) {
  if (!actor) return;
  if (!actor.statuses.has(key)) return;
  if (isFreeTerrainTag(actor, key)) {
    await removeCondition(actor, key);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `
        <div class="hollows-chat">
          <strong>${actor.name}</strong> loses <strong>${HOLLOWS_CONDITIONS[key]?.label || key}</strong>.
        </div>
      `,
    });
    return;
  }
  const { resolveTerrainDiscardOptions } = await import("../../data/actions/terrain-discard-options.js");
  if (await resolveTerrainDiscardOptions(actor, key, { zoneOverride, source: opts.source || "" })) return;
  await removeCondition(actor, key);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `
      <div class="hollows-chat">
        <strong>${actor.name}</strong> loses <strong>${HOLLOWS_CONDITIONS[key]?.label || key}</strong>.
        ${isPooledTerrainTag(key) ? `<span class="hollows-terrain-event" data-terrain-event="loss" data-terrain-tag="${key}"></span>` : ""}
      </div>
    `,
  });
}

export async function destroyGridTerrain(actor, { spareHolderId = "", spareTag = "" } = {}) {
  let destroyed = 0;
  for (const token of canvas?.tokens?.placeables || []) {
    const holder = token?.actor;
    if (!holder || (holder.type !== "hunter")) continue;
    for (const tag of getActorTerrainTags(holder)) {
      if ((tag === spareTag) && (holder.id === spareHolderId)) continue;
      await requestTerrainConditionApply(holder, tag, "", false, { skipPoolRefund: true });
      destroyed += 1;
    }
  }
  const entity = getActiveEntityActor();
  if (entity) {
    const counts = getEntityTerrainCounts(entity);
    const entityTags = Math.max(0, Number(counts.elevated || 0)) + Math.max(0, Number(counts.sheltered || 0));
    if (entityTags > 0) {
      const update = { "system.terrain.elevated": 0, "system.terrain.sheltered": 0 };
      if (game.user?.isGM || entity.testUserPermission(game.user, "OWNER")) await entity.update(update);
      else await runGMQuery("hollows.actorMutation", { actorId: entity.id, type: "update", payload: { update } });
      destroyed += entityTags;
    }
  }
  return destroyed;
}

export function getEntityTerrainCounts(actor) {
  if (!actor || (actor.type !== "entity")) return { elevated: 0, sheltered: 0 };
  const terrain = actor.system?.terrain || {};
  return {
    elevated: Math.max(0, Number(terrain.elevated ?? 0) || 0),
    sheltered: Math.max(0, Number(terrain.sheltered ?? 0) || 0),
  };
}

export function getEntityTerrainTotal(actor) {
  const t = getEntityTerrainCounts(actor);
  return t.elevated + t.sheltered;
}

export function targetHasTerrain(actor) {
  if (!actor) return false;
  if (actor.type === "entity") return getActorTerrainCount(actor) > 0;
  return getActorTerrainTags(actor).length > 0;
}

export function getActorTerrainCount(actor) {
  if (!actor) return 0;
  let count = getActorTerrainTags(actor).length;
  if (actor.type === "entity") {
    const entityTerrain = getEntityTerrainCounts(actor);
    count += entityTerrain.elevated + entityTerrain.sheltered;
  }
  return count;
}

export function getTargetCapacityValue(actor) {
  if (!actor) return 0;
  const weapons = actor.items?.filter((i) => i.type === "weapon") || [];
  return weapons.reduce((sum, w) => {
    if (isShotgunWeapon(w)) return sum + (isShotgunLoaded(w) ? 1 : 0);
    const max = Number(getEffectiveWeaponCapacity(w).max ?? 0);
    const cur = Number(w.system?.capacity?.value ?? 0);
    return sum + (max > 0 ? Math.max(0, cur) : 0);
  }, 0);
}

export function targetHasCapacity(actor) {
  return getTargetCapacityValue(actor) > 0;
}

export function getFreeTerrainTags(actor) {
  const raw = actor?.getFlag?.("hollows", "freeTerrainTags");
  return Array.isArray(raw) ? raw : [];
}

export function isFreeTerrainTag(actor, key) {
  if (!actor || !key) return false;
  return getFreeTerrainTags(actor).includes(key);
}

export async function setFreeTerrainTag(actor, key, active) {
  if (!actor || !key) return false;
  const tags = new Set(getFreeTerrainTags(actor));
  if (active) tags.add(key);
  else tags.delete(key);
  return setActorFlagSafe(actor, "freeTerrainTags", Array.from(tags));
}

export async function requestTerrainConditionApply(actor, key, tokenUuid = "", active = true, opts = {}) {
  if (!actor || !key) return false;
  if (game.user?.isGM) {
    if (active) await addCondition(actor, key);
    else await removeCondition(actor, key, opts);
    return true;
  }
  try {
    await runGMQuery("hollows.actorMutation", {
      actorId: actor.id,
      tokenUuid,
      type: "condition",
      payload: { key, active: !!active, opts },
    });
    return true;
  } catch (err) {
    console.warn("Hollows | Failed to apply terrain condition via query", err);
    return false;
  }
}
