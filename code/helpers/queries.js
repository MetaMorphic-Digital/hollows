/**
 * CONFIG.queries scaffold for Hollows RPC.
 *
 * Foundry V14 query API (per docs/wiki):
 *   - Register: `CONFIG.queries["<namespace>.<method>"] = async (data, opts) => result`
 *   - Send:     `await user.query("<namespace>.<method>", data, { timeout })`
 *
 * Hollows convention:
 *   - All query names prefixed `hollows.` (avoid collisions with core / modules).
 *   - Handlers run on the receiving user's side.
 *   - Each handler is wrapped by `registerHandler` which:
 *       1. Catches errors and serializes them so the caller sees a usable message
 *          instead of an opaque "Query failed".
 *       2. Logs unexpected throws with handler name for debugging.
 *
 * Sending:
 *   - `runUserQuery(user, name, payload)` targets a specific active user.
 *   - `runGMQuery(name, payload)` targets the active GM.
 *   - `dispatchToGM(event, payload)` targets the active GM by short event name.
 */

import { HANDLERS } from "./queries-state.js";
import { applyAdvanceTurnGM, applyPassInitiativeGM } from "./combat-runtime.js";
import { applyFirstPickSelection } from "./combat-first-pick.js";
import { promptIncursionRollQuery } from "../documents/actor/incursion.js";
import { addCondition, removeCondition } from "../documents/actor/conditions.js";
import { adjustHunterResource, adjustEntityResource } from "../documents/actor/resources.js";
import { applyHazardRoll } from "../documents/actor/hazard-damage.js";
import { applyAfterAttackPayload } from "../documents/entity/attack-effects.js";
import { applyRefugeActionPayload } from "../documents/actor/refuge.js";
import { applyRelicEffectPayload } from "../data/relic/apply-effect.js";
import { registerEchoQueries } from "../documents/actor/echo.js";
import { addThreatToZone } from "../canvas/overlays.js";
import { getActiveEntityActor } from "../canvas/zone.js";
import { resolveEntityKillRewardsFromMessage } from "../documents/entity/baptism.js";
import { QueryPermissionError } from "../utils/permissions.js";
import { registerReactions } from "./reactions.js";

// NOTE: permission helpers exist in ../utils/permissions.js. They are *not*
// used here because Foundry runs query handlers under the receiver's identity.
// Sender-side permission hardening needs sender metadata and is deferred to a
// later hardening pass.

// HANDLERS lives in a dependency-free module (queries-state.js) so it is always
// initialised before ability modules that call registerHandler() at eval time,
// even under circular import. See queries-state.js for the full rationale.

/**
 * Register a query handler. Wraps in error serialization.
 * Call from `registerQueries()` only — handlers must be in place before any
 * client can send.
 */
export function registerHandler(name, fn) {
  if (HANDLERS.has(name)) {
    console.warn(`Hollows | Query handler ${name} already registered; overwriting`);
  }
  HANDLERS.set(name, fn);
  // If CONFIG.queries was already populated by registerQueries(), wire this
  // late-registered handler in immediately — lets ability modules register
  // from their own `Hooks.once("init")` callback regardless of init order.
  if (typeof CONFIG?.queries === "object" && CONFIG.queries !== null) {
    CONFIG.queries[name] = buildDispatcher(name, fn);
  }
}

function buildDispatcher(name, fn) {
  return async (data, opts) => {
    try {
      return { ok: true, result: await fn(data, opts) };
    } catch (err) {
      console.error(`Hollows | Query handler ${name} failed`, err);
      return {
        ok: false,
        error: {
          message: err?.message || String(err),
          code: err?.code || "unknown"
        }
      };
    }
  };
}

/**
 * Register all Hollows query handlers with Foundry. Idempotent.
 * Called from init per Foundry V14 docs.
 */
export function registerQueries() {
  if (typeof CONFIG?.queries !== "object") {
    console.warn("Hollows | CONFIG.queries not available; query migration disabled");
    return;
  }
  registerCategoryAHandlers();
  registerCategoryBHandlers();
  registerCategoryDHandlers();
  registerCategoryEHandlers();
  registerReactions(registerHandler);
  registerEchoQueries(registerHandler);
  for (const [name, fn] of HANDLERS) {
    CONFIG.queries[name] = buildDispatcher(name, fn);
  }
  console.log(`Hollows | Registered ${HANDLERS.size} query handlers`);
}

// ---------------------------------------------------------------------------
// Category A — Combat orchestration
// ---------------------------------------------------------------------------

function resolveCombatOrThrow(combatId) {
  const combat = combatId ? game.combats?.get(String(combatId)) : game.combat;
  if (!combat) throw new QueryPermissionError(`Combat ${combatId} not found`, { code: "no-combat" });
  return combat;
}

function registerCategoryAHandlers() {
  registerHandler("hollows.passInitiative", async ({ combatId, fromCombatantId, toCombatantId } = {}) => {
    const combat = resolveCombatOrThrow(combatId);
    await applyPassInitiativeGM(combat, fromCombatantId, toCombatantId);
  });

  registerHandler("hollows.advanceTurn", async ({ combatId, fromCombatantId, mode } = {}) => {
    const combat = resolveCombatOrThrow(combatId);
    await applyAdvanceTurnGM(combat, fromCombatantId, mode);
  });

  registerHandler("hollows.firstPickChoice", async ({ combatId, combatantId, prevCombatantId, reason, eotDone } = {}) => {
    const combat = resolveCombatOrThrow(combatId);
    const awaiting = combat.getFlag("hollows", "awaitingFirstPick") || {};
    const prevId = prevCombatantId || awaiting.prevCombatantId || null;
    const eventReason = reason || awaiting.reason || "round-start";
    const eotFlag = typeof eotDone === "boolean" ? eotDone : !!awaiting.eotDone;
    await applyFirstPickSelection(combat, combatantId, prevId, eventReason, eotFlag);
  });

  registerHandler("hollows.setMessageFlag", async ({ messageId, key, value } = {}) => {
    const target = messageId ? game.messages?.get(String(messageId)) : null;
    if (!target) throw new QueryPermissionError(`Message ${messageId} not found`, { code: "no-message" });
    if (!key) throw new QueryPermissionError("setMessageFlag requires key", { code: "no-key" });
    await target.setFlag("hollows", String(key), value);
  });
}

// ---------------------------------------------------------------------------
// Category B — Cross-actor state mutations
// ---------------------------------------------------------------------------

async function resolveActor({ actorId, actorUuid, tokenUuid } = {}) {
  if (actorUuid) {
    const doc = await fromUuid(String(actorUuid));
    if (doc?.documentName === "Actor") return doc;
    if (doc?.actor) return doc.actor;
  }
  if (tokenUuid) {
    const token = await fromUuid(String(tokenUuid));
    if (token?.actor) return token.actor;
  }
  if (actorId) return game.actors?.get(String(actorId)) || null;
  return null;
}

function registerCategoryBHandlers() {
  registerHandler("hollows.actorMutation", async ({ actorId, actorUuid, tokenUuid, type, payload } = {}) => {
    const actor = await resolveActor({ actorId, actorUuid, tokenUuid });
    if (!actor) throw new QueryPermissionError("Actor not found", { code: "no-actor" });
    const p = payload || {};
    switch (String(type || "")) {
      case "flag": {
        if (!p.key) throw new QueryPermissionError("flag mutation requires key", { code: "no-key" });
        await actor.setFlag("hollows", String(p.key), p.value);
        return;
      }
      case "condition": {
        if (!p.key) throw new QueryPermissionError("condition mutation requires key", { code: "no-key" });
        if (p.active === false) await removeCondition(actor, String(p.key), p.opts || {});
        else await addCondition(actor, String(p.key));
        return;
      }
      case "update": {
        if (!p.update || typeof p.update !== "object") {
          throw new QueryPermissionError("update mutation requires payload.update object", { code: "no-update" });
        }
        await actor.update(p.update);
        return;
      }
      default:
        throw new QueryPermissionError(`Unknown mutation type: ${type}`, { code: "bad-type" });
    }
  });

  registerHandler("hollows.hunterResourceAdjust", async ({ actorId, actorUuid, tokenUuid, resolve, wounds, focus } = {}) => {
    const actor = await resolveActor({ actorId, actorUuid, tokenUuid });
    if (!actor || actor.type !== "hunter") throw new QueryPermissionError("Hunter not found", { code: "no-hunter" });
    return await adjustHunterResource(actor, { resolve, wounds, focus });
  });

  registerHandler("hollows.threatAdjust", async ({ zoneId, amount, opts } = {}) => {
    const zone = String(zoneId || "");
    if (!zone) throw new QueryPermissionError("Threat adjustment requires zoneId", { code: "no-zone" });
    return await addThreatToZone(zone, Number(amount || 0), opts || {});
  });

  registerHandler("hollows.afterAttackApply", async (payload = {}) => {
    await applyAfterAttackPayload(payload);
  });

  registerHandler("hollows.entityTerrainAdjust", async ({ entityId, tag, delta, fromPool, byHunter, hunterId } = {}) => {
    const entity = entityId ? game.actors?.get(String(entityId)) : getActiveEntityActor();
    if (!entity || entity.type !== "entity") throw new QueryPermissionError("Entity not found", { code: "no-entity" });
    const { applyEntityTerrainAdjustGM } = await import("../canvas/terrain-pool.js");
    return await applyEntityTerrainAdjustGM(entity, tag, Number(delta || 0), {
      fromPool: fromPool !== false,
      byHunter: !!byHunter,
      hunterId
    });
  });

  registerHandler("hollows.hazardRollApply", async ({ messageId, actorUuid, rollValue } = {}) => {
    const hazardMessage = messageId ? game.messages?.get(String(messageId)) : null;
    if (!hazardMessage) throw new QueryPermissionError(`Hazard message ${messageId} not found`, { code: "no-message" });
    const actor = actorUuid ? await fromUuid(String(actorUuid)) : null;
    if (!actor) throw new QueryPermissionError(`Actor ${actorUuid} not found`, { code: "no-actor" });
    await applyHazardRoll(hazardMessage, actor, Number(rollValue ?? 0));
  });
}

// ---------------------------------------------------------------------------
// Category D — Roll handshakes / reactions
// ---------------------------------------------------------------------------

function registerCategoryDHandlers() {
  registerHandler("hollows.incursionRoll", async (payload = {}) => {
    return await promptIncursionRollQuery(payload);
  });

  // Player→GM: deal damage to the active Entity (Make It Count, Frantic, …).
  // The GM applies it and resolves kill rewards if a Wound kill finishes it.
  registerHandler("hollows.entityDamage", async ({ actorId, resolve, wounds, label } = {}) => {
    const actor = actorId ? game.actors.get(String(actorId)) : null;
    const entity = getActiveEntityActor();
    if (!entity) return;
    const r = Math.max(0, Number(resolve ?? 0));
    const w = Math.max(0, Number(wounds ?? 0));
    if (!r && !w) return;
    const prevWounds = Number(entity.system.health.wounds.value ?? 0);
    await adjustEntityResource(entity, { resolve: -r, wounds: -w });
    const parts = [];
    if (r) parts.push(`${r} Resolve`);
    if (w) parts.push(`${w} Wound${w === 1 ? "" : "s"}`);
    const notice = await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: actor || entity }),
      content: `<div class="hollows-chat"><strong>${entity.name}</strong> suffers <strong>${parts.join(" and ")}</strong>${label ? ` (${label})` : ""}.</div>`
    });
    if (w && prevWounds > 0 && (prevWounds - w) <= 0) {
      await resolveEntityKillRewardsFromMessage(notice);
    }
  });

  // Player→GM: run an authored relic/rumour effect group GM-side so every
  // primitive (entity/zone mutations) has authority.
  registerHandler("hollows.relicEffect", async (payload = {}) => {
    await applyRelicEffectPayload(payload);
  });

  // GM→player reactions (counterattack / comeOutSwinging / arrogant /
  // forewarned / martyr / distract / blockade / guard / control) live in
  // reactions.js as `Reaction` instances and self-register via registerReactions().
}

// ---------------------------------------------------------------------------
// Category E — Refuge
// ---------------------------------------------------------------------------

function registerCategoryEHandlers() {
  registerHandler("hollows.refugeAction", async (payload = {}) => {
    await applyRefugeActionPayload(payload);
  });

  // GM→player: ask the owner to pick source+destination for Threat shift
  // (Control, Goad, Misdirection, etc.). Returns { from, to } or null if skipped.
  registerHandler("hollows.pickShiftThreat", async ({ sources, destPerSource, title, amount, reason } = {}) => {
    const list = Array.isArray(sources) ? sources : [];
    if (!list.length) return null;
    const sourceOptions = list.map((s) => `<option value="${s.zone}">${s.zone} (${s.count})</option>`).join("");
    const initialFrom = list[0].zone;
    const initialDest = (destPerSource && destPerSource[initialFrom]) || [];
    const destOptions = initialDest.map((z) => `<option value="${z}">${z}</option>`).join("");
    const result = await foundry.applications.api.DialogV2.wait({
      window: { title: title || "Shift Threat" },
      content: `
        <form class="hollows-roll-dialog">
          <div class="form-group"><label>Shift ${Number(amount ?? 1)} Threat (${String(reason || "Shift")})</label></div>
          <div class="form-group"><label>From</label><select name="fromZone">${sourceOptions}</select></div>
          <div class="form-group"><label>To</label><select name="toZone">${destOptions}</select></div>
        </form>
      `,
      rejectClose: false,
      render: (_e, dialog) => {
        const el = dialog.element;
        const updateDest = () => {
          const fromZone = String(el.querySelector("[name=fromZone]")?.value || "");
          const dests = (destPerSource && destPerSource[fromZone]) || [];
          el.querySelector("[name=toZone]").innerHTML = dests.map((z) => `<option value="${z}">${z}</option>`).join("");
        };
        el.querySelector("[name=fromZone]").addEventListener("change", updateDest);
        updateDest();
      },
      buttons: [
        {
          action: "apply",
          label: "Shift",
          default: true,
          callback: (_e, _b, dialog) => {
            const el = dialog.element;
            return {
              from: String(el.querySelector("[name=fromZone]")?.value || ""),
              to: String(el.querySelector("[name=toZone]")?.value || "")
            };
          }
        },
        { action: "skip", label: "Skip", callback: () => null }
      ]
    });
    return result || null;
  });

  // GM→player: ask the owner to pick a zone for Threat removal (Blood in the
  // Eyes etc.). Returns the chosen zone string, or empty string if skipped.
  registerHandler("hollows.pickThreatZone", async ({ zones } = {}) => {
    const list = Array.isArray(zones) ? zones : [];
    if (!list.length) return "";
    const { getThreatInZone } = await import("../canvas/zone.js");
    const options = list.map((z) => `<option value="${z}">${z} (${getThreatInZone(z)} Threat)</option>`).join("");
    const pick = await foundry.applications.api.DialogV2.wait({
      window: { title: "Remove Threat" },
      content: `<form class="hollows-roll-dialog"><div class="form-group"><label>Zone</label><select name="zone">${options}</select></div></form>`,
      rejectClose: false,
      buttons: [
        { action: "apply", label: "Remove", default: true, callback: (_e, _b, dialog) => String(dialog.element.querySelector("[name=zone]")?.value || "") },
        { action: "cancel", label: "Skip", callback: () => "" }
      ]
    });
    return pick || "";
  });

  // hollows.reaction.baptism is registered via reactions.js (GM→player).
}

/**
 * Send a query to a specific user. Returns the handler's resolved value or
 * throws a usable error.
 *
 * Edge cases:
 *   - Caller IS the target user: invoke handler inline (Foundry can't self-query).
 *   - Target user not active: reject with notification + throw.
 *   - Handler throws: error surfaces with message + code.
 */
export async function runUserQuery(targetUser, name, payload, opts = {}) {
  const fn = HANDLERS.get(name);

  if (!targetUser) {
    const msg = `No target user for ${name}`;
    ui.notifications?.warn(msg);
    throw new Error(msg);
  }
  if (targetUser.id === game.user?.id) {
    if (!fn) throw new Error(`Hollows | Unknown query ${name}`);
    return await fn(payload, opts);
  }
  if (!targetUser.active) {
    const msg = `Target user ${targetUser.name} is not active — cannot perform this action.`;
    ui.notifications?.warn(msg);
    throw new Error(msg);
  }

  const envelope = await targetUser.query(name, payload, { timeout: opts.timeout ?? 10_000 });
  if (!envelope) throw new Error(`Hollows | Query ${name} returned no response`);
  if (envelope.ok) return envelope.result;
  const err = new Error(envelope.error?.message || `Query ${name} failed`);
  err.code = envelope.error?.code || "unknown";
  if (opts.notifyOnError !== false) ui.notifications?.warn(err.message);
  throw err;
}

/**
 * Send a query to the active GM. Thin wrapper around runUserQuery.
 */
export async function runGMQuery(name, payload, opts = {}) {
  if (game.user?.isGM) return runUserQuery(game.user, name, payload, opts);
  const gm = game.users?.activeGM;
  if (!gm) {
    const msg = "No active GM — cannot perform this action.";
    ui.notifications?.warn(msg);
    throw new Error(msg);
  }
  return runUserQuery(gm, name, payload, opts);
}

/**
 * Offer a reaction-style choice to a specific user. Returns the user's
 * choice value (whatever the handler returns) or null if they declined / no-op.
 * Convention: handler returns `null` for skip, an object for accept.
 *
 * Note: "reaction" here means a triggered player prompt — distinct from the
 * game's "Interrupt" action (an Entity behavior tracked elsewhere).
 */
export async function offerReaction(targetUser, key, context, opts = {}) {
  try {
    return await runUserQuery(targetUser, `hollows.reaction.${key}`, context, opts);
  } catch (err) {
    console.warn(`Hollows | Reaction ${key} failed for ${targetUser?.name}`, err);
    return null;
  }
}

/**
 * Number of registered handlers. Used by sanity checks / dev tooling.
 */
export function getRegisteredHandlerCount() {
  return HANDLERS.size;
}

/**
 * Dispatch an event to the GM through `CONFIG.queries`. Every event has a handler
 * registered (in `registerQueries()` or an ability module's own init); an
 * unregistered event throws via `runGMQuery` — fail loud, never a silent no-op.
 */
export async function dispatchToGM(eventName, payload, opts = {}) {
  return await runGMQuery(`hollows.${eventName}`, payload, opts);
}
