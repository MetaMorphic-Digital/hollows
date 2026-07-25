import {
  HOLLOWS_LAST_COMBATANT_BY_COMBAT_ID,
  getCombatantsInBracket
} from "./combat-runtime.js";
import { processEndOfTurn, processStartOfTurn } from "./combat-lifecycle.js";
import { dispatchToGM } from "./queries.js";


export async function maybeSetTurnToHighest(combat) {
  if (!combat || !game.user?.isGM) return;
  if (!combat.started) return;
  const hunters = combat.combatants.filter((combatant) => combatant.actor?.type === "hunter");
  if (!hunters.length) return;
  const allReady = hunters.every((combatant) => (combatant.getFlag("hollows", "setup") || {}).bracket && combatant.initiative !== null && combatant.initiative !== undefined);
  if (!allReady) return;
  const setupDone = combat.getFlag("hollows", "setupFirstPickDone");
  const awaiting = combat.getFlag("hollows", "awaitingFirstPick");
  if (!setupDone && !awaiting) {
    const beforeCount = getCombatantsInBracket(combat, "before").length;
    const afterCount = getCombatantsInBracket(combat, "after").length;
    if (beforeCount > 0) {
      await beginFirstPick(combat, "before", null, "setup");
    } else if (afterCount > 0) {
      const entityCombatant = combat.combatants.find((combatant) => combatant.actor?.type === "entity");
      if (!entityCombatant) return;
      await applyFirstPickSelection(combat, entityCombatant.id, null, "setup", true);
    }
  }
}

export async function resetHunterRoundFlagsForNewRound() {
  if (!game.user?.isGM) return;
  for (const actor of (game.actors?.contents || [])) {
    if (actor?.type !== "hunter") continue;
    try { await actor.unsetFlag("hollows", "feintUsed"); } catch (err) {}
    try { await actor.unsetFlag("hollows", "armsReachUsed"); } catch (err) {}
  }
}

export async function applyFirstPickSelection(combat, combatantId, prevCombatantId, reason = "", eotDone = false) {
  if (!combat || !game.user?.isGM) return;
  const prevId = prevCombatantId || null;
  if (reason !== "setup" && prevId && !eotDone) {
    const prevCombatant = combat.combatants.get(prevId);
    if (prevCombatant) {
      if (!prevCombatant.getFlag("hollows", "acted")) {
        await prevCombatant.setFlag("hollows", "acted", true);
      }
      await processEndOfTurn(combat, prevCombatant);
    }
  }
  await combat.setFlag("hollows", "awaitingFirstPick", null);
  if (reason === "setup") {
    await combat.setFlag("hollows", "setupFirstPickDone", true);
  }

  const turns = combat.turns || [];
  const index = turns.findIndex((turn) => turn.id === combatantId);
  if (index === -1) return;
  if (combat.turn !== index || (reason === "round-start")) {
    const updateData = { turn: index };
    if (reason === "round-start") {
      updateData.round = Math.max(1, Number(combat.round || 0) + 1);
      await resetHunterRoundFlagsForNewRound();
    }
    await combat.update(updateData, { hollowsSkipTurnProcessing: true });
  }

  const newCombatant = combat.combatants.get(combatantId);
  await processStartOfTurn(combat, newCombatant);
  HOLLOWS_LAST_COMBATANT_BY_COMBAT_ID.set(combat.id, combatantId);
}

export function shouldCurrentUserHandleFirstPick(awaiting = null) {
  if (!awaiting) return false;
  const chooserUserId = String(awaiting.chooserUserId || "");
  if (chooserUserId) return chooserUserId === String(game.user?.id || "");
  return !!game.user?.isGM;
}

export async function ensureFirstPickDialog(combat, nonce = "") {
  if (!combat?.started) return;
  const awaiting = combat.getFlag("hollows", "awaitingFirstPick") || null;
  if (!awaiting || !shouldCurrentUserHandleFirstPick(awaiting)) return;
  const expectedNonce = String(nonce || awaiting.nonce || "");
  if (findOpenFirstPickDialog(combat.id, expectedNonce) || findOpenFirstPickDialog(combat.id)) return;
  await openFirstPickDialog(combat, awaiting.bracket, expectedNonce, {
    prevCombatantId: awaiting.prevCombatantId || "",
    reason: awaiting.reason || "",
    chooserUserId: awaiting.chooserUserId || "",
    eotDone: !!awaiting.eotDone,
    persistent: true,
    forceReopen: true
  });
}

export async function openFirstPickDialog(combat, bracket, nonce = "", options = {}) {
  if (!combat || !bracket) return;
  if (findOpenFirstPickDialog(combat.id, nonce) || findOpenFirstPickDialog(combat.id)) return;
  if (!game.hollowsFirstPickOpening) game.hollowsFirstPickOpening = new Set();
  if (!game.hollowsFirstPickOpeningByCombat) game.hollowsFirstPickOpeningByCombat = new Set();
  const openKey = getFirstPickOpenKey(combat.id, nonce, bracket);
  if (game.hollowsFirstPickOpening.has(openKey) || game.hollowsFirstPickOpeningByCombat.has(String(combat.id || ""))) return;
  game.hollowsFirstPickOpening.add(openKey);
  game.hollowsFirstPickOpeningByCombat.add(String(combat.id || ""));
  const candidates = getCombatantsInBracket(combat, bracket);
  if (!candidates.length) {
    game.hollowsFirstPickOpening.delete(openKey);
    game.hollowsFirstPickOpeningByCombat.delete(String(combat.id || ""));
    return;
  }
  if (nonce) {
    if (!game.hollowsFirstPickNonceSeen) game.hollowsFirstPickNonceSeen = new Map();
    const seen = game.hollowsFirstPickNonceSeen.get(combat.id);
    if (seen === nonce && !options.forceReopen) {
      game.hollowsFirstPickOpening.delete(openKey);
      game.hollowsFirstPickOpeningByCombat.delete(String(combat.id || ""));
      return;
    }
    game.hollowsFirstPickNonceSeen.set(combat.id, nonce);
  }
  const optionHtml = candidates.map((combatant) => `<option value="${combatant.id}">${combatant.name}</option>`).join("");
  const content = `
    <form class="hollows-roll-dialog">
      <p>Choose which combatant acts first in this bracket.</p>
      <div class="form-group">
        <label>First to Act (${bracket === "before" ? "Before" : "After"})</label>
        <select name="combatantId">${optionHtml}</select>
      </div>
    </form>
  `;
  let choiceMade = false;
  const dialog = new foundry.applications.api.DialogV2({
    window: { title: `Choose First (${bracket === "before" ? "Before" : "After"})` },
    content,
    buttons: [
      { action: "pick", label: "Select", default: true, callback: async (_e, _b, dlg) => {
        choiceMade = true;
        const id = String(dlg.element.querySelector("[name=combatantId]")?.value || "");
        if (!id) return;
        if (game.user?.isGM) {
          const awaiting = combat.getFlag("hollows", "awaitingFirstPick") || {};
          const prevId = options.prevCombatantId || awaiting.prevCombatantId || null;
          const reason = options.reason || awaiting.reason || "round-start";
          const eotDone = !!awaiting.eotDone;
          await applyFirstPickSelection(combat, id, prevId, reason, eotDone);
          return;
        }
        await dispatchToGM("firstPickChoice", {
          combatId: combat.id,
          combatantId: id,
          userId: game.user?.id,
          prevCombatantId: options.prevCombatantId || "",
          reason: options.reason || "",
          bracket
        });
      }},
      { action: "skip", label: "Skip", callback: () => { choiceMade = true; } }
    ]
  });
  dialog.hollowsDialogKind = "first-pick";
  dialog.hollowsCombatId = combat.id;
  dialog.hollowsFirstPickNonce = nonce;
  dialog.addEventListener("close", () => {
    game.hollowsFirstPickOpening?.delete(openKey);
    game.hollowsFirstPickOpeningByCombat?.delete(String(combat.id || ""));
    if (!options.persistent || choiceMade) return;
    window.setTimeout(() => {
      const latestCombat = game.combats?.get(combat.id) || game.combat;
      const awaiting = latestCombat?.getFlag("hollows", "awaitingFirstPick") || null;
      if (!awaiting) return;
      if (String(awaiting.nonce || "") !== String(nonce || "")) return;
      if (!shouldCurrentUserHandleFirstPick(awaiting)) return;
      ensureFirstPickDialog(latestCombat, nonce);
    }, 0);
  });
  dialog.render({ force: true });
}

export async function beginFirstPick(combat, bracket, prevCombatantId = null, reason = "", chooserUserId = null, eotDone = false, force = false) {
  if (!combat || !game.user?.isGM) return;
  const candidates = getCombatantsInBracket(combat, bracket);
  if (!candidates.length) return;

  await clearActedForBracket(combat, bracket);

  if (candidates.length === 1) {
    await applyFirstPickSelection(combat, candidates[0].id, prevCombatantId, reason, eotDone);
    return;
  }

  const existing = combat.getFlag("hollows", "awaitingFirstPick");
  if (existing) {
    if (!force) return;
    await combat.setFlag("hollows", "awaitingFirstPick", null);
  }

  const nonce = foundry.utils.randomID();
  await combat.setFlag("hollows", "awaitingFirstPick", {
    bracket,
    prevCombatantId: prevCombatantId || null,
    reason,
    chooserUserId: chooserUserId || null,
    eotDone: !!eotDone,
    nonce
  });
  if (chooserUserId && chooserUserId !== game.user?.id) return;
  await openFirstPickDialog(combat, bracket, nonce);
}

export async function finishEntityTurnAndBeginFirstPick(combat, entityCombatant) {
  if (!combat?.started || !game.user?.isGM) return;
  if (!entityCombatant || entityCombatant.actor?.type !== "entity") return;
  await processEndOfTurn(combat, entityCombatant);
  await clearActedForBracket(combat, "after");
  await clearActedForBracket(combat, "before");
  const afterList = getCombatantsInBracket(combat, "after");
  if (afterList.length) {
    await beginFirstPick(combat, "after", entityCombatant.id, "after-entity", null, true, true);
    return;
  }
  const beforeList = getCombatantsInBracket(combat, "before");
  if (beforeList.length) {
    await beginFirstPick(combat, "before", entityCombatant.id, "round-start", null, true, true);
  }
}

function findOpenFirstPickDialog(combatId, nonce = "") {
  for (const app of (foundry.applications.instances?.values() ?? [])) {
    if (String(app.hollowsDialogKind || "") !== "first-pick") continue;
    if (String(app.hollowsCombatId || "") !== String(combatId || "")) continue;
    if (nonce && String(app.hollowsFirstPickNonce || "") !== String(nonce || "")) continue;
    if (!app.rendered) continue;
    return app;
  }
  return null;
}

function getFirstPickOpenKey(combatId, nonce = "", bracket = "") {
  return `${String(combatId || "")}:${String(nonce || "")}:${String(bracket || "")}`;
}

async function clearActedForBracket(combat, bracket) {
  const list = getCombatantsInBracket(combat, bracket);
  for (const combatant of list) {
    if (combatant.getFlag("hollows", "acted")) {
      await combatant.setFlag("hollows", "acted", false);
    }
  }
}
