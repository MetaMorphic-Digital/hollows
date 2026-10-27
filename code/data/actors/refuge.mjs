import { getRefugeNpcRoles } from "../refuge/action-handlers.js";
import RefugeUpgradeData from "../items/refuge-upgrade.mjs";

export default class RefugeData extends foundry.abstract.TypeDataModel {
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      resources: new fields.SchemaField({
        bone: new fields.NumberField({ initial: 0, integer: true }),
        hearts: new fields.NumberField({ initial: 0, integer: true }),
      }),
      npcRoles: new fields.SchemaField(Object.fromEntries(
        getRefugeNpcRoles().map(({ key }) => [key, new fields.StringField({ initial: "" })]),
      )),
      upgrades: new fields.ObjectField({ initial: {} }),
      residents: new fields.ArrayField(
        new fields.StringField({ initial: "" }),
        { initial: [] },
      ),
      unlockedExploration: new fields.ArrayField(new fields.StringField({ initial: "" }), { initial: [] }),
      unlockedBattle: new fields.ArrayField(new fields.StringField({ initial: "" }), { initial: [] }),
      notes: new fields.StringField({ initial: "" }),
    };
  }

  /** @inheritdoc */
  async _preCreate(data, options, user) {
    await super._preCreate(data, options, user);
    if (this.parent.items.size) return;
    const defaults = await RefugeUpgradeData.getAvailableUpgrades({ defaultsOnly: true });
    const upgrades = await Promise.all(defaults.map(({ uuid }) => fromUuid(uuid)));
    const sources = new Map(upgrades.map(item => [
      item.pack ? item.uuid : item._stats.compendiumSource || item.uuid, item,
    ]));
    this.parent.updateSource({
      items: Array.from(sources.values(), item => {
        const itemData = game.items.fromCompendium(item, { clearFolder: true });
        foundry.utils.setProperty(itemData, "_stats.duplicateSource", item.uuid);
        return itemData;
      }),
    });
  }

  /** Installed upgrade items, in sheet order. */
  get upgradeItems() {
    return this.parent.items.filter(item => item.type === "refugeUpgrade").sort((a, b) => a.sort - b.sort);
  }

  /** Report the NPCs missing from an upgrade's operating requirements. */
  validateUpgradeRequirements(upgrade) {
    const missing = upgrade.system.getMissingNpcRoles(this.parent);
    if (!missing.length) return true;
    const roles = getRefugeNpcRoles();
    ui.notifications.warn(game.i18n.format("HOLLOWS.REFUGE.missingNpcRoles", {
      roles: missing.map(key => roles.find(role => role.key === key).label).join(", "),
    }));
    return false;
  }

  /** Purchase an upgrade template using the Refuge's Bone and Hearts. */
  async buyUpgrade(upgrade) {
    if (upgrade.type !== "refugeUpgrade") return false;
    const source = upgrade.pack ? upgrade.uuid : upgrade._stats.compendiumSource || upgrade.uuid;
    if (this.upgradeItems.some(item => (item._stats.compendiumSource || item._stats.duplicateSource) === source)) {
      ui.notifications.warn(game.i18n.localize("HOLLOWS.REFUGE.alreadyInstalled"));
      return false;
    }
    if (!this.validateUpgradeRequirements(upgrade)) return false;
    const { bone, hearts } = upgrade.system.cost;
    if ((this.resources.bone < bone) || (this.resources.hearts < hearts)) {
      ui.notifications.warn(game.i18n.localize("HOLLOWS.REFUGE.insufficientResources"));
      return false;
    }
    const data = game.items.fromCompendium(upgrade, { clearFolder: true });
    foundry.utils.setProperty(data, "_stats.duplicateSource", upgrade.uuid);
    const [item] = await this.parent.createEmbeddedDocuments("Item", [data]);
    if (!item) return false;
    if (bone || hearts) {
      await this.parent.update({
        "system.resources.bone": this.resources.bone - bone,
        "system.resources.hearts": this.resources.hearts - hearts,
      });
    }
    return item;
  }

  /** Run an action supplied by an installed upgrade. */
  async useUpgrade(itemId, action, hunter) {
    const upgrade = this.parent.items.get(itemId);
    if (!upgrade.system.actions.has(action)) return false;
    if (!this.validateUpgradeRequirements(upgrade)) return false;
    switch (action) {
      case "fullRecovery": {
        const { applyRecover } = await import("../../documents/actor/refuge.js");
        return applyRecover(this.parent, hunter);
      }
    }
  }
}
