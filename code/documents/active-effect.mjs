import { getPrimaryRefugeActor } from "../data/refuge/resolvers.js";
import { requestRefugeAction } from "./actor/refuge.js";

/**
 * System implementation of the ActiveEffect class.
 * @extends {foundry.documents.ActiveEffect}
 */
export default class HollowsActiveEffect extends foundry.documents.ActiveEffect {
  /** @inheritdoc */
  async _onCreate(data, options, userId) {
    super._onCreate(data, options, userId);
    await this.#enterRefugeOnDeath();
  }

  /** @inheritdoc */
  async _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    if (("statuses" in changed) || (changed.disabled === false)) await this.#enterRefugeOnDeath();
  }

  /** A dead Hunter enters the primary Refuge without paying for a group visit. */
  async #enterRefugeOnDeath() {
    if (!game.user.isActiveGM || (this.parent?.type !== "hunter")) return;
    if (!this.active || !this.statuses.has("dead")) return;
    await this.parent.system.clearRenewBonuses();
    const refuge = getPrimaryRefugeActor();
    if (refuge) await requestRefugeAction({ type: "enterHunter", refugeId: refuge.id, hunterUuid: this.parent.uuid });
  }
}
