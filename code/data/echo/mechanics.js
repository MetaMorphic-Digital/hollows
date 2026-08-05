import { OnDeath } from "../mechanics/OnDeath.js";
import { addCondition, removeCondition } from "../../documents/actor/conditions.js";
import { applyEffectGroupGM } from "../relic/apply-effect.js";

const echoChat = (actor, body) =>
  ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="hollows-chat">${body}</div>`,
  });

/**
 * Find a dying replacement echo.
 * @param {HollowsActor} actor
 * @returns {HollowsItem|null}
 */
function getDyingReplacementEcho(actor) {
  return actor.activeEchoes.find(echo => echo.system.replaceDyingState.enabled);
}

async function markReplacementUsed(actor, echoItem, cfg) {
  if (!cfg.oncePerCombat) return true;
  const combatId = game.combat?.id || "";
  const used = actor.getFlag("hollows", "echoReplaceDyingUsed") || {};
  if (combatId && used[echoItem.id] === combatId) {
    ui.notifications.warn(`${echoItem.name} already replaced dying this combat.`);
    return false;
  }
  await actor.setFlag("hollows", "echoReplaceDyingUsed", { ...used, [echoItem.id]: combatId || true });
  return true;
}

async function applyDyingReplacementGroups(actor, cfg) {
  const groups = Array.isArray(cfg.groups) ? cfg.groups : [];
  for (const group of groups) {
    if (!group?.enabled) continue;
    if (String(group.trigger || "") !== "onDeath") continue;
    await applyEffectGroupGM({ group, bearer: actor });
  }
}

async function applyEchoDyingReplacement(actor, echoItem) {
  if (actor.getFlag("hollows", "replaceDyingStateProcessing")) return { handled: false };
  const cfg = echoItem.system?.replaceDyingState || {};
  if (!(await markReplacementUsed(actor, echoItem, cfg))) return { handled: false };

  await actor.setFlag("hollows", "replaceDyingStateProcessing", true);
  try {
    await applyDyingReplacementGroups(actor, cfg);

    if (String(cfg.outcome || "preventDeath") === "preventDeath") {
      await removeCondition(actor, "dying");
      const rMax = Number(actor.system?.health?.resolve?.max ?? 0);
      const wMax = Number(actor.system?.health?.wounds?.max ?? 0);
      await actor.update({
        "system.health.resolve.value": Math.min(rMax || 999, Math.max(0, Number(cfg.resolve ?? 1) || 0)),
        "system.health.wounds.value": Math.min(wMax || 999, Math.max(1, Number(cfg.wounds ?? 1) || 1)),
      });
      await echoChat(actor, `<strong>${foundry.utils.escapeHTML(actor.name)}</strong> survives (${foundry.utils.escapeHTML(echoItem.name)}).`);
      if (echoItem.system.state.has("onePerHollow")) {
        const state = new Set(echoItem.system.state);
        state.add("usedThisHollow");
        await echoItem.update({ "system.state": [...state] });
      }
      return { handled: true, preventedDeath: true };
    }

    await removeCondition(actor, "dying");
    await addCondition(actor, "dead");
    await echoChat(actor, `<strong>${foundry.utils.escapeHTML(actor.name)}</strong> has died (${foundry.utils.escapeHTML(echoItem.name)}).`);
    if (echoItem.system.state.has("onePerHollow")) {
      const state = new Set(echoItem.system.state);
      state.add("usedThisHollow");
      await echoItem.update({ "system.state": [...state] });
    }
    return { handled: true, preventedDeath: false };
  } finally {
    await actor.unsetFlag("hollows", "replaceDyingStateProcessing");
  }
}

export const ECHO_REPLACE_DYING_STATE = new OnDeath({
  key: "echo.replace-dying-state",
  name: "Echo Replace Dying State",
  priority: 60,
  active: (actor) => !!getDyingReplacementEcho(actor),
  handler: async (actor) => {
    const echo = getDyingReplacementEcho(actor);
    return echo ? applyEchoDyingReplacement(actor, echo) : { handled: false };
  },
});
