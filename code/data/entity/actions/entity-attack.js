import { promptForm } from "../../../applications/apps/selection-dialogs.mjs";
import { getTokenZone, localizeZone, sceneHunterTokens } from "../../../canvas/zone.js";
import {
  createFollowUpConfig,
  createRepeatConfig,
  getEntityAbilityText,
  normalizeEntityAttackBuilderMode,
} from "../action-schema.js";
import {
  buildEntityAfterAttackConfigs,
  buildEntityBeforeAttackConfigs,
  getBeforeAttackTargetSnapshot,
  getEntityActionDamageBonus,
  getEntityActionTNBonus,
  getEntityModifyIfResult,
  matchesEntityAttackConditions,
  resolveEntityAbilityDamage,
  resolveEntityAbilityTN,
} from "../action-rules.js";
import {
  normalizeAllowedZones,
  resolveActionTargets,
  runEntityAction,
} from "../action-flow.js";
import { createEntityDefenceRequest } from "../action-cards.js";
import {
  initEntityAttackGroup,
  maybeRunEntityAttackEnhancementGate,
} from "../../../documents/entity/entity-enhancements.js";
import { getEffectiveEntityStat } from "../../../documents/entity/entity-stats.js";
import {
  applyEntityActionCost,
  getEffectiveThreatEnhancement,
  getEntityAttackCost,
  promptEntityThreatEnhance,
} from "../../../documents/entity/entity-threat.js";
import { getEntitySelfActionTargetingOverride } from "../../../helpers/entity-dispatchers.js";
import {
  runEntityActionPauses,
  runOnEntityAttack,
} from "../../../helpers/weapon-abilities/dispatchers.js";
import { requestAfterAttackApply } from "../../../documents/entity/attack-effects.js";

/** Run an Entity attack ability. */
export async function performEntityAttack(entityActor, attackItem, options = {}) {
  if (!attackItem) return;
  entityActor = game.actors?.get(entityActor?.id) || entityActor;
  const attack = attackItem.system;
  const builderMode = normalizeEntityAttackBuilderMode(attack.builderMode);
  const repeatCount = Math.max(0, Number(options?.repeatContext?.count ?? 0) || 0);
  const repeatConfig = builderMode === "advanced"
    ? createRepeatConfig(attack.repeat, repeatCount)
    : createRepeatConfig({}, 0);
  const ctx = {
    entityActor,
    actionItem: attackItem,
    action: attack,
    kind: "attack",
    actionType: "attack",
    options,
    targets: [],
    selectedZones: [],
    noTargetsMessage: "No valid targets for this attack.",
    scratch: {
      attackName: attackItem?.name || "Attack",
      builderMode,
      repeatCount,
      repeatConfig,
      forceAdvantage: !!options.forceDefenceAdvantage,
      zoneSpend: {},
      manualConfig: null,
    },
  };
  return runEntityAction(ctx, attackPipeline);
}

const attackPipeline = {
  async resolveTargets(ctx) {
    const { options, action: attack } = ctx;
    const { builderMode } = ctx.scratch;
    const profile = attack.profile;
    if (Array.isArray(options.forcedTargets) && options.forcedTargets.length) {
      ctx.selectedZones = [];
      return options.forcedTargets;
    }
    const targetOverride = getEntitySelfActionTargetingOverride(ctx.entityActor, {
      actionItem: ctx.actionItem,
      actionConfig: ctx.action,
      actionKind: "attack",
      actionType: "attack",
    });
    const mode = targetOverride.mode
      ? String(targetOverride.mode)
      : builderMode === "advanced" ? String(profile.targetMode || "single") : "single";
    const selection = await resolveActionTargets({
      mode,
      allowedZones: normalizeAllowedZones(profile.allowedZones),
      hunters: sceneHunterTokens(),
      actionType: "attack",
      targeting: targetOverride.mode ? targetOverride : profile,
      warnNoValidZones: "No valid zones with Hunters for this attack.",
    });
    ctx.selectedZones = mode === "single" || mode === "noTargets" ? [] : (selection?.zones || []);
    return selection?.targets || [];
  },

  filterPossible(ctx) {
    if (!(ctx.scratch.builderMode === "advanced" && ctx.action.possibleIf?.enabled)) return;
    const possibleIf = ctx.action.possibleIf;
    ctx.targets = ctx.targets.filter((t) => matchesEntityAttackConditions(possibleIf.conditions, t, ctx.entityActor, possibleIf.logic));
  },

  async beforeCardsPause(ctx) {
    const pause = await runEntityActionPauses({
      actionType: "attack",
      stage: "beforeDefenceCards",
      entityActor: ctx.entityActor,
      actionName: ctx.scratch.attackName,
      actionItem: ctx.actionItem,
      actionConfig: ctx.action,
      targetTokens: ctx.targets,
      selectedZones: ctx.selectedZones,
    });
    if (pause.cancelled) return { cancelled: true };
    if (Array.isArray(pause.targetTokens)) ctx.targets = pause.targetTokens;
    if (Array.isArray(pause.selectedZones)) ctx.selectedZones = pause.selectedZones;
    if (!ctx.targets.length) {
      ui.notifications.info("No targets remain for this attack.");
      return { cancelled: true };
    }
  },

  async beforeCost(ctx) {
    const gate = await maybeRunEntityAttackEnhancementGate(ctx.entityActor, {
      stage: "beforeCost",
      builderMode: ctx.scratch.builderMode,
      actionName: ctx.scratch.attackName,
      actionItem: ctx.actionItem,
      actionConfig: ctx.action,
      targets: ctx.targets,
      selectedZones: ctx.selectedZones,
    });
    if (gate.cancelled) return { cancelled: true };
  },

  async payCost(ctx) {
    const { builderMode, repeatCount, repeatConfig } = ctx.scratch;
    if (!(builderMode === "advanced" && (repeatCount <= 0 || repeatConfig.hasCost))) return true;
    const targetZones = Array.from(new Set([
      ...ctx.targets.map((target) => getTokenZone(target)).filter(Boolean),
      ...ctx.selectedZones,
    ]));
    return applyEntityActionCost(ctx.action, ctx.entityActor, ctx.targets, targetZones, {
      amount: getEntityAttackCost(ctx.action, ctx.entityActor, ctx.actionItem),
    });
  },

  async afterCost(ctx) {
    const { builderMode, attackName } = ctx.scratch;
    if (builderMode === "advanced") await applyBeforeAttackEffects(ctx);
    if (builderMode === "advanced" && !ctx.options.reaction) {
      ({ zoneSpend: ctx.scratch.zoneSpend } = await promptEntityThreatEnhance(ctx.entityActor, ctx.targets, { attackName }));
    }
    if (builderMode === "manual") {
      ctx.scratch.manualConfig = await promptForm({
        title: `${attackName}: Manual Setup`,
        fields: [
          {
            type: "select",
            name: "defenceStat",
            label: "Defence Stat",
            options: [
              { value: "hard", label: "Hard" },
              { value: "strong", label: "Strong" },
              { value: "quick", label: "Quick" },
              { value: "sharp", label: "Sharp" },
              { value: "wise", label: "Wise" },
            ],
          },
          {
            type: "select",
            name: "basicDefenceMode",
            label: "Basic Defence Mode",
            options: [
              { value: "normal", label: "Normal" },
              { value: "dis", label: "Disadvantage" },
              { value: "adv", label: "Advantage" },
            ],
          },
          { type: "number", name: "tn", label: "TN", value: 0 },
          { type: "number", name: "damageResolve", label: "Resolve Damage", value: 0 },
          { type: "number", name: "damageWounds", label: "Wounds Damage", value: 0 },
        ],
      });
      if (!ctx.scratch.manualConfig) return { cancelled: true };
    }
  },

  output: performAttackOutput,

  async afterEmit(ctx) {
    await runOnEntityAttack(ctx.entityActor, ctx.targets);
  },
};

/** Apply before-attack effect groups. */
async function applyBeforeAttackEffects(ctx) {
  const groups = buildEntityBeforeAttackConfigs(ctx.action);
  if (!groups.length) return;
  for (const targetToken of ctx.targets) {
    const target = targetToken.actor;
    if (!target) continue;
    const targetZone = getTokenZone(targetToken) || "";
    await requestAfterAttackApply(target, targetZone, groups, ctx.entityActor.id, null, {
      entityActor: ctx.entityActor,
      targetZone,
      effectTiming: "beforeAttack",
    });
  }
}

/** Post the attack card and roll data. */
async function performAttackOutput(ctx) {
  const { entityActor, actionItem: attackItem, action: attack } = ctx;
  const { attackName, builderMode, manualConfig, zoneSpend, repeatConfig, repeatCount, forceAdvantage } = ctx.scratch;
  const profile = attack.profile;
  const abilityText = getEntityAbilityText(attack);
  const threatSpend = attack.threatSpend;
  const filteredTargets = ctx.targets;
  const generatedByEnhancement = attackItem?.getFlag?.("hollows", "generatedByEnhancement") || "";
  const attackGroupId = generatedByEnhancement && filteredTargets.length ? foundry.utils.randomID() : "";
  if (attackGroupId) {
    await initEntityAttackGroup(entityActor, attackGroupId, { targetCount: filteredTargets.length, rule: generatedByEnhancement });
  }
  const triggerThreatCost = (attack.cost?.enabled && attack.cost.type === "threat")
    ? Math.max(0, Number(attack.cost.amount ?? 0) || 0)
    : 0;
  for (const targetToken of filteredTargets) {
    const target = targetToken.actor;
    const targetZone = getTokenZone(targetToken) || "";
    const spentInZone = Number(zoneSpend[targetZone] ?? 0);
    const enhancementSpend = getEffectiveThreatEnhancement(target, spentInZone);
    const threatSpent = triggerThreatCost + spentInZone;
    const threatRollBonus = (threatSpend.enabled && !threatSpend.affectsTN)
      ? 0
      : enhancementSpend * 2;
    let effectiveTn = builderMode === "manual"
      ? Number(manualConfig?.tn ?? 0)
      : resolveEntityAbilityTN(Number(profile.tn ?? 0), {
        mode: profile.tnMode,
        type: profile.tnDynamicType,
        dynamicSource: profile.tnDynamicSource,
        setSource: profile.tnSetSource,
        setDefence: profile.tnSetDefence,
        setStat: profile.tnSetStat,
      }, entityActor, targetToken);
    effectiveTn += getEntityActionTNBonus(entityActor, attackItem, targetToken, "attack");
    const damageBonus = builderMode === "advanced"
      ? getEntityActionDamageBonus(entityActor, attackItem, targetToken, "attack")
      : { resolve: 0, wounds: 0 };
    const attackDamage = builderMode === "manual"
      ? { resolve: Number(manualConfig?.damageResolve ?? 0), wounds: Number(manualConfig?.damageWounds ?? 0) }
      : builderMode === "basic"
        ? {
          resolve: Math.max(0, Number(profile.damage?.resolve ?? 0) || 0),
          wounds: Math.max(0, Number(profile.damage?.wounds ?? 0) || 0),
        }
        : resolveEntityAbilityDamage(profile, entityActor, targetToken);
    let damageResolve = attackDamage.resolve + damageBonus.resolve;
    let damageWounds = attackDamage.wounds + damageBonus.wounds;
    if (builderMode === "advanced" && threatSpend.enabled && threatSpend.modifyDamage && enhancementSpend > 0) {
      const perResolve = Number(threatSpend.damage?.resolve ?? 0);
      const perWounds = Number(threatSpend.damage?.wounds ?? 0);
      if (!Number.isNaN(perResolve)) damageResolve += perResolve * enhancementSpend;
      if (!Number.isNaN(perWounds)) damageWounds += perWounds * enhancementSpend;
    }
    const modify = builderMode === "advanced" && attack.modifyIf?.enabled
      ? getEntityModifyIfResult(attack, targetToken, entityActor)
      : null;
    if (modify?.matched) {
      effectiveTn += modify.tn;
      damageResolve += modify.damage.resolve;
      damageWounds += modify.damage.wounds;
    }
    if (builderMode === "advanced" && repeatCount > 0 && repeatConfig.enabled) {
      effectiveTn += repeatCount * repeatConfig.modifyTN;
      damageResolve += repeatCount * repeatConfig.damage.resolve;
      damageWounds += repeatCount * repeatConfig.damage.wounds;
    }
    effectiveTn += getEffectiveEntityStat(entityActor, "defendTN", { targetActor: target, target, targetZone, actionItem: attackItem });
    effectiveTn = Math.max(0, effectiveTn);
    damageResolve = Math.max(0, damageResolve);
    damageWounds = Math.max(0, damageWounds);
    const defenceStat = builderMode === "manual" ? String(manualConfig?.defenceStat || "hard") : profile.defenceStat;
    const basicDefenceMode = builderMode === "manual"
      ? String(manualConfig?.basicDefenceMode || "normal")
      : String(profile.basicDefenceMode || "normal");
    await createEntityDefenceRequest({
      entityActor,
      target,
      targetToken,
      titleHtml: `${foundry.utils.escapeHTML(entityActor.name)} attacks ${foundry.utils.escapeHTML(target.name)}`,
      attackName,
      defenceStat,
      basicDefenceMode,
      forceAdvantage,
      tn: effectiveTn,
      damageResolve,
      damageWounds,
      detailsHtml: [
        threatRollBonus > 0 ? `<div><strong>Threat Spend:</strong> ${spentInZone} in ${foundry.utils.escapeHTML(localizeZone(targetZone))} (+${threatRollBonus} to Defend roll)</div>` : "",
        builderMode === "advanced" && threatSpend.enabled && enhancementSpend > 0 && threatSpend.specialText
          ? `<div><strong>Threat Spend:</strong> ${foundry.utils.escapeHTML(threatSpend.specialText)}</div>`
          : "",
        abilityText ? `<div>${foundry.utils.escapeHTML(abilityText)}</div>` : "",
        builderMode === "advanced" && profile.conditionText ? `<div><strong>Condition:</strong> ${foundry.utils.escapeHTML(profile.conditionText)}</div>` : "",
      ].join(""),
      attackData: {
        rollMod: threatRollBonus,
        threatSpent,
        itemId: attackItem.id,
        repeat: repeatConfig,
        attackGroupId,
        targetSnapshot: getBeforeAttackTargetSnapshot(targetToken, entityActor),
        modifySelfDamage: modify?.selfDamage || null,
        afterAttack: builderMode === "advanced"
          ? buildEntityAfterAttackConfigs(attack, "anyDamageDealt")
          : [],
        followUp: builderMode === "advanced"
          ? createFollowUpConfig(attack.followUp, damageBonus)
          : { enabled: false },
      },
    });
  }
}
