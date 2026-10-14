/**
 * @import HollowsItem from "./item.mjs";
 */

/**
 * System implementation of the Actor class.
 * @extends {foundry.documents.Actor}
 */
export default class HollowsActor extends foundry.documents.Actor {
  /**
   * Update an actor directly as GM/owner, otherwise route through the active GM.
   * @param {Actor|null} actor The world or synthetic actor to update.
   * @param {object} changes Document update data.
   * @returns {Promise<boolean>} Whether an update was requested.
   */
  static async updateSafe(actor, changes) {
    if (!actor || !changes || !Object.keys(changes).length) return false;
    if (actor.testUserPermission(game.user, "OWNER")) {
      await actor.update(changes);
    } else {
      const { runGMQuery } = await import("../helpers/queries.js");
      await runGMQuery("hollows.actorMutation", {
        actorId: actor.id,
        actorUuid: actor.uuid,
        type: "update",
        payload: { update: changes },
      });
    }
    return true;
  }

  /**
   * Get all active Echo items.
   * @returns {HollowsItem[]}
   */
  get activeEchoes() {
    return this.items.documentsByType.echo.filter(echo => !echo.system.isSuppressed);
  }

  /* -------------------------------------------------- */

  /**
   * Can this actor be revived?
   * @type {boolean}
   */
  get isRevivable() {
    return this.system.isRevivable ?? false;
  }
}
