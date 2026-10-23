/**
 * System implementation of the Item class.
 * @extends {foundry.documents.Item}
 */
export default class HollowsItem extends foundry.documents.Item {
  /** @type {{path: string, text: string, name?: string, enabled: boolean}[]} */
  get scriptSlots() {
    if (this.type === "weapon") return [
      { path: "system.script", text: this.system.coreAbility, enabled: true },
      { path: "system.renown.script", text: this.system.renown.text, enabled: this.system.renown.enabled },
      {
        path: "system.appliedForm.script", text: this.system.appliedForm?.text,
        name: this.system.appliedForm?.name, enabled: !!this.system.appliedForm,
      },
    ];
    if (this.type === "weaponAbility") return [
      { path: "system.script", text: this.system.text, enabled: true },
    ];
    // A form is a template; its script runs from the copy stored on a weapon.
    if (this.type === "weaponForm") return [
      { path: "system.script", text: this.system.text, enabled: false },
    ];
    return [];
  }

  /** @inheritdoc */
  async _preCreate(data, options, user) {
    if (await super._preCreate(data, options, user) === false) return false;
    const scripts = this.scriptSlots.map(({ path }) => ({
      path, script: foundry.utils.getProperty(this, path),
    })).filter(({ script }) => script?.source || script?.enabled || script?.trusted);
    if (!user.isGM && scripts.length) {
      const source = data._stats?.compendiumSource && await fromUuid(data._stats.compendiumSource);
      const trustedImport = source && scripts.every(({ path, script }) => {
        const original = foundry.utils.getProperty(source, path);
        return original?.trusted && foundry.utils.equals(script, original);
      });
      if (!trustedImport) {
        ui.notifications.warn(game.i18n.localize("HOLLOWS.SCRIPT.gmCreateOnly"));
        return false;
      }
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
    for (const { path } of this.scriptSlots) {
      if (foundry.utils.equals(
        foundry.utils.getProperty(source, path), foundry.utils.getProperty(updated, path),
      )) continue;
      if (path === "system.appliedForm.script") {
        const form = updated.system.appliedForm;
        if (!form) continue;
        const original = await fromUuid(form.uuid);
        if ((original?.type === "weaponForm") && (original.system.weaponType === updated.system.weaponType)) {
          const script = original.system.toObject().script;
          const canImport = script.trusted || (!script.source && !script.enabled);
          if (canImport && foundry.utils.equals(form.script, script)) continue;
        }
      }
      ui.notifications.warn(game.i18n.localize("HOLLOWS.SCRIPT.gmOnly"));
      return false;
    }
  }
}
