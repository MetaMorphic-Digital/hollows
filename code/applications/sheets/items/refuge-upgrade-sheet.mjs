const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

export default class HollowsRefugeUpgradeSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["hollows", "sheet", "item", "refuge-upgrade"],
    position: { width: 520, height: 600 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
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
    };
  }

  /** @inheritdoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this.element.querySelector(".window-content")?.classList.add("hollows-sheet");
  }
}
