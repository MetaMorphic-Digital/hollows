import { getActiveEntityActor, getActiveHollowActor } from "../canvas/zone.js";
import { triggerEntityTriggeredAbilities } from "../data/entity/actions/entity-special.js";
import {
  applyFirstPickSelection,
  beginFirstPick,
  clearActedForBracket,
  ensureFirstPickDialog,
  resetHunterRoundFlagsForNewRound,
  shouldCurrentUserHandleFirstPick,
} from "../helpers/combat-first-pick.js";
import { processEndOfTurn, processStartOfTurn } from "../helpers/combat-lifecycle.js";
import { createSetupRollMessage, getCombatantBracket, getCombatantOwners, getCombatantsInBracket } from "../helpers/combat-runtime.js";
import { getTerrainTagKeys, removeCondition } from "./actor/conditions.js";
import { initializeHunterCoreStatesForCombat } from "./actor/hunter-combat.js";
import { getFocusCount, setFocusCount } from "./actor/resources.js";
import ScriptCompiler from "./item/script-compiler.mjs";
import { COMBAT_QUERY_TIMEOUT, runUserQuery } from "../helpers/queries.js";
import { getEffectiveEntityStat } from "./entity/entity-stats.js";

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

  #starting = false;
  #preparingSetup = false;

  /** Whether every Hunter has rolled Setup and chosen a bracket. */
  get isSetupComplete() {
    const hunters = this.combatants.filter(c => c.actor?.type === "hunter");
    return (hunters.length > 0) && hunters.every(c => c.getFlag("hollows", "setup")?.bracket
      && (c.initiative != null));
  }

  /** Prepare Setup rolls for Hunters who have not received a roll card. */
  async prepareSetup() {
    if (!game.user.isActiveGM) {
      await runUserQuery(game.users.activeGM, "hollows.prepareSetup", { combatId: this.id }, { timeout: COMBAT_QUERY_TIMEOUT });
      return this;
    }
    if (this.started || this.#preparingSetup) return this;
    const entity = getActiveEntityActor();
    if (!entity) {
      ui.notifications.warn("No Entity actor found for setup roll.");
      return this;
    }
    const requested = new Set(this.getFlag("hollows", "setupRolls") || []);
    const hunters = this.combatants.filter(c => (c.actor?.type === "hunter") && !requested.has(c.id));
    if (!hunters.length) return this;
    this.#preparingSetup = true;
    try {
      if (!requested.size) await this.#resetHunterCombatFlags();
      const tn = getEffectiveEntityStat(entity, "ranged");
      const entityCombatant = this.combatants.find(c => c.actor?.type === "entity");
      if (entityCombatant) await entityCombatant.update({ initiative: 1 });
      for (const combatant of hunters) {
        await createSetupRollMessage(combatant, tn);
        requested.add(combatant.id);
      }
      await this.setFlag("hollows", "setupRolls", [...requested]);
      return this;
    } finally {
      this.#preparingSetup = false;
    }
  }

  /* -------------------------------------------------- */

  /** @inheritdoc */
  async startCombat() {
    if (!game.user.isActiveGM) {
      await runUserQuery(game.users.activeGM, "hollows.startCombat", { combatId: this.id }, { timeout: COMBAT_QUERY_TIMEOUT });
      return this;
    }
    if (this.started || this.#starting || this.#preparingSetup) return this;
    if (!this.isSetupComplete) {
      ui.notifications.warn("Finish Setup rolls and choose Before or After before starting combat.");
      return this;
    }
    this.#starting = true;
    try {
      const entity = getActiveEntityActor();
      const hollow = getActiveHollowActor();
      if (hollow) await hollow.unsetFlag("hollows", "explorationTNMod");
      this.lastCombatantId = null;
      if (!this.getFlag("hollows", "setupRolls")) await this.#resetHunterCombatFlags();
      await super.startCombat();
      await initializeHunterCoreStatesForCombat(this);
      await triggerEntityTriggeredAbilities(entity, "battleStart", {}, ["special", "doom"]);
      if (getCombatantsInBracket(this, "before").length) {
        await beginFirstPick(this, "before", null, "setup");
      } else {
        const entityCombatant = this.combatants.find(c => c.actor?.type === "entity");
        if (entityCombatant) await applyFirstPickSelection(this, entityCombatant.id, null, "setup", true);
      }
      return this;
    } finally {
      this.#starting = false;
    }
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

    if (!game.user.isActiveGM || this.#starting) return;

    this.#onTurnChange(changed, options);
  }

  /* -------------------------------------------------- */

  /** @inheritdoc */
  async _onDelete(options, userId) {
    super._onDelete(options, userId);
    this.updateCombatantActors();

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
      echoReplaceDyingUsed: _del,
      battleMaxPenalty: _del,
      equipmentAttackBonuses: _del,
      dyingRevivedOnce: false,
    };

    const hunters = new Set(this.combatants.map(c => c.actor).filter(a => a?.type === "hunter"));
    for (const actor of hunters) {
      await ScriptCompiler.runInterceptors("combat-reset-hunter", { actor }, null);
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
