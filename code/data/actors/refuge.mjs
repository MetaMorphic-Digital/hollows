import { getRefugeNpcRoles } from "../refuge/action-handlers.js";
import RefugeUpgradeData from "../items/refuge-upgrade.mjs";

export default class RefugeData extends foundry.abstract.TypeDataModel {
  /** Refresh Refuge sheets, optionally restricted to an NPC's residences. */
  static renderSheets(residentId = null) {
    for (const actor of game.actors) {
      if ((actor.type === "refuge") && (!residentId || actor.system.residents.includes(residentId))) actor.render(false);
    }
  }

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
      anchoredEntity: new fields.BooleanField({ initial: false }),
    };
  }

  /** @inheritdoc */
  async _preCreate(data, options, user) {
    await super._preCreate(data, options, user);
    if (this.parent.items.size) return;
    const defaults = await RefugeUpgradeData.getAvailableUpgrades({ defaultsOnly: true });
    const upgrades = await Promise.all(defaults.map(({ uuid }) => fromUuid(uuid)));
    this.parent.updateSource({
      items: upgrades.map(item => {
        const itemData = game.items.fromCompendium(item, { clearFolder: true });
        foundry.utils.setProperty(itemData, "_stats.duplicateSource", RefugeUpgradeData.getSourceUuid(item));
        return itemData;
      }),
    });
  }

  /** Installed upgrade items, in sheet order. */
  get upgradeItems() {
    return this.parent.items.filter(item => item.type === "refugeUpgrade").sort((a, b) => a.sort - b.sort);
  }

  /** Hunters currently visiting this Refuge, in name order. */
  get visitingHunters() {
    return game.actors.filter(actor => (actor.type === "hunter") && (actor.system.refuge.id === this.parent.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Online players' assigned Hunters who are outside this Refuge. */
  get enteringHunters() {
    return game.actors.filter(actor => (actor.type === "hunter") && (actor.system.refuge.id !== this.parent.id)
      && game.users.some(user => user.active && !user.isGM && (user.character?.id === actor.id)));
  }

  /** Report unmet requirements before buying or using an upgrade. */
  validateUpgradeRequirements(upgrade) {
    const missing = upgrade.system.getMissingRequirements(this.parent);
    if (!missing.length) return true;
    ui.notifications.warn(game.i18n.format("HOLLOWS.REFUGE.missingRequirements", {
      requirements: missing.join(", "),
    }));
    return false;
  }

  /** Purchase an upgrade template using the Refuge's Bone and Hearts. */
  async buyUpgrade(upgrade) {
    if (upgrade.type !== "refugeUpgrade") return false;
    const source = RefugeUpgradeData.getSourceUuid(upgrade);
    if (this.upgradeItems.some(item => RefugeUpgradeData.getSourceUuid(item) === source)) {
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
    foundry.utils.setProperty(data, "_stats.duplicateSource", source);
    data.system.pending = true;
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

  /** Make purchased upgrades available when a Hunter starts a new visit. */
  async activateUpgrades() {
    const upgrades = this.upgradeItems.filter(item => item.system.pending);
    if (!upgrades.length) return;
    const { default: RefugeInstallation } = await import("../../documents/actor/refuge-installation.mjs");
    await RefugeInstallation.queue(upgrades);
    await this.parent.updateEmbeddedDocuments("Item", upgrades.map(item => ({ _id: item.id, "system.pending": false })));
  }

  /** Use the free recovery granted at the start of this Hunter's visit. */
  async recoverOnEntry(hunter) {
    if ((hunter.system.refuge.id !== this.parent.id) || !hunter.system.refuge.recoveryAvailable) return false;
    const { applyRecover } = await import("../../documents/actor/refuge.js");
    await applyRecover(this.parent, hunter);
    await hunter.update({ "system.refuge.recoveryAvailable": false });
    return true;
  }

  /** Run an action supplied by an installed upgrade. */
  async useUpgrade(itemId, actionIndex, hunter, choice) {
    const upgrade = this.parent.items.get(itemId);
    const action = upgrade.system.actions[actionIndex];
    if (!action) return false;
    if (upgrade.system.pending) {
      ui.notifications.warn(game.i18n.localize("HOLLOWS.REFUGE.pending"));
      return false;
    }
    if (hunter.system.refuge.id !== this.parent.id) {
      ui.notifications.warn(game.i18n.localize("HOLLOWS.REFUGE.hunterNotInRefuge"));
      return false;
    }
    if (hunter.statuses.has("dead") && (action.type !== "fullRecovery")) {
      ui.notifications.warn(game.i18n.localize("HOLLOWS.REFUGE.mustRecover"));
      return false;
    }
    const { cost } = action;
    if (hunter.system.refuge.actions.value < cost.actions) {
      ui.notifications.warn(game.i18n.localize("HOLLOWS.REFUGE.noActionsRemaining"));
      return false;
    }
    if (!this.validateUpgradeRequirements(upgrade)) return false;
    if ((this.resources.bone < cost.bone) || (this.resources.hearts < cost.hearts)) {
      ui.notifications.warn(game.i18n.localize("HOLLOWS.REFUGE.insufficientResources"));
      return false;
    }
    let { resolve, wounds } = action;
    if (action.type === "temporaryHealth") {
      for (const item of this.upgradeItems) {
        if (!item.system.isAvailable(this.parent)) continue;
        resolve += item.system.temporaryHealthBonus.resolve;
        wounds += item.system.temporaryHealthBonus.wounds;
      }
    }
    if (["fullRecovery", "temporaryHealth"].includes(action.type)) {
      const { applyRecover } = await import("../../documents/actor/refuge.js");
      await applyRecover(this.parent, hunter, { type: action.type, resolve, wounds });
    } else {
      const { default: RefugeRearmReforge } = await import("../../documents/actor/refuge-rearm-reforge.mjs");
      await RefugeRearmReforge.apply(hunter, action.type, choice);
    }
    if (cost.actions) {
      await hunter.update({ "system.refuge.actions.value": hunter.system.refuge.actions.value - cost.actions });
    }
    if (cost.bone || cost.hearts) {
      await this.parent.update({
        "system.resources.bone": this.resources.bone - cost.bone,
        "system.resources.hearts": this.resources.hearts - cost.hearts,
      });
    }
    return true;
  }
}
