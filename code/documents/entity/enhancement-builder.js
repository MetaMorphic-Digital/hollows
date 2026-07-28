import { addThreatToZoneSafe } from "../../canvas/overlays.js";
import {
  getActorTokenOnScene,
  getAdjacentZones,
  getHuntersInZone,
  getThreatInZone,
  getZoneList,
  isCloseZone,
  isRangedZone
} from "../../canvas/zone.js";
import { pickOne, promptForm } from "../../applications/apps/selection-dialogs.mjs";
import { createDefaultEntityInterrupt } from "../../data/entity/action-schema.js";
import { performEntityAttack } from "../../data/entity/actions/entity-attack.js";
import { triggerEntityInterrupt } from "../../data/entity/actions/entity-interrupt.js";
import {
  applyEntityShrugOff,
  openEntityTurnAroundDialog,
  performEntityManoeuvre,
  performEntityProwl,
  promptShiftHunterToAdjacentZone
} from "../../data/entity/actions/entity-manoeuvre.js";
import { requestAfterAttackApply } from "./attack-effects.js";
import { applyEntityActionCost, getEntityInterruptCost } from "./entity-threat.js";
import { adjustEntityResource, adjustHunterResource, StandardDamage } from "../actor/resources.js";
import { builderEnabled, dynamicAmount, getBuilder, list, selectedAbilityId } from "./enhancement-builder-passive.js";

function selectedAbility(enhancementItem) {
  const id = selectedAbilityId(enhancementItem);
  return id ? enhancementItem?.parent?.items?.get(id) || null : null;
}

function selectedStat(enhancementItem, fallback = "hard") {
  return String(enhancementItem?.getFlag?.("hollows", "chosenStat") || fallback);
}

function entityAbilityData(enhancementItem, name, system, img = enhancementItem.img) {
  return {
    name: String(name || enhancementItem.name || "Enhancement Ability"),
    type: "entityAbility",
    img,
    system,
    flags: { hollows: { generatedByEnhancement: enhancementItem.id } }
  };
}

function chat(entityActor, content) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: entityActor }),
    content: `<div class="hollows-chat">${content}</div>`
  });
}

function esc(value) {
  return foundry.utils.escapeHTML(String(value ?? ""));
}

function generatedAbilityData(enhancementItem, config = {}) {
  if (String(config.mode || "template") === "useExistingManoeuvre") {
    const choice = String(config.manoeuvre?.choice || "basic:prowl");
    const threatCost = choice === "basic:prowl" ? Math.max(0, Number(config.manoeuvre?.threatCost ?? 1) || 0) : 0;
    const system = createDefaultEntityInterrupt();
    system.profile.actionType = "other";
    system.profile.targetMode = "noTargets";
    system.profile.text = String(config.name || "Manoeuvre");
    system.cost.enabled = threatCost > 0;
    system.cost.type = "threat";
    system.cost.amount = threatCost;
    return entityAbilityData(enhancementItem, config.name || "Manoeuvre", system);
  }
  if (String(config.mode || "template") === "cloneSelectedAbility") {
    const chosen = selectedAbility(enhancementItem);
    if (!chosen) return null;
    const system = foundry.utils.deepClone(chosen.system);
    foundry.utils.mergeObject(system, config.overrides || {}, { inplace: true });
    const name = config.name || `${config.namePrefix || enhancementItem.name} ${chosen.name || "Ability"}`;
    return entityAbilityData(enhancementItem, name, system, chosen.img || enhancementItem.img);
  }
  const base = String(config.kind || "interrupt") === "interrupt" ? createDefaultEntityInterrupt() : {};
  const system = foundry.utils.mergeObject(foundry.utils.deepClone(base), config.system || {}, { inplace: false });
  if (config.defenceStatFromSelected) system.profile.defenceStat = selectedStat(enhancementItem, system.profile.defenceStat || "hard");
  return entityAbilityData(enhancementItem, config.name, system);
}

function generatedAbilityConfig(enhancementItem) {
  const config = getBuilder(enhancementItem).generatedAbility;
  return config && typeof config === "object" && Object.keys(config).length ? config : null;
}

export function getBuilderGeneratedAbility(enhancementItem) {
  if (!builderEnabled(enhancementItem)) return null;
  const config = generatedAbilityConfig(enhancementItem);
  return config ? generatedAbilityData(enhancementItem, config) : null;
}

function abilityEligible(item, rule = {}) {
  const kind = String(item.system?.kind || "");
  const kinds = list(rule.kinds).length ? list(rule.kinds).map((entry) => String(entry || "")) : [];
  if (kinds.length && !kinds.includes(kind)) return false;
  if (rule.targetMode && String(item.system?.profile?.targetMode || "") !== String(rule.targetMode)) return false;
  if (rule.requiresDamage && !abilityHasDamage(item)) return false;
  return true;
}

function abilityHasDamage(item) {
  return [item.system?.profile?.damage, item.system?.damage]
    .some((damage) => Number(damage?.resolve ?? 0) > 0 || Number(damage?.wounds ?? 0) > 0);
}

export function getBuilderEligibleActionFilter(enhancementItem) {
  const config = getBuilder(enhancementItem).configure || {};
  const rule = config.action || null;
  if (!rule) return null;
  const hasRule = list(rule.kinds).some((entry) => String(entry || ""))
    || !!rule.requiresDamage
    || !!String(rule.targetMode || "");
  if (!hasRule) return null;
  return (item) => item.type === "entityAbility" && abilityEligible(item, rule);
}

export function getBuilderActionChoiceLabel(enhancementItem) {
  return String(getBuilder(enhancementItem).configure?.action?.label || "Choose Ability");
}

export async function configureEnhancementBuilder(enhancementItem) {
  const config = getBuilder(enhancementItem).configure || {};
  const updateData = {};
  if (config.stat?.enabled) {
    const fallback = String(config.stat.default || "hard");
    const stat = await pickOne({
      title: config.stat.title || "Choose Stat",
      label: "Stat",
      options: ["hard", "quick", "sharp", "strong", "wise"].map((value) => ({ value, label: value, selected: value === fallback }))
    }) ?? fallback;
    updateData["flags.hollows.chosenStat"] = stat;
  }
  return updateData;
}

function generatedConfigFor(entityActor, abilityItem) {
  const enhancementId = String(abilityItem?.getFlag?.("hollows", "generatedByEnhancement") || "");
  if (!enhancementId) return null;
  const enhancementItem = entityActor?.items?.get(enhancementId) || null;
  if (enhancementItem?.type !== "entityEnhancement") return null;
  return generatedAbilityConfig(enhancementItem);
}

function threatenedProwlOptions(entityActor, ability, abilityItem) {
  const cost = getEntityInterruptCost(ability, entityActor);
  const sourceZoneFilter = (zone) => (cost <= 0 || getThreatInZone(zone) >= cost)
    && getHuntersInZone(zone).length > 0
    && getAdjacentZones(zone).some((adjacent) => isCloseZone(adjacent) || isRangedZone(adjacent));
  return {
    title: abilityItem?.name || "Prowl",
    testName: abilityItem?.name || "Prowl",
    sourceLabel: "Target Zone",
    destinationLabel: "Adjacent Close/Ranged Zone",
    sourceZoneFilter,
    destinationFilter: (zone) => isCloseZone(zone) || isRangedZone(zone),
    noSourceZonesMessage: "No zone has enough Threat for this ability.",
    cost,
    spendCostFromSourceZone: true,
    costFailureMessage: "Not enough Threat in that zone."
  };
}

export function builderGeneratedAbilityFeasible({ entityActor, ability, abilityItem } = {}) {
  const config = generatedConfigFor(entityActor, abilityItem);
  if (String(config?.mode || "") !== "useExistingManoeuvre") return false;
  const choice = String(config?.manoeuvre?.choice || "basic:prowl");
  if (choice === "basic:shrug" || choice === "basic:turn") return true;
  if (choice.startsWith("item:")) {
    const item = entityActor?.items?.get(choice.slice(5));
    return item?.type === "entityAbility" && String(item.system?.kind || "") === "manoeuvre";
  }
  if (choice !== "basic:prowl") return false;
  const options = threatenedProwlOptions(entityActor, ability, abilityItem);
  return getZoneList().some((zone) => options.sourceZoneFilter(zone));
}

export async function executeBuilderGeneratedAbility({ entityActor, ability, abilityItem } = {}) {
  const config = generatedConfigFor(entityActor, abilityItem);
  if (String(config?.mode || "") !== "useExistingManoeuvre") return { handled: false, result: false };
  const choice = String(config?.manoeuvre?.choice || "basic:prowl");
  if (choice === "basic:prowl") {
    return {
      handled: true,
      result: await performEntityProwl(entityActor, threatenedProwlOptions(entityActor, ability, abilityItem))
    };
  }
  if (choice === "basic:shrug") return { handled: true, result: await applyEntityShrugOff(entityActor) };
  if (choice === "basic:turn") return { handled: true, result: await openEntityTurnAroundDialog(entityActor) };
  if (choice.startsWith("item:")) {
    const item = entityActor?.items?.get(choice.slice(5));
    if (item?.type !== "entityAbility" || String(item.system?.kind || "") !== "manoeuvre") return { handled: true, result: false };
    return { handled: true, result: await performEntityManoeuvre(entityActor, item) };
  }
  return { handled: true, result: false };
}

function triggerMatches(trigger, hookName, context = {}) {
  if (String(trigger.hook || "") !== String(hookName || "")) return false;
  if (trigger.stage && String(trigger.stage) !== String(context.stage || "")) return false;
  if (trigger.damageType && String(trigger.damageType) !== String(context.damageType || "")) return false;
  if (trigger.minDamage !== undefined && Number(context.damageValue ?? 0) < Number(trigger.minDamage)) return false;
  if (trigger.condition === "hunterBreaks" && !(Number(context.previousResolve ?? 0) > 0 && Number(context.nextResolve ?? 0) <= 0)) return false;
  if (trigger.condition === "noWoundDamage" && context.anyWoundDamage) return false;
  return true;
}

function combatRoundKey() {
  const combat = game.combat;
  return combat?.started ? { combatId: String(combat.id || ""), round: Number(combat.round ?? 0) } : null;
}

async function runBuilderOperation(effect, context = {}) {
  const entityActor = context.entityActor;
  const op = String(effect.operation || "");
  if (op === "chat") {
    await chat(entityActor, String(effect.text || ""));
  }
  if (op === "damageHuntersInZones") {
    const hunters = [...new Map(list(effect.zones).flatMap((zone) => getHuntersInZone(zone)).map((hunter) => [hunter.id, hunter])).values()];
    for (const hunter of hunters) {
      const damage = StandardDamage.resolve(effect.damage || {}, {
        mode: "defence",
        outcomeLabel: "Success",
        targetResolve: StandardDamage.targetResolve(hunter)
      });
      if (damage.damageType) await adjustHunterResource(hunter, damage.damageType === "Wounds" ? { wounds: -damage.damageValue } : { resolve: -damage.damageValue });
    }
  }
  if (op === "destroyTerrain") {
    if (!context.target) return undefined;
    await requestAfterAttackApply(context.target, context.targetZone, [{
      applyIfLogic: "and",
      applyIfConditions: [{ condition: "always" }],
      destroyTerrain: true
    }], entityActor?.id || "", null);
  }
  if (op === "promptShiftHunter") {
    await promptShiftHunterToAdjacentZone(entityActor || context.target, context.target, effect.title || "Shift", context.targetZone);
  }
  if (op === "damageEventHunter") {
    if (!context.target) return undefined;
    const result = await adjustHunterResource(context.target, {
      resolve: -Number(effect.damage?.resolve ?? 0),
      wounds: -Number(effect.damage?.wounds ?? 0)
    });
    return { nextResolve: result.resolve.after, nextWounds: result.wounds.after };
  }
  if (op === "addThreatToEventZone") {
    if (!context.targetZone) return undefined;
    await addThreatToZoneSafe(context.targetZone, Number(effect.amount ?? 0));
  }
  if (op === "entityResource") {
    const roundKey = effect.oncePerRound ? combatRoundKey() : null;
    const onceKey = String(effect.onceKey || `${context.enhancementItem?.id || "enhancement"}:${op}`);
    const used = roundKey ? entityActor.getFlag("hollows", "enhancementBuilderOnce") || {} : {};
    const state = used[onceKey] || {};
    if (roundKey && String(state.combatId || "") === roundKey.combatId && Number(state.round ?? 0) === roundKey.round) return undefined;
    const multiplier = String(effect.amountMode || "fixed") === "dynamic" ? dynamicAmount(effect.amountSource, context) : 1;
    const resolve = (Number(effect.resolve ?? 0) || 0) * multiplier;
    const wounds = (Number(effect.wounds ?? 0) || 0) * multiplier;
    if (!resolve && !wounds) return undefined;
    await adjustEntityResource(entityActor, { resolve, wounds });
    if (roundKey) await entityActor.setFlag("hollows", "enhancementBuilderOnce", { ...used, [onceKey]: roundKey });
    if (effect.chatLabel) {
      await chat(entityActor, `<strong>${esc(entityActor.name)}</strong>: ${esc(effect.chatLabel)}.`);
    }
  }
  if (op === "promptEntityResolveCost") {
    if (String(context.builderMode || "") !== "advanced") return { cancelled: false };
    const choice = await promptForm({
      title: effect.title || context.actionName || "Entity Resolve Cost",
      fields: [{ type: "checkbox", name: "apply", label: effect.prompt || "Apply extra Resolve cost?" }],
      applyLabel: "Continue"
    });
    if (!choice) return { cancelled: true };
    if (!choice.apply) return { cancelled: false };
    const ok = await applyEntityActionCost({ cost: { enabled: true, type: "entityResolve", amount: Number(effect.amount ?? 2) } }, entityActor, context.targets || []);
    return { cancelled: !ok };
  }
  if (op === "runEntityAbilityAgainstEventHunter") {
    const sourceHunter = context.sourceHunter;
    if (!sourceHunter) {
      await chat(entityActor, `<strong>${esc(effect.title || "Reaction")}</strong>: ${esc(entityActor.name)} may immediately make an attack or Interrupt against <strong>the Hunter who inflicted the damage</strong>. That target defends with advantage.`);
      return undefined;
    }
    const abilities = entityActor.items.filter((item) => item.type === "entityAbility" && ["attack", "interrupt"].includes(String(item.system?.kind || "")));
    if (!abilities.length) return undefined;
    const itemId = await pickOne({
      title: effect.title || "Reaction",
      label: "Counteraction",
      applyLabel: "Use",
      options: abilities.map((item) => ({ value: item.id, label: item.name || "Ability" }))
    }) ?? "";
    const item = abilities.find((entry) => entry.id === itemId);
    if (!item) return undefined;
    const token = getActorTokenOnScene(sourceHunter);
    if (!token) {
      ui.notifications.warn(`${effect.title || "Reaction"}: the target has no token on this scene.`);
      return undefined;
    }
    const flowOptions = { forcedTargets: [token], forceDefenceAdvantage: true, reaction: true };
    return item.system?.kind === "interrupt"
      ? triggerEntityInterrupt(entityActor, item.system, item, flowOptions)
      : performEntityAttack(entityActor, item, flowOptions);
  }
  if (op === "stagedBreakRepositionReminder") {
    const combatId = String(game.combat?.id || "");
    const stateKey = String(effect.stateKey || "breakRepositionReminder");
    const state = entityActor.getFlag("hollows", stateKey) || {};
    const brokenCount = String(state.combatId || "") === combatId ? Number(state.brokenCount ?? 0) : 0;
    await entityActor.setFlag("hollows", stateKey, { combatId, brokenCount: brokenCount + 1 });
    const text = brokenCount <= 0
      ? String(effect.firstText || "Reposition all Hunters to adjacent Close or Ranged areas.")
      : String(effect.laterText || `Reposition only ${context.sourceHunter?.name || "the Hunter who Broke the Entity"} to an adjacent Close or Ranged area.`);
    await chat(entityActor, `<strong>${esc(effect.title || "Reposition")}</strong>: ${esc(text)}`);
  }
  return undefined;
}

export async function runEnhancementBuilderHook(enhancementItem, hookName, context = {}) {
  if (!builderEnabled(enhancementItem)) return [];
  const results = [];
  for (const trigger of list(getBuilder(enhancementItem).triggers)) {
    if (!triggerMatches(trigger, hookName, context)) continue;
    for (const effect of list(trigger.effects)) {
      const result = await runBuilderOperation(effect, { ...context, enhancementItem });
      if (result !== undefined) results.push(result);
    }
  }
  return results;
}
