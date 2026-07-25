/**
 * Shared Entity action condition reads.
 * Outcome- and threshold-specific checks stay with their callers.
 */
import { getHuntersInZone, getThreatInZone, getZoneCurseValue } from "../../canvas/zone.js";
import { getActorTerrainCount, targetHasCapacity, targetHasTerrain } from "../actor/conditions.js";
import { getFocusCount } from "../actor/resources.js";

export function computeEntityConditionFlags(target, targetZone, entityActor) {
  const zone = String(targetZone || "");
  const occupants = zone ? getHuntersInZone(zone).length : 0;
  return {
    targetBroken: Number(target?.system?.health?.resolve?.value ?? 0) <= 0,
    targetAlone: occupants <= 1,
    targetHasCurse: Number(target?.system?.curse?.value ?? 0) > 0,
    targetZoneHasCurse: zone ? getZoneCurseValue(zone) > 0 : false,
    targetZoneHasThreat: zone ? getThreatInZone(zone) > 0 : false,
    targetHasTerrain: targetHasTerrain(target),
    targetHasFocus: getFocusCount(target) > 0,
    targetHasCapacity: targetHasCapacity(target),
    entityHasCurse: Number(entityActor?.system?.curse?.value ?? 0) > 0,
    entityIsBroken: Number(entityActor?.system?.health?.resolve?.value ?? 0) <= 0,
    entityHasTerrain: getActorTerrainCount(entityActor) > 0
  };
}

const ENTITY_STATE_CONDITIONS = {
  targetBroken: (f) => f.targetBroken,
  targetNotBroken: (f) => !f.targetBroken,
  targetAlone: (f) => f.targetAlone,
  targetNotAlone: (f) => !f.targetAlone,
  targetHasCurse: (f) => f.targetHasCurse,
  targetHasNoCurse: (f) => !f.targetHasCurse,
  targetZoneHasCurse: (f) => f.targetZoneHasCurse,
  targetZoneHasNoCurse: (f) => !f.targetZoneHasCurse,
  targetZoneHasThreat: (f) => f.targetZoneHasThreat,
  targetZoneHasNoThreat: (f) => !f.targetZoneHasThreat,
  targetHasTerrain: (f) => f.targetHasTerrain,
  targetHasNoTerrain: (f) => !f.targetHasTerrain,
  targetHasFocus: (f) => f.targetHasFocus,
  targetHasNoFocus: (f) => !f.targetHasFocus,
  targetHasCapacity: (f) => f.targetHasCapacity,
  targetHasNoCapacity: (f) => !f.targetHasCapacity,
  entityHasCurse: (f) => f.entityHasCurse,
  entityHasNoCurse: (f) => !f.entityHasCurse,
  entityIsBroken: (f) => f.entityIsBroken,
  entityIsNotBroken: (f) => !f.entityIsBroken,
  entityHasTerrain: (f) => f.entityHasTerrain,
  entityHasNoTerrain: (f) => !f.entityHasTerrain
};

const CONDITION_ALIASES = {
  targetNoTerrain: "targetHasNoTerrain",
  targetNoFocus: "targetHasNoFocus",
  targetNoCurse: "targetHasNoCurse",
  targetZoneNoCurse: "targetZoneHasNoCurse",
  targetZoneThreat: "targetZoneHasThreat",
  targetZoneNoThreat: "targetZoneHasNoThreat",
  entityNoCurse: "entityHasNoCurse",
  entityNoTerrain: "entityHasNoTerrain",
  targetBrokenBeforeAttack: "targetBroken",
  targetNotBrokenBeforeAttack: "targetNotBroken"
};

/**
 * Returns `undefined` for caller-owned outcome/threshold conditions.
 */
export function evaluateEntityStateCondition(rawKey, flags) {
  const key = CONDITION_ALIASES[rawKey] || String(rawKey || "");
  const predicate = ENTITY_STATE_CONDITIONS[key];
  return predicate ? !!predicate(flags) : undefined;
}
