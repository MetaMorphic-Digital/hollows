import { applyEffects } from "../mechanics/dsl/effects.js";
import {
  getActiveEntityActor,
  getActorZone,
  getHuntersInZone,
  getAdjacentZones,
  filterZonesByGroup,
  getActiveSceneHunters,
  getThreatInZone,
  getZoneCurseValue
} from "../../canvas/zone.js";
import { confirmDialog, pickMany, pickOne } from "../../applications/apps/selection-dialogs.mjs";
import { dispatchToGM } from "../../helpers/queries.js";
import { activeRelicEffect } from "../../documents/item/relic-cypher.js";

const num = (value) => Number(value) || 0;

function activeRelicProfile(item) {
  return item?.system?.upgraded ? "cypher" : "base";
}

function groupsForProfile(item, profile = "base") {
  return (profile === "cypher" ? item?.system?.cypher?.groups : item?.system?.groups) || [];
}

function groupAt(item, profile, index) {
  return groupsForProfile(item, profile)[index] || null;
}

function enabledGroups(item, { trigger = "", profile = "base" } = {}) {
  return groupsForProfile(item, profile)
    .map((group, index) => ({ group, index }))
    .filter(({ group }) => group?.enabled && (!trigger || String(group.trigger || "") === String(trigger)));
}

function heldRelics(actor) {
  return (actor?.items?.contents || []).filter((item) => item.type === "relic");
}

export function relicHasActiveUse(item) {
  if (!item || item.type !== "relic") return false;
  return enabledGroups(item, { trigger: "onUse", profile: activeRelicProfile(item) }).length > 0;
}

export function effectUseNeedsBearer(item, { trigger = "onUse", profile = "base" } = {}) {
  return enabledGroups(item, { trigger, profile }).some(({ group }) => groupNeedsBearer(group));
}

function groupNeedsBearer(group) {
  const gateSource = String(group.gate?.source || "none");
  if (gateSource === "bearerZoneCurse" || gateSource === "bearerZoneThreat") return true;
  if (group.attack?.enabled) return true;
  const target = group.target || {};
  if (String(target.side || "") === "hunter") {
    const scope = String(target.hunterScope || "self");
    return scope === "self" || scope === "bearerArea";
  }
  if (String(target.side || "") === "zone") {
    const mode = String(target.zoneMode || "selected");
    return mode === "bearer" || mode === "adjacent";
  }
  return false;
}

export async function postEffectTextChat(item, { speaker = null, title = "" } = {}) {
  if (!item) return;
  const system = item.type === "relic" ? activeRelicEffect(item) : item.system;
  const description = String(system?.text || "").trim();
  const reminder = String(system?.combatReminder || "").trim();
  const setup = String(system?.narrativeSetup || "").trim();
  const gmText = String(system?.gmText || "").trim();
  const parts = [];
  if (description) parts.push(`<div>${foundry.utils.escapeHTML(description)}</div>`);
  if (reminder) parts.push(`<div><strong>Combat Reminder:</strong> ${foundry.utils.escapeHTML(reminder)}</div>`);
  if (setup) parts.push(`<div><strong>Narrative Setup:</strong> ${foundry.utils.escapeHTML(setup)}</div>`);
  await ChatMessage.create({
    speaker: speaker || ChatMessage.getSpeaker(),
    flavor: item.name || title || "Effect",
    content: `<div class="hollows-chat"><div class="attack-title">${foundry.utils.escapeHTML(String(title || item.name || "Effect"))}</div>${parts.join("") || "<div>Effect.</div>"}</div>`
  });
  if (gmText) {
    await ChatMessage.create({
      speaker: speaker || ChatMessage.getSpeaker(),
      whisper: ChatMessage.getWhisperRecipients("GM"),
      content: `<div class="hollows-chat"><div class="attack-title">${foundry.utils.escapeHTML(String(title || item.name || "Effect"))}: GM Notes</div><div>${foundry.utils.escapeHTML(gmText)}</div></div>`
    });
  }
}

export async function runEffectGroups(item, { trigger = "onUse", profile = "base", bearer = null } = {}) {
  if (!item) return;
  const matches = enabledGroups(item, { trigger, profile });
  if (!matches.length) return;
  for (const { group, index } of matches) {
    if (trigger === "onUse" && group.attack?.enabled && bearer) await runRelicAttack(bearer, group, item);
    if (game.user?.isGM) {
      await applyEffectGroupGM({ group, bearer });
    } else {
      await dispatchToGM("relicEffect", { itemUuid: item.uuid, profile, groupIndex: index, bearerId: bearer?.id || "" });
    }
  }
}

async function runRelicAttack(bearer, group, item) {
  if (!bearer || bearer.type !== "hunter") return;
  const attack = group.attack || {};
  const { openAttackDialog } = await import("../actions/attack.js");
  await openAttackDialog(bearer, {
    weaponless: true,
    title: `${item?.name || "Relic"} - Attack`,
    forcedProfile: { stat: String(attack.attackStat || "quick"), defence: String(attack.defence || "close") },
    damageOverride: { resolve: num(attack.amount?.resolve), wounds: num(attack.amount?.wounds) },
    suggestedMode: attack.advantage ? "adv" : "normal"
  });
}

export async function runRelicTriggers(trigger, { bearer = null } = {}) {
  if (!game.user?.isGM) return;
  const hunters = bearer ? [bearer] : getActiveSceneHunters();
  for (const actor of hunters) {
    if (actor?.type !== "hunter") continue;
    for (const item of heldRelics(actor)) {
      await runEffectGroups(item, { trigger, profile: activeRelicProfile(item), bearer: actor });
    }
  }
}

export async function runRelicDeathSave(actor) {
  if (!actor || actor.type !== "hunter" || !game.user?.isGM) return false;
  if (!actor.getFlag("hollows", "dyingRevivedOnce")) return false;
  for (const item of heldRelics(actor)) {
    for (const { group } of enabledGroups(item, { trigger: "onDeath", profile: activeRelicProfile(item) })) {
      if (!group.reaction?.enabled || String(group.reaction.kind || "") !== "deathSave") continue;
      await applyEffectGroupGM({ group, bearer: actor });
      if (item.system?.deleteWhenUsed) await item.delete();
      return true;
    }
  }
  return false;
}

export async function runRelicActionCancel(context = {}) {
  if (!game.user?.isGM) return false;
  const actionName = String(context.actionName || "the action");
  for (const hunter of getActiveSceneHunters()) {
    for (const item of heldRelics(hunter)) {
      for (const { group } of enabledGroups(item, { trigger: "passiveWhileHeld", profile: activeRelicProfile(item) })) {
        if (!group.reaction?.enabled || String(group.reaction.kind || "") !== "cancelAction") continue;
        const ok = await confirmDialog({
          title: item.name || "Relic",
          bodyHtml: `Cancel <strong>${foundry.utils.escapeHTML(actionName)}</strong> using <strong>${foundry.utils.escapeHTML(item.name || "Relic")}</strong>?`
        });
        if (ok) {
          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: hunter }),
            content: `<div class="hollows-chat"><strong>${foundry.utils.escapeHTML(hunter.name)}</strong> uses <strong>${foundry.utils.escapeHTML(item.name || "Relic")}</strong> to cancel <strong>${foundry.utils.escapeHTML(actionName)}</strong>.</div>`
          });
          return true;
        }
      }
    }
  }
  return false;
}

export async function applyRelicEffectPayload({ itemUuid, profile, groupIndex, bearerId } = {}) {
  const item = itemUuid ? await fromUuid(itemUuid) : null;
  if (!item) return;
  const group = groupAt(item, String(profile || "base"), Number(groupIndex));
  if (!group) return;
  const bearer = bearerId ? game.actors.get(String(bearerId)) : null;
  await applyEffectGroupGM({ group, bearer });
}

export async function applyEffectGroupGM({ group, bearer }) {
  if (!group?.enabled) return;
  const entity = resolveEntity(group);
  if (!passesGate(group.gate, { entity, bearer })) return;
  const side = String(group.target?.side || "none");
  const ctx = { actor: bearer || null, entity: entity || null };
  if (side === "entity") {
    await applyEffects(entityEffects(group), ctx);
  } else if (side === "hunter") {
    for (const hunter of await resolveHunters(group, bearer)) {
      await applyEffects(hunterEffects(group), { ...ctx, actor: hunter, target: hunter });
    }
  } else if (side === "zone") {
    const bearerZone = bearer ? getActorZone(bearer) : "";
    for (const zone of await resolveZones(group, bearer)) {
      await applyEffects(zoneEffects(group, zone, bearerZone), ctx);
    }
  }
  const other = String(group.otherText || "").trim();
  if (other) await applyEffects([{ type: "chatNotice", message: other }], ctx);
}

function resolveEntity(group) {
  const target = group.target || {};
  if (target.entityScope === "specific" && target.entityId) {
    const found = game.actors.get(String(target.entityId));
    return found?.type === "entity" ? found : null;
  }
  return getActiveEntityActor();
}

async function resolveHunters(group, bearer) {
  const target = group.target || {};
  const scope = String(target.hunterScope || "self");
  if (scope === "allHunters") return getActiveSceneHunters();
  if (scope === "bearerArea") {
    const zone = bearer ? getActorZone(bearer) : "";
    return zone ? getHuntersInZone(zone) : (bearer ? [bearer] : []);
  }
  if (scope === "chosenZone") {
    const zones = Array.isArray(target.zones) ? target.zones.filter(Boolean) : [];
    const hunters = zones.flatMap((zone) => getHuntersInZone(zone));
    return [...new Map(hunters.map((hunter) => [hunter.id, hunter])).values()];
  }
  if (scope === "chosen") {
    const hunters = getActiveSceneHunters();
    const id = await pickOne({ title: "Choose Hunter", label: "Hunter", options: hunters.map((h) => ({ value: h.id, label: h.name })) });
    const picked = id ? game.actors.get(id) : null;
    return picked ? [picked] : [];
  }
  return bearer ? [bearer] : [];
}

async function resolveZones(group, bearer) {
  const target = group.target || {};
  const mode = String(target.zoneMode || "selected");
  const bearerZone = bearer ? getActorZone(bearer) : "";
  if (mode === "bearer") return bearerZone ? [bearerZone] : [];
  if (mode === "adjacent") {
    const zones = new Set();
    if (target.adjBearer && bearerZone) zones.add(bearerZone);
    if (bearerZone) {
      const adjacent = getAdjacentZones(bearerZone);
      if (target.adjClose) for (const zone of filterZonesByGroup(adjacent, "close")) zones.add(zone);
      if (target.adjRanged) for (const zone of filterZonesByGroup(adjacent, "ranged")) zones.add(zone);
      if (target.adjSelect) for (const zone of await promptAdjacentZones(adjacent)) zones.add(zone);
    }
    return [...zones];
  }
  return Array.isArray(target.zones) ? target.zones.filter(Boolean) : [];
}

async function promptAdjacentZones(zones) {
  const list = (zones || []).filter(Boolean);
  if (!list.length) return [];
  const picked = await pickMany({
    title: "Select Adjacent Zones",
    options: list.map((zone) => ({ value: zone, label: zone }))
  });
  return picked || [];
}

function passesGate(gate, { entity = null, bearer = null } = {}) {
  const source = String(gate?.source || "none");
  if (source === "none") return true;
  let current = null;
  if (source === "entityResolve") {
    if (!entity) return false;
    current = num(entity.system?.health?.resolve?.value);
  } else if (source === "entityWounds") {
    if (!entity) return false;
    current = num(entity.system?.health?.wounds?.value);
  } else if (source === "entityCurse") {
    if (!entity) return false;
    current = num(entity.system?.curse?.value);
  } else if (source === "bearerZoneCurse") {
    const zone = bearer ? getActorZone(bearer) : "";
    if (!zone) return false;
    current = getZoneCurseValue(zone);
  } else if (source === "bearerZoneThreat") {
    const zone = bearer ? getActorZone(bearer) : "";
    if (!zone) return false;
    current = getThreatInZone(zone);
  } else return false;
  const value = num(gate?.value);
  const cmp = String(gate?.comparison || "lowerEqual");
  if (cmp === "higherEqual") return current >= value;
  if (cmp === "equal") return current === value;
  return current <= value;
}

function entityEffects(group) {
  const fx = [];
  if (group.resource?.enabled) {
    fx.push({ type: "adjustEntity", resolve: num(group.resource.resolve), wounds: num(group.resource.wounds) });
  }
  if (group.terrain?.enabled) {
    const delta = (String(group.terrain.mode) === "remove" ? -1 : 1) * Math.max(1, num(group.terrain.amount) || 1);
    for (const tag of (group.terrain.tags || [])) fx.push({ type: "adjustEntityTerrain", tag, amount: delta });
  }
  if (group.curse?.enabled) {
    const amount = Math.max(0, num(group.curse.amount));
    const mode = String(group.curse.mode);
    if (mode === "add") fx.push({ type: "adjustEntityCurse", amount });
    else if (mode === "remove") fx.push({ type: "adjustEntityCurse", amount: -amount });
    else if (mode === "clamp") fx.push({ type: "clampEntityCurse", value: num(group.curse.amount) });
  }
  return fx;
}

function hunterEffects(group) {
  const fx = [];
  if (group.resource?.enabled) {
    fx.push({ type: "adjustHunter", resolve: num(group.resource.resolve), wounds: num(group.resource.wounds), focus: num(group.resource.focus), allowTemporary: !!group.resource.allowTemporary });
  }
  if (group.condition?.enabled) {
    const type = String(group.condition.mode) === "remove" ? "removeCondition" : "addCondition";
    for (const key of (group.condition.conditions || [])) fx.push({ type, key });
  }
  if (group.terrain?.enabled) {
    const type = String(group.terrain.mode) === "remove" ? "removeCondition" : "addCondition";
    for (const tag of (group.terrain.tags || [])) fx.push({ type, key: tag });
  }
  if (group.reaction?.enabled) {
    const kind = String(group.reaction.kind || "");
    if (kind === "grantManoeuvre") fx.push({ type: "grantManoeuvre", scope: "self" });
    else if (kind === "immediateMove") fx.push({ type: "chatNotice", message: "<strong>{actor}</strong> may immediately Move." });
    else if (kind === "grantReaction") fx.push({ type: "grantReaction", reaction: String(group.reaction.reactionKey || "guard") });
  }
  return fx;
}

function zoneEffects(group, zone, bearerZone) {
  const fx = [];
  if (group.threat?.enabled) {
    const amount = Math.max(0, num(group.threat.amount));
    const mode = String(group.threat.mode);
    if (mode === "add") fx.push({ type: "adjustThreat", zone, amount });
    else if (mode === "remove") fx.push({ type: "adjustThreat", zone, amount: -amount });
    else if (mode === "shiftToBearer" && bearerZone && bearerZone !== zone) {
      fx.push({ type: "adjustThreat", zone, amount: -amount });
      fx.push({ type: "adjustThreat", zone: bearerZone, amount });
    }
  }
  if (group.curse?.enabled) {
    const amount = Math.max(0, num(group.curse.amount));
    const mode = String(group.curse.mode);
    if (mode === "add") fx.push({ type: "adjustZoneCurse", zone, amount });
    else if (mode === "remove") fx.push({ type: "adjustZoneCurse", zone, amount: -amount });
    else if (mode === "clamp") fx.push({ type: "clampZoneCurse", zone, value: num(group.curse.amount) });
  }
  return fx;
}
