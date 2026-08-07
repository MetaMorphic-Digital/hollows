import { getActiveHollowActor, getActiveSceneHunterCount, getThreatInZone, getTokenZone, getZoneCurseValue, getZoneList, getHuntersInZone, sumCurseInZones, sumThreatInZones, sumCurseOnHunters } from "../../canvas/zone.js";
import { getEntityTerrainTotal } from "../actor/conditions.js";
import { computeEntityConditionFlags, evaluateEntityStateCondition } from "./entity-conditions.js";
import { MECHANIC_BUCKETS } from "../../helpers/mechanic-registry.js";
import { getEntityStatDelta } from "../../helpers/weapon-abilities/dispatchers.js";
import { relicEntityStatDelta } from "../../data/relic/passive.js";
import { getEntityEngineAbilities } from "../../data/entity/resolvers.js";
import { getEnhancementBuilderStatDelta } from "./enhancement-builder-passive.js";

const DEFENCE_STATS = new Set(["close", "ranged", "wyrd"]);

const STAT_ALIASES = {
  threatcap: "threatCap",
  threatmax: "threatCap",
  threatperround: "threatPerRound",
  resolve: "resolveMax",
  resolvemax: "resolveMax",
  wounds: "woundsMax",
  woundsmax: "woundsMax",
  defendtn: "defendTN",
};

export function normalizeEntityStatKey(stat) {
  const key = String(stat || "").trim();
  const compact = key.toLowerCase().replace(/[\s_-]+/g, "");
  return STAT_ALIASES[compact] || key;
}

export function getEntityBaseSystem(entityActor) {
  return entityActor?._source?.system || entityActor?.system || {};
}

function getEntityBaseStat(entityActor, stat) {
  const key = normalizeEntityStatKey(stat);
  const system = getEntityBaseSystem(entityActor);
  if (key === "close" || key === "ranged" || key === "wyrd") return Math.max(0, Number(system?.defences?.[key] ?? 0) || 0);
  if (key === "threatCap") return Math.max(0, Number(system?.threat?.max ?? 0) || 0);
  if (key === "threatPerRound") return Math.max(0, Number(system?.threat?.perRound ?? 0) || 0);
  if (key === "resolveMax") return Math.max(0, Number(system?.health?.resolve?.max ?? 0) || 0);
  if (key === "woundsMax") return Math.max(0, Number(system?.health?.wounds?.max ?? 0) || 0);
  if (key === "defendTN") return 0;
  return Math.max(0, Number(system?.[key] ?? 0) || 0);
}

export function getSceneDoomValue(scene = canvas?.scene) {
  if (!scene) return 0;
  return Number(scene.getFlag("hollows", "doom") ?? 0);
}

function getDoomValue() {
  const hollow = getActiveHollowActor();
  if (hollow) return Number(hollow.system?.doom?.current ?? 0);
  return getSceneDoomValue();
}

export function isEntityEngineAbilityActive(entityActor, ability) {
  if (!entityActor || !ability) return false;
  const sys = ability.system || {};
  if (String(sys.kind || "") !== "doom") return true;
  const threshold = Math.max(0, Number(sys.doom?.threshold ?? 1) || 0);
  return getDoomValue() >= threshold;
}

/** True if any active Special/Doom ability on the Entity sets the given special flag. */
function entityHasActiveSpecialFlag(entityActor, key) {
  if (!entityActor || entityActor.type !== "entity") return false;
  for (const spec of getEntityEngineAbilities(entityActor, ["special", "doom"])) {
    if (!isEntityEngineAbilityActive(entityActor, spec)) continue;
    if (spec.system?.special?.[key]) return true;
  }
  return false;
}

/** Colossal: Climbing rules (Elevated advantage → +1/+2 damage, thrown-free Wound). */
export function isEntityColossal(entityActor) {
  return entityHasActiveSpecialFlag(entityActor, "colossal");
}

/** Improvised Defences: Hunters may destroy an Entity terrain tag instead of inflicting Wound damage. */
export function entityAllowsTerrainShield(entityActor) {
  return entityHasActiveSpecialFlag(entityActor, "terrainShield");
}

function getEntitySpecialConditionThreshold(source) {
  return Math.max(1, Number(source?.special?.passive?.curseThreshold ?? source?.special?.trigger?.thresholdValue ?? 3) || 3);
}

/**
 * Single source for dynamic value lookups shared by TN modifiers, attack-damage
 * modifiers, passive amounts and Modify-If thresholds. `zones` defaults to the
 * whole grid only when not provided (an explicit [] yields the empty set).
 */
export function resolveEntitySourceValue(source, { entityActor = null, targetToken = null, zones = null } = {}) {
  const s = String(source || "");
  const target = targetToken?.actor || null;
  const targetZone = targetToken ? (getTokenZone(targetToken) || "") : "";
  const zoneList = zones == null ? getZoneList() : zones;
  if (s === "targetCurse") return Math.max(0, Number(target?.system?.curse?.value ?? 0) || 0);
  if (s === "zoneCurse") return targetZone ? Math.max(0, Number(getZoneCurseValue(targetZone)) || 0) : 0;
  if (s === "entityCurse" || s === "curseEntity") return Math.max(0, Number(entityActor?.system?.curse?.value ?? 0) || 0);
  if (s === "threat") return targetZone ? Math.max(0, Number(getThreatInZone(targetZone)) || 0) : 0;
  if (s === "huntersInZone") return targetZone ? getHuntersInZone(targetZone).length : 0;
  if (s === "threatZones") return sumThreatInZones(zoneList);
  if (s === "curseZones") return sumCurseInZones(zoneList);
  if (s === "curseHunters") return sumCurseOnHunters(zoneList);
  if (s === "entityTerrain") return Math.max(0, getEntityTerrainTotal(entityActor));
  if (s === "entityResolve") return Math.max(0, Number(entityActor?.system?.health?.resolve?.value ?? 0) || 0);
  if (s === "entityWounds") return Math.max(0, Number(entityActor?.system?.health?.wounds?.value ?? 0) || 0);
  return 0;
}

export function doesEntitySpecialConditionApply(source, entityActor, context = {}) {
  const passive = source?.special?.passive || {};
  const cond = String(passive.condition || "always");
  const target = context.targetActor || context.target || null;
  const threshold = getEntitySpecialConditionThreshold(source);
  const targetToken = context.targetToken || null;
  const targetZone = targetToken ? (getTokenZone(targetToken) || "") : "";
  if (cond === "always") return true;

  // Special-passive-specific gates (thresholds, zone lists, zone-scoped alone).
  if (cond === "entityTerrainThreshold") return getEntityTerrainTotal(entityActor) >= threshold;
  if (cond === "targetCurseThreshold") return Number(target?.system?.curse?.value ?? 0) >= threshold;
  if (cond === "entityCurseThreshold") return Number(entityActor?.system?.curse?.value ?? 0) >= threshold;
  if (cond === "zoneHasThreat") return targetZone ? getThreatInZone(targetZone) > 0 : false;
  if (cond === "zoneNoThreat") return targetZone ? getThreatInZone(targetZone) <= 0 : false;
  if (cond === "zoneThreatThreshold") return targetZone ? getThreatInZone(targetZone) >= threshold : false;
  if (cond === "targetInZones") {
    const zones = Array.isArray(passive.conditionZones) ? passive.conditionZones : [];
    return !zones.length || (!!targetZone && zones.includes(targetZone));
  }
  if (cond === "targetAlone") return targetZone ? getHuntersInZone(targetZone).length <= 1 : false;
  if (cond === "targetNotAlone") return targetZone ? getHuntersInZone(targetZone).length > 1 : false;

  // Shared target / Entity state conditions (curse, terrain, broken …).
  const state = evaluateEntityStateCondition(cond, computeEntityConditionFlags(target, targetZone, entityActor));
  return state === undefined ? true : state;
}

function resolvePassiveDynamicAmount(passive, entityActor) {
  const zones = String(passive?.amountScope || "all") === "select"
    ? (Array.isArray(passive?.amountZones) ? passive.amountZones : [])
    : getZoneList();
  return resolveEntitySourceValue(String(passive?.amountSource || "curseEntity"), { entityActor, zones });
}

export function resolvePassiveAmount(passive, side = "single", entityActor = null) {
  if (String(passive?.amountMode || "fixed") === "dynamic") {
    return side === "wounds" ? 0 : resolvePassiveDynamicAmount(passive, entityActor);
  }
  return Number((side === "wounds" ? passive?.amountWounds : passive?.amount) ?? 0) || 0;
}

function getEntitySpecialPassiveStatDelta(entityActor, stat, context = {}) {
  const key = normalizeEntityStatKey(stat);
  let total = 0;
  for (const spec of getEntityEngineAbilities(entityActor, ["special", "doom"])) {
    if (!isEntityEngineAbilityActive(entityActor, spec)) continue;
    const sys = spec.system || {};
    if (String(sys.special?.type || "textOnly") !== "passiveModifier") continue;
    const passive = sys.special.passive;
    const passiveType = String(passive.type || "");
    if (passiveType === "modifyDefences") {
      if (!DEFENCE_STATS.has(key)) continue;
      const scope = String(passive.defenceScope || "all");
      if (scope !== "all" && scope !== key) continue;
    } else {
      const expectedType = {
        threatCap: "modifyThreatCap",
        threatPerRound: "modifyThreatPerRound",
        resolveMax: "modifyMaxResolve",
        woundsMax: "modifyMaxWounds",
      }[key] || "";
      if (passiveType !== expectedType) continue;
    }
    if (!doesEntitySpecialConditionApply(sys, entityActor, context)) continue;
    total += resolvePassiveAmount(passive, "single", entityActor);
  }
  return total;
}

export function getEntitySelfStatDelta(entityActor, stat, context = {}) {
  if (!entityActor || entityActor.type !== "entity") return 0;
  const key = normalizeEntityStatKey(stat);
  const state = {
    ...context,
    stat: key,
    hunterCount: context.hunterCount ?? getActiveSceneHunterCount(),
  };
  let total = 0;
  for (const modifier of MECHANIC_BUCKETS.entitySelfStatModifier || []) {
    if (!modifier.match(entityActor, { stat: key, context: state })) continue;
    total += modifier.value(entityActor, state);
  }
  total += getEnhancementBuilderStatDelta(entityActor, key, state);
  return total;
}

export function getEffectiveEntityStat(entityActor, stat, context = {}) {
  const key = normalizeEntityStatKey(stat);
  const base = getEntityBaseStat(entityActor, key);
  if (!entityActor || entityActor.type !== "entity") return base;
  const hunterSideDelta = DEFENCE_STATS.has(key) ? getEntityStatDelta(entityActor, key) : 0;
  const selfDelta = getEntitySelfStatDelta(entityActor, key, context);
  const specialDelta = getEntitySpecialPassiveStatDelta(entityActor, key, context);
  const relicDelta = relicEntityStatDelta(entityActor, key);
  const total = base + hunterSideDelta + selfDelta + specialDelta + relicDelta;
  return key === "defendTN" ? total : Math.max(0, total);
}
