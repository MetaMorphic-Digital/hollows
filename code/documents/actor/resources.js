import { hasWeaponEquipped } from "../../helpers/weapon-utils.js";

export function getFocusLimit(actor) {
  return hasWeaponEquipped(actor, "Rifle") ? 5 : 1;
}

export function getFocusCount(actor) {
  const val = Number(actor?.system?.focus?.value ?? 0);
  if (Number.isNaN(val)) return 0;
  return Math.max(0, val);
}

function asDelta(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function resourceState(value, max = 0, delta = 0, { allowTemporary = false } = {}) {
  const before = Math.max(0, Number(value ?? 0) || 0);
  const cap = Math.max(0, Number(max ?? 0) || 0) || 999;
  const after = Math.max(0, allowTemporary ? before + delta : Math.min(cap, before + delta));
  return { before, after, changed: after !== before };
}

/**
 * Standard X/Y damage resolver.
 *
 * X is Resolve damage, Y is Wounds damage. This class only resolves the
 * numeric damage pair into a resource hit; it does not run hooks, mitigation,
 * chat output, threat placement, or action-specific effects.
 */
export class StandardDamage {
  static targetResolve(actor) {
    return Math.max(0, actor.system.health.resolve.value);
  }

  static resolve(damage, { mode = "defence", outcomeLabel = "", targetResolve = 0 } = {}) {
    const label = String(outcomeLabel?.label ?? outcomeLabel ?? "");
    const modeKey = String(mode || "defence").toLowerCase();
    let damageType = "";
    let damageValue = 0;
    let convertedFromResolve = false;

    if (modeKey === "attack") {
      if (label === "Critical Success") {
        damageType = "Wounds";
        damageValue = damage.wounds + 1;
      } else if (label === "Superior Success") {
        damageType = "Wounds";
        damageValue = damage.wounds;
      } else if (label === "Success") {
        damageType = "Resolve";
        damageValue = damage.resolve;
      }
    } else {
      if (label === "Success") {
        damageType = "Resolve";
        damageValue = damage.resolve;
      } else if (label === "Failure" || label === "Critical Failure") {
        damageType = "Wounds";
        damageValue = damage.wounds;
      }
    }

    if (damageType === "Resolve" && targetResolve <= 0 && damage.wounds > 0) {
      damageType = "Wounds";
      damageValue = damage.wounds;
      convertedFromResolve = true;
    }

    if (!damageType || damageValue <= 0) {
      return {
        damageType: "",
        damageValue: 0,
        convertedFromResolve: false,
        mode: modeKey,
        outcomeLabel: label,
      };
    }

    return {
      damageType,
      damageValue,
      convertedFromResolve,
      mode: modeKey,
      outcomeLabel: label,
    };
  }
}

export async function setFocusCount(actor, value) {
  if (!actor) return { before: 0, after: 0, changed: false };
  const before = getFocusCount(actor);
  const limit = getFocusLimit(actor);
  const next = Math.max(0, Math.min(limit, Number(value ?? 0)));
  await actor.update({ "system.focus.value": next });
  const { addCondition, removeCondition } = await import("./conditions.js");
  if (next > 0) {
    if (!actor.statuses.has("focus")) await addCondition(actor, "focus");
  } else if (actor.statuses.has("focus")) {
    await removeCondition(actor, "focus");
  }
  return { before, after: next, changed: next !== before };
}

export async function adjustHunterResource(actor, { resolve = 0, wounds = 0, focus = 0 } = {}, { allowTemporary = false } = {}) {
  const empty = {
    resolve: { before: 0, after: 0, changed: false },
    wounds: { before: 0, after: 0, changed: false },
    focus: { before: 0, after: 0, changed: false },
  };
  if (!actor) return empty;
  if (!game.user?.isGM && !actor.testUserPermission(game.user, "OWNER")) {
    const { runGMQuery } = await import("../../helpers/queries.js");
    return runGMQuery("hollows.hunterResourceAdjust", {
      actorId: actor.id,
      actorUuid: actor.uuid ?? "",
      resolve, wounds, focus,
    });
  }

  const deltas = {
    resolve: asDelta(resolve),
    wounds: asDelta(wounds),
    focus: asDelta(focus),
  };
  const result = {
    resolve: resourceState(actor.system?.health?.resolve?.value, actor.system?.health?.resolve?.max, deltas.resolve, { allowTemporary }),
    wounds: resourceState(actor.system?.health?.wounds?.value, actor.system?.health?.wounds?.max, deltas.wounds, { allowTemporary }),
    focus: { before: getFocusCount(actor), after: getFocusCount(actor), changed: false },
  };

  const update = {};
  if (deltas.resolve) update["system.health.resolve.value"] = result.resolve.after;
  if (deltas.wounds) update["system.health.wounds.value"] = result.wounds.after;
  if (Object.keys(update).length) await actor.update(update);

  if (deltas.focus) {
    result.focus = await setFocusCount(actor, result.focus.before + deltas.focus);
  }
  return result;
}

/**
 * Adjust an Entity's Resolve/Wounds by clamped deltas (restore = +, damage/spend = −).
 * Floors at 0, caps at max (0/undefined max → 999) via the shared resourceState clamp.
 * The single Entity resolve/wounds mutation primitive. GM-side (entity is GM-owned).
 */
export async function adjustEntityResource(entity, { resolve = 0, wounds = 0 } = {}) {
  if (!entity) return;
  const update = {};
  if (resolve) update["system.health.resolve.value"] = resourceState(entity.system?.health?.resolve?.value, entity.system?.health?.resolve?.max, asDelta(resolve)).after;
  if (wounds) update["system.health.wounds.value"] = resourceState(entity.system?.health?.wounds?.value, entity.system?.health?.wounds?.max, asDelta(wounds)).after;
  if (Object.keys(update).length) await entity.update(update);
}

/**
 * Spend a Resolve cost. Paid from Resolve first; any shortfall — Resolve
 * already 0, or the cost running it below 0 — is paid in Wounds instead.
 * The single Resolve-spend primitive: all "Spend Resolve" paths route here.
 */
export async function spendResolve(actor, amount) {
  if (!actor) return;
  const value = Number(amount ?? 0);
  if (value <= 0) return;
  const resolveCur = Number(actor.system?.health?.resolve?.value ?? 0);
  const fromResolve = Math.min(value, Math.max(0, resolveCur));
  const fromWounds = value - fromResolve;
  const update = { "system.health.resolve.value": Math.max(0, resolveCur - fromResolve) };
  if (fromWounds > 0) {
    const woundsCur = Number(actor.system?.health?.wounds?.value ?? 0);
    update["system.health.wounds.value"] = Math.max(0, woundsCur - fromWounds);
  }
  await actor.update(update);
}
