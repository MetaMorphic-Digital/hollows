import { editItemScript } from "../../apps/script-editor.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

export default class HollowsWeaponAbilitySheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["hollows", "sheet", "item", "weapon-ability"],
    position: { width: 520, height: 520 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: { editScript: editItemScript },
  };

  static PARTS = {
    sheet: {
      template: "systems/hollows/templates/item/weapon-ability-sheet.html",
      root: true,
    },
  };

  get title() {
    return this.item?.name ?? "Weapon Ability";
  }

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

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.element.querySelector(".window-content")?.classList.add("hollows-sheet");
  }

  /** @inheritdoc */
  async _processSubmitData(event, form, submitData, options) {
    return super._processSubmitData(event, form, submitData, { ...options, render: false });
  }
}
