import { MECHANIC_BUCKETS } from "./mechanic-registry.js";
import { enhancementBuilderSelfActionModifier } from "../documents/entity/enhancement-builder-passive.js";

function matchingModifiers(entity, context = {}) {
  if (!entity || entity.type !== "entity") return [];
  return [...(MECHANIC_BUCKETS.entitySelfActionModifier || []), enhancementBuilderSelfActionModifier]
    .filter((modifier) => modifier.match(entity, context));
}

export function getEntitySelfActionDamageDelta(entity, context = {}) {
  let resolve = 0;
  let wounds = 0;
  for (const modifier of matchingModifiers(entity, context)) {
    const delta = modifier.getDamageDelta(entity, context);
    resolve += Number(delta.resolve ?? 0) || 0;
    wounds += Number(delta.wounds ?? 0) || 0;
  }
  return { resolve, wounds };
}

export function getEntitySelfActionCostDelta(entity, context = {}) {
  let threat = 0;
  for (const modifier of matchingModifiers(entity, context)) {
    threat += Number(modifier.getCostDelta(entity, context).threat ?? 0) || 0;
  }
  return { threat };
}

export function getEntitySelfActionTNDelta(entity, context = {}) {
  let total = 0;
  for (const modifier of matchingModifiers(entity, context)) {
    total += Number(modifier.getTNDelta(entity, context) ?? 0) || 0;
  }
  return total;
}

export function getEntitySelfActionTargetingOverride(entity, context = {}) {
  for (const modifier of matchingModifiers(entity, context)) {
    const override = modifier.getTargetingOverride(entity, context);
    if (override?.mode) return override;
  }
  return {};
}
