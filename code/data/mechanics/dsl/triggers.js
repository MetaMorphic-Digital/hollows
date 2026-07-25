/**
 * DSL trigger evaluator. Each mechanic's `triggers` field is an object of
 * named predicates; this module knows how to check each predicate against
 * a runtime context.
 *
 * Supported predicate keys:
 *   actorInZones: string[]               — actor's zone is one of these
 *   actorZoneType: "close"|"ranged"|"support"
 *   actorHasCondition: string            — actor has this condition
 *   actorMissingCondition: string        — actor lacks this condition
 *   actorMinFocus: number                — actor has at least this much Focus
 *   actorWoundsAtLeastMax: true          - current Wounds are at maximum or higher
 *   actorWeaponEquipped: string          — actor wields this weapon type
 *   actorShotgunLoaded: true             — actor wields at least one Loaded Shotgun
 *   actorBroken: boolean                 — true: actor is Broken (Resolve 0); false: actor is not Broken
 *   actorZoneHasThreat: true             — actor's zone contains Threat
 *   actorFlagTruthy: string              — actor hollows flag path is truthy
 *   actorFlagFalsy: string               — actor hollows flag path is falsy
 *   entityHasCondition: string           — active entity has condition
 *   activeEntityRequired: true           — bail if no active entity
 *
 * Context keys (passed to evalTriggers):
 *   actor, entity (optional)
 *
 * Returns true when ALL predicates pass. Empty triggers => always true.
 */

import { getActiveEntityActor, getActorZone, getThreatInZone, isCloseZone, isRangedZone } from "../../../canvas/zone.js";

const CONDITION_STATUS_ID = {
  focus: "hollowsFocus",
  ready: "hollowsReady",
  loaded: "hollowsLoaded",
  bleeding: "hollowsBleeding",
  elevated: "hollowsElevated",
  sheltered: "hollowsSheltered",
  dying: "hollowsDying",
  dead: "hollowsDead",
  anchored: "hollowsAnchored",
  custom1: "hollowsCustom1",
  custom2: "hollowsCustom2"
};

function hasActorCondition(actor, key) {
  if (!actor || !key) return false;
  const conditionKey = String(key);
  const statusId = CONDITION_STATUS_ID[conditionKey] || conditionKey;
  const effects = actor.effects?.contents || [];
  return effects.some((effect) => {
    if (effect.disabled) return false;
    if (effect.getFlag?.("hollows", "conditionKey") === conditionKey) return true;
    if (effect.getFlag?.("core", "statusId") === statusId) return true;
    const statuses = Array.from(effect.statuses || []);
    return statuses.includes(statusId) || statuses.includes(conditionKey);
  });
}

function getHollowsFlagPath(actor, path) {
  if (!actor || !path) return undefined;
  const [root, ...rest] = String(path).split(".");
  let value = actor.getFlag("hollows", root);
  for (const segment of rest) {
    if (value == null) return undefined;
    value = value[segment];
  }
  return value;
}

function zoneTypeOf(zone) {
  if (!zone) return null;
  if (isCloseZone(zone)) return "close";
  if (isRangedZone(zone)) return "ranged";
  if (String(zone) === "Support") return "support";
  return null;
}

export function evalTriggers(triggers, { actor, entity, fromZone, toZone } = {}) {
  if (!triggers || typeof triggers !== "object") return true;
  for (const [predicate, value] of Object.entries(triggers)) {
    if (!check(predicate, value, { actor, entity, fromZone, toZone })) return false;
  }
  return true;
}

function check(predicate, value, ctx) {
  switch (predicate) {
    case "actorInZones": {
      if (!ctx.actor) return false;
      const zone = getActorZone(ctx.actor);
      return Array.isArray(value) && value.includes(zone);
    }
    case "actorZoneType": {
      if (!ctx.actor) return false;
      return zoneTypeOf(getActorZone(ctx.actor)) === String(value);
    }
    case "actorHasCondition": {
      return hasActorCondition(ctx.actor, String(value));
    }
    case "actorMissingCondition": {
      return !!ctx.actor && !hasActorCondition(ctx.actor, String(value));
    }
    case "actorMinFocus": {
      if (!ctx.actor) return false;
      return Number(ctx.actor.system?.focus?.value ?? 0) >= Number(value);
    }
    case "actorWoundsAtLeastMax": {
      if (!ctx.actor || !value) return false;
      const current = Number(ctx.actor.system?.health?.wounds?.value ?? 0);
      const max = Number(ctx.actor.system?.health?.wounds?.max ?? 0);
      return max > 0 && current >= max;
    }
    case "actorWeaponEquipped": {
      if (!ctx.actor) return false;
      const items = ctx.actor.items || [];
      return items.some((it) => it.type === "weapon" && String(it.system?.weaponType || "") === String(value));
    }
    case "actorShotgunLoaded": {
      if (!ctx.actor || !value) return false;
      const items = ctx.actor.items || [];
      return items.some((it) =>
        it.type === "weapon"
        && String(it.system?.weaponType || "") === "Shotgun"
        && !!it.system?.loaded
      );
    }
    case "actorBroken": {
      if (!ctx.actor) return false;
      const broken = Number(ctx.actor.system?.health?.resolve?.value ?? 0) <= 0;
      return value ? broken : !broken;
    }
    case "actorZoneHasThreat": {
      if (!ctx.actor || !value) return false;
      const zone = getActorZone(ctx.actor);
      return !!zone && Number(getThreatInZone(zone) || 0) > 0;
    }
    case "actorFlagTruthy": {
      return !!getHollowsFlagPath(ctx.actor, value);
    }
    case "actorFlagFalsy": {
      return !getHollowsFlagPath(ctx.actor, value);
    }
    case "moveToZoneType": {
      return zoneTypeOf(ctx.toZone) === String(value);
    }
    case "entityHasCondition": {
      const e = ctx.entity || getActiveEntityActor();
      return hasActorCondition(e, String(value));
    }
    case "activeEntityRequired": {
      return !!(ctx.entity || getActiveEntityActor());
    }
    default:
      console.warn(`Hollows | Unknown trigger predicate: ${predicate}`);
      return false;
  }
}
