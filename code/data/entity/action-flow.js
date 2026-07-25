import { chooseOneTarget, chooseOneZone, promptForZoneSelection } from "../../applications/apps/selection-dialogs.js";
import { filterZonesByGroup, getAdjacentZones, getTokenZone, getZoneCurseValue, getZoneList, getActiveEntityActor, sceneHunterTokens } from "../../canvas/zone.js";
import { matchesEntityAttackConditions } from "./action-rules.js";
import { applyInterceptors } from "../../helpers/extensions.js";
import { adjustEntityResource } from "../../documents/actor/resources.js";
import { resolveEntitySourceValue } from "../../documents/entity/entity-stats.js";

export function normalizeAllowedZones(allowedZones) {
  if (Array.isArray(allowedZones)) return allowedZones;
  return [];
}

function zonesFromTargets(tokens) {
  return Array.from(new Set((tokens || []).map((t) => getTokenZone(t)).filter(Boolean)));
}

function uniqueZones(zones = []) {
  return Array.from(new Set((zones || []).filter(Boolean)));
}

function adjacentZonesForScope(originZone, scope = "any") {
  const adjacent = getAdjacentZones(originZone).filter((zone) => zone !== "Support");
  const key = String(scope || "any");
  if (key === "close") return filterZonesByGroup(adjacent, "close");
  if (key === "ranged") return filterZonesByGroup(adjacent, "ranged");
  return adjacent;
}

async function pickAdjacentTargetZones({
  originZones = [],
  hunters = [],
  adjacentScope = "any",
  adjacentCount = "one",
  warnNoValidZones = "No valid adjacent zones for this action."
} = {}) {
  const origins = uniqueZones(originZones).filter((zone) => zone !== "Support");
  const candidates = origins.filter((zone) =>
    adjacentZonesForScope(zone, adjacentScope).some((adjacent) => hunters.some((t) => getTokenZone(t) === adjacent))
  );
  if (!candidates.length) { ui.notifications.warn(warnNoValidZones); return { originZones: [], targetZones: [] }; }
  const origin = await chooseOneZone(candidates);
  if (!origin) return { originZones: [], targetZones: [] };
  const adjacent = adjacentZonesForScope(origin, adjacentScope)
    .filter((zone) => hunters.some((t) => getTokenZone(t) === zone));
  if (!adjacent.length) { ui.notifications.warn(warnNoValidZones); return { originZones: [], targetZones: [] }; }
  const count = String(adjacentCount || "one");
  if (count === "all") return { originZones: [origin], targetZones: adjacent };
  if (count === "one") {
    const targetZones = await promptForZoneSelection(adjacent, { title: "Choose Adjacent Zone", single: true });
    return { originZones: [origin], targetZones };
  }
  if (adjacent.length <= 2) return { originZones: [origin], targetZones: adjacent };
  const first = await chooseOneZone(adjacent);
  if (!first) return { originZones: [origin], targetZones: [] };
  const second = await chooseOneZone(adjacent.filter((zone) => zone !== first));
  return { originZones: [origin], targetZones: [first, second].filter(Boolean) };
}

export async function resolveSingleTargets({ allowedZones = [], hunters = null, zoneFilter = null } = {}) {
  const pool = hunters || sceneHunterTokens();
  const poolIds = new Set(pool.map((t) => t.id));
  const inScope = (t) => poolIds.has(t.id)
    && (!allowedZones.length || allowedZones.includes(getTokenZone(t)))
    && (typeof zoneFilter !== "function" || zoneFilter(getTokenZone(t)));
  const targeted = Array.from(game.user?.targets ?? [])
    .filter((t) => t.actor?.type === "hunter")
    .filter(inScope);
  if (targeted.length) return targeted;
  const chosen = await chooseOneTarget(pool.filter(inScope));
  return chosen ? [chosen] : [];
}

export async function pickActionZones({
  allowedZones = [],
  hunters = null,
  zoneFilter = null,
  requireHunters = true,
  select = "multi",
  warnNoZones = "No zone regions found on this scene.",
  warnNoValidZones = "No valid zones for this action."
} = {}) {
  const pool = hunters || sceneHunterTokens();
  let zones = allowedZones.length ? allowedZones.slice() : getZoneList();
  if (!zones.length) { ui.notifications.warn(warnNoZones); return []; }
  if (allowedZones.length) zones = zones.filter((z) => allowedZones.includes(z));
  if (typeof zoneFilter === "function") zones = zones.filter((z) => zoneFilter(z));
  if (requireHunters) zones = zones.filter((z) => pool.some((t) => getTokenZone(t) === z));
  if (!zones.length) { ui.notifications.warn(warnNoValidZones); return []; }
  if (select === "single") {
    const zone = await chooseOneZone(zones);
    return zone ? [zone] : [];
  }
  return await promptForZoneSelection(zones);
}

export async function resolveActionTargets({
  mode,
  allowedZones = [],
  hunters = null,
  zoneFilter = null,
  actionType = "attack",
  allowEmptyZones = false,
  warnNoValidZones = "No valid zones for this action.",
  targeting = {}
} = {}) {
  const allowed = normalizeAllowedZones(allowedZones);
  const pool = hunters || sceneHunterTokens();
  const requestedMode = String(mode || "single");
  const targetMode = actionType === "other" ? requestedMode : (requestedMode === "noTargets" ? "single" : requestedMode);
  if (targetMode === "noTargets") return { targets: [], zones: [] };
  if (targetMode === "zone") {
    const zones = await pickActionZones({
      allowedZones: allowed,
      hunters: pool,
      zoneFilter,
      requireHunters: !allowEmptyZones,
      select: "single",
      warnNoValidZones
    });
    if (actionType === "other") return { targets: [], zones };
    return { targets: pool.filter((t) => zones.includes(getTokenZone(t))), zones };
  }
  if (targetMode === "adjacentZones") {
    const originZones = allowed.length ? allowed : getZoneList();
    const selection = await pickAdjacentTargetZones({
      originZones: typeof zoneFilter === "function" ? originZones.filter((zone) => zoneFilter(zone)) : originZones,
      hunters: pool,
      adjacentScope: targeting.adjacentScope,
      adjacentCount: targeting.adjacentCount,
      warnNoValidZones
    });
    const targetZones = uniqueZones(selection.targetZones);
    const zones = uniqueZones([...(selection.originZones || []), ...targetZones]);
    if (actionType === "other") return { targets: [], zones, targetZones, originZones: selection.originZones || [] };
    return {
      targets: pool.filter((t) => targetZones.includes(getTokenZone(t))),
      zones,
      targetZones,
      originZones: selection.originZones || []
    };
  }
  if (targetMode === "single") {
    const targets = await resolveSingleTargets({ allowedZones: allowed, hunters: pool, zoneFilter });
    return { targets, zones: zonesFromTargets(targets) };
  }
  const zones = await pickActionZones({
    allowedZones: allowed,
    hunters: pool,
    zoneFilter,
    requireHunters: !allowEmptyZones,
    select: "multi",
    warnNoValidZones
  });
  if (actionType === "other") return { targets: [], zones };
  return { targets: pool.filter((t) => zones.includes(getTokenZone(t))), zones };
}

async function resolveRestoreZones(config) {
  const chosen = Array.isArray(config.zones) ? config.zones : [];
  const allZones = getZoneList();
  let zones = chosen.length ? chosen.filter((z) => allZones.includes(z)) : allZones;
  if (!zones.length) return [];
  const source = String(config.dynamicSource || "curseZones");
  if (config.mode === "dynamic") {
    if (source === "curseZones") {
      zones = zones.filter((z) => getZoneCurseValue(z) > 0);
    } else if (source === "curseHunters" || source === "huntersInZones" || source === "numberMinusHunters") {
      const hunters = sceneHunterTokens();
      zones = zones.filter((z) => hunters.some((t) => getTokenZone(t) === z));
    }
  }
  if (!zones.length) return [];
  if (config.zoneMode === "single") {
    const picked = await chooseOneZone(zones);
    return picked ? [picked] : [];
  }
  return zones;
}

export async function resolveRestoreResolve(config, entityActor) {
  const restore = config?.restoreResolve;
  if (!restore?.enabled) return;
  let restoreAmount = 0;
  if (restore.mode === "fixed") {
    restoreAmount = Math.max(0, Number(restore.fixed ?? 0) || 0);
  } else {
    const source = String(restore.dynamicSource || "curseZones");
    if (source === "entityTerrain") {
      restoreAmount = Math.max(0, (Number(restore.dynamicNumber ?? 0) || 0) * resolveEntitySourceValue("entityTerrain", { entityActor }));
    } else if (source === "huntersInZones") {
      const zones = await resolveRestoreZones(restore);
      const hunters = sceneHunterTokens();
      restoreAmount = hunters.filter((t) => zones.includes(getTokenZone(t))).length;
    } else if (source === "numberMinusHunters") {
      const zones = await resolveRestoreZones(restore);
      const hunters = sceneHunterTokens();
      const count = hunters.filter((t) => zones.includes(getTokenZone(t))).length;
      restoreAmount = Math.max(0, (Number(restore.dynamicNumber ?? 0) || 0) - count);
    } else {
      const zones = await resolveRestoreZones(restore);
      restoreAmount = resolveEntitySourceValue(source, { entityActor, zones });
    }
  }
  restoreAmount = await applyInterceptors("entity-restore", { entityActor }, restoreAmount);
  if (restoreAmount > 0) {
    await adjustEntityResource(entityActor, { resolve: restoreAmount });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: entityActor }),
      content: `<div class="hollows-chat"><strong>${entityActor.name}</strong> restores <strong>${restoreAmount} Resolve</strong>.</div>`
    });
  }
}

const aborted = (r) => !!(r && r.cancelled === true);

function filterPossibleDefault(ctx) {
  if (!ctx.action?.possibleIf?.enabled) return;
  const possibleIf = ctx.action.possibleIf;
  ctx.targets = ctx.targets.filter((t) => matchesEntityAttackConditions(possibleIf.conditions, t, ctx.entityActor, possibleIf.logic));
}

export async function runEntityAction(ctx, pipeline) {
  if (pipeline.preflight) {
    const r = await pipeline.preflight(ctx);
    if (r && r.handled) return r.result;
    if (aborted(r)) return false;
  }

  ctx.targets = await pipeline.resolveTargets(ctx);
  (pipeline.filterPossible ?? filterPossibleDefault)(ctx);
  if (!ctx.targets.length && ctx.actionType !== "other") {
    ui.notifications.warn(ctx.noTargetsMessage || `No valid targets for this ${ctx.kind}.`);
    return false;
  }

  if (!ctx.options?.reaction && pipeline.beforeCardsPause) {
    if (aborted(await pipeline.beforeCardsPause(ctx))) return false;
  }
  if (!ctx.options?.reaction && pipeline.beforeCost) {
    if (aborted(await pipeline.beforeCost(ctx))) return false;
  }

  if (!(await pipeline.payCost(ctx))) return false;

  if (pipeline.afterCost) {
    if (aborted(await pipeline.afterCost(ctx))) return false;
  }

  if (!ctx.options?.reaction && pipeline.beforeResolve) {
    if (aborted(await pipeline.beforeResolve(ctx))) return false;
  }

  await pipeline.output(ctx);

  if (pipeline.afterEmit) await pipeline.afterEmit(ctx);
  return true;
}

export function resolveEntityActorFromAttackContext(attackData = {}, originMessage = null, fallbackMessage = null) {
  const activeEntity = getActiveEntityActor();
  if (activeEntity?.type === "entity") {
    if (!attackData?.entityId || String(activeEntity.id || "") === String(attackData.entityId || "")) return activeEntity;
  }
  const byId = attackData?.entityId ? game.actors?.get(String(attackData.entityId)) : null;
  if (byId?.type === "entity") return byId;
  const originSpeakerId = originMessage?.speaker?.actor ? String(originMessage.speaker.actor) : "";
  const originSpeaker = originSpeakerId ? game.actors?.get(originSpeakerId) : null;
  if (originSpeaker?.type === "entity") return originSpeaker;
  const fallbackSpeakerId = fallbackMessage?.speaker?.actor ? String(fallbackMessage.speaker.actor) : "";
  const fallbackSpeaker = fallbackSpeakerId ? game.actors?.get(fallbackSpeakerId) : null;
  if (fallbackSpeaker?.type === "entity") return fallbackSpeaker;
  return getActiveEntityActor();
}
