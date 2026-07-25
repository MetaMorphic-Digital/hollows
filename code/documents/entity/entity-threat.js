import {
  getTokenZone, getThreatInZone, isThreatZone, getZoneCurseValue, getZoneRegionDoc
} from "../../canvas/zone.js";
import { spendThreatFromZones, updateRegionCurse } from "../../canvas/overlays.js";
import { adjustEntityResource } from "../actor/resources.js";
import { runRelicTriggers } from "../../data/relic/apply-effect.js";
import { getEntitySelfActionCostDelta } from "../../helpers/entity-dispatchers.js";
import { getEntityAbilityCostDelta } from "../../helpers/weapon-abilities/dispatchers.js";

export function getEntityActionCost(action, amountOverride = null) {
  const cost = action?.cost || {};
  return {
    type: cost.enabled ? String(cost.type || "threat") : "threat",
    amount: Math.max(0, Number(amountOverride ?? (cost.enabled ? cost.amount : 0) ?? 0) || 0)
  };
}

export function getEntityInterruptCost(interrupt, entityActor, interruptItem = null) {
  const { type, amount } = getEntityActionCost(interrupt);
  if (type !== "threat") return amount;
  const abilityDelta = getEntityAbilityCostDelta(entityActor, "interrupt").threat || 0;
  const selfDelta = getEntitySelfActionCostDelta(entityActor, {
    actionItem: interruptItem,
    actionConfig: interrupt,
    actionKind: "interrupt",
    actionType: "interrupt"
  }).threat || 0;
  return Math.max(0, amount + abilityDelta + selfDelta);
}

export function getEntityAttackCost(attack, entityActor, attackItem = null) {
  const { type, amount } = getEntityActionCost(attack);
  if (type !== "threat") return amount;
  const selfDelta = getEntitySelfActionCostDelta(entityActor, {
    actionItem: attackItem,
    actionConfig: attack,
    actionKind: "attack",
    actionType: "attack"
  }).threat || 0;
  return Math.max(0, amount + selfDelta);
}

export async function applyEntityActionCost(action, entityActor, targets, zonesOverride = null, options = {}) {
  const { type, amount } = getEntityActionCost(action, options.amount);
  if (!amount) return true;
  const source = String(options.source || "entityAction");
  const targetZones = Array.from(new Set((zonesOverride || []).filter((z) => !!z)));
  if (!targetZones.length) {
    targetZones.push(...Array.from(new Set((targets || []).map((t) => getTokenZone(t)).filter((z) => !!z))));
  }
  if (type === "threat") {
    if (!targetZones.length) { ui.notifications.warn("No target zones available for Threat cost."); return false; }
    const ok = await spendThreatFromZones(targetZones, amount, { source });
    if (!ok && options.warn !== false) ui.notifications.warn("Not enough Threat to pay action cost.");
    return ok;
  }
  if (type === "entityResolve") {
    const cur = Number(entityActor.system?.health?.resolve?.value ?? 0);
    if (cur < amount) { ui.notifications.warn("Not enough Entity Resolve to pay action cost."); return false; }
    await adjustEntityResource(entityActor, { resolve: -amount });
    return true;
  }
  if (type === "entityWounds") {
    const cur = Number(entityActor.system?.health?.wounds?.value ?? 0);
    if (cur < amount) { ui.notifications.warn("Not enough Entity Wounds to pay action cost."); return false; }
    await adjustEntityResource(entityActor, { wounds: -amount });
    return true;
  }
  if (type === "entityCurse") {
    const cur = Number(entityActor.system?.curse?.value ?? 0);
    if (cur < amount) { ui.notifications.warn("Not enough Entity Curse to pay action cost."); return false; }
    await entityActor.update({ "system.curse.value": Math.max(0, cur - amount) });
    await runRelicTriggers("onEntityCurse");
    return true;
  }
  if (type === "hunterCurse") {
    if (!targets?.length) { ui.notifications.warn("No targets available for Hunter Curse cost."); return false; }
    for (const t of targets) {
      const cur = Number(t.actor?.system?.curse?.value ?? 0);
      if (cur < amount) { ui.notifications.warn("Not enough Hunter Curse to pay action cost."); return false; }
    }
    for (const t of targets) {
      const cur = Number(t.actor?.system?.curse?.value ?? 0);
      await t.actor.update({ "system.curse.value": Math.max(0, cur - amount) });
    }
    return true;
  }
  if (type === "zoneCurse") {
    if (!targetZones.length) { ui.notifications.warn("No target zones available for Zone Curse cost."); return false; }
    for (const z of targetZones) {
      const cur = getZoneCurseValue(z);
      if (cur < amount) { ui.notifications.warn("Not enough Zone Curse to pay action cost."); return false; }
    }
    for (const z of targetZones) {
      const region = getZoneRegionDoc(z);
      const cur = getZoneCurseValue(z);
      if (region) await updateRegionCurse(region, Math.max(0, cur - amount));
    }
    return true;
  }
  if (type === "closeDefence" || type === "rangedDefence" || type === "wyrdDefence") {
    const key = type === "closeDefence" ? "close" : type === "rangedDefence" ? "ranged" : "wyrd";
    const cur = Number(entityActor.system?.defences?.[key] ?? 0);
    if (cur < amount) { ui.notifications.warn("Not enough Defence value to pay action cost."); return false; }
    await entityActor.update({ [`system.defences.${key}`]: Math.max(0, cur - amount) });
    return true;
  }
  if (type === "entityTerrain") {
    const tag = String(action?.cost?.terrainTag || "any");
    const { getEntityTerrainCounts, getEntityTerrainTotal } = await import("../actor/conditions.js");
    const available = tag === "any" ? getEntityTerrainTotal(entityActor) : Math.max(0, Number(getEntityTerrainCounts(entityActor)[tag] || 0));
    if (available < amount) { ui.notifications.warn("Not enough Entity terrain tags to pay action cost."); return false; }
    const { adjustEntityTerrain } = await import("../../canvas/terrain-pool.js");
    await adjustEntityTerrain(entityActor, tag, -amount, { fromPool: false });
    return true;
  }
  return true;
}

export async function promptEntityThreatEnhance(entityActor, targets, { attackName = "Attack" } = {}) {
  const zoneSpend = {};
  if (!game.user?.isGM) return { zoneSpend };
  const targetZones = Array.from(new Set((targets || []).map((t) => getTokenZone(t)).filter((z) => !!z)));
  const { getThreatLockedZones } = await import("../../helpers/weapon-abilities/dispatchers.js");
  const lockedForSpend = getThreatLockedZones("spend");
  const spendableZones = targetZones.filter((z) => isThreatZone(z) && getThreatInZone(z) > 0 && !lockedForSpend.has(z));
  if (!spendableZones.length) return { zoneSpend };
  const rows = spendableZones.map((z) => {
    const available = getThreatInZone(z);
    return `
            <div class="form-group">
              <label>${z} (available: ${available})</label>
              <input type="number" name="spend-${foundry.utils.escapeHTML(z)}" min="0" max="${available}" value="0" />
              <small>Each Threat adds +2 TN for defenders in this zone.</small>
            </div>
          `;
  }).join("");
  await foundry.applications.api.DialogV2.wait({
    window: { title: `${attackName}: Threat Spend` },
    content: `<form class="hollows-roll-dialog">${rows}</form>`,
    buttons: [
      { action: "apply", label: "Apply", default: true, callback: async (_e, _b, dialog) => {
        for (const zoneId of spendableZones) {
          const available = getThreatInZone(zoneId);
          const raw = Number(dialog.element.querySelector(`[name="spend-${zoneId}"]`)?.value ?? 0);
          const spend = Math.max(0, Math.min(available, Number.isNaN(raw) ? 0 : raw));
          zoneSpend[zoneId] = spend;
          if (spend > 0) {
            await spendThreatFromZones([zoneId], spend, { source: "entityAction" });
          }
        }
      }}
    ],
    rejectClose: false
  });
  return { zoneSpend };
}

const THREAT_ENHANCEMENT_MODIFIERS = [];

export function registerThreatEnhancementModifier(fn) {
  THREAT_ENHANCEMENT_MODIFIERS.push(fn);
}

export function getEffectiveThreatEnhancement(target, spentInZone) {
  let effective = spentInZone;
  for (const fn of THREAT_ENHANCEMENT_MODIFIERS) {
    effective = fn(target, effective) ?? effective;
  }
  return effective;
}
