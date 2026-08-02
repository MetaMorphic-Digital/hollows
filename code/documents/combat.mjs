import { clearAllCurseTrackers } from "../canvas/overlays";
import { HOLLOWS_LAST_COMBATANT_BY_COMBAT_ID, HOLLOWS_PREV_COMBATANT_BY_COMBAT_ID } from "../helpers/combat-runtime";
import { hasCondition, removeCondition } from "./actor/conditions";
import { cleanupCombatStates } from "./actor/hunter-combat";

/**
 * System implementation of the Combat class.
 * @extends {foundry.documents.Combat}
 */
export default class HollowsCombat extends foundry.documents.Combat {
  /** @inheritdoc */
  async _onDelete(options, userId) {
    super._onDelete(options, userId);

    if (!game.user.isActiveGM) return;

    // TODO: Refactor these two methods as well into the operations below.
    // The cleanupCombatStates method has an issue where it removes flags that are also removed below.
    await cleanupCombatStates(this);
    await clearAllCurseTrackers(this);

    // TODO: Refactor further to move these into being properties on the Combat class or the instance of a combat?
    // Their purpose is not at all clear.
    HOLLOWS_PREV_COMBATANT_BY_COMBAT_ID.delete(this.id);
    HOLLOWS_LAST_COMBATANT_BY_COMBAT_ID.delete(this.id);

    const hunters = new Set(this.combatants.filter(c => c.actor?.type === "hunter").map(c => c.actor));

    // This is the 'resetCombatHunterFlags' method which should be removed at some point.
    const operations = Array.from(hunters).map(actor => {
      const flags = actor.flags[hollows.id] ?? {};
      const update = { _id: actor.id };

      if (flags.dyingRevivedOnce) update[`flags.${hollows.id}.dyingRevivedOnce`] = false;
      if (flags.dead) update[`flags.${hollows.id}.dead`] = _del;

      // TODO: Can this be added to the operations?
      if (hasCondition(actor, "dead")) removeCondition(actor, "dead");

      return { action: "update", documentName: actor.documentName, parent: actor.parent, updates: [update] };
    });

    foundry.documents.modifyBatch(operations);
  }
}
