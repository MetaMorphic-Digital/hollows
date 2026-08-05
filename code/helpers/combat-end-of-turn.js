import { addThreatToZone } from "../canvas/overlays.js";
import { getEffectiveEntityStat } from "../documents/entity/entity-stats.js";
import { triggerEntityTriggeredAbilities } from "../data/entity/actions/entity-special.js";
import { hasCondition } from "../documents/actor/conditions.js";
import { openInterruptPromptForHunterEnd } from "../data/entity/actions/entity-interrupt.js";
import { runEndOfTurnAbilities, runOnTurnEnd } from "./weapon-abilities/dispatchers.js";
import { THREAT_PLACEMENT_SCOPE_LABELS } from "../data/gameplay-constants.js";
import {
  getActiveEntityActor,
  getRegionThreatData,
  getThreatRegionDocs,
  localizeZone,
  resolveThreatPlacementZones,
} from "../canvas/zone.js";

const THREAT_PLACEMENT_TEMPLATE = "systems/hollows/templates/apps/threat-placement.html";

const MODE_LABELS = {
  place: "HOLLOWS.THREAT.modePlace",
  shift: "HOLLOWS.THREAT.modeShift",
  burn: "HOLLOWS.THREAT.modeBurn",
};

/** Run end-of-turn combat effects. */
export async function runEndOfTurnEffects(combat, prevCombatant) {
  if (!combat || !prevCombatant) return;
  const actor = prevCombatant.actor;

  if (actor?.type === "entity") {
    await triggerEntitySpecialsOnPhase("entityEnd");
    await openEntityThreatPlacementDialog(combat, actor);
    return;
  }
  if (actor?.type !== "hunter" || hasCondition(actor, "dead")) return;

  await runEndOfTurnAbilities(actor);
  await runOnTurnEnd(actor);

  const ward = actor.getFlag("hollows", "wardGranted");
  if (ward?.sourceId) {
    // Non-owners reach this path too, so the flag writes are allowed to fail.
    const source = game.actors.get(ward.sourceId);
    await source?.unsetFlag("hollows", "wardSuppressed");
    await actor.unsetFlag("hollows", "wardGranted");
  }

  const entityCombatant = combat.combatants.find((combatant) => combatant.actor?.type === "entity");
  const entityActor = entityCombatant?.actor || getActiveEntityActor();
  if (entityActor) await openInterruptPromptForHunterEnd(combat, entityActor);
  await triggerEntitySpecialsOnPhase("hunterEnd");
}

/** Run Entity triggers for a phase. */
export async function triggerEntitySpecialsOnPhase(phase) {
  if (!game.user?.isGM) return;
  const entity = getActiveEntityActor();
  if (!entity) return;
  await triggerEntityTriggeredAbilities(entity, phase, {}, ["special", "doom"]);
}

/** Resolve placement rules against scene zones. */
function resolvePlacementRules(entityActor, zoneIds, scene) {
  return (entityActor?.system?.threat?.placement || []).map((rule) => ({
    scope: rule.scope,
    zones: resolveThreatPlacementZones(rule, scene).filter((zone) => zoneIds.includes(zone)),
    amount: rule.amount,
    perZoneMax: rule.perZoneMax,
  }));
}

/** Find the first placement-rule violation. */
function placementViolation(rules, increments) {
  if (!rules.length) return null;
  const outside = increments.find(([zone]) => !rules.some((rule) => rule.zones.includes(zone)));
  if (outside) return { key: "HOLLOWS.THREAT.errorZone", data: { zone: outside[0] } };

  for (const rule of rules) {
    const own = increments.filter(([zone]) => rule.zones.includes(zone));
    const total = own.reduce((sum, [, count]) => sum + count, 0);
    if (total > rule.amount) {
      return { key: "HOLLOWS.THREAT.errorRuleTotal", rule, data: { max: rule.amount } };
    }
    if (rule.perZoneMax && own.some(([, count]) => count > rule.perZoneMax)) {
      return { key: "HOLLOWS.THREAT.errorRuleZone", rule, data: { max: rule.perZoneMax } };
    }
  }
  return null;
}

/** Display label for a placement rule. */
function ruleLabel(rule) {
  if (rule.scope === "select") return rule.zones.map(localizeZone).join(" / ");
  return game.i18n.localize(THREAT_PLACEMENT_SCOPE_LABELS[rule.scope]);
}

/** Localized message for a placement violation. */
function violationMessage(violation) {
  const data = { ...(violation.data || {}) };
  if (data.zone) data.zone = localizeZone(data.zone);
  if (violation.rule) data.rule = ruleLabel(violation.rule);
  return game.i18n.format(violation.key, data);
}

/** Open the GM prompt for end-of-turn Threat. */
async function openEntityThreatPlacementDialog(combat, entityActor) {
  if (!game.user?.isGM) return;
  const scene = combat?.scene || canvas?.scene;
  const threatRegions = getThreatRegionDocs(scene);
  if (!threatRegions.length) return;

  const zones = threatRegions.map((region) => {
    const data = getRegionThreatData(region);
    return { zoneId: data.zoneId, current: Math.max(0, Number(data.current) || 0) };
  });
  const perRound = getEffectiveEntityStat(entityActor, "threatPerRound");
  const cap = getEffectiveEntityStat(entityActor, "threatCap");
  const totalNow = zones.reduce((sum, zone) => sum + zone.current, 0);
  const rules = resolvePlacementRules(entityActor, zones.map((zone) => zone.zoneId), scene);

  const evaluate = (targets) => {
    const total = targets.reduce((sum, value) => sum + value, 0);
    const increments = targets
      .map((value, index) => [zones[index].zoneId, Math.max(0, value - zones[index].current)])
      .filter(([, count]) => count > 0);
    const placed = increments.reduce((sum, [, count]) => sum + count, 0);
    const removed = targets.reduce((sum, value, index) => sum + Math.max(0, zones[index].current - value), 0);

    let mode = "place";
    if (cap > 0 && totalNow > cap) mode = "burn";
    else if (cap > 0 && totalNow === cap) mode = "shift";
    const budget = mode === "place" && cap > 0 ? Math.max(0, Math.min(perRound, cap - totalNow)) : perRound;

    let violation = placementViolation(rules, increments);
    if (!violation && placed > budget) violation = { key: "HOLLOWS.THREAT.errorBudget" };
    if (!violation && mode === "place" && removed > 0) violation = { key: "HOLLOWS.THREAT.errorDrop" };
    if (!violation && mode === "shift" && total !== totalNow) violation = { key: "HOLLOWS.THREAT.errorCap" };
    if (!violation && mode === "burn" && total !== cap) violation = { key: "HOLLOWS.THREAT.errorBurn" };
    return { mode, total, violation, valid: !violation };
  };

  const readTargets = (root) => Array.from(root.querySelectorAll("input[type='number']"))
    .map((input) => Math.max(0, Math.round(Number(input.value) || 0)));

  const content = await foundry.applications.handlebars.renderTemplate(THREAT_PLACEMENT_TEMPLATE, {
    zones,
    rules: rules.map((rule) => (rule.perZoneMax
      ? game.i18n.format("HOLLOWS.THREAT.ruleSummaryPerZone", { rule: ruleLabel(rule), max: rule.amount, perZone: rule.perZoneMax })
      : game.i18n.format("HOLLOWS.THREAT.ruleSummary", { rule: ruleLabel(rule), max: rule.amount }))),
  });

  await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize("HOLLOWS.THREAT.title") },
    classes: ["hollows-threat-placement"],
    position: { width: 420 },
    content,
    render: (_event, dialog) => {
      const root = dialog.element;
      const statusEl = root.querySelector(".threat-placement-status");
      const applyBtn = root.querySelector("[data-action='apply']");
      const refresh = () => {
        const state = evaluate(readTargets(root));
        const summary = game.i18n.format("HOLLOWS.THREAT.budget", {
          perRound, cap, total: totalNow, target: state.total,
        });
        const verdict = state.valid
          ? game.i18n.format("HOLLOWS.THREAT.valid", { mode: game.i18n.localize(MODE_LABELS[state.mode]) })
          : violationMessage(state.violation);
        statusEl.innerHTML = `
          <p class="hint">${foundry.utils.escapeHTML(summary)}</p>
          <p class="notification ${state.valid ? "info" : "warning"}">${foundry.utils.escapeHTML(verdict)}</p>
        `;
        if (applyBtn) applyBtn.disabled = !state.valid;
      };
      for (const button of root.querySelectorAll("[data-step]")) {
        button.addEventListener("click", (event) => {
          event.preventDefault();
          const input = button.parentElement.querySelector("input[type='number']");
          input.value = String(Math.max(0, (Number(input.value) || 0) + Number(button.dataset.step)));
          refresh();
        });
      }
      root.addEventListener("input", refresh);
      refresh();
    },
    buttons: [
      {
        action: "apply",
        label: "HOLLOWS.COMBAT.apply",
        default: true,
        callback: async (_event, _button, dialog) => {
          const targets = readTargets(dialog.element);
          for (const [index, zone] of zones.entries()) {
            const delta = targets[index] - zone.current;
            if (delta !== 0) await addThreatToZone(zone.zoneId, delta);
          }
        },
      },
      { action: "cancel", label: "Cancel" },
    ],
    rejectClose: false,
  });
}
