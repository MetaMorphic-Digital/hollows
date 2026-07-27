import { STAT_LABELS } from "../../data/_module.mjs";
import { HunterStatRollFlow } from "../../dice/_module.mjs";
import { requestDoomAdjust } from "../../data/entity/actions/entity-doom.js";
import { getActiveHollowActor, getActiveHunterForUser } from "../../canvas/zone.js";
import { pickMany, pickOne, promptForm } from "../../applications/apps/selection-dialogs.mjs";
import { buildStandardRollCardHtml } from "../../applications/ui/roll-card.js";
import { getTotalStatForActor } from "./hunter-combat.js";
import { adjustHunterResource } from "./resources.js";

export { getActiveHollowActor };

export function getPrimaryHunterOwnerId(hunter) {
  if (!hunter) return "";
  const owners = game.users
    .filter((u) => !u.isGM && hunter.testUserPermission(u, "OWNER"))
    .map((u) => u.id);
  return owners[0] || "";
}

export async function chooseIncursionHunter(hunters, defaultHunter = null, { title = "Choose Hunter" } = {}) {
  if (!hunters.length) {
    ui.notifications.warn("No Hunters available.");
    return "";
  }
  return await pickOne({
    title,
    label: "Hunter",
    applyLabel: "Choose",
    options: hunters.map((h) => ({ value: h.id, label: h.name, selected: h.id === defaultHunter?.id }))
  }) || "";
}

export async function promptIncursionConsequences(picks) {
  if (picks <= 0) return { resolve: 0, wounds: 0, doom: 0 };
  const picked = await pickMany({
    title: "Incursion Consequences",
    label: `Consequences (pick ${picks})`,
    applyLabel: "Apply",
    options: [
      { value: "resolve", label: "Suffer 2 Resolve damage" },
      { value: "wounds", label: "Suffer 1 Wound damage" },
      { value: "doom", label: "Increase Doom by 1" }
    ]
  });
  if (!picked) return { resolve: 0, wounds: 0, doom: 0 };
  if (picked.length !== picks) {
    ui.notifications.warn(`Select exactly ${picks} consequences.`);
    return await promptIncursionConsequences(picks);
  }
  return {
    resolve: picked.includes("resolve") ? 2 : 0,
    wounds: picked.includes("wounds") ? 1 : 0,
    doom: picked.includes("doom") ? 1 : 0
  };
}

export async function promptIncursionStatRoll(hollowActor, hunter, label) {
  if (!hollowActor || !hunter) return null;
  const config = await promptForm({
    title: `${label} Roll`,
    bodyHtml: `
      <div class="form-group">
        <label>Hunter</label>
        <div><strong>${foundry.utils.escapeHTML(hunter.name || "Hunter")}</strong></div>
      </div>
    `,
    applyLabel: "Roll",
    fields: [
      {
        type: "select",
        name: "stat",
        label: "Stat",
        options: Object.entries(STAT_LABELS).map(([value, statLabel]) => ({ value, label: statLabel }))
      },
      {
        type: "select",
        name: "mode",
        label: "Roll Mode",
        value: "normal",
        options: [
          { value: "normal", label: "Normal" },
          { value: "adv", label: "Advantage" },
          { value: "dis", label: "Disadvantage" }
        ]
      }
    ]
  });
  if (!config) return null;
  const statKey = String(config.stat || "hard");
  const mode = String(config.mode || "normal");
  const statValue = getTotalStatForActor(hunter, statKey);
  const { roll, results, chosen, effectiveMode } = await new HunterStatRollFlow(hunter, {
    title: label,
    cardTitle: `performs ${label}`,
    statLabel: STAT_LABELS[statKey] || statKey,
    statValue
  }).roll({ mode, useFocus: false });
  const outcomeLabel = chosen.outcome.label;
  const isCritSuccess = outcomeLabel === "Critical Success";
  const isFailure = outcomeLabel === "Failure" || outcomeLabel === "Critical Failure";
  const picks = isCritSuccess ? 0 : (isFailure ? 2 : 1);
  const consequence = await promptIncursionConsequences(picks);
  return {
    hollowActor,
    hunter,
    label,
    statKey,
    mode: effectiveMode,
    roll,
    results,
    chosen,
    chosenValue: Number(chosen.value ?? 0),
    statValue,
    outcomeLabel,
    consequence,
    picks,
    card: buildIncursionRollCard({ hunter, label, statKey, statValue, results, mode: effectiveMode, chosen, consequence })
  };
}

export async function applyIncursionConsequencesToHunter(hunter, consequence) {
  if (!hunter || !consequence) return;
  const resolveLoss = Number(consequence.resolve ?? 0);
  const woundLoss = Number(consequence.wounds ?? 0);
  const doomGain = Number(consequence.doom ?? 0);
  if (resolveLoss > 0 || woundLoss > 0) {
    await adjustHunterResource(hunter, { resolve: -resolveLoss, wounds: -woundLoss });
  }
  if (doomGain) await requestDoomAdjust(doomGain);
}

export async function recordIncursionStepResult(hollowActor, stepId, hunter) {
  if (!hollowActor || !stepId || !hunter) return;
  await hollowActor.update({
    [`system.incursion.steps.${stepId}.done`]: true,
    [`system.incursion.steps.${stepId}.performerActorId`]: hunter.id,
    [`system.incursion.steps.${stepId}.performerName`]: hunter.name || "",
    [`system.incursion.steps.${stepId}.performerImg`]: hunter.img || ""
  });
}

export async function runHollowIncursionStep(hollowActor, stepId, label) {
  if (!hollowActor || !game.user?.isGM) return false;
  const hunters = game.actors.filter((a) => a.type === "hunter");
  const defaultHunter = getActiveHunterForUser() || hunters[0];
  const hunterId = await chooseIncursionHunter(hunters, defaultHunter, { title: `${label}: Choose Hunter` });
  if (!hunterId) return false;
  const hunter = game.actors.get(hunterId);
  if (!hunter) return false;
  const ownerId = getPrimaryHunterOwnerId(hunter);
  if (ownerId) {
    const owner = game.users.get(ownerId);
    const { runUserQuery } = await import("../../helpers/queries.js");
    let result = null;
    try {
      result = await runUserQuery(owner, "hollows.incursionRoll", {
        hollowId: hollowActor.id,
        hunterId: hunter.id,
        stepId,
        label
      }, { timeout: 120_000 });
    } catch (err) {
      console.warn("Hollows | Incursion roll query failed", err);
      return false;
    }
    if (!result) return false;
    await finalizeIncursionRollResult({
      hollow: hollowActor,
      hunter,
      stepId,
      label,
      statKey: result.statKey,
      mode: result.mode,
      chosenValue: result.chosenValue,
      statValue: result.statValue,
      outcomeLabel: result.outcomeLabel,
      results: result.results,
      consequence: result.consequence
    });
    return true;
  }
  const result = await promptIncursionStatRoll(hollowActor, hunter, label);
  if (!result) return false;
  await finalizeIncursionRollResult({
    hollow: hollowActor,
    hunter,
    stepId,
    label,
    statKey: result.statKey,
    mode: result.mode,
    chosenValue: result.chosenValue,
    statValue: result.statValue,
    outcomeLabel: result.outcomeLabel,
    results: result.results,
    consequence: result.consequence,
    roll: result.roll,
    card: result.card
  });
  return true;
}

export async function promptIncursionRollQuery(payload = {}) {
  const hollow = payload.hollowId ? game.actors.get(payload.hollowId) : null;
  const hunter = payload.hunterId ? game.actors.get(payload.hunterId) : null;
  if (!hollow || hollow.type !== "hollow" || !hunter || hunter.type !== "hunter") return null;
  if (!hunter.testUserPermission(game.user, "OWNER")) return null;

  const result = await promptIncursionStatRoll(
    hollow,
    hunter,
    String(payload.label || payload.stepId || "Incursion")
  );
  if (!result) return null;
  return {
    statKey: String(result.statKey || "hard"),
    mode: String(result.mode || "normal"),
    chosenValue: Number(result.chosenValue ?? 0),
    statValue: Number(result.statValue ?? 0),
    outcomeLabel: String(result.outcomeLabel || "Failure"),
    results: Array.isArray(result.results) ? result.results : [],
    consequence: result.consequence || { resolve: 0, wounds: 0, doom: 0 }
  };
}

async function finalizeIncursionRollResult({ hollow, hunter, stepId, label, statKey, mode, chosenValue, statValue, outcomeLabel, results, consequence, roll = null, card = "" } = {}) {
  await applyIncursionConsequencesToHunter(hunter, consequence || {});
  await recordIncursionStepResult(hollow, stepId, hunter);
  const content = card || buildIncursionRollCard({
    hunter,
    label,
    statKey,
    statValue,
    results,
    mode,
    chosen: { value: chosenValue, outcome: { label: outcomeLabel } },
    consequence
  });
  const messageData = {
    speaker: ChatMessage.getSpeaker({ actor: hunter }),
    flavor: `${hollow.name}: ${label}`,
    content
  };
  if (roll) await roll.toMessage(messageData);
  else await ChatMessage.create(messageData);
}

function incursionConsequenceSummary(consequence = {}) {
  const resolve = Number(consequence?.resolve ?? 0);
  const wounds = Number(consequence?.wounds ?? 0);
  const doom = Number(consequence?.doom ?? 0);
  return resolve || wounds || doom
    ? `; Consequences: -${resolve} Resolve, -${wounds} Wounds, +${doom} Doom`
    : "; Critical Success: generate a Relic or Rumour.";
}

function buildIncursionRollCard({ hunter, label, statKey, statValue, results, mode, chosen, consequence } = {}) {
  return buildStandardRollCardHtml({
    actorName: hunter?.name || "",
    title: `performs ${label}`,
    statLabel: STAT_LABELS[String(statKey || "hard")] || String(statKey || "hard"),
    statValue,
    tn: null,
    results,
    mode,
    chosen,
    extraLines: [incursionConsequenceSummary(consequence).replace(/^; /, "")]
  });
}
