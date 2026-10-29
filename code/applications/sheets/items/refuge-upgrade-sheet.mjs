import HollowsItem from "../../../documents/item.mjs";
import RefugeUpgradeData from "../../../data/items/refuge-upgrade.mjs";
import { getWeaponTypeChoices } from "../../../data/weapons/index.js";
import { pickOne } from "../../apps/selection-dialogs.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

export default class HollowsRefugeUpgradeSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  #showAdditional = false;

  static DEFAULT_OPTIONS = {
    classes: ["hollows", "sheet", "item", "builder", "refuge-upgrade"],
    position: { width: 520, height: 600 },
    window: { resizable: true, contentClasses: ["hollows-sheet"] },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      addAction: HollowsRefugeUpgradeSheet.#addAction,
      removeAction: HollowsRefugeUpgradeSheet.#removeAction,
      toggleAdditional: HollowsRefugeUpgradeSheet.#toggleAdditional,
    },
  };

  static PARTS = {
    sheet: {
      template: "systems/hollows/templates/item/refuge-upgrade-sheet.html",
      scrollable: [""],
      root: true,
    },
  };

  /** @inheritdoc */
  async _prepareContext(options) {
    const system = this.item.system;
    const systemFields = system.schema.fields;
    const sections = {
      recover: (system.category === "recover") || system.recoverOnEntry
        || system.temporaryHealthBonus.resolve || system.temporaryHealthBonus.wounds,
      weapons: (this.#categoryGroup === "weapons") || system.weaponTiers.size || system.extraRelicSlot
        || system.weaponDamage.types.size || system.weaponDamage.resolve || system.weaponDamage.wounds,
      renew: (system.category === "renew") || (system.renew.marks !== systemFields.renew.fields.marks.getInitialValue())
        || system.renew.disadvantage,
      research: (system.category === "research") || system.research.advantage || system.research.anyStat,
      revel: (system.category === "revel") || system.revel.additionalEchoes || system.revel.advantage
        || system.echoRollModifier || system.healthBonus.resolve || system.healthBonus.wounds,
      resupply: (system.category === "resupply") || system.extraEquipmentSlots.size,
    };
    if (this.#showAdditional) {
      for (const key of Object.keys(sections)) sections[key] = true;
    }
    const actionChoices = this.#actionChoices;
    const [upgrades, weaponChoices] = await Promise.all([
      RefugeUpgradeData.getAvailableUpgrades(), sections.weapons ? getWeaponTypeChoices() : {},
    ]);
    return {
      ...await super._prepareContext(options),
      item: this.item,
      system,
      systemFields,
      sections,
      showAdditional: this.#showAdditional,
      additionalSettingsLabel: this.#showAdditional ? "HOLLOWS.REFUGE.hideAdditionalSettings" : "HOLLOWS.REFUGE.additionalSettings",
      actionFields: systemFields.actions.element.fields,
      upgradeChoices: upgrades.filter(item => item.sourceUuid !== HollowsItem.getSourceUuid(this.item))
        .map(item => ({ value: item.sourceUuid, label: item.name })),
      weaponChoices: Object.entries(weaponChoices).map(([value, label]) => ({ value, label })),
      actions: system.actions.map((action, index) => ({
        ...action, index, temporary: action.type === "temporaryHealth",
        typeChoices: { ...actionChoices, [action.type]: RefugeUpgradeData.ACTIONS[action.type].label },
      })),
    };
  }

  /** Settings shared by the upgrade's category. */
  get #categoryGroup() {
    const category = this.item.system.category;
    return ["rearm", "reforge"].includes(category) ? "weapons" : category;
  }

  /** Actions suggested for this category, or all actions when additional settings are open. */
  get #actionChoices() {
    const category = this.item.system.category;
    const group = this.#categoryGroup;
    return Object.fromEntries(Object.entries(RefugeUpgradeData.ACTIONS)
      .filter(([type, definition]) => this.#showAdditional || (definition.group === group) || (type === category))
      .map(([type, { label }]) => [type, label]));
  }

  /** Show or hide settings from other categories. */
  static #toggleAdditional() {
    this.#showAdditional = !this.#showAdditional;
    this.render();
  }

  /** Choose an action and add it with the schema defaults. */
  static async #addAction() {
    const type = await pickOne({
      title: game.i18n.localize("HOLLOWS.REFUGE.addAction"),
      label: game.i18n.localize("HOLLOWS.REFUGE.actionType"),
      options: Object.entries(this.#actionChoices).map(([value, label]) => ({
        value, label: game.i18n.localize(label), selected: value === this.item.system.category,
      })),
    });
    if (!type) return;
    const actions = this.item.system.toObject().actions;
    actions.push({ ...this.item.system.schema.fields.actions.element.getInitialValue(), type });
    await this.item.update({ "system.actions": actions });
  }

  /** Remove the selected action from the upgrade. */
  static async #removeAction(event, target) {
    const actions = this.item.system.toObject().actions;
    actions.splice(Number(target.dataset.index), 1);
    await this.item.update({ "system.actions": actions });
  }
}
