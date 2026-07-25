import { Mechanic } from "./Mechanic.js";

function normalizeActionKinds(actionKind = "any") {
  return (Array.isArray(actionKind) ? actionKind : [actionKind])
    .map((value) => String(value).trim().toLowerCase());
}

function normalizeDamage(delta = {}) {
  return {
    resolve: Number(delta.resolve ?? 0) || 0,
    wounds: Number(delta.wounds ?? 0) || 0
  };
}

function normalizeCost(delta = {}) {
  return {
    threat: Number(delta.threat ?? 0) || 0
  };
}

export class EntitySelfActionModifier extends Mechanic {
  constructor(config = {}) {
    super(config);
    this.actionKinds = normalizeActionKinds(config.actionKind);
    this.active = typeof config.active === "function" ? config.active : null;
    this.damageDelta = typeof config.damageDelta === "function" ? config.damageDelta : normalizeDamage(config.damageDelta);
    this.costDelta = typeof config.costDelta === "function" ? config.costDelta : normalizeCost(config.costDelta);
    this.tnDelta = typeof config.tnDelta === "function" ? config.tnDelta : Number(config.tnDelta ?? 0) || 0;
    this.targetingOverride = typeof config.targetingOverride === "function" ? config.targetingOverride : (config.targetingOverride || {});
  }

  match(entity, context = {}) {
    const kind = String(context.actionKind ?? context.actionType ?? "").trim().toLowerCase();
    if (!this.actionKinds.includes("any") && !this.actionKinds.includes(kind)) return false;
    return this.active ? !!this.active(entity, context) : true;
  }

  getDamageDelta(entity, context = {}) {
    const delta = typeof this.damageDelta === "function" ? this.damageDelta(entity, context) : this.damageDelta;
    return normalizeDamage(delta);
  }

  getCostDelta(entity, context = {}) {
    const delta = typeof this.costDelta === "function" ? this.costDelta(entity, context) : this.costDelta;
    return normalizeCost(delta);
  }

  getTNDelta(entity, context = {}) {
    return typeof this.tnDelta === "function" ? Number(this.tnDelta(entity, context) ?? 0) || 0 : this.tnDelta;
  }

  getTargetingOverride(entity, context = {}) {
    return typeof this.targetingOverride === "function" ? this.targetingOverride(entity, context) || {} : this.targetingOverride;
  }
}
