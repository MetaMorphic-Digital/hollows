/**
 * @import HollowsItem from "./item.mjs";
 */

/**
 * System implementation of the Actor class.
 * @extends {foundry.documents.Actor}
 */
export default class HollowsActor extends foundry.documents.Actor {
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
