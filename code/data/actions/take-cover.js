import { HOLLOWS_CONDITIONS } from "../_module.mjs";
import {
  getActorZone, getAdjacentZones, getHunterTokensInZone,
  getActorTokenOnScene, getTokenZone
} from "../../canvas/zone.js";
import { getTerrainPoolValue, spendTerrainPoolTag } from "../../canvas/terrain-pool.js";
import { placeThreatFromHunter } from "../../canvas/threat-ops.js";
import {
  hasCondition, requestTerrainConditionApply, isPooledTerrainTag
} from "../../documents/actor/conditions.js";
import { runOnTakeCover, getTakeCoverModifier } from "../../helpers/weapon-abilities/dispatchers.js";
import { getTotalStatForActor } from "../../documents/actor/hunter-combat.js";
import { adjustHunterResource } from "../../documents/actor/resources.js";
import { buildStandardRollCardHtml } from "../../applications/ui/roll-card.js";
import { HunterStatRollFlow } from "../../dice/flow.js";
import { triggerUseOnManoeuvre } from "./use.js";
import { pickOne, promptForm } from "../../applications/apps/selection-dialogs.mjs";
import { applyInterceptors } from "../../helpers/extensions.js";

export async function openTakeCoverForActor(actor, opts = {}) {
  if (!actor || actor.type !== "hunter") return;
  const zone = getActorZone(actor);
  if (!zone) {
    ui.notifications.warn("Hunter must be in a zone to Take Cover.");
    return;
  }
  const reason = String(opts.reason || "Take Cover");
  const skipRoll = !!opts.skipRoll || !!opts.forcedFailure;
  let allowedTags = Array.isArray(opts.allowedTags) && opts.allowedTags.length
    ? opts.allowedTags.map((tag) => String(tag)).filter((tag) => HOLLOWS_CONDITIONS[tag])
    : ["elevated", "sheltered"];
  if (!allowedTags.length) allowedTags = ["elevated", "sheltered"];
  let failureModes = Array.isArray(opts.failureModes) && opts.failureModes.length
    ? opts.failureModes.map((mode) => String(mode)).filter((mode) => ["resolve", "threat", "lose"].includes(mode))
    : ["resolve", "threat", "lose"];
  if (!failureModes.length) failureModes = ["resolve", "threat", "lose"];
  const tcMod = getTakeCoverModifier(actor);
  const expandTargeting = (tcMod.expandZones || tcMod.allowOtherTarget) && opts.allowTargetExpansion !== false && !skipRoll;
  const zonesForTargets = expandTargeting ? Array.from(new Set([zone, ...getAdjacentZones(zone)])) : [zone];
  const targetCandidates = expandTargeting
    ? zonesForTargets.flatMap((z) => getHunterTokensInZone(z))
    : [getActorTokenOnScene(actor)].filter(Boolean);
  const uniqueTargets = Array.from(new Map(targetCandidates.map(t => [t.id, t])).values());
  if (expandTargeting && !uniqueTargets.length) {
    ui.notifications.warn("No eligible Hunters available.");
    return;
  }
  await runOnTakeCover(actor);

  const modStatLabel = expandTargeting && tcMod.statKey ? tcMod.statKey.charAt(0).toUpperCase() + tcMod.statKey.slice(1) : null;
  const statElevated = modStatLabel ?? "Strong";
  const statSheltered = modStatLabel ?? "Quick";
  const fields = [{
    type: "select", name: "tag", label: "Terrain Tag",
    options: allowedTags.map((tag) => ({
      value: tag,
      label: `${HOLLOWS_CONDITIONS[tag]?.label || tag}${tag === "elevated" ? ` (${statElevated})` : tag === "sheltered" ? ` (${statSheltered})` : ""}`
    }))
  }];
  if (expandTargeting) fields.push({
    type: "select", name: "targetId", label: "Recipient",
    options: uniqueTargets.map((t) => ({
      value: t.document?.uuid || t.uuid || "",
      label: t.name || t.actor?.name || "Hunter"
    }))
  });

  const runFlow = async (picked) => {
    const tag = String(picked.tag || "elevated");
    const targetTokenUuid = expandTargeting
      ? String(picked.targetId || "")
      : (getActorTokenOnScene(actor)?.document?.uuid || getActorTokenOnScene(actor)?.uuid || "");
    const targetToken = targetTokenUuid ? await fromUuid(targetTokenUuid) : getActorTokenOnScene(actor);
    if (!targetToken) {
      ui.notifications.warn("Target token not found.");
      return;
    }
    const targetActor = targetToken.actor || actor;
    const targetZone = getTokenZone(targetToken);
    if (!targetZone) {
      ui.notifications.warn("Target must be in a zone to Take Cover.");
      return;
    }
    const statKey = expandTargeting && tcMod.statKey ? tcMod.statKey : (tag === "sheltered" ? "quick" : "strong");
    const statValue = getTotalStatForActor(actor, statKey);
    const conditionTarget = targetToken.actor || targetActor;
    const tokenUuid = targetToken.document?.uuid || targetToken.uuid || "";
    if (hasCondition(conditionTarget, tag)) {
      ui.notifications.warn(`${targetActor.name} already has ${HOLLOWS_CONDITIONS[tag].label}.`);
      return false;
    }
    const available = getTerrainPoolValue(tag);
    if (available !== null && available <= 0) {
      ui.notifications.warn(`No ${HOLLOWS_CONDITIONS[tag].label} terrain tags left in pool.`);
      return false;
    }

    const claimZone = targetZone;

    const applyTerrainTag = async () => {
      const replaced = await applyInterceptors("take-cover", {
        actor: targetActor, userId: game.user?.id || "", zone: claimZone, token: targetToken, tag
      }, "");
      if (!replaced) {
        await requestTerrainConditionApply(conditionTarget, tag, tokenUuid, true);
        await spendTerrainPoolTag(tag, 1);
      }
      return { replaced };
    };

    const targetLabel = targetActor.id === actor.id ? `${actor.name}` : `${actor.name} (given to ${targetActor.name})`;

    const applyFailure = async ({ roll = null, results = [], chosen, useFocus = false, effectiveMode = "normal" } = {}) => {
      const failMode = await pickOne({
        title: `${reason} Failed`,
        label: "Failure Consequence",
        options: failureModes.map((mode) => ({
          value: mode,
          label: mode === "resolve" ? "Suffer 1 Resolve Damage"
               : mode === "threat" ? "Place 1 Threat"
               : "Discard Terrain Tag"
        }))
      });
      if (!failMode) return null;
      let replaced = "";
      if (failMode !== "lose") {
        const result = await applyTerrainTag();
        replaced = result.replaced;
      }
      if (failMode === "resolve") {
        await adjustHunterResource(actor, { resolve: -1 });
      } else if (failMode === "threat") {
        const ok = await placeThreatFromHunter(actor, zone, 1, { source: "action", reason });
        if (!ok) await adjustHunterResource(actor, { resolve: -1 });
      }
      const chatContent = buildStandardRollCardHtml({
        actorName: actor.name,
        title: `${reason} Failed`,
        statLabel: statKey.charAt(0).toUpperCase() + statKey.slice(1),
        statValue: statValue,
        tn: null,
        results,
        mode: effectiveMode,
        chosen: chosen || { value: "-", outcome: { label: "Failure" } },
        useFocus,
        extraLines: [
          `<div><strong>${targetLabel}</strong> fails to claim <strong>${HOLLOWS_CONDITIONS[tag].label}</strong>.</div>`,
          `<div>Consequence: <strong>${failMode}</strong>.</div>`,
          failMode !== "lose" && !replaced && isPooledTerrainTag(tag) ? `<span class="hollows-terrain-event" data-terrain-event="claim" data-terrain-tag="${tag}"></span>` : "",
          failMode !== "lose" && replaced ? `<div>Replaced with <strong>${foundry.utils.escapeHTML(replaced)}</strong>.</div>` : ""
        ]
      });
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: reason,
        content: chatContent,
        rolls: roll ? [roll] : []
      });
      return true;
    };

    if (skipRoll) {
      return await applyFailure();
    }

    const rollOutcome = await new HunterStatRollFlow(actor, {
      title: reason,
      statLabel: statKey.charAt(0).toUpperCase() + statKey.slice(1),
      statValue
    }).roll({
      mode: "normal",
      useFocus: false
    });
    if (!rollOutcome) return false;
    const { roll, results, chosen, useFocus, effectiveMode } = rollOutcome;
    const success = chosen.outcome.label === "Success" || chosen.outcome.label === "Superior Success" || chosen.outcome.label === "Critical Success";

    if (success) {
      const { replaced } = await applyTerrainTag();
      const chatContent = buildStandardRollCardHtml({
        actorName: actor.name,
        title: reason,
        statLabel: statKey.charAt(0).toUpperCase() + statKey.slice(1),
        statValue: statValue,
        tn: null,
        results,
        mode: effectiveMode,
        chosen,
        useFocus,
        extraLines: [
          `<div><strong>${targetLabel}</strong> claims <strong>${HOLLOWS_CONDITIONS[tag].label}</strong>.</div>`,
          replaced ? `<div>Replaced with <strong>${foundry.utils.escapeHTML(replaced)}</strong>.</div>` : "",
          !replaced && isPooledTerrainTag(tag) ? `<span class="hollows-terrain-event" data-terrain-event="claim" data-terrain-tag="${tag}"></span>` : ""
        ]
      });

      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: reason,
        content: chatContent,
        rolls: [roll]
      });
      return true;
    }

    return await applyFailure({ roll, results, chosen, useFocus, effectiveMode });
  };

  const picked = await promptForm({ title: reason, fields, applyLabel: skipRoll ? "Apply" : "Roll" });
  const tcResult = picked ? await runFlow(picked) : null;
  if (tcResult !== null) await triggerUseOnManoeuvre(actor, "take-cover");
  return tcResult;
}
