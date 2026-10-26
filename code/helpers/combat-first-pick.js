import { getCombatantsInBracket, getCombatTurnKey, isSameCombatTurn } from "./combat-runtime.js";
import { processEndOfTurn, processStartOfTurn } from "./combat-lifecycle.js";
import { COMBAT_QUERY_TIMEOUT, runUserQuery } from "./queries.js";

const selectionInProgress = new WeakSet();
const entityEndInProgress = new WeakSet();

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
  if (selectionInProgress.has(combat)) return;
  selectionInProgress.add(combat);
  try {
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
    const turns = combat.turns || [];
    const index = turns.findIndex((turn) => turn.id === combatantId);
    if (index === -1) return;
    if (combat.turn !== index || (reason === "round-start")) {
      const updateData = { turn: index };
      if (reason === "round-start") {
        updateData.round = Math.max(1, Number(combat.round || 0) + 1);
        await resetHunterRoundFlagsForNewRound();
      }
      await combat.update(updateData, { hollowsSkipTurnProcessing: true, turnEvents: false });
    }

    const newCombatant = combat.combatants.get(combatantId);
    await processStartOfTurn(combat, newCombatant);
    combat.lastCombatantId = combatantId;
  } finally {
    selectionInProgress.delete(combat);
  }
}

export function shouldCurrentUserHandleFirstPick(awaiting = null) {
  if (!awaiting) return false;
  const chooserUserId = String(awaiting.chooserUserId || "");
  if (chooserUserId) return chooserUserId === String(game.user?.id || "");
  return game.user.isActiveGM;
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
  const turn = getCombatTurnKey(combat);
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
        await runUserQuery(game.users.activeGM, "hollows.firstPickChoice", {
          combatId: combat.id,
          combatantId: id,
          nonce,
          turn,
          prevCombatantId: options.prevCombatantId || "",
          reason: options.reason || "",
        }, { timeout: COMBAT_QUERY_TIMEOUT });
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
  await ensureFirstPickDialog(combat, nonce);
}

/** Finish an Entity turn once and offer the next bracket to the active GM. */
export async function finishEntityTurnAndBeginFirstPick(combat, turn) {
  if (!combat.started || !game.user.isActiveGM) return;
  if (!isSameCombatTurn(turn, getCombatTurnKey(combat))) return;
  if (entityEndInProgress.has(combat) || selectionInProgress.has(combat)) return;
  if (combat.getFlag("hollows", "awaitingFirstPick")) return;
  const entityCombatant = combat.combatant;
  if (entityCombatant.actor.type !== "entity") return;
  entityEndInProgress.add(combat);
  try {
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
  } finally {
    entityEndInProgress.delete(combat);
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

export async function clearActedForBracket(combat, bracket) {
  const list = getCombatantsInBracket(combat, bracket);
  for (const combatant of list) {
    if (combatant.getFlag("hollows", "acted")) {
      await combatant.setFlag("hollows", "acted", false);
    }
  }
}
