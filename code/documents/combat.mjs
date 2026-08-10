import { getActiveEntityActor, getActiveHollowActor } from "../canvas/zone.js";
import { triggerEntityTriggeredAbilities } from "../data/entity/actions/entity-special.js";
import {
  beginFirstPick,
  clearActedForBracket,
  ensureFirstPickDialog,
  maybeSetTurnToHighest,
  resetHunterRoundFlagsForNewRound,
  shouldCurrentUserHandleFirstPick,
} from "../helpers/combat-first-pick.js";
import { processEndOfTurn, processStartOfTurn } from "../helpers/combat-lifecycle.js";
import { getCombatantBracket, getCombatantOwners, getCombatantsInBracket } from "../helpers/combat-runtime.js";
import { getTerrainTagKeys, removeCondition } from "./actor/conditions.js";
import { initializeHunterCoreStatesForCombat } from "./actor/hunter-combat.js";
import { getFocusCount, setFocusCount } from "./actor/resources.js";

/**
 * System implementation of the Combat class.
 * @extends {foundry.documents.Combat}
 */
export default class HollowsCombat extends foundry.documents.Combat {
  /**
   * The combatant that acted last in bracket order, which is not the tracker's previous combatant.
   * @type {string|null}
   */
  lastCombatantId = null;

  /* -------------------------------------------------- */

  /** @inheritdoc */
  async startCombat() {
    // Before super, so this still runs against the pre-start round and turn.
    if (game.user.isActiveGM) {
      const hollow = getActiveHollowActor();
      if (hollow) await hollow.unsetFlag("hollows", "explorationTNMod");
      this.lastCombatantId = this.combatant?.id || null;
      await triggerEntityTriggeredAbilities(getActiveEntityActor(), "battleStart", {}, ["special", "doom"]);
      await this.#resetHunterCombatFlags();
    }
    return super.startCombat();
  }

  /* -------------------------------------------------- */

  /** @inheritdoc */
  async _preUpdate(changed, options, user) {
    if (game.user.isGM && (("turn" in changed) || ("round" in changed))) {
      options.hollows = { ...options.hollows, prevCombatantId: this.combatant?.id || null };
    }
    return super._preUpdate(changed, options, user);
  }

  /* -------------------------------------------------- */

  /** @inheritdoc */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);

    // Above the guard: the dialog is opened by whichever user was picked to choose.
    this.#onAwaitingFirstPickUpdate(changed);

    if (!game.user.isActiveGM) return;

    // Must stay unchained — awaiting the first delays the turn machine and double-advances the round.
    this.#onInitializeUpdate();
    this.#onTurnChange(changed, options);
  }

  /* -------------------------------------------------- */

  /** @inheritdoc */
  _onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId) {
    super._onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId);
    if (collection !== "combatants") return;
    if (!game.user.isActiveGM) return;
    const relevant = changes.some(c => c.flags?.hollows?.setup || ("initiative" in c));
    if (relevant) maybeSetTurnToHighest(this);
  }

  /* -------------------------------------------------- */

  /** @inheritdoc */
  async _onDelete(options, userId) {
    super._onDelete(options, userId);

    if (!game.user.isActiveGM) return;

    // Clean up combat states.
    const actors = new Set(this.combatants.map(c => c.actor).filter(_ => _));
    for (const actor of actors) {
      for (const tag of getTerrainTagKeys()) {
        // Refund the pool itself for non-free pooled tags.
        if (actor.statuses.has(tag)) await removeCondition(actor, tag);
      }
    }

    await this.#resetHunterCombatFlags();
    await this.#clearAllCurseTrackers();
  }

  /* -------------------------------------------------- */

  /**
   * Reset combat state on every hunter that participate(s/d) in this combat.
   * @returns {Promise<void>}
   */
  async #resetHunterCombatFlags() {
    const operations = [];

    /** Hunter flags cleared when a combat ends. */
    const COMBAT_RESET_FLAGS = {
      wardGranted: _del,
      wardSuppressed: _del,
      echoReplaceDyingUsed: _del,
      battleMaxPenalty: _del,
      dyingRevivedOnce: false,
    };

    const hunters = new Set(this.combatants.map(c => c.actor).filter(a => a?.type === "hunter"));
    for (const actor of hunters) {
      for (const tag of getTerrainTagKeys()) {
        if (actor.statuses.has(tag)) await removeCondition(actor, tag, { skipPoolRefund: true });
      }
      if (actor.statuses.has("dying")) await removeCondition(actor, "dying");
      if (actor.statuses.has("dead")) await removeCondition(actor, "dead");
      if (getFocusCount(actor) > 0) await setFocusCount(actor, 0);

      operations.push({
        action: "update",
        documentName: "Actor",
        parent: actor.parent,
        updates: [{ _id: actor.id, flags: { [hollows.id]: { ...COMBAT_RESET_FLAGS } } }],
      });
    }

    await foundry.documents.modifyBatch(operations);
  }

  /* -------------------------------------------------- */

  /**
   * Clear all curse trackers.
   * @returns {Promise<void>}
   */
  async #clearAllCurseTrackers() {
    const scene = this.scene ?? canvas.scene;
    const regions = scene.regions.filter(region => region.getFlag(hollows.id, "lairRegion"));
    for (const region of regions) await region.updateRegionCurse(0);
    const actors = new Set(this.combatants.map(c => c.actor).filter(a => ["hunter", "entity"].includes(a?.type)));
    const operations = Array.from(actors).map(actor => {
      return {
        action: "update",
        documentName: "Actor",
        parent: actor.parent,
        updates: [{ _id: actor.id, "system.curse.value": 0 }],
      };
    });
    await foundry.documents.modifyBatch(operations);
  }

  /* -------------------------------------------------- */
  /*   Update Handling                                  */
  /* -------------------------------------------------- */

  /** Reopen the first-pick dialog for the user who owns the pending choice. */
  #onAwaitingFirstPickUpdate(changed) {
    if (!this.started) return;
    if (!Object.hasOwn(changed?.flags?.hollows || {}, "awaitingFirstPick")) return;
    const awaiting = this.getFlag("hollows", "awaitingFirstPick") || null;
    if (!awaiting) return;
    if (!shouldCurrentUserHandleFirstPick(awaiting)) return;
    window.setTimeout(() => ensureFirstPickDialog(this), 0);
  }

  /* -------------------------------------------------- */

  /** Seed hunter state once the combat is under way. */
  async #onInitializeUpdate() {
    if (!this.started && ((this.round ?? 0) <= 0)) return;
    await initializeHunterCoreStatesForCombat(this);
  }

  /* -------------------------------------------------- */

  /** Bracket turn machine: the transition is derived from the previous combatant, not the turn index. */
  async #onTurnChange(changed, options) {
    if (!this.started) return;
    if (!("turn" in changed) && !("round" in changed)) return;
    if (options.hollowsSkipTurnProcessing) return;
    const awaiting = this.getFlag("hollows", "awaitingFirstPick");
    if (awaiting?.reason === "setup") return;
    const passInitiative = !!options.hollowsPassInitiative;
    const manualMakeActive = !!options.hollowsManualMakeActive;

    const newCombatantId = this.combatant?.id || null;
    const prevCombatantId = (options.hollows?.prevCombatantId ?? null) || this.lastCombatantId;
    if (!prevCombatantId) {
      this.lastCombatantId = newCombatantId;
      return;
    }

    const prevCombatant = this.combatants.get(prevCombatantId);
    const newCombatant = newCombatantId ? this.combatants.get(newCombatantId) : null;
    const prevIsEntity = prevCombatant?.actor?.type === "entity";
    if (newCombatantId === prevCombatantId) {
      this.lastCombatantId = newCombatantId;
      return;
    }

    if ((newCombatant?.actor?.type === "hunter") && newCombatant.actor.statuses.has("dead")) {
      await this.#advancePastDeadHunter(newCombatantId);
      return;
    }

    if (prevCombatant?.actor?.type === "hunter") {
      await prevCombatant.setFlag("hollows", "acted", true);
    }

    const prevBracket = getCombatantBracket(prevCombatant);
    const newBracket = getCombatantBracket(newCombatant);
    const afterExists = getCombatantsInBracket(this, "after").length > 0;

    if (prevIsEntity) {
      await processEndOfTurn(this, prevCombatant);
      await clearActedForBracket(this, "after");
      await clearActedForBracket(this, "before");
      if (passInitiative) {
        if (newCombatant) await processStartOfTurn(this, newCombatant);
        if ((newBracket === "before") && !afterExists) await this.#beginNewRound();
        this.lastCombatantId = prevCombatantId;
        return;
      }
      if (afterExists) {
        await beginFirstPick(this, "after", prevCombatantId, "after-entity", null, true, true);
      } else if (getCombatantsInBracket(this, "before").length) {
        await beginFirstPick(this, "before", prevCombatantId, "round-start", null, true, true);
      }
      this.lastCombatantId = prevCombatantId;
      return;
    }

    if ((prevBracket === "after") && (newBracket === "before")) {
      const owners = getCombatantOwners(prevCombatant?.actor);
      const chooser = owners.find((u) => !u.isGM)?.id || owners[0]?.id || null;
      await processEndOfTurn(this, prevCombatant);
      await beginFirstPick(this, "before", prevCombatantId, "round-start", chooser, true, true);
      this.lastCombatantId = prevCombatantId;
      return;
    }

    if (!manualMakeActive && (prevBracket === "after") && (newCombatant?.actor?.type === "entity")
      && !getCombatantsInBracket(this, "before").length) {
      await processEndOfTurn(this, prevCombatant);
      await this.#beginNewRound();
      if (newCombatant) await processStartOfTurn(this, newCombatant);
      this.lastCombatantId = newCombatantId;
      return;
    }

    await processEndOfTurn(this, prevCombatant);
    await processStartOfTurn(this, newCombatant);
    this.lastCombatantId = newCombatantId;
  }

  /* -------------------------------------------------- */

  /** Skip the turn forward to the next combatant who is not a dead hunter. */
  async #advancePastDeadHunter(fromCombatantId) {
    const turns = this.turns || [];
    const startIndex = turns.findIndex((t) => t.id === fromCombatantId);
    if (startIndex === -1) return;
    for (let i = 1; i <= turns.length; i++) {
      const index = (startIndex + i) % turns.length;
      const candidate = turns[index];
      const actor = candidate?.actor || this.combatants.get(candidate.id)?.actor;
      if (!actor || (actor.type !== "hunter") || !actor.statuses.has("dead")) {
        await this.update({ turn: index }, { hollowsSkipDeadAdvance: true, turnEvents: false });
        return;
      }
    }
  }

  /* -------------------------------------------------- */

  /** Advance to the next round and clear per-round hunter state. */
  async #beginNewRound() {
    const round = Math.max(1, Number(this.round || 0) + 1);
    await this.update({ round }, { hollowsSkipTurnProcessing: true, turnEvents: false });
    await resetHunterRoundFlagsForNewRound();
  }
}
