import { getActiveSceneHunterCount, getThreatInZone } from "../../canvas/zone.js";

const STAT_AMOUNT_SOURCES = new Set(["hunterCountOnGrid"]);

export function getBuilder(enhancementItem) {
  const builder = enhancementItem?.system?.builder;
  return builder && typeof builder === "object" ? builder : {};
}

export function builderEnabled(enhancementItem) {
  return getBuilder(enhancementItem).enabled !== false;
}

export function list(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  return Object.keys(value)
    .filter((key) => /^\d+$/.test(key))
    .sort((a, b) => Number(a) - Number(b))
    .map((key) => value[key]);
}

function valueList(value) {
  const entries = list(value);
  if (entries.length) return entries;
  const single = String(value || "");
  return single ? [single] : [];
}

export function selectedAbilityId(enhancementItem) {
  return String(enhancementItem?.getFlag?.("hollows", "chosenActionId") || "");
}

export function dynamicAmount(source, context = {}) {
  const key = String(source || "");
  if (key === "hunterCountOnGrid") return getActiveSceneHunterCount();
  if (key === "damageValue") return Number(context.damageValue ?? 0) || 0;
  if (key === "targetZoneThreat") return context.targetZone ? getThreatInZone(context.targetZone) : 0;
  if (key === "targetCount") return Array.isArray(context.targets) ? context.targets.length : (context.target ? 1 : 0);
  if (key === "entityResolve") return Number(context.entityActor?.system?.health?.resolve?.value ?? 0) || 0;
  if (key === "entityWounds") return Number(context.entityActor?.system?.health?.wounds?.value ?? 0) || 0;
  return Number(context?.[key] ?? 0) || 0;
}

function amount(config = {}, context = {}) {
  if (String(config.mode || "fixed") === "dynamic") {
    const source = String(config.source || "hunterCountOnGrid");
    return STAT_AMOUNT_SOURCES.has(source) ? dynamicAmount(source, context) : 0;
  }
  return Number(config.amount ?? 0) || 0;
}

function actionKindMatches(modifier, context = {}) {
  const modifierKinds = valueList(modifier.actionKind);
  const rawKinds = modifierKinds.length ? modifierKinds : ["any"];
  const kinds = rawKinds.map((kind) => String(kind || "").toLowerCase());
  const kind = String(context.actionKind ?? context.actionType ?? "").trim().toLowerCase();
  return kinds.includes("any") || kinds.includes(kind);
}

function modifierTargetsAction(modifier, enhancementItem, context = {}) {
  if (!actionKindMatches(modifier, context)) return false;
  if (String(modifier.scope || "") !== "selectedAbility") return true;
  return String(modifier?.selectedAbilityId || selectedAbilityId(enhancementItem)) === String(context.actionItem?.id || "");
}

function enhancementItems(entityActor) {
  if (!entityActor || entityActor.type !== "entity") return [];
  return entityActor.items.filter((entry) => entry.type === "entityEnhancement" && builderEnabled(entry));
}

function matchingActionModifiers(entityActor, context = {}) {
  return enhancementItems(entityActor).flatMap((item) =>
    list(getBuilder(item).actionModifiers).filter((modifier) => modifierTargetsAction(modifier, item, context))
  );
}

export function getEnhancementBuilderStatDelta(entityActor, stat, context = {}) {
  const key = String(stat || "").toLowerCase();
  let total = 0;
  for (const item of enhancementItems(entityActor)) {
    for (const modifier of list(getBuilder(item).statModifiers)) {
      const stats = valueList(modifier.stat);
      if (!stats.some((entry) => String(entry || "").toLowerCase() === key)) continue;
      total += amount(modifier, { ...context, entityActor });
    }
  }
  return total;
}

export function getEnhancementBuilderActionDamageDelta(entityActor, context = {}) {
  let resolve = 0;
  let wounds = 0;
  for (const modifier of matchingActionModifiers(entityActor, context)) {
    resolve += Number(modifier.damage?.resolve ?? 0) || 0;
    wounds += Number(modifier.damage?.wounds ?? 0) || 0;
  }
  return { resolve, wounds };
}

export function getEnhancementBuilderActionTNDelta(entityActor, context = {}) {
  let total = 0;
  for (const modifier of matchingActionModifiers(entityActor, context)) total += Number(modifier.tn ?? 0) || 0;
  return total;
}

export function getEnhancementBuilderActionCostDelta(entityActor, context = {}) {
  let threat = 0;
  for (const modifier of matchingActionModifiers(entityActor, context)) threat += Number(modifier.cost?.threat ?? 0) || 0;
  return { threat };
}

export function getEnhancementBuilderActionTargetingOverride(entityActor, context = {}) {
  const modifier = matchingActionModifiers(entityActor, context).find((entry) => entry.targetMode);
  if (modifier) return {
    mode: String(modifier.targetMode || ""),
    adjacentScope: String(modifier.adjacentScope || "any"),
    adjacentCount: String(modifier.adjacentCount || "one")
  };
  return {};
}

export const enhancementBuilderSelfActionModifier = {
  match: () => true,
  getDamageDelta: getEnhancementBuilderActionDamageDelta,
  getCostDelta: getEnhancementBuilderActionCostDelta,
  getTNDelta: getEnhancementBuilderActionTNDelta,
  getTargetingOverride: getEnhancementBuilderActionTargetingOverride
};
