/**
 * Entity attack RULES - side-effect-free resolution over live actor/zone/condition
 * state: TN/damage resolution, possibleIf/modifyIf matching, before/after effect
 * + config builders, interrupt feasibility/cost, passive special bonuses, snapshots.
 *
 * Rules live in the data/entity layer; base primitives
 * (terrain/capacity reads, focus) come from documents/actor/*, so this file
 * does not duplicate actor resource logic.
 *
 * Targeting is not here: it does UI and belongs in action-flow.js and concrete action modules.
 */
import { normalizeAfterAttackApplyIf, normalizeBeforeAttackApplyIf } from "./action-schema.js";
import { computeEntityConditionFlags, evaluateEntityStateCondition } from "../../documents/entity/entity-conditions.js";
import {
  getThreatInZone,
  getTokenZone,
  getZoneList,
  isThreatZone,
  sceneHunterTokens
} from "../../canvas/zone.js";
import { getTargetCapacityValue } from "../../documents/actor/conditions.js";
import { getTotalStatForActor } from "../../documents/actor/hunter-combat.js";
import { doesEntitySpecialConditionApply, getEffectiveEntityStat, isEntityEngineAbilityActive, resolveEntitySourceValue, resolvePassiveAmount } from "../../documents/entity/entity-stats.js";
import { getEntityEngineAbilities } from "./resolvers.js";
import { entityAbilityModifyDelta } from "../relic/passive.js";
import { getEntitySelfActionDamageDelta, getEntitySelfActionTNDelta } from "../../helpers/entity-dispatchers.js";
import { getEntityActionCost, getEntityInterruptCost } from "../../documents/entity/entity-threat.js";
import { isFailureOutcomeLabel, isSuccessOutcomeLabel } from "../../dice/roll-outcome.js";

// ─── TN resolution ────────────────────────────────────────────────────────────

function getEntityDynamicTNModifierValue(source, entityActor, targetToken) {
  if (String(source || "targetCurse") === "targetCapacity") {
    return Math.max(0, Number(getTargetCapacityValue(targetToken?.actor)) || 0);
  }
  return resolveEntitySourceValue(String(source || "targetCurse"), { entityActor, targetToken });
}

function getEntityDynamicTNSetValue(config, entityActor, targetToken, originalTargetToken = null) {
  const source = String(config?.source || "entityDefence");
  const targetActor = targetToken?.actor || null;
  const originalTargetActor = originalTargetToken?.actor || targetActor || null;
  if (source === "entityDefence") return getEffectiveEntityStat(entityActor, String(config?.defence || "close"));
  if (source === "targetStat") return Math.max(0, Number(getTotalStatForActor(targetActor, String(config?.stat || "hard"))) || 0);
  if (source === "originalTargetStat") return Math.max(0, Number(getTotalStatForActor(originalTargetActor, String(config?.stat || "hard"))) || 0);
  if (source === "entityResolve") return Math.max(0, Number(entityActor?.system?.health?.resolve?.value ?? 0) || 0);
  if (source === "entityWounds") return Math.max(0, Number(entityActor?.system?.health?.wounds?.value ?? 0) || 0);
  return 0;
}

export function resolveEntityAbilityTN(baseTN, config = {}, entityActor, targetToken, originalTargetToken = null) {
  const normalizedMode = String(config?.mode || "fixed");
  if (normalizedMode !== "dynamic") return Math.max(0, Number(baseTN ?? 0) || 0);
  const dynamicType = String(config?.type || "modify");
  if (dynamicType === "set") {
    return Math.max(0, getEntityDynamicTNSetValue({
      source: config?.setSource, defence: config?.setDefence, stat: config?.setStat
    }, entityActor, targetToken, originalTargetToken));
  }
  const modifier = getEntityDynamicTNModifierValue(config?.dynamicSource, entityActor, targetToken);
  return Math.max(0, (Number(baseTN ?? 0) || 0) + modifier);
}

// Passive-condition matching + amount resolution live in documents/entity/entity-stats.js
// (imported above) - single source for both the attack rules and entity stat deltas.

function getActivePassiveSpecials(entityActor, passiveTypes = [], context = {}) {
  const types = new Set((passiveTypes || []).map((type) => String(type || "")));
  const out = [];
  for (const spec of getEntityEngineAbilities(entityActor, ["special", "doom"])) {
    if (!isEntityEngineAbilityActive(entityActor, spec)) continue;
    const sys = spec.system || {};
    if (String(sys.special?.type || "textOnly") !== "passiveModifier") continue;
    const passive = sys.special?.passive || {};
    const passiveType = String(passive.type || "");
    if (types.size && !types.has(passiveType)) continue;
    if (!doesEntitySpecialConditionApply(sys, entityActor, context)) continue;
    out.push(passive);
  }
  return out;
}

function getEntityPassiveSpecialDamageReduction(entityActor, damageType) {
  if (!entityActor || !damageType) return 0;
  const side = String(damageType).toLowerCase() === "wounds" ? "wounds" : "resolve";
  return getActivePassiveSpecials(entityActor, ["damageTaken"])
    .reduce((total, passive) => total + Math.max(0, resolvePassiveAmount(passive, side, entityActor)), 0);
}

function getEntityActionPassiveContext(actionItem = null, targetToken = null, actionKind = "attack") {
  const targetActor = targetToken?.actor || null;
  return { targetActor, target: targetActor, targetToken, actionItem, actionKind };
}

function getEntityPassiveSpecialActionBonus(entityActor, actionItem = null, targetToken = null, actionKind = "attack") {
  let resolve = 0;
  let wounds = 0;
  const context = getEntityActionPassiveContext(actionItem, targetToken, actionKind);
  for (const passive of getActivePassiveSpecials(entityActor, ["attackDamage", "interruptDamage"], context)) {
    const modifierType = String(passive.type || "");
    if (modifierType === "attackDamage" && actionKind !== "attack") continue;
    if (modifierType === "interruptDamage" && actionKind !== "interrupt") continue;
    resolve += resolvePassiveAmount(passive, "resolve", entityActor);
    wounds += resolvePassiveAmount(passive, "wounds", entityActor);
  }
  return { resolve, wounds };
}

function getEntityActionDamageBonus(entityActor, actionItem = null, targetToken = null, actionKind = "attack") {
  let resolve = 0;
  let wounds = 0;
  const registered = getEntitySelfActionDamageDelta(entityActor, { actionItem, targetToken, actionKind });
  resolve += registered.resolve;
  wounds += registered.wounds;
  const passive = getEntityPassiveSpecialActionBonus(entityActor, actionItem, targetToken, actionKind);
  resolve += passive.resolve;
  wounds += passive.wounds;
  const relic = entityAbilityModifyDelta(entityActor, actionItem?.id);
  resolve += relic.resolve;
  wounds += relic.wounds;
  return { resolve, wounds };
}

function getEntityActionTNBonus(entityActor, actionItem = null, targetToken = null, actionKind = "attack") {
  const context = getEntityActionPassiveContext(actionItem, targetToken, actionKind);
  const base = getActivePassiveSpecials(entityActor, ["actionsTN"], context)
    .reduce((total, passive) => total + resolvePassiveAmount(passive, "single", entityActor), 0);
  return base + entityAbilityModifyDelta(entityActor, actionItem?.id).tn + getEntitySelfActionTNDelta(entityActor, context);
}

// ─── Damage resolution ──────────────────────────────────────────────────────────

function resolveEntityAbilityDamage(baseDamage, mode, dynamicMode, dynamicSource, entityActor, targetToken, reduce = false, floor = 0) {
  let resolve = Math.max(0, Number(baseDamage?.resolve ?? 0) || 0);
  let wounds = Math.max(0, Number(baseDamage?.wounds ?? 0) || 0);
  if (String(mode || "fixed") !== "dynamic") {
    return { resolve, wounds };
  }
  const modifier = resolveEntitySourceValue(String(dynamicSource || "targetCurse"), { entityActor, targetToken });
  // `reduce` subtracts the modifier (down to `floor`); otherwise it adds.
  const floorValue = Math.max(0, Number(floor ?? 0) || 0);
  const applySide = (base) => reduce ? Math.max(floorValue, base - modifier) : base + modifier;
  const normalizedDynamicMode = String(dynamicMode || "both");
  if (normalizedDynamicMode === "resolve") {
    resolve = applySide(resolve);
  } else if (normalizedDynamicMode === "wounds") {
    wounds = applySide(wounds);
  } else {
    resolve = applySide(resolve);
    wounds = applySide(wounds);
  }
  return {
    resolve: Math.max(0, resolve),
    wounds: Math.max(0, wounds)
  };
}

// ─── Interrupt feasibility / cost ─────────────────────────────────────────────

function getHuntersForInterrupt(interrupt) {
  const hunters = sceneHunterTokens();
  const allowed = Array.isArray(interrupt?.profile?.allowedZones) ? interrupt.profile.allowedZones : [];
  return hunters.filter((t) => {
    const zone = getTokenZone(t);
    if (!zone || !isThreatZone(zone)) return false;
    if (!allowed.length) return true;
    return allowed.includes(zone);
  });
}

function isInterruptFeasible(interrupt, entityActor = null) {
  if (!interrupt) return false;
  const cost = getEntityInterruptCost(interrupt, entityActor);
  const costType = getEntityActionCost(interrupt).type;
  const needsThreatCost = costType === "threat" && cost > 0;
  const profile = interrupt.profile;
  const actionType = String(profile.actionType || "attack");
  const targetMode = String(profile.targetMode || "single");
  if (actionType === "other" && targetMode === "noTargets") {
    return !needsThreatCost;
  }
  if (actionType === "other" && targetMode === "multiZone") {
    const zones = Array.isArray(profile.allowedZones) && profile.allowedZones.length
      ? profile.allowedZones.filter((z) => !!z)
      : getZoneList();
    if (!zones.length) return false;
    return !needsThreatCost || zones.reduce((sum, zoneId) => sum + getThreatInZone(zoneId), 0) >= cost;
  }
  const hunters = getHuntersForInterrupt(interrupt);
  if (!hunters.length) return false;
  const possibleZones = Array.from(new Set(hunters.map((t) => getTokenZone(t)).filter((z) => !!z)));
  const available = possibleZones.reduce((sum, zoneId) => sum + getThreatInZone(zoneId), 0);
  return !needsThreatCost || available >= cost;
}

// ─── After-attack config builders ─────────────────────────────────────────────

function buildEntityEffectConfigs(source, sectionKey, fallbackCondition, normalizeCondition) {
  const section = source?.[sectionKey];
  if (!section?.enabled || !Array.isArray(section.groups)) return [];
  return section.groups.map((group) => ({
    ...group,
    applyIfLogic: String(group?.applyIfLogic || "and"),
    applyIfConditions: (Array.isArray(group?.applyIfConditions) && group.applyIfConditions.length
      ? group.applyIfConditions
      : [{ condition: fallbackCondition }]
    ).map((entry) => ({ condition: normalizeCondition(entry?.condition, fallbackCondition) }))
  }));
}

function buildEntityAfterAttackConfigs(source, fallbackApplyIf = "anyDamageDealt") {
  return buildEntityEffectConfigs(source, "afterAttack", fallbackApplyIf, normalizeAfterAttackApplyIf);
}

function buildEntityBeforeAttackConfigs(source) {
  return buildEntityEffectConfigs(source, "beforeAttack", "always", normalizeBeforeAttackApplyIf);
}

function hasEnabledAfterAttackGroups(afterAttack) {
  const groups = Array.isArray(afterAttack) ? afterAttack : (afterAttack?.groups || []);
  return groups.length > 0;
}

// ─── Snapshot + after-attack applyIf ──────────────────────────────────────────

function getBeforeAttackTargetSnapshot(targetToken, entityActor) {
  const targetZone = targetToken ? String(getTokenZone(targetToken) || "") : "";
  return computeEntityConditionFlags(targetToken?.actor || null, targetZone, entityActor);
}

function matchesAfterAttackApplyIf(applyIf, context = {}) {
  const key = normalizeAfterAttackApplyIf(applyIf, "anyDamageDealt");
  if (key === "always") return true;
  const outcome = matchesEntityOutcomeCondition(key, context);
  if (outcome !== undefined) return outcome;

  // State conditions use the pre-attack snapshot, falling back to live state.
  const target = context.target || null;
  const flags = context.snapshot && Object.keys(context.snapshot).length
    ? context.snapshot
    : computeEntityConditionFlags(target, String(context.targetZone || ""), context.entityActor || null);
  const state = evaluateEntityStateCondition(key, flags);
  return state === undefined ? false : state;
}

function matchesEntityOutcomeCondition(key, context = {}) {
  const outcomeLabel = String(context.outcomeLabel || "");
  const damageType = String(context.damageType || "");
  const damageValue = Math.max(0, Number(context.damageValue ?? 0) || 0);
  const target = context.target || null;
  const previousResolve = Number(context.previousResolve ?? target?.system?.health?.resolve?.value ?? 0);
  const previousWounds = Number(context.previousWounds ?? target?.system?.health?.wounds?.value ?? 0);
  const nextResolve = Number(context.nextResolve ?? previousResolve);
  const nextWounds = Number(context.nextWounds ?? previousWounds);
  const checks = {
    always: () => true,
    successAny: () => isSuccessOutcomeLabel(outcomeLabel),
    failureAny: () => isFailureOutcomeLabel(outcomeLabel),
    resolveDamageDealt: () => damageType === "Resolve" && damageValue > 0,
    woundsDamageDealt: () => damageType === "Wounds" && damageValue > 0,
    anyDamageDealt: () => damageValue > 0,
    noDamageDealt: () => damageValue <= 0,
    onBreak: () => previousResolve > 0 && nextResolve <= 0,
    onKill: () => !!target && target.type === "entity" && previousWounds > 0 && nextWounds <= 0,
    onMakingDying: () => !!target && target.type !== "entity" && previousWounds > 0 && nextWounds <= 0
  };
  return checks[key] ? checks[key]() : undefined;
}

function evaluateBooleanLogic(results, logic = "and") {
  return String(logic || "and") === "or" ? results.some(Boolean) : results.every(Boolean);
}

function shouldApplyEffectConditions(config, matcher, context = {}) {
  const conditions = Array.isArray(config?.applyIfConditions)
    ? config.applyIfConditions.map((entry) => entry?.condition).filter(Boolean)
    : [];
  if (!conditions.length) return true;
  return evaluateBooleanLogic(conditions.map((condition) => matcher(condition, context)), config?.applyIfLogic);
}

function shouldApplyAfterAttackEffects(afterAttack, context = {}) {
  return shouldApplyEffectConditions(afterAttack, matchesAfterAttackApplyIf, context);
}

function matchesBeforeAttackApplyIf(applyIf, context = {}) {
  const key = normalizeBeforeAttackApplyIf(applyIf);
  if (key === "always") return true;
  const flags = computeEntityConditionFlags(context.target || null, String(context.targetZone || ""), context.entityActor || null);
  const state = evaluateEntityStateCondition(key, flags);
  return state === undefined ? false : state;
}

function shouldApplyBeforeAttackEffects(beforeAttack, context = {}) {
  return shouldApplyEffectConditions(beforeAttack, matchesBeforeAttackApplyIf, context);
}

// ─── possibleIf / modifyIf matching ───────────────────────────────────────────

function matchesEntityAttackConditions(conditions, targetToken, entityActor, logic = "and") {
  const list = Array.isArray(conditions) ? conditions.filter(Boolean) : [];
  if (!list.length) return true;
  const zone = targetToken ? String(getTokenZone(targetToken) || "") : "";
  const flags = computeEntityConditionFlags(targetToken?.actor || null, zone, entityActor);
  const results = list.map((c) => evaluateEntityStateCondition(String(c?.condition || ""), flags) === true);
  return evaluateBooleanLogic(results, logic);
}

/** A group's numeric Threshold gate (<= / >= a value source). Disabled = always passes. */
function matchesEntityThreshold(threshold, entityActor) {
  if (!threshold?.enabled) return true;
  const value = resolveEntitySourceValue(threshold.source, { entityActor, zones: getZoneList() });
  const target = Number(threshold.value ?? 0) || 0;
  return String(threshold.comparison || "lowerEqual") === "higherEqual" ? value >= target : value <= target;
}

function getEntityModifyIfResult(config, targetToken, entityActor, options = {}) {
  const allowDamage = options.allowDamage !== false;
  const allowText = options.allowText === true;
  const groups = config?.modifyIf?.enabled && Array.isArray(config.modifyIf.groups) ? config.modifyIf.groups : [];
  if (!groups.length) {
    return {
      matched: false,
      tn: 0,
      damage: { resolve: 0, wounds: 0 },
      selfDamage: null,
      effectText: ""
    };
  }
  let matched = false;
  let tn = 0;
  let damageResolve = 0;
  let damageWounds = 0;
  let selfResolve = 0;
  let selfWounds = 0;
  let effectText = "";
  for (const group of groups) {
    const modifyConditions = Array.isArray(group.conditions) ? group.conditions : [];
    if (!matchesEntityAttackConditions(modifyConditions, targetToken, entityActor, group.logic)) continue;
    if (!matchesEntityThreshold(group.threshold, entityActor)) continue;
    matched = true;
    tn += Number(group.tn ?? 0) || 0;
    if (allowDamage) {
      damageResolve += Number(group.damage?.resolve ?? 0) || 0;
      damageWounds += Number(group.damage?.wounds ?? 0) || 0;
    }
    if (group.selfDamage) {
      selfResolve += Number(group.selfDamage.resolve ?? 0) || 0;
      selfWounds += Number(group.selfDamage.wounds ?? 0) || 0;
    }
    if (allowText && group.effectText) {
      effectText = String(group.effectText || "");
    }
  }
  if (!matched) {
    return {
      matched: false,
      tn: 0,
      damage: { resolve: 0, wounds: 0 },
      selfDamage: null,
      effectText: ""
    };
  }
  const selfDamage = (selfResolve > 0 || selfWounds > 0)
    ? {
        resolve: selfResolve,
        wounds: selfWounds
      }
    : null;
  return {
    matched,
    tn,
    damage: allowDamage
      ? {
          resolve: damageResolve,
          wounds: damageWounds
        }
      : { resolve: 0, wounds: 0 },
    selfDamage,
    effectText: allowText ? effectText : ""
  };
}

export {
  buildEntityAfterAttackConfigs,
  buildEntityBeforeAttackConfigs,
  getBeforeAttackTargetSnapshot,
  getEntityActionDamageBonus,
  getEntityActionTNBonus,
  getEntityModifyIfResult,
  getEntityPassiveSpecialDamageReduction,
  hasEnabledAfterAttackGroups,
  isInterruptFeasible,
  matchesEntityOutcomeCondition,
  matchesEntityAttackConditions,
  resolveEntityAbilityDamage,
  shouldApplyAfterAttackEffects,
  shouldApplyBeforeAttackEffects
};
