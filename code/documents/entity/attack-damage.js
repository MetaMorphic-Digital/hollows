import { hasCondition } from "../actor/conditions.js";
import { adjustHunterResource, StandardDamage } from "../actor/resources.js";
import { applyDefenceOptionMitigation } from "../../data/actions/defence-options.js";
import {
  applyIncomingDamageModifiers,
  runOnDefenceResult,
  runOnIncomingEntityWoundDamage
} from "../../helpers/weapon-abilities/dispatchers.js";
import { triggerEntityTriggeredAbilities } from "../../data/entity/actions/entity-special.js";
import {
  maybeTriggerEntityInflictsDamageEnhancements,
  recordEntityAttackOutcome,
  runEntityAfterHunterDamageEnhancements
} from "./entity-enhancements.js";
import {
  maybePromptRepetitiveAttack,
  resolveFollowUpFromMessage
} from "../../data/entity/action-followups.js";
import { resolveEntityActorFromAttackContext } from "../../data/entity/action-flow.js";
import { requestAfterAttackApply } from "./attack-effects.js";

/**
 * Standard Entity -> Hunter damage application.
 *
 * Defence cards only store the resolved payload in message flags. This module
 * owns the later GM-side mutation: mitigation, redirects, resource damage,
 * after-attack effects, enhancement hooks, follow-up and repetitive attacks.
 */

async function resolveHunterDamageTarget(data = {}) {
  let targetTokenDoc = null;
  let target = null;
  if (data.targetTokenUuid) {
    targetTokenDoc = await fromUuid(data.targetTokenUuid);
    target = targetTokenDoc?.actor || null;
  }
  if (!target && data.targetId) {
    target = game.actors.get(String(data.targetId)) || null;
  }
  return { target, targetTokenDoc };
}

export async function applyEntityAttackDamage(message) {
  const data = message?.getFlag("hollows", "hunterDamage");
  if (!data || message?.getFlag("hollows", "applyDamage")?.applied) return false;

  const { target, targetTokenDoc } = await resolveHunterDamageTarget(data);
  if (!target || target.type !== "hunter") return false;

  let damageType = String(data.damageType || "");
  let damageValue = Number(data.damageValue ?? 0);
  const altWoundsValue = Number(data.altWoundsValue ?? 0);
  if ((damageType !== "Resolve" && damageType !== "Wounds") || damageValue <= 0) return false;

  const notes = [];
  if (damageType === "Resolve" && StandardDamage.targetResolve(target) <= 0 && altWoundsValue > 0) {
    damageType = "Wounds";
    damageValue = altWoundsValue;
    notes.push("Resolve is 0: Wound damage applied instead");
  }

  const defenceResult = message?.getFlag("hollows", "defenceResult") || {};
  const originMessage = defenceResult.originMessageId
    ? game.messages?.get(defenceResult.originMessageId)
    : null;
  const attackData = originMessage?.getFlag("hollows", "attackData") || message?.getFlag("hollows", "attackData") || {};
  const entityActor = resolveEntityActorFromAttackContext(attackData, originMessage, message);

  if (entityActor) {
    const incoming = await applyIncomingDamageModifiers(target, {
      damageType,
      damageValue,
      source: "entity",
      timing: "preMitigation",
      notes
    });
    damageValue = incoming.damageValue;
  }

  const targetZone = String(data.targetZone || "");
  const targetScene = targetTokenDoc?.parent || canvas?.scene || game.scenes?.active || null;
  const previousResolve = Number(target.system.health.resolve.value ?? 0);
  const previousWounds = Number(target.system.health.wounds.value ?? 0);

  const hasSheltered = hasCondition(target, "sheltered");
  const optionMitigation = await applyDefenceOptionMitigation(target, {
    damageType,
    damageValue,
    notes
  }, {
    optionData: data.defenceOptions || {},
    hasSheltered,
    source: "entity",
    targetZone
  });
  damageValue = optionMitigation.damageValue;

  const shelteredReduction = hasSheltered && !optionMitigation.suppressSheltered ? 1 : 0;
  if (shelteredReduction) {
    notes.push("Sheltered: -1");
    damageValue = Math.max(0, damageValue - shelteredReduction);
  }

  if (damageValue > 0 && entityActor) {
    const incoming = await applyIncomingDamageModifiers(target, {
      damageType,
      damageValue,
      source: "entity",
      timing: "postMitigation",
      notes,
      shelteredApplied: shelteredReduction > 0
    });
    damageValue = incoming.damageValue;
  }

  if (damageType === "Wounds" && damageValue > 0 && entityActor) {
    const woundResult = await runOnIncomingEntityWoundDamage(target, { damageValue });
    damageValue = woundResult.damageValue;
  }

  let damageRedirected = false;
  if (entityActor) {
    const result = await runOnDefenceResult(target, {
      damageType,
      damageValue,
      entityActor,
      threatSpent: attackData.threatSpent
    });
    damageRedirected = !!result.damageRedirected;
    if (result.damageConverted) {
      damageType = result.damageType;
      damageValue = result.damageValue;
    }
  }

  let nextResolve = previousResolve;
  let nextWounds = previousWounds;
  if (!damageRedirected && damageType === "Resolve") {
    const result = await adjustHunterResource(target, { resolve: -damageValue });
    nextResolve = result.resolve.after;
  } else if (!damageRedirected && damageType === "Wounds") {
    const result = await adjustHunterResource(target, { wounds: -damageValue });
    nextWounds = result.wounds.after;
  }

  const appliedEntityDamage = !damageRedirected && entityActor && damageValue > 0;
  if (appliedEntityDamage) {
    const enhancementResults = await runEntityAfterHunterDamageEnhancements(entityActor, {
      stage: "afterDamageApplied",
      entityActor,
      target,
      targetScene,
      targetZone,
      damageType,
      damageValue,
      previousResolve,
      previousWounds,
      nextResolve,
      nextWounds
    });
    for (const result of enhancementResults) {
      if (result?.nextResolve !== undefined) nextResolve = result.nextResolve;
      if (result?.nextWounds !== undefined) nextWounds = result.nextWounds;
    }
  }

  if (notes.length) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: target }),
      content: `<div class="hollows-chat"><strong>${target.name}</strong> mitigation: <strong>${notes.join("; ")}</strong>. Final damage: <strong>${damageValue}</strong>.</div>`
    });
  }

  await requestAfterAttackApply(
    target,
    targetZone,
    attackData.afterAttack || {},
    attackData.entityId || "",
    attackData.modifySelfDamage || null,
    {
      outcomeLabel: defenceResult.outcomeLabel || "",
      damageType: damageRedirected ? "" : damageType,
      damageValue: damageRedirected ? 0 : damageValue,
      previousResolve,
      previousWounds,
      nextResolve,
      nextWounds,
      entityActor,
      targetZone,
      snapshot: attackData.targetSnapshot || {}
    }
  );

  if (appliedEntityDamage) {
    await runEntityAfterHunterDamageEnhancements(entityActor, {
      stage: "afterAfterAttackApply",
      entityActor,
      target,
      targetScene,
      targetZone,
      damageType,
      damageValue,
      previousResolve,
      previousWounds,
      nextResolve,
      nextWounds,
      requestAfterAttackApply
    });
  }

  if (appliedEntityDamage) {
    await maybeTriggerEntityInflictsDamageEnhancements(entityActor, target, damageType, damageValue, message, previousResolve, targetZone);
    if (damageType === "Resolve") {
      await triggerEntityTriggeredAbilities(entityActor, "entityDealsResolveDamage", {
        targetActor: target,
        targetZone
      }, ["special", "doom"]);
      if (previousResolve > 0 && nextResolve <= 0) {
        await triggerEntityTriggeredAbilities(entityActor, "entityBreaksHunter", {
          targetActor: target,
          targetZone
        }, ["special", "doom"]);
      }
    } else if (damageType === "Wounds") {
      await triggerEntityTriggeredAbilities(entityActor, "entityDealsWoundsDamage", {
        targetActor: target,
        targetZone
      }, ["special", "doom"]);
    }
  }

  if (defenceResult.originMessageId) {
    await resolveFollowUpFromMessage(defenceResult.originMessageId, {
      outcomeLabel: defenceResult.outcomeLabel || "",
      targetTokenUuid: data.targetTokenUuid || defenceResult.targetTokenUuid || "",
      damageType: damageRedirected ? "" : damageType,
      damageValue: damageRedirected ? 0 : damageValue,
      phase: "finalDamage"
    });
  }

  await maybePromptRepetitiveAttack(attackData, {
    outcomeLabel: defenceResult.outcomeLabel || "",
    damageType: damageRedirected ? "" : damageType,
    damageValue: damageRedirected ? 0 : damageValue,
    previousResolve,
    previousWounds,
    nextResolve,
    nextWounds,
    entityActor,
    target,
    targetZone,
    snapshot: attackData.targetSnapshot || {}
  });

  if (entityActor && attackData.attackGroupId) {
    await recordEntityAttackOutcome(entityActor, String(attackData.attackGroupId), {
      woundDamage: damageType === "Wounds" && damageValue > 0
    });
  }

  await message.setFlag("hollows", "applyDamage", { applied: true });
  return true;
}
