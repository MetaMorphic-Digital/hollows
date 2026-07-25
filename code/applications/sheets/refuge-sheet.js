import { requestRefugeAction, applyEnterRefuge } from "../../documents/actor/refuge.js";
import { getRefugeTabs } from "./refuge-tabs.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

export class HollowsRefugeSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["hollows", "sheet", "actor", "refuge"],
    position: { width: 640, height: 640 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false }
  };

  static PARTS = {
    sheet: {
      template: "systems/hollows/templates/actor/refuge-sheet.html",
      root: true
    }
  };

  get title() {
    return this.actor?.name ?? "Refuge";
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const data = {
      ...context,
      actor: this.actor,
      system: this.actor.system,
      editable: this.isEditable,
      owner: this.document.isOwner,
      limited: this.document.limited
    };
    return this._prepareSheetContext(data);
  }

  async _prepareSheetContext(data) {
    const tabs = [];
    for (const def of getRefugeTabs()) {
      if (def.hasContent && !(await def.hasContent(this.actor))) continue;
      const tabContext = def.prepareContext ? await def.prepareContext(this, data) : {};
      const html = await foundry.applications.handlebars.renderTemplate(def.template, { ...data, ...tabContext });
      tabs.push({ id: def.id, label: def.label, html });
    }
    data.tabs = tabs;
    return data;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.element.querySelector(".window-content")?.classList.add("hollows-sheet");

    if (this.isEditable) {
      this.element.querySelector('[data-edit="img"]')?.addEventListener("click", () => {
        new foundry.applications.apps.FilePicker.implementation({
          type: "image",
          current: this.document.img ?? "",
          callback: async path => { await this.document.update({ img: path }); }
        }).render({ force: true });
      });
    }

    this.element.querySelector("[data-enter-refuge]")?.addEventListener("click", this._onEnterRefuge.bind(this));

    const visible = (context.tabs || []).map((t) => t.id);
    if (!visible.includes(this._activeTab)) this._activeTab = visible[0] || "";
    for (const tab of this.element.querySelectorAll(".sheet-tabs[data-group='refugeTabs'] [data-tab]")) {
      tab.addEventListener("click", (event) => {
        event.preventDefault();
        this._activeTab = tab.dataset.tab;
        this._activateRefugeTab(this._activeTab);
      });
    }
    this._activateRefugeTab(this._activeTab);

    for (const def of getRefugeTabs()) {
      if (!visible.includes(def.id) || typeof def.activateListeners !== "function") continue;
      const root = this.element.querySelector(`.refuge-tabs-content > .tab[data-tab="${def.id}"]`);
      if (root) def.activateListeners(this, root);
    }
  }

  _activateRefugeTab(tabName) {
    if (!tabName || !this.element) return;
    for (const tab of this.element.querySelectorAll(".sheet-tabs[data-group='refugeTabs'] [data-tab]")) {
      tab.classList.toggle("active", tab.dataset.tab === tabName);
    }
    for (const panel of this.element.querySelectorAll(".refuge-tabs-content > .tab")) {
      panel.classList.toggle("active", panel.dataset.tab === tabName);
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
    return super._onChangeForm(formConfig, event);
  }

  async _onEnterRefuge(event) {
    event.preventDefault();
    if (await requestRefugeAction({ type: "enterRefuge", refugeId: this.actor.id })) return;
    await applyEnterRefuge(this.actor);
  }
}
