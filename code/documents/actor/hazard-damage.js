import { evaluateResult, isFailureOutcomeLabel } from "../../dice/roll-outcome.js";
import { getActiveHollowActor } from "../../canvas/zone.js";
import { setMessageFlagSafe } from "../../utils/flag-utils.js";
import { requestDoomAdjust } from "../../data/entity/actions/entity-doom.js";
import { adjustHunterResource, StandardDamage } from "./resources.js";
import { getTotalStatForActor } from "./hunter-combat.js";
import { STAT_LABELS } from "../../data/_module.mjs";
import { checkCypherUpgrades } from "../item/relic-cypher.js";

export async function postHazardChatCard(hazardActor) {
  if (!hazardActor) return false;
  const system = hazardActor.system || {};
  const category = String(system.category || "hazard");
  const categoryLabel = category === "hunt" || category === "obstacle" ? "Hunt" : "Hazard";
  const stat = String(system.stat || "strong");
  const tn = Number(system.tn ?? 0);
  const targetMode = String(system.targetMode || "any");
  const damageSuccessResolve = Number(system.damageSuccessResolve ?? 0);
  const damageFailureWounds = Number(system.damageFailureWounds ?? 0);
  const doomOnFailure = Number(system.doomOnFailure ?? 0);
  const participants = (canvas?.tokens?.placeables || [])
    .filter(t => t.actor?.type === "hunter")
    .map(t => t.actor?.uuid)
    .filter(Boolean);

  const content = `
    <div class="hollows-chat hollows-hazard-card">
      <div class="attack-title">${foundry.utils.escapeHTML(hazardActor.name || "Hazard")}</div>
      <div><strong>Type:</strong> ${categoryLabel}</div>
      <div><strong>Stat:</strong> ${STAT_LABELS[stat] || stat} | <strong>TN:</strong> ${tn}</div>
      <div><strong>Targeting:</strong> ${targetMode === "all" ? "All Hunters" : "Any Hunter"}</div>
      <div><strong>Success:</strong> ${damageSuccessResolve} Resolve damage (superior/critical: no damage)</div>
      <div><strong>Failure:</strong> ${damageFailureWounds} Wound damage${doomOnFailure ? `, Doom +${doomOnFailure}` : ""}</div>
      <div><strong>Critical Failure:</strong> ${damageFailureWounds} Wound damage, Doom +1, does not pass</div>
      <button type="button" class="stat-roll hollows-hazard-roll">Roll</button>
    </div>
  `;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker(),
    content,
    flags: {
      hollows: {
        hazard: {
          hazardId: hazardActor.id || "",
          title: hazardActor.name || "",
          type: category,
          stat,
          tn,
          targetMode,
          damageSuccessResolve,
          damageFailureWounds,
          doomOnFailure,
          participants,
          progress: {},
          completed: false
        }
      }
    }
  });
  return true;
}

function hazardDamageDelta(resolvedDamage) {
  if (!resolvedDamage?.damageType || resolvedDamage.damageValue <= 0) return null;
  const key = String(resolvedDamage.damageType).toLowerCase();
  return key === "resolve" || key === "wounds" ? { [key]: -resolvedDamage.damageValue } : null;
}

export async function applyHazardRoll(message, actor, rollValue) {
  if (!message || !actor) return false;
  const current = message.getFlag("hollows", "hazard") || {};
  if (current.completed) return false;
  const actorUuid = actor.uuid || "";
  const progress = current.progress || {};
  if (actorUuid && progress[actorUuid]) return false;

  const stat = String(current.stat || "strong");
  const baseTn = Number(current.tn ?? 0);
  const tnMod = Number(getActiveHollowActor()?.getFlag("hollows", "explorationTNMod") ?? 0);
  const tn = baseTn + Math.max(0, tnMod);
  const statValue = getTotalStatForActor(actor, stat);
  const rollNum = Number(rollValue ?? 0) || 20;
  const outcome = evaluateResult(rollNum, statValue, tn);
  const label = outcome.label;
  const criticalFailure = Number(outcome.rank ?? 0) === 0;
  const passed = !criticalFailure;
  if (passed) await checkCypherUpgrades("hazardPassed", current.hazardId);

  let doomDelta = 0;
  const resolvedDamage = StandardDamage.resolve(
    {
      resolve: Number(current.damageSuccessResolve ?? 0),
      wounds: Number(current.damageFailureWounds ?? 0)
    },
    {
      mode: "defence",
      outcomeLabel: label,
      targetResolve: StandardDamage.targetResolve(actor)
    }
  );

  if (isFailureOutcomeLabel(label)) {
    if (!criticalFailure) doomDelta += Number(current.doomOnFailure ?? 0);
    if (criticalFailure) doomDelta += 1;
  }

  let appliedDamage = null;
  const damageDelta = hazardDamageDelta(resolvedDamage);
  if (damageDelta) {
    await adjustHunterResource(actor, damageDelta);
    appliedDamage = resolvedDamage;
  }
  if (doomDelta) await requestDoomAdjust(doomDelta);

  progress[actorUuid] = { label, passed };
  let completed = !!current.completed;
  if (current.targetMode === "any") {
    if (passed) completed = true;
  } else {
    const participants = Array.isArray(current.participants) ? current.participants : [];
    const allDone = participants.length
      ? participants.every((uuid) => progress[uuid])
      : Object.keys(progress).length > 0;
    if (allDone) completed = true;
  }

  await setMessageFlagSafe(message, "hazard", { ...current, progress, completed });

  const damageLabel = appliedDamage
    ? `${appliedDamage.damageValue} ${appliedDamage.damageType}`
    : "no damage";
  const doomLabel = doomDelta ? `, Doom +${doomDelta}` : "";
  const passLabel = passed ? "passes" : "does not pass";
  const hazardName = current.title || "Hazard";

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `
      <div class="hollows-chat">
        <div><strong>${actor.name}</strong> ${passLabel} <strong>${foundry.utils.escapeHTML(hazardName)}</strong>.</div>
        <div>Roll: ${rollNum} vs ${statValue} (TN ${tn}) - <strong>${label}</strong></div>
        <div>Result: ${damageLabel}${doomLabel}</div>
      </div>
    `
  });

  ui.chat?.render?.();
  return true;
}
