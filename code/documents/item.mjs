/**
 * System implementation of the Item class.
 * @extends {foundry.documents.Item}
 */
export default class HollowsItem extends foundry.documents.Item {
  /** @type {string|null} */
  get scriptPath() {
    if (this.type === "weapon") return "system.renown.script";
    if (this.type === "weaponAbility") return "system.script";
    return null;
  }

  /** @inheritdoc */
  async _preCreate(data, options, user) {
    if (await super._preCreate(data, options, user) === false) return false;
    const script = this.scriptPath ? foundry.utils.getProperty(data, this.scriptPath) : null;
    if (!user.isGM && (script?.source || script?.enabled)) {
      ui.notifications.warn(game.i18n.localize("HOLLOWS.SCRIPT.gmCreateOnly"));
      return false;
    }
  }

  /** @inheritdoc */
  async _preUpdate(changes, options, user) {
    if (await super._preUpdate(changes, options, user) === false) return false;
    if (user.isGM || !this.scriptPath) return;
    const source = this.toObject();
    const updated = foundry.utils.mergeObject(source, foundry.utils.expandObject(changes), {
      inplace: false, applyOperators: true,
    });
    const before = foundry.utils.getProperty(source, this.scriptPath);
    const after = foundry.utils.getProperty(updated, this.scriptPath);
    if (!foundry.utils.equals(before, after)) {
      ui.notifications.warn(game.i18n.localize("HOLLOWS.SCRIPT.gmOnly"));
      return false;
    }
  }
}
