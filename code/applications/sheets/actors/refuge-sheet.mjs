import { requestRefugeAction, applyEnterRefuge } from "../../../documents/actor/refuge.js";
import { default as REFUGE_TABS } from "../refuge-tabs.mjs";
import RefugeUpgradeData from "../../../data/items/refuge-upgrade.mjs";
import { getActiveHunterForUser } from "../../../canvas/zone.js";
import { confirmDialog, pickOne, resolveActionHunter } from "../../apps/selection-dialogs.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

export default class HollowsRefugeSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["hollows", "sheet", "actor", "refuge"],
    position: { width: 640, height: 640 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      buyUpgrade: HollowsRefugeSheet.#buyUpgrade,
      useUpgrade: HollowsRefugeSheet.#useUpgrade,
      editUpgrade: HollowsRefugeSheet.#editUpgrade,
      removeUpgrade: HollowsRefugeSheet.#removeUpgrade,
    },
  };

  static PARTS = {
    sheet: {
      template: "systems/hollows/templates/actor/refuge-sheet.html",
      root: true,
    },
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
      limited: this.document.limited,
    };
    return this._prepareSheetContext(data);
  }

  async _prepareSheetContext(data) {
    const tabs = [];
    for (const def of REFUGE_TABS) {
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
      this.element.querySelector("[data-edit=\"img\"]")?.addEventListener("click", () => {
        new foundry.applications.apps.FilePicker.implementation({
          type: "image",
          current: this.document.img ?? "",
          callback: async path => { await this.document.update({ img: path }); },
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

    for (const def of REFUGE_TABS) {
      if (!visible.includes(def.id) || (typeof def.activateListeners !== "function")) continue;
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
    if ((input?.tagName !== "SELECT") && name && ((name === "name") || name.startsWith("system."))) {
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

  /** @inheritdoc */
  async _onDropItem(event, item) {
    if (item.type !== "refugeUpgrade") return null;
    if (item.parent === this.actor) return super._onDropItem(event, item);
    return this._purchaseUpgrade(item);
  }

  /** Confirm the purchase price before requesting installation. */
  async _purchaseUpgrade(upgrade) {
    const { bone, hearts } = upgrade.system.cost;
    const confirmed = await confirmDialog({
      title: game.i18n.localize("HOLLOWS.REFUGE.buyUpgrade"),
      bodyHtml: game.i18n.format("HOLLOWS.REFUGE.confirmPurchase", {
        name: foundry.utils.escapeHTML(upgrade.name), bone, hearts,
      }),
      yesLabel: game.i18n.localize("HOLLOWS.REFUGE.buy"),
    });
    if (!confirmed) return null;
    if (await requestRefugeAction({ type: "buyUpgrade", refugeId: this.actor.id, upgradeUuid: upgrade.uuid })) return null;
    return this.actor.system.buyUpgrade(upgrade);
  }

  /** Choose an upgrade from the world or a compendium. */
  static async #buyUpgrade() {
    const upgrades = await RefugeUpgradeData.getAvailableUpgrades();
    const uuid = await pickOne({
      title: game.i18n.localize("HOLLOWS.REFUGE.buyUpgrade"),
      options: upgrades.map(item => ({ value: item.uuid, label: item.name })),
    });
    if (!uuid) return;
    await this._purchaseUpgrade(await fromUuid(uuid));
  }

  /** Choose the recovering Hunter and execute the installed item's action. */
  static async #useUpgrade(event, target) {
    const activeHunter = game.user.isGM ? null : getActiveHunterForUser();
    if (!game.user.isGM && !activeHunter) {
      ui.notifications.warn(game.i18n.localize("HOLLOWS.REFUGE.selectHunter"));
      return;
    }
    const hunter = await resolveActionHunter(activeHunter, { title: game.i18n.localize("HOLLOWS.REFUGE.fullRecovery") });
    if (!hunter) return;
    const { itemId, upgradeAction: action } = target.dataset;
    if (await requestRefugeAction({
      type: "useUpgrade", refugeId: this.actor.id, itemId, action, hunterUuid: hunter.uuid,
    })) return;
    await this.actor.system.useUpgrade(itemId, action, hunter);
  }

  /** Open an installed upgrade for editing. */
  static #editUpgrade(event, target) {
    this.actor.items.get(target.dataset.itemId).sheet.render({ force: true });
  }

  /** Remove an installed upgrade without refunding its purchase price. */
  static async #removeUpgrade(event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    const confirmed = await confirmDialog({
      title: game.i18n.localize("HOLLOWS.REFUGE.removeUpgrade"),
      bodyHtml: game.i18n.format("HOLLOWS.REFUGE.confirmRemoval", { name: foundry.utils.escapeHTML(item.name) }),
      yesLabel: game.i18n.localize("HOLLOWS.REFUGE.remove"),
    });
    if (confirmed) await item.delete();
  }
}
