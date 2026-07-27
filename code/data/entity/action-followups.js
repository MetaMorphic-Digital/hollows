import { promptForZoneSelection } from "../../applications/apps/selection-dialogs.mjs";
import { getAdjacentZones, getTokenZone, filterZonesByGroup, getZoneList, sceneHunterTokens } from "../../canvas/zone.js";
import {
  buildEntityAfterAttackConfigs,
  getBeforeAttackTargetSnapshot,
  matchesEntityOutcomeCondition,
  resolveEntityAbilityDamage,
  resolveEntityAbilityTN,
  shouldApplyAfterAttackEffects
} from "./action-rules.js";
import { performEntityAttack } from "./actions/entity-attack.js";
import { createEntityDefenceRequest, createEntityNoticeCard, createEntityTestRequest, getEntityActionWhisper } from "./action-cards.js";
import { resolveActionTargets, resolveEntityActorFromAttackContext } from "./action-flow.js";

function shouldTriggerFollowUp(followUp, context = {}) {
  if (!followUp || followUp.enabled === false) return false;
  return matchesEntityOutcomeCondition(String(followUp.when || "successAny"), context) === true;
}

function followUpBranches(groups = []) {
  const list = Array.isArray(groups) ? groups : [];
  const branches = [];
  let current = null;
  list.forEach((group, index) => {
    const rootsBranch = index === 0 || String(group?.trigger || "afterPrevious") === "afterMain";
    if (rootsBranch) {
      if (current) branches.push(current);
      current = { rootIndex: index, groups: [group] };
    } else if (current) {
      current.groups.push(group);
    } else {
      current = { rootIndex: index, groups: [group] };
    }
  });
  if (current) branches.push(current);
  return branches;
}

function shouldTriggerRepetitiveAttack(repeatConfig, context = {}) {
  if (!repeatConfig?.enabled) return false;
  return shouldApplyAfterAttackEffects({
    applyIfLogic: "and",
    applyIfConditions: [{ condition: repeatConfig.repeatIf }]
  }, context);
}

export async function maybePromptRepetitiveAttack(attackData, context = {}) {
  const repeatConfig = attackData?.repeat || {};
  if (!shouldTriggerRepetitiveAttack(repeatConfig, context)) return false;
  const entityActor = context.entityActor || (attackData?.entityId ? game.actors.get(String(attackData.entityId)) : null);
  const attackItemId = String(attackData?.itemId || "");
  if (!entityActor || !attackItemId) return false;
  const nextRepeatCount = Math.max(1, Number(repeatConfig.repeatCount ?? 0) + 1);
  const shouldRepeat = await foundry.applications.api.DialogV2.wait({
    window: { title: String(attackData?.attackName || "Repeat Attack") },
    content: `
        <div class="hollows-roll-dialog">
          <div><strong>Repeat this attack?</strong></div>
          <div>Repeat #${nextRepeatCount}</div>
        </div>
      `,
    buttons: [
      { action: "repeat", label: "Repeat Attack", default: true, callback: () => true },
      { action: "stop", label: "Stop", callback: () => false }
    ],
    rejectClose: false
  }) ?? false;
  if (!shouldRepeat) return false;
  const liveActor = game.actors.get(entityActor.id) || entityActor;
  const liveItem = liveActor?.items?.get(attackItemId) || null;
  if (!liveItem) {
    ui.notifications.warn("Unable to repeat this attack.");
    return false;
  }
  await performEntityAttack(liveActor, liveItem, { repeatContext: { count: nextRepeatCount } });
  return true;
}

function followUpNeedsFinalDamageDecision(when = "") {
  return [
    "resolveDamageDealt",
    "woundsDamageDealt",
    "anyDamageDealt",
    "noDamageDealt"
  ].includes(String(when || ""));
}

function uniqueZones(zones = []) {
  return Array.from(new Set((zones || []).filter(Boolean)));
}

function getFollowUpAdjacentZones(targetZone, targetAreas = []) {
  if (!targetZone) return [];
  const adjacent = getAdjacentZones(targetZone);
  let zones = [];
  if (targetAreas.includes("adjacentClose")) zones.push(...filterZonesByGroup(adjacent, "close"));
  if (targetAreas.includes("adjacentRanged")) zones.push(...filterZonesByGroup(adjacent, "ranged"));
  return uniqueZones(zones);
}

async function resolveFollowUpTargetZones(followUp, targetZone, { promptAdjacent = false } = {}) {
  const targetAreas = Array.isArray(followUp?.targetAreas) ? followUp.targetAreas.filter(Boolean) : [];
  if (!targetAreas.length) return getZoneList();

  const zones = [];
  if (targetAreas.includes("original") && targetZone) zones.push(targetZone);

  let adjacentZones = getFollowUpAdjacentZones(targetZone, targetAreas);
  if (promptAdjacent && adjacentZones.length && String(followUp?.adjacentMode || "all") === "select") {
    adjacentZones = await promptForZoneSelection(adjacentZones, { title: "Choose Follow-Up Adjacent Zones" }) || [];
  }
  zones.push(...adjacentZones);
  return uniqueZones(zones);
}

const resolvedFollowUpKeys = new Set();

export async function resolveFollowUpFromMessage(messageId, outcomeOrContext, targetTokenUuid) {
  const message = game.messages.get(messageId);
  if (!message) return;
  const attackData = message.getFlag("hollows", "attackData") || null;
  const testData = message.getFlag("hollows", "entityTestData") || {};
  const flagData = attackData || {
    attackName: testData.testName || "Test",
    targetZone: testData.targetZone || "",
    targetTokenUuid: testData.targetTokenUuid || "",
    entityId: testData.entityId || "",
    targetSnapshot: testData.targetSnapshot || {},
    followUp: testData.followUp || {}
  };
  const followUpChain = flagData.followUp || {};
  if (!followUpChain.enabled) return;
  const groups = Array.isArray(followUpChain.groups) ? followUpChain.groups : [];
  if (!groups.length) return;

  const context = typeof outcomeOrContext === "object" && outcomeOrContext
    ? outcomeOrContext
    : {
        outcomeLabel: String(outcomeOrContext || ""),
        targetTokenUuid: String(targetTokenUuid || ""),
        damageType: "",
        damageValue: 0
      };
  const phase = String(context.phase || "outcome");

  const resolvedTargetTokenUuid = String(context.targetTokenUuid || targetTokenUuid || flagData.targetTokenUuid || "");
  const targetToken = resolvedTargetTokenUuid ? await fromUuid(resolvedTargetTokenUuid) : null;
  const shared = {
    message,
    flagData,
    context,
    entityActor: resolveEntityActorFromAttackContext(flagData, message),
    targetToken,
    originalTargetToken: targetToken,
    targetZone: flagData.targetZone || (targetToken ? getTokenZone(targetToken) : "")
  };

  for (const branch of followUpBranches(groups)) {
    const head = branch.groups[0];
    if (!head) continue;
    const headPhase = followUpNeedsFinalDamageDecision(head.when) ? "finalDamage" : "outcome";
    if (phase !== "all" && phase !== headPhase) continue;
    const claimKey = `${messageId}:${branch.rootIndex}`;
    if (resolvedFollowUpKeys.has(claimKey)) continue;
    resolvedFollowUpKeys.add(claimKey);
    if (!shouldTriggerFollowUp(head, context)) continue;
    await resolveFollowUpGroup(head, { enabled: branch.groups.length > 1, groups: branch.groups.slice(1) }, shared);
  }
}

async function resolveFollowUpBranchInPlace(groups, shared) {
  const list = Array.isArray(groups) ? groups : [];
  if (!list.length) return;
  const head = list[0];
  if (!shouldTriggerFollowUp(head, shared.context || {})) return;
  await resolveFollowUpGroup(head, { enabled: list.length > 1, groups: list.slice(1) }, shared);
}

async function postFollowUpNotice(shared, text, targetActor = null) {
  const { entityActor, message, flagData } = shared;
  const safeName = foundry.utils.escapeHTML(`${flagData.attackName || "Attack"} (Follow-Up)`);
  const safeEntity = foundry.utils.escapeHTML(entityActor?.name || message.speaker?.alias || "Entity");
  const on = targetActor ? ` on ${foundry.utils.escapeHTML(targetActor.name)}` : "";
  await createEntityNoticeCard({
    actor: entityActor,
    titleHtml: `${safeEntity} follow-up uses ${safeName}${on}`,
    text: String(text || ""),
    ...(targetActor ? { whisper: getEntityActionWhisper(targetActor) } : {})
  });
}

async function resolveFollowUpGroup(followUp, remainingFollowUp, shared) {
  const { message, flagData, entityActor, targetToken, originalTargetToken, targetZone } = shared;
  const profile = followUp.profile || {};
  const followUpType = String(profile.actionType || "attack");
  const followUpTargetMode = String(followUp.targetMode || "single");

  if (followUpTargetMode === "noTargets") {
    if (followUpType !== "other") return;
    await postFollowUpNotice(shared, profile.text);
    if (remainingFollowUp.enabled) await resolveFollowUpBranchInPlace(remainingFollowUp.groups, shared);
    return;
  }

  let targets = [];
  if (followUpTargetMode === "sameTarget") {
    if (!originalTargetToken?.actor) return;
    targets = [originalTargetToken];
  } else {
    const zones = await resolveFollowUpTargetZones(followUp, targetZone, { promptAdjacent: followUpTargetMode === "single" });
    if (!zones.length) return;
    let hunters = sceneHunterTokens().filter(t => zones.includes(getTokenZone(t)));
    if (followUp.excludeOriginal && targetToken) {
      hunters = hunters.filter(t => t.id !== targetToken.id);
    }
    const selection = await resolveActionTargets({
      mode: followUpTargetMode,
      allowedZones: zones,
      hunters,
      actionType: "attack",
      warnNoValidZones: "No valid zones for this Follow-Up."
    });
    targets = Array.isArray(selection?.targets) ? selection.targets : [];
  }

  if (!targets.length) return;

  for (const tkn of targets) {
    const tgt = tkn.actor;
    const followTargetZone = getTokenZone(tkn) || "";
    const followUpSnapshot = getBeforeAttackTargetSnapshot(tkn, entityActor);
    if (followUpType === "test") {
      const stat = String(profile.testStat || "hard");
      const tn = resolveEntityAbilityTN(Number(profile.tn ?? 0), {
        mode: profile.tnMode,
        type: profile.tnDynamicType,
        dynamicSource: profile.tnDynamicSource,
        setSource: profile.tnSetSource,
        setDefence: profile.tnSetDefence,
        setStat: profile.tnSetStat
      }, entityActor, tkn, originalTargetToken);
      const testName = `${flagData.attackName || "Attack"} (Follow-Up)`;
      const safeName = foundry.utils.escapeHTML(testName);
      const effectText = String(profile.effectText || "");
      const afterAttack = buildEntityAfterAttackConfigs(followUp, "successAny");
      await createEntityTestRequest({
        entityActor,
        target: tgt,
        targetToken: tkn,
        titleHtml: `${foundry.utils.escapeHTML(entityActor?.name || message.speaker?.alias || "Entity")} follow-up uses ${safeName} on ${foundry.utils.escapeHTML(tgt.name)}`,
        kind: "followUp",
        testName,
        stat,
        basicRollMode: String(profile.basicRollMode || "normal"),
        tn,
        effectText,
        afterAttack,
        followUp: remainingFollowUp,
        targetZone: followTargetZone,
        targetSnapshot: followUpSnapshot,
        allowGM: true
      });
    } else if (followUpType === "other") {
      await postFollowUpNotice(shared, profile.text, tgt);
    } else {
      const followUpDamage = resolveEntityAbilityDamage(
        profile.damage,
        profile.damageMode,
        profile.damageDynamicMode,
        profile.damageDynamicSource,
        entityActor,
        tkn,
        profile.damageDynamicReduce,
        profile.damageDynamicFloor
      );
      const followUpDamageBonus = {
        resolve: Number(followUp.damageBonus?.resolve ?? 0) || 0,
        wounds: Number(followUp.damageBonus?.wounds ?? 0) || 0
      };
      const damageResolve = Math.max(0, followUpDamage.resolve + followUpDamageBonus.resolve);
      const damageWounds = Math.max(0, followUpDamage.wounds + followUpDamageBonus.wounds);
      const followUpTN = resolveEntityAbilityTN(Number(profile.tn ?? 0), {
        mode: profile.tnMode,
        type: profile.tnDynamicType,
        dynamicSource: profile.tnDynamicSource,
        setSource: profile.tnSetSource,
        setDefence: profile.tnSetDefence,
        setStat: profile.tnSetStat
      }, entityActor, tkn, originalTargetToken);
      const safeFollowUpAttackName = foundry.utils.escapeHTML(`${flagData.attackName || "Attack"} (Follow-Up)`);
      const afterAttack = buildEntityAfterAttackConfigs(followUp, "anyDamageDealt");
      await createEntityDefenceRequest({
        entityActor,
        target: tgt,
        targetToken: tkn,
        titleHtml: `${foundry.utils.escapeHTML(entityActor?.name || message.speaker?.alias || "Entity")} follow-up attacks ${foundry.utils.escapeHTML(tgt.name)}`,
        attackName: safeFollowUpAttackName,
        defenceStat: profile.defenceStat || "hard",
        basicDefenceMode: String(profile.basicDefenceMode || "normal"),
        tn: followUpTN,
        damageResolve,
        damageWounds,
        attackData: {
          targetZone: followTargetZone,
          targetSnapshot: followUpSnapshot,
          afterAttack,
          followUp: remainingFollowUp,
          skipDefencePrompt: true
        }
      });
    }
    if (game.user?.isGM) {
      ui.notifications.info(`Follow-Up sent to ${tgt.name}`);
    }
  }
  if (followUpType === "other" && remainingFollowUp.enabled) {
    await resolveFollowUpBranchInPlace(remainingFollowUp.groups, shared);
  }
}
