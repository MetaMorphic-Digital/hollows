const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

export default class HollowsWeaponFormSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["hollows", "sheet", "item", "weapon-form"],
    position: { width: 520, height: 600 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      /** @this {HollowsWeaponFormSheet} */
      editFormScript: async function() {
        if (!this.isEditable) return;
        const { default: HollowsScriptEditor } = await import("../../apps/script-editor.mjs");
        HollowsScriptEditor.open(this.item, "system.script", {
          title: game.i18n.format("HOLLOWS.SCRIPT.formTitle", { name: this.item.name }),
        });
      },
    },
  };

  static PARTS = {
    sheet: {
      template: "systems/hollows/templates/item/weapon-form-sheet.html",
      root: true,
    },
  };

  /** @inheritdoc */
  get title() {
    return this.item.name;
  }

  /** @inheritdoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return {
      ...context,
      item: this.item,
      system: this.item.system,
      editable: this.isEditable,
      owner: this.document.isOwner,
      limited: this.document.limited,
      scriptsAllowed: hollows.settings.allowCustomScripts,
      canEditScripts: game.user.isGM && this.isEditable,
    };
  }

  /** @inheritdoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this.element.querySelector(".window-content")?.classList.add("hollows-sheet");
  }

  /** @inheritdoc */
  async _onChangeForm(formConfig, event) {
    const input = event.target;
    const name = input.name;
    if ((name === "name") || name.startsWith("system.")) {
      event.preventDefault();
      event.stopPropagation();
      const value = input.type === "number" ? Number(input.value) : input.value;
      await this.document.update({ [name]: value }, { render: false });
      return;
    }
    return super._onChangeForm(formConfig, event);
  }
}
