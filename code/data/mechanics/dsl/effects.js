/**
 * DSL effect applier. Each mechanic's `effects` field is an array of effect
 * descriptors; this module knows how to execute each.
 *
 * Supported effect types:
 *   restoreResolve: { amount, target?: "self" }
 *   restoreWounds:  { amount }
 *   adjustFocus:    { amount, stopIfUnchanged? }
 *   focus:          { stopIfUnchanged? } run the Focus manoeuvre
 *   confirm:        { title?, message?, yesLabel?, noLabel? }
 *   removeCondition: { key }
 *   addCondition:    { key }
 *   removeThreat:    { amount|"all", zone? } — zone "self" = carrier's zone; omitted
 *                    = picked via a dialog routed to the owner
 *   chatNotice:      { message }       — supports {actor} placeholder
 *   setFlag:         { key, value? }   — set actor flag (default value {active:true})
 *   grantManoeuvre:  { manoeuvre?, scope?, options? } — grant an immediate
 *                    manoeuvre. `scope` ("self"|"zoneMate"|"allyInZone"|"ally"
 *                    |"allyNotSupport") picks the recipient; omit `manoeuvre`
 *                    to let the recipient choose (from `options` if given).
 *   claimTerrainTag: { label? } — prompt the actor to claim an Elevated /
 *                    Sheltered terrain tag (no test); spends a pool tag.
 *   damageEntity:    { resolve?, wounds?, label? } — deal damage to the active
 *                    Entity (routed to the GM; resolves kill rewards on kill).
 *
 * Context: { actor, entity, target?, payload?, fromZone?, toZone? }
 *
 * `amount` may be "all", a number OR a computed object:
 *   { base: N, perZoneType?: { close: +X, ranged: +Y, support: +Z } }
 */

import { addCondition, removeCondition } from "../../../documents/actor/conditions.js";
import {
  getActiveEntityActor,
  getActorZone,
  getAdjacentZones,
  getHuntersInZone,
  getThreatInZone,
  isCloseZone,
  isRangedZone,
} from "../../../canvas/zone.js";
import { pickOne } from "../../../applications/apps/selection-dialogs.mjs";
import { HOLLOWS_CONDITIONS } from "../../system-constants.js";
import {
  adjustHunterResource,
  adjustEntityResource,
  getFocusCount,
  spendResolve,
} from "../../../documents/actor/resources.js";
import { addCurseToZone, addThreatToZone } from "../../../canvas/overlays.js";
import { getZoneCurseValue } from "../../../canvas/zone.js";
import { adjustEntityTerrain } from "../../../canvas/terrain-pool.js";

function zoneTypeOf(zone) {
  if (!zone) return null;
  if (isCloseZone(zone)) return "close";
  if (isRangedZone(zone)) return "ranged";
  if (String(zone) === "Support") return "support";
  return null;
}

function resolveAmount(amountDesc, ctx = {}) {
  const { actor, damageType } = ctx;
  if (typeof amountDesc === "number") return amountDesc;
  if (amountDesc && typeof amountDesc === "object") {
    if (amountDesc.fromCtx) return Number(ctx[amountDesc.fromCtx] ?? 0);
    if (amountDesc.fromDamageType) {
      const map = amountDesc.fromDamageType;
      return Number(map[damageType] ?? map.default ?? 0);
    }
    const base = Number(amountDesc.base ?? 0);
    let extra = 0;
    if (amountDesc.perZoneType && actor) {
      const zt = zoneTypeOf(getActorZone(actor));
      if (zt && typeof amountDesc.perZoneType[zt] === "number") extra += amountDesc.perZoneType[zt];
    }
    return base + extra;
  }
  return 0;
}

function resolveTarget(targetDesc, ctx) {
  if (!targetDesc) return ctx.actor;
  if (targetDesc.fromCtx) return ctx[targetDesc.fromCtx] || ctx.actor;
  return ctx.actor;
}

function fmt(template, { actor, target }) {
  return String(template || "")
    .replace(/\{actor\}/g, actor?.name || "Actor")
    .replace(/\{target\}/g, target?.name || "the target");
}

// Hunters eligible to receive a granted manoeuvre, per `scope`.
function resolveManoeuvreRecipients(actor, scope) {
  const hunters = (canvas?.tokens?.placeables || [])
    .map((t) => t.actor)
    .filter((a) => a?.type === "hunter");
  if (scope === "self") return actor ? [actor] : [];
  if (scope === "zoneMate") {
    const myZone = actor ? getActorZone(actor) : null;
    if (!myZone) return [];
    return hunters.filter((a) => getActorZone(a) === myZone);
  }
  if (scope === "allyInZone") {
    // Same as zoneMate but excludes the carrier — RAW "ally in your area".
    const myZone = actor ? getActorZone(actor) : null;
    if (!myZone) return [];
    return hunters.filter((a) => a.id !== actor?.id && getActorZone(a) === myZone);
  }
  if (scope === "ally") return hunters.filter((a) => a.id !== actor?.id);
  if (scope === "allyNotSupport") {
    return hunters.filter((a) => a.id !== actor?.id && String(getActorZone(a) || "") !== "Support");
  }
  if (scope === "allyInZoneOrAdjacent") {
    const myZone = actor ? getActorZone(actor) : null;
    if (!myZone) return [];
    const searchZones = new Set([myZone, ...getAdjacentZones(myZone)]);
    return hunters.filter((a) => a.id !== actor?.id && searchZones.has(getActorZone(a)));
  }
  return [];
}

// Generic single-select dialog. `options` is [{ value, label }]; returns the
// chosen value, or "" on cancel.
async function promptSelect(title, label, options) {
  if (!Array.isArray(options) || !options.length) return "";
  return (await pickOne({ title, label, options, applyLabel: "Confirm" })) ?? "";
}

export async function applyEffects(effects, ctx = {}) {
  if (!Array.isArray(effects) || !effects.length) return;
  for (const eff of effects) {
    if (ctx._cancelled) return;
    await applyOne(eff, ctx);
  }
}

async function applyOne(eff, ctx) {
  const { actor } = ctx;
  switch (eff?.type) {
    case "restoreResolve": {
      if (!actor) return;
      if (eff.onDamageType && ctx.damageType !== eff.onDamageType) return;
      const amount = resolveAmount(eff.amount, ctx);
      if (!amount) return;
      const target = resolveTarget(eff.target, ctx);
      await adjustHunterResource(target, { resolve: amount });
      return;
    }
    case "restoreWounds": {
      if (!actor) return;
      if (eff.onDamageType && ctx.damageType !== eff.onDamageType) return;
      const amount = resolveAmount(eff.amount, ctx);
      if (!amount) return;
      const target = resolveTarget(eff.target, ctx);
      await adjustHunterResource(target, { wounds: amount });
      return;
    }
    case "pickTarget": {
      if (!actor) return;
      const scope = eff.scope || "selfOrZoneAlly";
      let candidates = [actor];
      if (scope === "selfOrZoneAlly") {
        const zone = getActorZone(actor);
        candidates = zone ? [actor, ...getHuntersInZone(zone).filter((h) => h.id !== actor.id)] : [actor];
      } else if (scope === "zoneAlly") {
        const zone = getActorZone(actor);
        candidates = zone ? getHuntersInZone(zone).filter((h) => h.id !== actor.id) : [];
      }
      if (!candidates.length) return;
      let target = candidates[0];
      if (candidates.length > 1) {
        const esc = (v) => foundry.utils.escapeHTML(String(v ?? ""));
        const opts = candidates.map((h) => `<option value="${h.id}">${esc(h.name)}</option>`).join("");
        const pick = await foundry.applications.api.DialogV2.wait({
          window: { title: eff.title || "Choose Target" },
          content: `<form class="hollows-roll-dialog"><div class="form-group"><label>${esc(eff.label || "Target")}</label><select name="targetId">${opts}</select></div></form>`,
          rejectClose: false,
          buttons: [
            { action: "apply", label: "Apply", default: true, callback: (_e, _b, d) => String(d.element.querySelector("[name=targetId]")?.value || "") },
            { action: "cancel", label: "Skip", callback: () => "" },
          ],
        }) ?? "";
        if (!pick) return;
        target = game.actors.get(pick) || candidates[0];
      }
      ctx[eff.ctxKey || "_target"] = target;
      return;
    }
    case "pickAmount": {
      if (!actor) return;
      if (eff.requireMyTurn) {
        const combat = game.combat;
        if (combat?.started && combat.combatant?.actor?.id !== actor.id) {
          ui.notifications?.warn?.("You can only use this on your turn.");
          ctx._cancelled = true;
          return;
        }
      }
      let max = Number.MAX_SAFE_INTEGER;
      if (eff.maxResolve) max = Math.min(max, Number(actor.system?.health?.resolve?.value ?? 0));
      if (eff.maxZoneThreat) {
        const zone = getActorZone(actor);
        max = Math.min(max, zone ? Number(getThreatInZone(zone) || 0) : 0);
      }
      if (max <= 0) {
        ui.notifications?.warn?.(eff.warnIfZero || "Nothing available to spend.");
        ctx._cancelled = true;
        return;
      }
      const esc = (v) => foundry.utils.escapeHTML(String(v ?? ""));
      const descHtml = eff.description ? `<div class="muted">${esc(eff.description)}</div>` : "";
      const picked = await foundry.applications.api.DialogV2.wait({
        window: { title: eff.title || "Choose Amount" },
        content: `<form class="hollows-roll-dialog">${descHtml}<div class="form-group"><label>${esc(eff.label || "Amount")} (0–${max})</label><input type="number" name="amount" min="0" max="${max}" value="${max}" /></div></form>`,
        rejectClose: false,
        buttons: [
          { action: "apply", label: "Apply", default: true, callback: (_e, _b, d) => Number(d.element.querySelector("[name=amount]")?.value ?? 0) },
          { action: "cancel", label: "Cancel", callback: () => -1 },
        ],
      }) ?? -1;
      const amount = Math.max(0, Math.min(max, Number(picked ?? 0)));
      if (picked === -1 || amount <= 0) { ctx._cancelled = true; return; }
      ctx[eff.ctxKey || "_amount"] = amount;
      return;
    }
    case "spendResolve": {
      if (!actor) return;
      const amount = resolveAmount(eff.amount, ctx);
      if (!amount || amount <= 0) return;
      await spendResolve(actor, amount);
      return;
    }
    case "adjustFocus": {
      if (!actor) return;
      const amount = resolveAmount(eff.amount, ctx);
      if (!amount) return;
      const result = await adjustHunterResource(actor, { focus: amount });
      if (eff.stopIfUnchanged && !result?.focus?.changed) ctx._cancelled = true;
      return;
    }
    case "focus": {
      if (!actor) return;
      const { applyFocusToActor } = await import("../../actions/focus.js");
      const before = getFocusCount(actor);
      await applyFocusToActor(actor, actor);
      if (eff.stopIfUnchanged && getFocusCount(actor) === before) ctx._cancelled = true;
      return;
    }
    case "confirm": {
      const ok = await foundry.applications.api.DialogV2.wait({
        window: { title: eff.title || "Confirm" },
        content: `<div class="hollows-roll-dialog"><div>${eff.message || "Apply this effect?"}</div></div>`,
        rejectClose: false,
        buttons: [
          { action: "yes", label: eff.yesLabel || "Apply", default: true, callback: () => true },
          { action: "no", label: eff.noLabel || "Skip", callback: () => false },
        ],
      }) ?? false;
      if (ok !== true) ctx._cancelled = true;
      return;
    }
    case "addCondition": {
      if (!actor || !eff.key) return;
      await addCondition(actor, String(eff.key));
      return;
    }
    case "removeCondition": {
      if (!actor || !eff.key) return;
      await removeCondition(actor, String(eff.key));
      return;
    }
    case "removeThreat": {
      const { removeThreatViaDialog } = await import("../../../canvas/threat-ops.js");
      const amount = eff.amount === "all" ? "all" : resolveAmount(eff.amount, ctx);
      if (amount !== "all" && !amount) return;
      let zone = null;
      let allowedZones = null;
      if (eff.zone === "self") {
        zone = getActorZone(actor);
      } else if (eff.zone === "selfOrAdjacent") {
        const myZone = getActorZone(actor);
        if (myZone) allowedZones = [myZone, ...getAdjacentZones(myZone)];
      } else if (eff.zone) {
        zone = String(eff.zone);
      }
      await removeThreatViaDialog(actor, amount, zone, allowedZones);
      return;
    }
    case "chatNotice": {
      const message = fmt(eff.message, ctx);
      if (!message) return;
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: actor || undefined }),
        content: `<div class="hollows-chat">${message}</div>`,
      });
      return;
    }
    case "setFlag": {
      if (!actor || !eff.key) return;
      await actor.setFlag("hollows", String(eff.key), eff.value ?? { active: true });
      return;
    }
    case "unsetFlag": {
      if (!actor || !eff.key) return;
      await actor.unsetFlag("hollows", String(eff.key));
      return;
    }
    case "grantManoeuvre": {
      const { grantManoeuvre } = await import("../../actions/index.js");
      const scope = eff.scope || "self";
      if (scope === "self") {
        if (!actor) return;
        await grantManoeuvre(actor, eff.manoeuvre, eff.options);
        return;
      }
      const recipients = resolveManoeuvreRecipients(actor, scope);
      if (!recipients.length) {
        ui.notifications?.info?.("No eligible Hunter for the granted manoeuvre.");
        return;
      }
      let recipient = recipients[0];
      if (recipients.length > 1) {
        const pickedId = await promptSelect(
          "Grant Manoeuvre", "Hunter",
          recipients.map((a) => ({ value: a.id, label: a.name })),
        );
        recipient = pickedId ? recipients.find((a) => a.id === pickedId) : null;
        if (!recipient) { ctx._cancelled = true; return; }
      }
      await grantManoeuvre(recipient, eff.manoeuvre, eff.options);
      return;
    }
    case "claimTerrainTag": {
      if (!actor) return;
      if (!getActorZone(actor)) {
        ui.notifications?.warn?.("Your token is not inside a zone region.");
        ctx._cancelled = true;
        return;
      }
      const choice = await foundry.applications.api.DialogV2.wait({
        window: { title: eff.label || "Claim Terrain Tag" },
        content: "<div class=\"hollows-roll-dialog\"><div>Claim a terrain tag (no test).</div></div>",
        rejectClose: false,
        buttons: [
          { action: "elevated", label: "Take Elevated", default: true, callback: () => "elevated" },
          { action: "sheltered", label: "Take Sheltered", callback: () => "sheltered" },
          { action: "skip", label: "Skip", callback: () => "" },
        ],
      }) ?? "";
      if (!choice) {
        ctx._cancelled = true;
        return;
      }

      if (actor.statuses.has(choice)) {
        ui.notifications?.warn?.(`${actor.name} already has ${HOLLOWS_CONDITIONS[choice]?.label || choice}.`);
        ctx._cancelled = true;
        return;
      }
      const { spendTerrainPoolTag } = await import("../../../canvas/terrain-pool.js");
      const spent = await spendTerrainPoolTag(choice, 1);
      if (!spent) {
        ui.notifications?.warn?.(`No ${HOLLOWS_CONDITIONS[choice]?.label || choice} terrain tags left in pool.`);
        ctx._cancelled = true;
        return;
      }
      await addCondition(actor, choice);
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="hollows-chat"><strong>${actor.name}</strong> claims <strong>${choice === "sheltered" ? "Sheltered" : "Elevated"}</strong>${eff.label ? ` (${eff.label})` : ""}.</div>`,
      });
      return;
    }
    case "damageEntity": {
      const { dispatchToGM } = await import("../../../helpers/queries.js");
      await dispatchToGM("entityDamage", {
        actorId: actor?.id || "",
        resolve: Number(eff.resolve || 0),
        wounds: Number(eff.wounds || 0),
        label: eff.label || "",
      });
      return;
    }
    // Signed primitives below run in GM context (relic groups execute GM-side);
    // a player-side caller would need routing, like damageEntity above.
    case "adjustHunter": {
      const target = resolveTarget(eff.target, ctx);
      if (!target) return;
      await adjustHunterResource(target,
        { resolve: Number(eff.resolve || 0), wounds: Number(eff.wounds || 0), focus: Number(eff.focus || 0) },
        { allowTemporary: !!eff.allowTemporary });
      return;
    }
    case "adjustEntity": {
      const entity = ctx.entity || getActiveEntityActor();
      if (!entity) return;
      await adjustEntityResource(entity, { resolve: Number(eff.resolve || 0), wounds: Number(eff.wounds || 0) });
      return;
    }
    case "adjustEntityTerrain": {
      const entity = ctx.entity || getActiveEntityActor();
      if (!entity || !eff.tag) return;
      await adjustEntityTerrain(entity, String(eff.tag), Number(eff.amount || 0));
      return;
    }
    case "adjustThreat": {
      const zone = eff.zone === "self" ? getActorZone(actor) : String(eff.zone || "");
      if (!zone) return;
      await addThreatToZone(zone, Number(eff.amount || 0));
      return;
    }
    case "adjustZoneCurse": {
      const zone = eff.zone === "self" ? getActorZone(actor) : String(eff.zone || "");
      if (!zone) return;
      await addCurseToZone(zone, Number(eff.amount || 0));
      return;
    }
    case "clampZoneCurse": {
      const zone = eff.zone === "self" ? getActorZone(actor) : String(eff.zone || "");
      if (!zone) return;
      const current = getZoneCurseValue(zone);
      const cap = Number(eff.value || 0);
      if (current > cap) await addCurseToZone(zone, cap - current);
      return;
    }
    case "adjustEntityCurse": {
      const entity = ctx.entity || getActiveEntityActor();
      if (!entity) return;
      const current = entity.system.curse.value;
      await entity.update({ "system.curse.value": current + (eff.amount || 0) });
      return;
    }
    case "clampEntityCurse": {
      const entity = ctx.entity || getActiveEntityActor();
      if (!entity) return;
      const current = entity.system.curse.value;
      const cap = eff.value || 0;
      if (current > cap) await entity.update({ "system.curse.value": cap });
      return;
    }
    default:
      console.warn(`Hollows | Unknown effect type: ${eff?.type}`);
  }
}
