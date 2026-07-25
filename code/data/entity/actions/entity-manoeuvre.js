import { ZONE_GROUPS } from "../../gameplay-constants.js";
import {
  getActorZone,
  getAdjacentZones,
  getTokenZone,
  getZoneList,
  isCloseZone,
  isRangedZone,
  sceneHunterTokens
} from "../../../canvas/zone.js";
import { buildMoveOutcomeCardHtml } from "../../../applications/ui/move-card.js";
import {
  buildEntityAfterAttackConfigs,
  getBeforeAttackTargetSnapshot,
  getEntityModifyIfResult,
  hasEnabledAfterAttackGroups,
  resolveEntityAbilityTN
} from "../action-rules.js";
import {
  normalizeAllowedZones,
  pickActionZones,
  resolveRestoreResolve,
  resolveSingleTargets,
  runEntityAction
} from "../action-flow.js";
import { requestAfterAttackApply } from "../../../documents/entity/attack-effects.js";
import { applyEntityActionCost } from "../../../documents/entity/entity-threat.js";
import { adjustEntityResource } from "../../../documents/actor/resources.js";
import { runEntityActionPauses } from "../../../helpers/weapon-abilities/dispatchers.js";
import { performEntityAttack } from "./entity-attack.js";
import { createEntityNoticeCard, createEntityTestRequest } from "../action-cards.js";

export async function performEntityManoeuvre(entityActor, manoeuvreItem) {
  entityActor = game.actors?.get(entityActor?.id) || entityActor;
  const pause = await runEntityActionPauses({
    actionType: "manoeuvre",
    stage: "beforeResolve",
    entityActor,
    actionName: manoeuvreItem?.name || "Manoeuvre"
  });
  if (pause.cancelled) return;
  const manoeuvre = manoeuvreItem.system || {};
  const actionType = String(manoeuvre.profile.actionType || "other");
  if (actionType === "attack") {
    await performEntityAttack(entityActor, manoeuvreItem);
    return;
  }
  const ctx = {
    entityActor,
    actionItem: manoeuvreItem,
    action: manoeuvre,
    kind: "manoeuvre",
    actionType,
    options: {},
    targets: [],
    selectedZones: [],
    noTargetsMessage: "No valid targets for this manoeuvre.",
    scratch: {}
  };
  return runEntityAction(ctx, manoeuvrePipeline);
}

const manoeuvrePipeline = {
  async resolveTargets(ctx) {
    const { action: manoeuvre, actionType } = ctx;
    const profile = manoeuvre.profile;
    const mode = String(profile.targetMode || "single");
    const allowedZones = normalizeAllowedZones(profile.allowedZones);
    const hunters = sceneHunterTokens();
    if (mode === "noTargets") { ctx.selectedZones = []; return []; }
    if (mode === "single") {
      ctx.selectedZones = [];
      return await resolveSingleTargets({ allowedZones, hunters });
    }
    const allowEmptyZones = actionType === "other"
      || (manoeuvre.restoreResolve?.enabled && manoeuvre.restoreResolve.dynamicSource === "curseZones")
      || (manoeuvre.cost?.enabled && manoeuvre.cost.type === "zoneCurse")
      || (manoeuvre.cost?.enabled && manoeuvre.cost.type === "threat");
    ctx.selectedZones = await pickActionZones({
      allowedZones,
      hunters,
      select: "multi",
      requireHunters: !allowEmptyZones,
      warnNoValidZones: "No valid zones with Hunters for this manoeuvre."
    });
    if (actionType === "other") return [];
    return hunters.filter((t) => ctx.selectedZones.includes(getTokenZone(t)));
  },

  async payCost(ctx) {
    const { action: manoeuvre, targets } = ctx;
    const profile = manoeuvre.profile;
    let zonesForCost = null;
    if (!targets.length && manoeuvre.cost?.enabled && manoeuvre.cost.type === "zoneCurse") {
      zonesForCost = ctx.selectedZones.length ? ctx.selectedZones : (Array.isArray(manoeuvre.restoreResolve?.zones) && manoeuvre.restoreResolve.zones.length
        ? manoeuvre.restoreResolve.zones
        : (Array.isArray(profile.allowedZones) && profile.allowedZones.length ? profile.allowedZones : getZoneList()));
    }
    return applyEntityActionCost(manoeuvre, ctx.entityActor, targets, zonesForCost);
  },

  async afterCost(ctx) {
    await resolveRestoreResolve(ctx.action, ctx.entityActor);
  },

  output: manoeuvreOutput
};

async function manoeuvreOutput(ctx) {
  const { entityActor, actionItem: manoeuvreItem, action: manoeuvre, actionType } = ctx;
  const profile = manoeuvre.profile;
  const filteredTargets = ctx.targets;
  const selectedZones = ctx.selectedZones;

  if (actionType === "other") {
    const safeName = foundry.utils.escapeHTML(manoeuvreItem?.name || manoeuvre.name || "Manoeuvre");
    await createEntityNoticeCard({
      actor: entityActor,
      titleHtml: safeName,
      text: String(profile.text || "")
    });
    const afterAttack = buildEntityAfterAttackConfigs(manoeuvre, "always");
    if (!filteredTargets.length && selectedZones.length && hasEnabledAfterAttackGroups(afterAttack)) {
      for (const zoneId of selectedZones) {
        await requestAfterAttackApply(null, zoneId, afterAttack, entityActor.id, null, { entityActor });
      }
    } else if (!filteredTargets.length && hasEnabledAfterAttackGroups(afterAttack)) {
      await requestAfterAttackApply(null, "", afterAttack, entityActor.id, null, { entityActor });
    }
    for (const targetToken of filteredTargets) {
      const target = targetToken.actor;
      const targetZone = getTokenZone(targetToken) || "";
      await requestAfterAttackApply(target, targetZone, afterAttack, entityActor.id, null, { entityActor });
    }
    return;
  }

  for (const targetToken of filteredTargets) {
    const target = targetToken.actor;
    const targetZone = getTokenZone(targetToken) || "";
    const stat = String(profile.testStat || "hard");
    const tn = resolveEntityAbilityTN(Number(profile.tn ?? 0), {
      mode: profile.tnMode,
      type: profile.tnDynamicType,
      dynamicSource: profile.tnDynamicSource,
      setSource: profile.tnSetSource,
      setDefence: profile.tnSetDefence,
      setStat: profile.tnSetStat
    }, entityActor, targetToken);
    const testName = manoeuvreItem?.name || manoeuvre.name || "Manoeuvre";
    const safeName = foundry.utils.escapeHTML(testName);
    const modify = getEntityModifyIfResult(manoeuvre, targetToken, entityActor, { allowDamage: false });
    const modifySelfDamage = modify.selfDamage;
    const tnModified = tn + modify.tn;
    const effectTextModified = modify.effectText ? String(modify.effectText) : String(profile.effectText || "");
    const afterAttack = buildEntityAfterAttackConfigs(manoeuvre, "successAny");
    const snapshot = getBeforeAttackTargetSnapshot(targetToken, entityActor);
    await createEntityTestRequest({
      entityActor,
      target,
      targetToken,
      titleHtml: `${foundry.utils.escapeHTML(entityActor.name)} uses manoeuvre: ${safeName} on ${foundry.utils.escapeHTML(target.name)}`,
      kind: "manoeuvre",
      testName,
      stat,
      basicRollMode: String(profile.basicRollMode || "normal"),
      tn: tnModified,
      conditionText: profile.conditionText,
      effectText: effectTextModified,
      afterAttack,
      modifySelfDamage,
      targetZone,
      targetSnapshot: snapshot,
      allowGM: true
    });
  }
}

export async function promptShiftHunterToAdjacentZone(sourceActor, targetActor, reason, currentZoneOverride = "") {
  if (!sourceActor || !targetActor) return false;
  const currentZone = String(currentZoneOverride || getActorZone(targetActor) || "");
  if (!currentZone) return false;
  const candidates = getAdjacentZones(currentZone).filter((zone) => isCloseZone(zone) || isRangedZone(zone));
  if (!candidates.length) return false;
  const options = candidates.map((zone) => `<option value="${zone}">${zone}</option>`).join("");
  const chosen = await foundry.applications.api.DialogV2.wait({
    window: { title: reason },
    content: `
        <form class="hollows-roll-dialog">
          <div class="form-group">
            <label>Destination</label>
            <select name="zone">${options}</select>
          </div>
        </form>
      `,
    buttons: [
      { action: "apply", label: "Apply", default: true, callback: (_e, _b, dialog) => String(dialog.element.querySelector("[name=zone]")?.value || "") },
      { action: "cancel", label: "Cancel", callback: () => null }
    ],
    rejectClose: false
  }) ?? "";
  if (!chosen) return false;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: sourceActor }),
    content: buildMoveOutcomeCardHtml({
      reason: reason || "Shift",
      moveType: "Shift",
      moves: [{ subjectName: targetActor.name, sourceZone: currentZone, destinationZone: chosen }]
    })
  });
  return true;
}

function getTurnAroundTargetZone(zone, direction = "clockwise") {
  const clockwise = { "Front": "Flank Right", "Flank Right": "Rear", "Rear": "Flank Left", "Flank Left": "Front" };
  const counter = { "Front": "Flank Left", "Flank Left": "Rear", "Rear": "Flank Right", "Flank Right": "Front" };
  return (direction === "counter" ? counter : clockwise)[zone] || null;
}

export async function performEntityProwl(entityActor, options = {}) {
  if (!entityActor || entityActor.type !== "entity") return false;
  const esc = (value) => foundry.utils.escapeHTML(String(value ?? ""));
  const title = String(options.title || "Prowl");
  const testName = String(options.testName || title);
  const sourceLabel = String(options.sourceLabel || "Source Zone");
  const destinationLabel = String(options.destinationLabel || "Adjacent Zone");
  const sourceFilter = typeof options.sourceZoneFilter === "function" ? options.sourceZoneFilter : null;
  const destinationFilter = typeof options.destinationFilter === "function" ? options.destinationFilter : null;
  const zones = (Array.isArray(options.sourceZones) ? options.sourceZones : getZoneList())
    .map((zone) => String(zone || ""))
    .filter((zone) => zone && (!sourceFilter || sourceFilter(zone)));
  if (!zones.length) {
    ui.notifications.warn(options.noSourceZonesMessage || `No zones found for ${title}.`);
    return false;
  }
  const zoneOptions = zones.map((zone) => `<option value="${esc(zone)}">${esc(zone)}</option>`).join("");
  const selection = await foundry.applications.api.DialogV2.wait({
    window: { title },
    content: `
      <form class="hollows-roll-dialog">
        <div class="form-group">
          <label>${esc(sourceLabel)}</label>
          <select name="sourceZone">${zoneOptions}</select>
        </div>
        <div class="form-group">
          <label>${esc(destinationLabel)}</label>
          <select name="adjacentZone"></select>
        </div>
      </form>
    `,
    buttons: [
      {
        action: "apply",
        label: "Apply",
        default: true,
        callback: (_e, _b, dialog) => ({
          sourceZone: String(dialog.element.querySelector("[name=sourceZone]")?.value || ""),
          adjacentZone: String(dialog.element.querySelector("[name=adjacentZone]")?.value || "")
        })
      }
    ],
    rejectClose: false,
    render: (_e, dialog) => {
      const el = dialog.element;
      const source = el.querySelector("[name=sourceZone]");
      const adjacent = el.querySelector("[name=adjacentZone]");
      const updateAdjacent = () => {
        const src = String(source?.value || "");
        const opts = getAdjacentZones(src).filter((zone) => !destinationFilter || destinationFilter(zone));
        adjacent.innerHTML = opts.map((zone) => `<option value="${esc(zone)}">${esc(zone)}</option>`).join("");
      };
      source?.addEventListener("change", updateAdjacent);
      updateAdjacent();
    }
  }) ?? null;
  if (!selection?.sourceZone || !selection?.adjacentZone) return false;

  const hunters = sceneHunterTokens()
    .filter((token) => (getTokenZone(token) || "") === selection.sourceZone)
    .map((token) => ({ actor: token.actor, token }));
  if (!hunters.length) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: entityActor }),
      content: `<div class="hollows-chat"><strong>${esc(testName)}</strong>: no Hunters in ${esc(selection.sourceZone)}.</div>`
    });
    return false;
  }

  const cost = Math.max(0, Number(options.cost ?? 0) || 0);
  if (cost > 0 && options.spendCostFromSourceZone) {
    const paid = await applyEntityActionCost(null, entityActor, [], [selection.sourceZone], {
      amount: cost,
      source: "entityInterrupt",
      warn: !options.costFailureMessage
    });
    if (!paid && options.costFailureMessage) ui.notifications.warn(options.costFailureMessage);
    if (!paid) return false;
  }

  await runEntityActionPauses({ actionType: "prowl", stage: "beforeResolve", entityActor });

  for (const entry of hunters) {
    const actor = entry.actor;
    await createEntityTestRequest({
      entityActor,
      target: actor,
      targetToken: entry.token,
      titleHtml: `<strong>${esc(entityActor.name)}</strong> uses <strong>${esc(testName)}</strong> on <strong>${esc(selection.sourceZone)}</strong> -> <strong>${esc(selection.adjacentZone)}</strong>.`,
      kind: "prowl",
      testName,
      stat: "quick",
      basicRollMode: "normal",
      tn: null,
      detailsHtml: `<div><strong>${esc(actor.name)}</strong> must test <strong>Quick</strong> (any success).</div>`,
      effectText: `On failure: Reposition to ${selection.adjacentZone}.`,
      buttonLabel: "Roll Quick",
      move: {
        kind: "reposition",
        type: "Reposition",
        on: "failure",
        sourceZone: selection.sourceZone,
        destinationZone: selection.adjacentZone,
        subjectName: actor.name
      }
    });
  }
  return true;
}

export async function openEntityProwlDialog(entityActor) {
  return performEntityProwl(entityActor);
}

export async function applyEntityShrugOff(entityActor) {
  if (!entityActor || entityActor.type !== "entity") return;
  await adjustEntityResource(entityActor, { resolve: 3 });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: entityActor }),
    content: `<div class="hollows-chat"><strong>${entityActor.name}</strong> uses <strong>Shrug Off</strong> and restores <strong>3 Resolve</strong>.</div>`
  });
}

export async function openEntityTurnAroundDialog(entityActor) {
  if (!entityActor || entityActor.type !== "entity") return;
  const closeHunters = sceneHunterTokens()
    .map(t => ({ actor: t.actor, zone: getTokenZone(t) || "" }))
    .filter(h => ZONE_GROUPS.close.includes(h.zone));
  const content = `
    <form class="hollows-roll-dialog">
      <div class="form-group">
        <label>Direction</label>
        <select name="direction">
          <option value="clockwise" selected>Clockwise</option>
          <option value="counter">Counter-Clockwise</option>
        </select>
      </div>
    </form>
  `;
  await foundry.applications.api.DialogV2.wait({
    window: { title: "Turn Around" },
    content,
    buttons: [
      {
        action: "apply",
        label: "Apply",
        default: true,
        callback: async (_e, _b, dialog) => {
          const direction = String(dialog.element.querySelector("[name=direction]")?.value || "clockwise");
          await runEntityActionPauses({ actionType: "turnAround", stage: "beforeResolve", entityActor });
          if (!closeHunters.length) {
            await ChatMessage.create({
              speaker: ChatMessage.getSpeaker({ actor: entityActor }),
              content: `<div class="hollows-chat"><strong>Turn Around</strong>: no Hunters in Close.</div>`
            });
            return;
          }
          const moves = closeHunters.map((h) => ({
            subjectName: h.actor.name,
            sourceZone: h.zone,
            destinationZone: getTurnAroundTargetZone(h.zone, direction) || ""
          }));
          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: entityActor }),
            content: buildMoveOutcomeCardHtml({
              moveType: "Move",
              reason: `Turn Around (${direction === "clockwise" ? "Clockwise" : "Counter-Clockwise"})`,
              moves
            })
          });
        }
      }
    ],
    rejectClose: false
  });
}
