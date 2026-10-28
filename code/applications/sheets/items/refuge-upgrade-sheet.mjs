const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

export default class HollowsRefugeUpgradeSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["hollows", "sheet", "item", "refuge-upgrade"],
    position: { width: 520, height: 600 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      addAction: HollowsRefugeUpgradeSheet.#addAction,
      removeAction: HollowsRefugeUpgradeSheet.#removeAction,
    },
  };

  static PARTS = {
    sheet: {
      template: "systems/hollows/templates/item/refuge-upgrade-sheet.html",
      root: true,
    },
  };

  /** @inheritdoc */
  async _prepareContext(options) {
    return {
      ...await super._prepareContext(options),
      item: this.item,
      system: this.item.system,
      systemFields: this.item.system.schema.fields,
      actionFields: this.item.system.schema.fields.actions.element.fields,
      actions: this.item.system.actions.map((action, index) => ({
        ...action, index, temporary: action.type === "temporaryHealth",
      })),
    };
  }

  /** Add an action using the schema defaults. */
  static async #addAction() {
    const actions = this.item.system.toObject().actions;
    actions.push(this.item.system.schema.fields.actions.element.getInitialValue());
    await this.item.update({ "system.actions": actions });
  }

  /** Remove the selected action from the upgrade. */
  static async #removeAction(event, target) {
    const actions = this.item.system.toObject().actions;
    actions.splice(Number(target.dataset.index), 1);
    await this.item.update({ "system.actions": actions });
  }

  /** @inheritdoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this.element.querySelector(".window-content")?.classList.add("hollows-sheet");
  }
}
