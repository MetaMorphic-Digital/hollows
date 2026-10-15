/**
 * System implementation of the Item class.
 * @extends {foundry.documents.Item}
 */
export default class HollowsItem extends foundry.documents.Item {
  /** @type {{path: string, text: string, enabled: boolean}[]} */
  get scriptSlots() {
    if (this.type === "weapon") return [
      { path: "system.script", text: this.system.coreAbility, enabled: true },
      { path: "system.renown.script", text: this.system.renown.text, enabled: this.system.renown.enabled },
    ];
    if (this.type === "weaponAbility") return [
      { path: "system.script", text: this.system.text, enabled: true },
    ];
    return [];
  }

  /** @inheritdoc */
  async _preCreate(data, options, user) {
    if (await super._preCreate(data, options, user) === false) return false;
    const hasScript = this.scriptSlots.some(({ path }) => {
      const script = foundry.utils.getProperty(data, path);
      return script?.source || script?.enabled;
    });
    if (!user.isGM && hasScript) {
      ui.notifications.warn(game.i18n.localize("HOLLOWS.SCRIPT.gmCreateOnly"));
      return false;
    }
  }

  /** @inheritdoc */
  async _preUpdate(changes, options, user) {
    if (await super._preUpdate(changes, options, user) === false) return false;
    if (user.isGM || !this.scriptSlots.length) return;
    const source = this.toObject();
    const updated = foundry.utils.mergeObject(source, foundry.utils.expandObject(changes), {
      inplace: false, applyOperators: true,
    });
    if (this.scriptSlots.some(({ path }) => !foundry.utils.equals(
      foundry.utils.getProperty(source, path), foundry.utils.getProperty(updated, path),
    ))) {
      ui.notifications.warn(game.i18n.localize("HOLLOWS.SCRIPT.gmOnly"));
      return false;
    }
  }
}
