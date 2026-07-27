const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

export default class HollowsEquipmentSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["hollows", "sheet", "item", "equipment"],
    position: { width: 560, height: 760 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
  };

  static PARTS = {
    sheet: {
      template: "systems/hollows/templates/item/equipment-sheet.html",
      root: true,
    },
  };

  get title() {
    return this.item?.name ?? "Equipment";
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
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const wc = this.element.querySelector(".window-content");
    wc?.classList.add("hollows-sheet");
    if (this._savedScrollTop && wc) {
      wc.scrollTop = this._savedScrollTop;
      this._savedScrollTop = 0;
    }
    if (this.isEditable) {
      this.element.querySelector("[data-edit=\"img\"]")?.addEventListener("click", () => {
        new foundry.applications.apps.FilePicker.implementation({
          type: "image",
          current: this.document.img ?? "",
          callback: async path => { await this.document.update({ img: path }); },
        }).render({ force: true });
      });
    }
  }

  async _onChangeForm(formConfig, event) {
    const input = event?.target;
    const name = String(input?.name ?? "");
    if (input?.tagName !== "SELECT" && name && (name === "name" || name.startsWith("system."))) {
      event.preventDefault?.();
      event.stopPropagation?.();
      const value = input.type === "checkbox" ? input.checked
        : input.type === "number" ? (Number(input.value) || 0)
          : String(input.value ?? "");
      await this.document.update({ [name]: value }, { render: false });
      return;
    }
    this._savedScrollTop = this.element?.querySelector(".window-content")?.scrollTop ?? 0;
    return super._onChangeForm(formConfig, event);
  }
}
