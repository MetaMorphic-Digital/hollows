import {
  getActorZone,
  getActorTokenOnScene,
  getTokenZone,
  getThreatInZone,
  isThreatZone
} from "../../../canvas/zone.js";
import {
  buildEntityAfterAttackConfigs,
  getBeforeAttackTargetSnapshot,
  getEntityActionDamageBonus,
  getEntityActionTNBonus,
  getEntityModifyIfResult,
  hasEnabledAfterAttackGroups,
  isInterruptFeasible,
  resolveEntityAbilityDamage,
  resolveEntityAbilityTN
} from "../action-rules.js";
import { requestAfterAttackApply } from "../../../documents/entity/attack-effects.js";
import { runEntityActionPauses } from "../../../helpers/weapon-abilities/dispatchers.js";
import {
  applyEntityActionCost,
  getEntityActionCost,
  getEntityInterruptCost
} from "../../../documents/entity/entity-threat.js";
import { getEntitySelfActionTargetingOverride } from "../../../helpers/entity-dispatchers.js";
import {
  builderGeneratedAbilityFeasible,
  executeBuilderGeneratedAbility
} from "../../../documents/entity/enhancement-builder.js";
import {
  resolveActionTargets,
  resolveRestoreResolve,
  runEntityAction
} from "../action-flow.js";
import { createEntityDefenceRequest, createEntityNoticeCard, createEntityTestRequest, getEntityActionWhisper } from "../action-cards.js";

export async function triggerEntityInterrupt(entityActor, interrupt, interruptItem = null, options = {}) {
  if (!entityActor || !interrupt) return false;
  const ctx = {
    entityActor,
    actionItem: interruptItem,
    action: interrupt,
    kind: "interrupt",
    actionType: String(interrupt.profile.actionType || "attack"),
    options,
    targets: [],
    selectedZones: [],
    noTargetsMessage: "No valid targets for this Interrupt.",
    scratch: {
      forceAdvantage: !!options.forceDefenceAdvantage,
      interruptCost: getEntityInterruptCost(interrupt, entityActor, interruptItem),
      interruptCostType: getEntityActionCost(interrupt).type
    }
  };
  return runEntityAction(ctx, interruptPipeline);
}

const interruptPipeline = {
  async preflight(ctx) {
    const generatedExecution = await executeBuilderGeneratedAbility({
      entityActor: ctx.entityActor,
      ability: ctx.action,
      abilityItem: ctx.actionItem
    });
    if (generatedExecution.handled) return { handled: true, result: generatedExecution.result };
    if (!ctx.options.reaction && !isInterruptFeasible(ctx.action, ctx.entityActor)) {
      ui.notifications.warn("Interrupt is not currently feasible (targets/threat).");
      return { cancelled: true };
    }
  },

  async resolveTargets(ctx) {
    const { options, action: interrupt, actionType } = ctx;
    const profile = interrupt.profile;
    if (Array.isArray(options.forcedTargets) && options.forcedTargets.length) {
      ctx.selectedZones = Array.from(new Set(options.forcedTargets.map((t) => getTokenZone(t)).filter(Boolean)));
      return options.forcedTargets;
    }
    const { interruptCost, interruptCostType } = ctx.scratch;
    const interruptZoneFilter = (z) => isThreatZone(z) && (interruptCostType !== "threat" || interruptCost <= 0 || getThreatInZone(z) > 0);
    const targetOverride = getEntitySelfActionTargetingOverride(ctx.entityActor, {
      actionItem: ctx.actionItem,
      actionConfig: ctx.action,
      actionKind: "interrupt",
      actionType
    });
    const targeting = targetOverride.mode ? targetOverride : profile;
    const selection = await resolveActionTargets({
      mode: String(targetOverride.mode || profile.targetMode || "single"),
      allowedZones: profile.allowedZones,
      zoneFilter: interruptZoneFilter,
      actionType,
      targeting,
      warnNoValidZones: "No valid zones for this Interrupt."
    });
    ctx.selectedZones = Array.isArray(selection?.zones) ? selection.zones.filter(Boolean) : [];
    return Array.isArray(selection?.targets) ? selection.targets : [];
  },

  async beforeCardsPause(ctx) {
    if (ctx.actionType !== "attack" || !ctx.targets.length) return;
    const pause = await runEntityActionPauses({
      actionType: "attack",
      stage: "beforeDefenceCards",
      entityActor: ctx.entityActor,
      actionName: ctx.actionItem?.name || ctx.action.name || "Interrupt",
      actionItem: ctx.actionItem,
      actionConfig: ctx.action,
      targetTokens: ctx.targets,
      selectedZones: ctx.selectedZones
    });
    if (pause.cancelled) return { cancelled: true };
    if (Array.isArray(pause.targetTokens)) ctx.targets = pause.targetTokens;
    if (Array.isArray(pause.selectedZones)) ctx.selectedZones = pause.selectedZones;
    if (!ctx.targets.length) {
      ui.notifications.info("No targets remain for this Interrupt.");
      return { cancelled: true };
    }
  },

  async payCost(ctx) {
    if (ctx.options?.freeCost) return true;
    const targetZones = Array.from(new Set([
      ...ctx.targets.map((t) => getTokenZone(t)).filter((z) => !!z),
      ...ctx.selectedZones
    ]));
    return applyEntityActionCost(ctx.action, ctx.entityActor, ctx.targets, targetZones, {
      amount: ctx.scratch.interruptCost,
      source: "entityInterrupt"
    });
  },

  async beforeResolve(ctx) {
    const pause = await runEntityActionPauses({ actionType: "interrupt", stage: "beforeResolve", entityActor: ctx.entityActor });
    if (pause.cancelled) return { cancelled: true };
  },

  output: interruptOutput
};

async function interruptOutput(ctx) {
  const { entityActor, actionItem: interruptItem, action: interrupt, actionType, options } = ctx;
  const { forceAdvantage } = ctx.scratch;
  const profile = interrupt.profile;
  let filteredTargets = ctx.targets;
  let selectedZones = ctx.selectedZones;

  if (actionType === "other") await resolveRestoreResolve(interrupt, entityActor);

  if (actionType === "other") {
    const ownerSet = new Set();
    for (const t of filteredTargets) {
      const target = t.actor;
      game.users.filter((u) => u.isGM || target.testUserPermission(u, "OWNER")).forEach((u) => ownerSet.add(u.id));
    }
    const whisper = ownerSet.size ? Array.from(ownerSet) : ChatMessage.getWhisperRecipients("GM");
    const safeName = foundry.utils.escapeHTML(interruptItem?.name || interrupt.name || "Interrupt");
    await createEntityNoticeCard({
      actor: entityActor,
      titleHtml: `${foundry.utils.escapeHTML(entityActor.name)} uses interrupt: ${safeName}`,
      text: String(profile.text || profile.effectText || ""),
      whisper
    });
    const afterAttack = buildEntityAfterAttackConfigs(interrupt, "always");
    if (!filteredTargets.length && selectedZones.length && hasEnabledAfterAttackGroups(afterAttack)) {
      for (const zoneId of selectedZones) await requestAfterAttackApply(null, zoneId, afterAttack, entityActor.id, null, { entityActor });
    } else if (!filteredTargets.length && hasEnabledAfterAttackGroups(afterAttack)) {
      await requestAfterAttackApply(null, "", afterAttack, entityActor.id, null, { entityActor });
    }
    for (const targetToken of filteredTargets) {
      const target = targetToken.actor;
      const targetZone = getTokenZone(targetToken) || "";
      await requestAfterAttackApply(target, targetZone, afterAttack, entityActor.id, null, { entityActor });
    }
    return true;
  }

  for (let targetToken of filteredTargets) {
    let target = targetToken.actor;
    let targetZone = getTokenZone(targetToken) || "";
    if (actionType === "test") {
      const stat = String(profile.testStat || "hard");
      const modify = getEntityModifyIfResult(interrupt, targetToken, entityActor, { allowDamage: false });
      const tn = resolveEntityAbilityTN(Number(profile.tn ?? 0), {
        mode: profile.tnMode,
        type: profile.tnDynamicType,
        dynamicSource: profile.tnDynamicSource,
        setSource: profile.tnSetSource,
        setDefence: profile.tnSetDefence,
        setStat: profile.tnSetStat
      }, entityActor, targetToken) + modify.tn + getEntityActionTNBonus(entityActor, interruptItem, targetToken, "interrupt");
      const testName = interruptItem?.name || interrupt.name || "Interrupt";
      const safeName = foundry.utils.escapeHTML(testName);
      const effectText = String(profile.effectText || "");
      const afterAttack = buildEntityAfterAttackConfigs(interrupt, "successAny");
      const snapshot = getBeforeAttackTargetSnapshot(targetToken, entityActor);
      await createEntityTestRequest({
        entityActor,
        target,
        targetToken,
        titleHtml: `${foundry.utils.escapeHTML(entityActor.name)} uses interrupt: ${safeName} on ${foundry.utils.escapeHTML(target.name)}`,
        kind: "interrupt",
        testName,
        stat,
        basicRollMode: forceAdvantage ? "adv" : String(profile.basicRollMode || "normal"),
        tn,
        conditionText: profile.conditionText,
        effectText,
        afterAttack,
        modifySelfDamage: modify.selfDamage || null,
        targetZone,
        targetSnapshot: snapshot
      });
      continue;
    }

    if (actionType === "attack" && targetZone && !options.reaction) {
      const paused = await runEntityActionPauses({
        actionType: "interrupt",
        stage: "beforeTargetResolve",
        entityActor,
        target,
        targetToken,
        targetZone
      });
      if (paused.target && paused.target.id !== target.id) {
        target = paused.target;
        targetToken = paused.targetToken || getActorTokenOnScene(target) || targetToken;
        targetZone = paused.targetZone || getActorZone(target) || targetZone;
      }
    }
    const defenceStat = String(profile.defenceStat || "hard");
    const modify = getEntityModifyIfResult(interrupt, targetToken, entityActor, { allowDamage: true });
    const tn = resolveEntityAbilityTN(Number(profile.tn ?? 0), {
      mode: profile.tnMode,
      type: profile.tnDynamicType,
      dynamicSource: profile.tnDynamicSource,
      setSource: profile.tnSetSource,
      setDefence: profile.tnSetDefence,
      setStat: profile.tnSetStat
    }, entityActor, targetToken) + modify.tn + getEntityActionTNBonus(entityActor, interruptItem, targetToken, "interrupt");
    const damageBonus = getEntityActionDamageBonus(entityActor, interruptItem, targetToken, "interrupt");
    const interruptDamage = resolveEntityAbilityDamage(
      profile.damage,
      profile.damageMode,
      profile.damageDynamicMode,
      profile.damageDynamicSource,
      entityActor,
      targetToken,
      profile.damageDynamicReduce,
      profile.damageDynamicFloor
    );
    const damageResolve = Math.max(0, interruptDamage.resolve + damageBonus.resolve + modify.damage.resolve);
    const damageWounds = Math.max(0, interruptDamage.wounds + damageBonus.wounds + modify.damage.wounds);
    const afterAttack = buildEntityAfterAttackConfigs(interrupt, "anyDamageDealt");
    const snapshot = getBeforeAttackTargetSnapshot(targetToken, entityActor);
    const safeName = foundry.utils.escapeHTML(interruptItem?.name || interrupt.name || "Interrupt");
    await createEntityDefenceRequest({
      entityActor,
      target,
      targetToken,
      titleHtml: `${foundry.utils.escapeHTML(entityActor.name)} uses interrupt: ${safeName} on ${foundry.utils.escapeHTML(target.name)}`,
      attackName: safeName,
      defenceStat,
      basicDefenceMode: String(profile.basicDefenceMode || "normal"),
      forceAdvantage,
      tn,
      damageResolve,
      damageWounds,
      detailsHtml: profile.conditionText ? `<div><strong>Condition:</strong> ${foundry.utils.escapeHTML(profile.conditionText)}</div>` : "",
      whisper: getEntityActionWhisper(target),
      attackData: {
        targetZone,
        targetSnapshot: snapshot,
        modifySelfDamage: modify.selfDamage || null,
        afterAttack,
        followUp: { enabled: false },
        skipDefencePrompt: true
      }
    });
  }
}

export async function openInterruptPromptForHunterEnd(combat, entityActor) {
  if (!game.user?.isGM) return;
  if (!entityActor) return;
  const interrupts = entityActor.items.filter(i => i.type === "entityAbility" && i.system?.kind === "interrupt");
  const feasible = [];
  for (const item of interrupts) {
    const intr = item.system;
    if (builderGeneratedAbilityFeasible({ entityActor, ability: intr, abilityItem: item }) || isInterruptFeasible(intr, entityActor)) {
      feasible.push({ item, intr });
    }
  }
  if (!feasible.length) return;
  const options = feasible.map(({ item, intr }) => {
    const name = foundry.utils.escapeHTML(item.name || "Interrupt");
    const cost = getEntityInterruptCost(intr, entityActor, item);
    const actionType = String(intr.profile.actionType || "attack");
    const kind = actionType === "test" ? "Test" : (actionType === "other" ? "Other" : "Attack");
    return `<option value="${item.id}">${name} (${kind}, Cost ${cost})</option>`;
  }).join("");
  await foundry.applications.api.DialogV2.wait({
    window: { title: "Interrupt Opportunity" },
    content: `
        <form class="hollows-roll-dialog">
          <p>Hunter turn ended. Use an Interrupt now?</p>
          <div class="form-group">
            <label>Interrupt</label>
            <select name="interruptId">${options}</select>
          </div>
        </form>
      `,
    buttons: [
      {
        action: "use",
        label: "Use Interrupt",
        default: true,
        callback: async (_e, _b, dialog) => {
          const id = String(dialog.element.querySelector("[name=interruptId]")?.value || "");
          const item = entityActor.items.get(id);
          if (!item) return;
          await triggerEntityInterrupt(entityActor, item.system, item);
        }
      },
      { action: "skip", label: "Skip", callback: () => null }
    ],
    rejectClose: false
  });
}
