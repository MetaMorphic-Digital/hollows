import { requestRefugeAction } from "../../../documents/actor/refuge.js";
import { default as REFUGE_TABS } from "../refuge-tabs.mjs";
import RefugeUpgradeData from "../../../data/items/refuge-upgrade.mjs";
import { confirmDialog, pickOne } from "../../apps/selection-dialogs.mjs";
import RefugeRearmReforgeDialogs from "../../apps/refuge-rearm-reforge-dialogs.mjs";
import RefugeInstallation from "../../../documents/actor/refuge-installation.mjs";
import RefugeRenewRevel from "../../../documents/actor/refuge-renew-revel.mjs";
import RefugeResearch from "../../../documents/actor/refuge-research.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

export default class HollowsRefugeSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["hollows", "sheet", "actor", "refuge"],
    position: { width: 640, height: 640 },
    window: { resizable: true, contentClasses: ["hollows-sheet"] },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      enterRefuge: HollowsRefugeSheet.#enterRefuge,
      buyUpgrade: HollowsRefugeSheet.#buyUpgrade,
      useUpgrade: HollowsRefugeSheet.#useUpgrade,
      editUpgrade: HollowsRefugeSheet.#editUpgrade,
      removeUpgrade: HollowsRefugeSheet.#removeUpgrade,
      leaveRefuge: HollowsRefugeSheet.#leaveRefuge,
      recoverOnEntry: HollowsRefugeSheet.#recoverOnEntry,
      installationTest: HollowsRefugeSheet.#installationTest,
    },
  };

  static PARTS = {
    sheet: {
      template: "systems/hollows/templates/actor/refuge-sheet.html",
      scrollable: [""],
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
      systemFields: this.actor.system.schema.fields,
      editable: this.isEditable,
      owner: this.document.isOwner,
      limited: this.document.limited,
    };
    return this._prepareSheetContext(data);
  }

  async _prepareSheetContext(data) {
    data.installationTests = game.actors.filter(actor => (actor.type === "hunter") && actor.isOwner)
      .flatMap(hunter => hunter.system.refuge.installationTests.slice(0, 1).map(test => ({
        hunterId: hunter.id, hunterName: hunter.name, name: test.name,
      })));
    data.visitors = this.actor.system.visitingHunters.map(hunter => ({
      id: hunter.id,
      name: hunter.name,
      img: hunter.img,
      actions: hunter.system.refuge.actions,
      canLeave: hunter.isOwner,
      canRecover: hunter.isOwner && hunter.system.refuge.recoveryAvailable,
    }));
    data.canOpenRefuge = this.actor.system.enteringHunters.length > 0;
    const tabs = [];
    for (const def of REFUGE_TABS) {
      if (def.hasContent && !(await def.hasContent(this.actor))) continue;
      const tabContext = def.prepareContext ? await def.prepareContext(this, data) : {};
      const html = await foundry.applications.handlebars.renderTemplate(def.template, { ...data, ...tabContext });
      tabs.push({ id: def.id, label: def.label, html });
    }
    if (!tabs.some(tab => tab.id === this.tabGroups.refugeTabs)) this.tabGroups.refugeTabs = tabs[0].id;
    data.tabs = tabs.map(tab => ({ ...tab, cssClass: tab.id === this.tabGroups.refugeTabs ? "active" : "" }));
    return data;
  }

  /** @inheritdoc */
  _toggleDisabled(disabled) {
    const controls = Array.from(this.element.querySelectorAll(
      "[data-action='enterRefuge'], [data-action='leaveRefuge'], [data-action='recoverOnEntry'], [data-action='useUpgrade'], [data-action='installationTest']",
    ), button => [button, button.disabled]);
    super._toggleDisabled(disabled);
    for (const [button, wasDisabled] of controls) button.disabled = wasDisabled;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const visible = context.tabs.map(tab => tab.id);
    for (const def of REFUGE_TABS) {
      if (!visible.includes(def.id) || !def.activateListeners) continue;
      const root = this.element.querySelector(`.refuge-tabs-content > .tab[data-tab="${def.id}"]`);
      def.activateListeners(this, root);
    }
  }

  /** Open a paid group visit through the Refuge action queue. */
  static async #enterRefuge() {
    await requestRefugeAction({ type: "enterRefuge", refugeId: this.actor.id });
  }

  /** @inheritdoc */
  async _onDropActor(event, actor) {
    if (!game.user.isGM || (actor.type !== "hunter") || actor.pack) return null;
    await requestRefugeAction({ type: "enterHunter", refugeId: this.actor.id, hunterUuid: actor.uuid });
    return actor;
  }

  /** End only the selected Hunter's visit. */
  static async #leaveRefuge(event, target) {
    const hunter = game.actors.get(target.dataset.hunterId);
    await hunter.update({
      "system.refuge.id": "", "system.refuge.actions.value": 0, "system.refuge.recoveryAvailable": false,
    });
  }

  /** Claim the selected Hunter's free recovery for this visit. */
  static async #recoverOnEntry(event, target) {
    const hunter = game.actors.get(target.dataset.hunterId);
    await requestRefugeAction({ type: "recoverOnEntry", refugeId: this.actor.id, hunterUuid: hunter.uuid });
  }

  /** Resolve the selected Hunter's next installation test. */
  static async #installationTest(event, target) {
    await RefugeInstallation.prompt(game.actors.get(target.dataset.hunterId), this.actor);
  }

  /** @inheritdoc */
  async _onDropItem(event, item) {
    if (item.type !== "refugeUpgrade") return null;
    if (item.parent === this.actor) return super._onDropItem(event, item);
    return this._purchaseUpgrade(item);
  }

  /** Confirm the purchase price before requesting installation. */
  async _purchaseUpgrade(upgrade) {
    const { bone, hearts } = upgrade.system.getPurchaseCost(this.actor);
    const confirmed = await confirmDialog({
      title: game.i18n.localize("HOLLOWS.REFUGE.buyUpgrade"),
      bodyHtml: game.i18n.format("HOLLOWS.REFUGE.confirmPurchase", {
        name: foundry.utils.escapeHTML(upgrade.name), bone, hearts,
      }),
      yesLabel: game.i18n.localize("HOLLOWS.REFUGE.buy"),
    });
    if (!confirmed) return null;
    await requestRefugeAction({ type: "buyUpgrade", refugeId: this.actor.id, upgradeUuid: upgrade.uuid });
    return null;
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

  /** Choose a visitor who can pay the action cost and use the upgrade. */
  static async #useUpgrade(event, target) {
    const { itemId, upgradeAction: action } = target.dataset;
    const upgrade = this.actor.items.get(itemId).system;
    const definition = upgrade.actions[action];
    const { bone, hearts } = this.actor.system.resources;
    const minimumCost = upgrade.getActionCost(definition);
    if ((bone < minimumCost.bone) || (hearts < minimumCost.hearts)) {
      ui.notifications.warn(game.i18n.localize("HOLLOWS.REFUGE.insufficientResources"));
      return;
    }
    const hunters = this.actor.system.visitingHunters.filter(hunter => hunter.isOwner
      && (hunter.system.refuge.actions.value >= definition.cost.actions)
      && (!hunter.statuses.has("dead") || (definition.type === "fullRecovery")));
    if (!hunters.length) {
      ui.notifications.warn(game.i18n.localize("HOLLOWS.REFUGE.noAvailableHunters"));
      return;
    }
    const hunterId = hunters.length === 1 ? hunters[0].id : await pickOne({
      title: game.i18n.localize("HOLLOWS.REFUGE.selectVisitor"),
      options: hunters.map(hunter => ({ value: hunter.id, label: hunter.name })),
    });
    const hunter = game.actors.get(hunterId);
    if (!hunter) return;
    const group = RefugeUpgradeData.ACTIONS[definition.type].group;
    const actionHandler = {
      weapons: RefugeRearmReforgeDialogs, renewRevel: RefugeRenewRevel, research: RefugeResearch,
    }[group];
    const choice = actionHandler ? await actionHandler.prepare(hunter, this.actor, definition).catch(err => {
      ui.notifications.warn(err.message);
      return null;
    }) : {};
    if (!choice) return;
    const cost = upgrade.getActionCost(definition, choice);
    if ((this.actor.system.resources.bone < cost.bone) || (this.actor.system.resources.hearts < cost.hearts)) {
      ui.notifications.warn(game.i18n.localize("HOLLOWS.REFUGE.insufficientResources"));
      return;
    }
    try {
      await requestRefugeAction({
        type: "useUpgrade", refugeId: this.actor.id, itemId, action, hunterUuid: hunter.uuid, choice,
      });
    } catch (err) {
      if (game.user.isActiveGM) ui.notifications.warn(err.message);
    }
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
