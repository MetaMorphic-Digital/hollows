import {
  confirmReplaceHunterRelic,
  applyRelicReplacementForHunter,
  getEquipmentSlotKey,
  getHunterEquipmentItemsForSlot,
  syncEquipmentSlotsFromItems,
} from "../documents/actor/hunter-equipment.js";
import { isShotgunWeapon, setShotgunsLoaded, hasWeaponEquipped } from "./weapon-utils.js";
import { addCondition, removeCondition } from "../documents/actor/conditions.js";
import { HOLLOWS_CONDITIONS } from "../data/_module.mjs";
import { getFocusCount, setFocusCount } from "../documents/actor/resources.js";
import { applyEchoAcquisition, handleCorruptionIncrease } from "../documents/actor/echo.js";
import { maybeTriggerEntityCurseThresholdAbilities } from "../data/entity/actions/entity-special.js";
import { triggerEntityWhenBrokenAbilities } from "../data/entity/actions/entity-broken.js";
import { checkCypherUpgrades } from "../documents/item/relic-cypher.js";
import { runRelicTriggers } from "../data/relic/apply-effect.js";
import {
  deleteGeneratedEnhancementAbility,
  runEntityWhenBrokenEnhancements,
  syncGeneratedEnhancementAbility,
} from "../documents/entity/entity-enhancements.js";
import { runDeathInterceptors, runOnDeathEffects } from "./weapon-abilities/dispatchers.js";
import { syncHunterLoadedStatusFromShotguns } from "./weapon-utils.js";
import { applyInterceptorsSync } from "./extensions.js";

const HOLLOWS_ENTITY_RESOLVE_PRE_UPDATE = new Map();
const HOLLOWS_HUNTER_CORRUPTION_PRE_UPDATE = new Map();
const HOLLOWS_THRALL_WOUNDS_PRE_UPDATE = new Map();

async function syncGeneratedAbilityForEnhancementItem(item) {
  if (!game.user?.isGM) return;
  if (item?.type !== "entityEnhancement") return;
  await syncGeneratedEnhancementAbility(item);
}

async function deleteGeneratedAbilityForEnhancementItem(item, options) {
  if (!game.user?.isGM) return;
  if (item?.type !== "entityEnhancement") return;
  if (options?.hollowsSkipGeneratedCleanup) return;
  await deleteGeneratedEnhancementAbility(item);
}

async function replaceHunterRelicFlow(actor, itemData) {
  const ok = await confirmReplaceHunterRelic(actor, itemData?.name || "Relic");
  if (!ok) return;
  await applyRelicReplacementForHunter(actor);
  await actor.createEmbeddedDocuments("Item", [itemData], { hollowsSkipEquipmentSlotCheck: true });
}

export function registerActorHooks() {
  Hooks.on("preCreateItem", (item, data, options, userId) => {
    if (item.type !== "weaponAbility") return;
    const hasDuration = foundry.utils.getProperty(data, "system.durationType");
    if (!hasDuration) {
      item.updateSource({ "system.durationType": "permanent" });
    }
    const hasBound = foundry.utils.getProperty(data, "system.boundWeaponId");
    if (hasBound === undefined) {
      item.updateSource({ "system.boundWeaponId": "" });
    }
  });

  // Sync on purpose: an async listener returns a Promise and `return false`
  // can no longer veto the creation. The relic confirm flow therefore vetoes
  // first and re-creates with `hollowsSkipEquipmentSlotCheck` after the dialog.
  Hooks.on("preCreateItem", (item, data, options) => {
    const actor = item?.parent;
    if (!actor || actor.type !== "hunter") return;
    if (options?.hollowsSkipEquipmentSlotCheck) return;
    if (applyInterceptorsSync("hunter-equipment-pre-create", { actor, item, data, options }, true) === false) return false;
    if (item.type === "relic") {
      replaceHunterRelicFlow(actor, item.toObject());
      return false;
    }
    if (item.type !== "equipment") return;
    const category = foundry.utils.getProperty(data, "system.category") ?? item.system?.category;
    const slot = getEquipmentSlotKey(category);
    if (!slot) return;
    const existing = getHunterEquipmentItemsForSlot(actor, slot);
    if (existing.length >= 1) {
      ui.notifications.warn(`Only one ${slot} equipment can be equipped at a time.`);
      return false;
    }
  });

  Hooks.on("preUpdateItem", (item, changes, options) => {
    if (item.type !== "equipment") return;
    const actor = item?.parent;
    if (!actor || actor.type !== "hunter") return;
    if (!foundry.utils.hasProperty(changes, "system.category")) return;
    if (applyInterceptorsSync("hunter-equipment-pre-update", { actor, item, changes, options }, true) === false) return false;
    const category = foundry.utils.getProperty(changes, "system.category");
    const slot = getEquipmentSlotKey(category);
    if (!slot) return;
    const existing = getHunterEquipmentItemsForSlot(actor, slot).filter((entry) => entry.id !== item.id);
    if (existing.length >= 1) {
      ui.notifications.warn(`Only one ${slot} equipment can be equipped at a time.`);
      return false;
    }
  });

  Hooks.on("updateActor", async (actor, changed) => {
    if (!game.user.isGM) return;
    if (actor?.type !== "hunter") return;
    const resolveChanged = foundry.utils.hasProperty(changed, "system.health.resolve.value");
    if (!resolveChanged) return;
    const resolveValue = Number(actor.system?.health?.resolve?.value ?? 0);
    if (resolveValue <= 0) {
      if (hasWeaponEquipped(actor, "Armour") && actor.statuses.has("ready")) {
        // Involuntary loss (Resolve hit 0) — not an "expend", so Barbed etc.
        // must not trigger.
        await removeCondition(actor, "ready", { skipReactionDispatch: true });
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `<div class="hollows-chat"><strong>${actor.name}</strong> becomes <strong>Unready</strong> (Broken).</div>`,
        });
      }
      if (hasWeaponEquipped(actor, "Rifle") && (getFocusCount(actor) > 0)) {
        await setFocusCount(actor, 0);
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `<div class="hollows-chat"><strong>${actor.name}</strong> loses all <strong>Focus</strong> (Broken).</div>`,
        });
      }
    }
  });

  Hooks.on("updateActor", async (actor, changed) => {
    if (!game.user.isGM) return;
    if (!actor || (actor.type !== "hunter")) return;
    const woundsChanged = foundry.utils.hasProperty(changed, "system.health.wounds.value");
    if (!woundsChanged) return;
    if (actor.getFlag("hollows", "replaceDyingStateProcessing")) return;
    const woundsValue = Number(actor.system?.health?.wounds?.value ?? 0);
    if (woundsValue > 0) return;
    if (actor.statuses.has("dead")) return;

    if (await runDeathInterceptors(actor)) return;
    if (!actor.isRevivable) {
      await removeCondition(actor, "dying");
      await addCondition(actor, "dead");
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="hollows-chat"><strong>${actor.name}</strong> has died.</div>`,
      });
      await runOnDeathEffects(actor);
      return;
    }
    if (!actor.statuses.has("dying")) {
      await addCondition(actor, "dying");
    }
    const resolveValue = Number(actor.system?.health?.resolve?.value ?? 0);
    if (resolveValue > 0) {
      await actor.update({ "system.health.resolve.value": 0 });
    }
  });

  Hooks.on("preUpdateActor", (actor, changed) => {
    if (!actor || (actor.type !== "hunter")) return;
    const corruptionChanged = foundry.utils.hasProperty(changed, "system.corruption.value");
    if (!corruptionChanged) return;
    const current = Number(actor.system?.corruption?.value ?? 0);
    HOLLOWS_HUNTER_CORRUPTION_PRE_UPDATE.set(actor.id, current);
  });

  Hooks.on("updateActor", async (actor, changed) => {
    if (!actor || (actor.type !== "hunter")) return;
    const corruptionChanged = foundry.utils.hasProperty(changed, "system.corruption.value");
    if (!corruptionChanged) return;
    const prev = HOLLOWS_HUNTER_CORRUPTION_PRE_UPDATE.get(actor.id);
    HOLLOWS_HUNTER_CORRUPTION_PRE_UPDATE.delete(actor.id);
    if (prev === undefined || prev === null) return;
    const next = Number(actor.system?.corruption?.value ?? 0);
    if (next <= prev) return;
    await handleCorruptionIncrease(actor, prev, next);
  });

  Hooks.on("preUpdateActor", (actor, changed) => {
    if (!actor || actor.type !== "entity") return;
    const resolveChanged = foundry.utils.hasProperty(changed, "system.health.resolve.value");
    if (!resolveChanged) return;
    const current = Number(actor.system?.health?.resolve?.value ?? 0);
    HOLLOWS_ENTITY_RESOLVE_PRE_UPDATE.set(actor.id, current);
  });

  Hooks.on("preUpdateActor", (actor, changed) => {
    if (!actor || actor.type !== "thrall") return;
    if (!foundry.utils.hasProperty(changed, "system.health.wounds.value")) return;
    HOLLOWS_THRALL_WOUNDS_PRE_UPDATE.set(actor.id, Number(actor.system?.health?.wounds?.value ?? 0));
  });

  Hooks.on("preUpdateActor", async (actor, changed, options) => {
    if (!actor || actor.type !== "hollow") return;
    if (options?.hollowsSkipActiveCheck) return;
    const nextStatus = foundry.utils.getProperty(changed, "system.status");
    if (String(nextStatus || "") !== "active") return;
    const others = game.actors.filter(a =>
      a.type === "hollow" &&
      a.id !== actor.id &&
      String(a.system?.status || "") === "active",
    );
    for (const other of others) {
      await other.update({ "system.status": "dormant" }, { hollowsSkipActiveCheck: true });
    }
  });

  Hooks.on("updateActor", async (actor, changed) => {
    if (!game.user?.isGM) return;
    if (!actor || !["hunter", "entity"].includes(String(actor.type || ""))) return;
    if (!foundry.utils.hasProperty(changed, "system.curse.value")) return;
    await maybeTriggerEntityCurseThresholdAbilities(actor);
  });

  Hooks.on("updateActor", async (actor, changed, options) => {
    if (!game.user?.isGM) return;
    if (!actor || actor.type !== "entity") return;
    const resolveChanged = foundry.utils.hasProperty(changed, "system.health.resolve.value");
    if (!resolveChanged) return;
    const prev = HOLLOWS_ENTITY_RESOLVE_PRE_UPDATE.get(actor.id);
    HOLLOWS_ENTITY_RESOLVE_PRE_UPDATE.delete(actor.id);
    if (prev === undefined || prev === null) return;
    const next = Number(actor.system?.health?.resolve?.value ?? 0);
    if ((next > prev) && actor.statuses.has("bleeding")) {
      await removeCondition(actor, "bleeding");
    }
    const becameBroken = (prev > 0) && (next <= 0);
    if (!becameBroken) return;
    const sourceHunter = options?.hollowsSourceHunterId ? game.actors.get(options.hollowsSourceHunterId) : null;
    await triggerEntityWhenBrokenAbilities(actor, sourceHunter);
    await runEntityWhenBrokenEnhancements(actor, { sourceHunter });
    await checkCypherUpgrades("entityDefeated", actor.id);
    await runRelicTriggers("onEntityBroken");
  });

  Hooks.on("updateActor", async (actor, changed) => {
    if (!game.user?.isGM) return;
    if (!actor || actor.type !== "thrall") return;
    if (!foundry.utils.hasProperty(changed, "system.health.wounds.value")) return;
    const prev = HOLLOWS_THRALL_WOUNDS_PRE_UPDATE.get(actor.id);
    HOLLOWS_THRALL_WOUNDS_PRE_UPDATE.delete(actor.id);
    if (prev === undefined || prev === null) return;
    const next = Number(actor.system?.health?.wounds?.value ?? 0);
    if (prev > 0 && next <= 0) await checkCypherUpgrades("thrallDefeated", actor.id);
  });

  Hooks.on("updateItem", async (item) => {
    if (!game.user?.isGM) return;
    const actor = item?.parent;
    if (!actor || actor.type !== "hunter" || item.type !== "weapon") return;
    if (isShotgunWeapon(item)) {
      await syncHunterLoadedStatusFromShotguns(actor);
    }
  });

  Hooks.on("preUpdateItem", (item, changed) => {
    if (!item || item.type !== "weapon") return;
    if (!isShotgunWeapon(item)) return;
    if (!foundry.utils.hasProperty(changed, "system.loaded")) return;
    const raw = foundry.utils.getProperty(changed, "system.loaded");
    if (typeof raw === "string") {
      foundry.utils.setProperty(changed, "system.loaded", raw === "true");
    }
  });

  Hooks.on("updateItem", async (item) => {
    if (!game.user?.isGM) return;
    const actor = item?.parent;
    if (!actor || actor.type !== "hunter" || (item.type !== "equipment" && item.type !== "relic")) return;
    await syncEquipmentSlotsFromItems(actor);
  });

  Hooks.on("createItem", syncGeneratedAbilityForEnhancementItem);
  Hooks.on("updateItem", syncGeneratedAbilityForEnhancementItem);
  Hooks.on("deleteItem", deleteGeneratedAbilityForEnhancementItem);

  Hooks.on("createItem", async (item, _options, userId) => {
    if (userId && game.user?.id !== userId) return;
    const actor = item?.parent;
    if (!actor || actor.type !== "hunter" || item.type !== "echo") return;
    await applyEchoAcquisition(actor, item);
  });

  Hooks.on("createItem", async (item) => {
    if (!game.user?.isGM) return;
    const actor = item?.parent;
    if (!actor || actor.type !== "hunter" || item.type !== "weapon") return;
    if (isShotgunWeapon(item) && item.system?.loaded === undefined) {
      await item.update({ "system.loaded": true });
    }
    if (isShotgunWeapon(item)) {
      await syncHunterLoadedStatusFromShotguns(actor);
    }
  });

  Hooks.on("createItem", async (item) => {
    if (!game.user?.isGM) return;
    const actor = item?.parent;
    if (!actor || actor.type !== "hunter" || (item.type !== "equipment" && item.type !== "relic")) return;
    await syncEquipmentSlotsFromItems(actor);
  });

  Hooks.on("deleteItem", async (item) => {
    if (!game.user?.isGM) return;
    const actor = item?.parent;
    if (!actor || actor.type !== "hunter" || item.type !== "weapon") return;
    if (isShotgunWeapon(item)) {
      await syncHunterLoadedStatusFromShotguns(actor);
    }
    if (!hasWeaponEquipped(actor, "Armour") && actor.statuses.has("ready")) {
      // Armour removed — involuntary Ready loss, not an "expend".
      await removeCondition(actor, "ready", { skipReactionDispatch: true });
    }
  });

  Hooks.on("deleteItem", async (item) => {
    if (!game.user?.isGM) return;
    const actor = item?.parent;
    if (!actor || actor.type !== "hunter" || (item.type !== "equipment" && item.type !== "relic")) return;
    await syncEquipmentSlotsFromItems(actor);
  });

  Hooks.on("deleteActiveEffect", async (effect) => {
    const actor = effect?.parent;
    if (!actor || (actor.type !== "hunter")) return;
    if (!game.user?.isGM && !actor.testUserPermission(game.user, "OWNER")) return;
    const focusId = HOLLOWS_CONDITIONS?.focus?.id;
    const loadedId = HOLLOWS_CONDITIONS?.loaded?.id;
    const effectKey = effect?.flags?.hollows?.conditionKey;
    const hasFocusStatus = focusId && (effect.statuses?.has?.(focusId) || effect.statuses?.includes?.(focusId));
    const hasLoadedStatus = loadedId && (effect.statuses?.has?.(loadedId) || effect.statuses?.includes?.(loadedId));
    if ((effectKey === "focus") || hasFocusStatus) {
      await setFocusCount(actor, 0);
    }
    if ((effectKey === "loaded") || hasLoadedStatus) {
      await setShotgunsLoaded(actor, false);
    }
  });

  Hooks.on("updateActiveEffect", async (effect, changed) => {
    const actor = effect?.parent;
    if (!actor || actor.type !== "hunter") return;
    if (!game.user?.isGM && !actor.testUserPermission(game.user, "OWNER")) return;
    if (!Object.prototype.hasOwnProperty.call(changed || {}, "disabled")) return;
    if (!changed.disabled) return;
    const focusId = HOLLOWS_CONDITIONS?.focus?.id;
    const loadedId = HOLLOWS_CONDITIONS?.loaded?.id;
    const effectKey = effect?.flags?.hollows?.conditionKey;
    const hasFocusStatus = focusId && (effect.statuses?.has?.(focusId) || effect.statuses?.includes?.(focusId));
    const hasLoadedStatus = loadedId && (effect.statuses?.has?.(loadedId) || effect.statuses?.includes?.(loadedId));
    if (effectKey === "focus" || hasFocusStatus) {
      await setFocusCount(actor, 0);
    }
    if (effectKey === "loaded" || hasLoadedStatus) {
      await setShotgunsLoaded(actor, false);
    }
  });
}
