import {
  HOLLOWS_LAST_COMBATANT_BY_COMBAT_ID,
  HOLLOWS_PREV_COMBATANT_BY_COMBAT_ID,
  getCombatantBracket,
  getCombatantOwners,
  getCombatantsInBracket,
} from "./combat-runtime.js";
import { initializeHunterCoreStatesForCombat } from "../documents/actor/hunter-combat.js";
import { getActiveEntityActor, getActiveHollowActor } from "../canvas/zone.js";
import { hasCondition, removeCondition } from "../documents/actor/conditions.js";
import { triggerEntityTriggeredAbilities } from "../data/entity/actions/entity-special.js";
import {
  beginFirstPick,
  ensureFirstPickDialog,
  maybeSetTurnToHighest,
  resetHunterRoundFlagsForNewRound,
  shouldCurrentUserHandleFirstPick,
} from "./combat-first-pick.js";
import { processEndOfTurn, processStartOfTurn } from "./combat-lifecycle.js";

export async function onCombatInitializeUpdate(combat) {
  if (!game.user?.isGM) return;
  if (!combat) return;
  const startedNow = !!combat.started || (combat.round ?? 0) > 0;
  if (!startedNow) return;
  await initializeHunterCoreStatesForCombat(combat);
}

export async function onCombatAwaitingFirstPickUpdate(combat, changed) {
  if (!combat?.started) return;
  const awaitingChanged = Object.prototype.hasOwnProperty.call(changed?.flags?.hollows || {}, "awaitingFirstPick");
  if (!awaitingChanged) return;
  const awaiting = combat.getFlag("hollows", "awaitingFirstPick") || null;
  if (!awaiting) return;
  if (!shouldCurrentUserHandleFirstPick(awaiting)) return;
  window.setTimeout(() => ensureFirstPickDialog(combat), 0);
}

export function onPreUpdateCombat(combat, changed) {
  if (!game.user?.isGM) return;
  if (!combat) return;
  if (typeof changed.turn === "undefined" && typeof changed.round === "undefined") return;
  const prevCombatantId = combat.combatant?.id || null;
  HOLLOWS_PREV_COMBATANT_BY_COMBAT_ID.set(combat.id, prevCombatantId);
}

export async function onUpdateCombat(combat, changed, options) {
  if (!game.user?.isGM) return;
  if (!combat?.started) return;
  if (typeof changed.turn === "undefined" && typeof changed.round === "undefined") return;
  if (options?.hollowsSkipTurnProcessing) return;
  const awaiting = combat.getFlag("hollows", "awaitingFirstPick");
  if (awaiting?.reason === "setup") return;
  const passInitiative = !!options?.hollowsPassInitiative;
  const manualMakeActive = !!options?.hollowsManualMakeActive;

  const newCombatantId = combat.combatant?.id || null;
  const prevFromPreUpdate = HOLLOWS_PREV_COMBATANT_BY_COMBAT_ID.get(combat.id) ?? null;
  HOLLOWS_PREV_COMBATANT_BY_COMBAT_ID.delete(combat.id);
  const prevFromLastSeen = HOLLOWS_LAST_COMBATANT_BY_COMBAT_ID.get(combat.id) ?? null;
  const prevCombatantId = prevFromPreUpdate || prevFromLastSeen;
  if (!prevCombatantId) {
    HOLLOWS_LAST_COMBATANT_BY_COMBAT_ID.set(combat.id, newCombatantId);
    return;
  }

  const prevCombatant = combat.combatants.get(prevCombatantId);
  const newCombatant = newCombatantId ? combat.combatants.get(newCombatantId) : null;
  const prevIsEntity = prevCombatant?.actor?.type === "entity";
  if (newCombatantId === prevCombatantId) {
    HOLLOWS_LAST_COMBATANT_BY_COMBAT_ID.set(combat.id, newCombatantId);
    return;
  }

  if (newCombatant?.actor?.type === "hunter" && hasCondition(newCombatant.actor, "dead")) {
    const turns = combat.turns || [];
    const startIndex = turns.findIndex((t) => t.id === newCombatantId);
    if (startIndex === -1) return;
    let nextIndex = null;
    for (let i = 1; i <= turns.length; i++) {
      const candidate = turns[(startIndex + i) % turns.length];
      const candidateActor = candidate?.actor || combat.combatants.get(candidate.id)?.actor;
      if (!candidateActor || candidateActor.type !== "hunter") {
        nextIndex = (startIndex + i) % turns.length;
        break;
      }
      if (!hasCondition(candidateActor, "dead")) {
        nextIndex = (startIndex + i) % turns.length;
        break;
      }
    }
    if (nextIndex === null) return;
    await combat.update({ turn: nextIndex }, { hollowsSkipDeadAdvance: true });
    return;
  }

  if (prevCombatant?.actor?.type === "hunter") {
    await prevCombatant.setFlag("hollows", "acted", true);
  }

  const prevBracket = getCombatantBracket(prevCombatant);
  const newBracket = getCombatantBracket(newCombatant);
  const afterExists = getCombatantsInBracket(combat, "after").length > 0;
  if (prevIsEntity) {
    await processEndOfTurn(combat, prevCombatant);
    await clearActedForBracket(combat, "after");
    await clearActedForBracket(combat, "before");
    if (passInitiative) {
      if (newCombatant) {
        await processStartOfTurn(combat, newCombatant);
      }
      if (newBracket === "before" && !afterExists) {
        const nextRound = Math.max(1, Number(combat.round || 0) + 1);
        await combat.update({ round: nextRound }, { hollowsSkipTurnProcessing: true });
        await resetHunterRoundFlagsForNewRound();
      }
      HOLLOWS_LAST_COMBATANT_BY_COMBAT_ID.set(combat.id, prevCombatantId);
      return;
    }
    if (afterExists) {
      await beginFirstPick(combat, "after", prevCombatantId, "after-entity", null, true, true);
    } else {
      const beforeExists = getCombatantsInBracket(combat, "before").length > 0;
      if (beforeExists) {
        await beginFirstPick(combat, "before", prevCombatantId, "round-start", null, true, true);
      }
    }
    HOLLOWS_LAST_COMBATANT_BY_COMBAT_ID.set(combat.id, prevCombatantId);
    return;
  }

  if (prevBracket === "after" && newBracket === "before") {
    const owners = getCombatantOwners(prevCombatant?.actor);
    const chooser = owners.find((u) => !u.isGM)?.id || owners[0]?.id || null;
    await processEndOfTurn(combat, prevCombatant);
    await beginFirstPick(combat, "before", prevCombatantId, "round-start", chooser, true, true);
    HOLLOWS_LAST_COMBATANT_BY_COMBAT_ID.set(combat.id, prevCombatantId);
    return;
  }

  if (!manualMakeActive && prevBracket === "after" && newCombatant?.actor?.type === "entity" && !getCombatantsInBracket(combat, "before").length) {
    await processEndOfTurn(combat, prevCombatant);
    const nextRound = Math.max(1, Number(combat.round || 0) + 1);
    await combat.update({ round: nextRound }, { hollowsSkipTurnProcessing: true });
    await resetHunterRoundFlagsForNewRound();
    if (newCombatant) await processStartOfTurn(combat, newCombatant);
    HOLLOWS_LAST_COMBATANT_BY_COMBAT_ID.set(combat.id, newCombatantId);
    return;
  }

  await processTurnTransition(combat, prevCombatant, newCombatant);

  HOLLOWS_LAST_COMBATANT_BY_COMBAT_ID.set(combat.id, newCombatantId);
}

export async function onUpdateCombatant(combatant, changed) {
  if (!game.user?.isGM) return;
  if (!combatant?.combat) return;
  if (changed?.flags?.hollows?.setup || typeof changed.initiative !== "undefined") {
    await maybeSetTurnToHighest(combatant.combat);
  }
}

export async function onCombatStart(combat) {
  if (!game.user?.isGM) return;
  const hollow = getActiveHollowActor();
  if (hollow) await hollow.unsetFlag("hollows", "explorationTNMod");
  HOLLOWS_LAST_COMBATANT_BY_COMBAT_ID.set(combat.id, combat.combatant?.id || null);
  await triggerEntityTriggeredAbilities(getActiveEntityActor(), "battleStart", {}, ["special", "doom"]);
  const hunters = combat.combatants
    .map((c) => c.actor)
    .filter((a) => a?.type === "hunter");
  for (const hunter of hunters) {
    await resetCombatHunterFlags(hunter);
  }
}

async function clearActedForBracket(combat, bracket) {
  const list = getCombatantsInBracket(combat, bracket);
  for (const combatant of list) {
    if (combatant.getFlag("hollows", "acted")) {
      await combatant.setFlag("hollows", "acted", false);
    }
  }
}

async function processTurnTransition(combat, prevCombatant, newCombatant) {
  if (!combat) return;
  await processEndOfTurn(combat, prevCombatant);
  await processStartOfTurn(combat, newCombatant);
}

async function resetCombatHunterFlags(hunter) {
  if (!hunter) return;
  if (hunter.getFlag("hollows", "dyingRevivedOnce")) {
    await hunter.setFlag("hollows", "dyingRevivedOnce", false);
  }
  if (hunter.getFlag("hollows", "dead")) {
    await hunter.unsetFlag("hollows", "dead");
  }
  if (hasCondition(hunter, "dead")) {
    await removeCondition(hunter, "dead");
  }
}
