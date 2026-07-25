import { STAT_LABELS } from "../../data/_module.mjs";
import { createEntityDefenceRequest } from "../../data/entity/action-cards.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

export class HollowsThrallSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["hollows", "sheet", "actor", "thrall"],
    position: { width: 520, height: 520 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      thrallAttack: async function(event) {
        if (!this.isEditable) return;
        return this._onThrallAttack(event);
      }
    }
  };

  static PARTS = {
    sheet: {
      template: "systems/hollows/templates/actor/thrall-sheet.html",
      root: true
    }
  };

  get title() {
    return this.actor?.name ?? "Thrall";
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return {
      ...context,
      actor: this.actor,
      system: this.actor.system,
      editable: this.isEditable,
      owner: this.document.isOwner,
      limited: this.document.limited,
      statLabels: STAT_LABELS
    };
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
  }

  async _onChangeForm(formConfig, event) {
    const input = event?.target;
    const name = String(input?.name ?? "");
    if (name && (name === "name" || name.startsWith("system."))) {
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

  async _onThrallAttack(event) {
    event.preventDefault();
    const targetToken = Array.from(game.user?.targets ?? [])
      .find(t => t.actor?.type === "hunter");
    if (!targetToken?.actor) {
      ui.notifications.warn("Target a Hunter token to attack.");
      return;
    }
    const target = targetToken.actor;
    const attackName = this.actor?.name || "Thrall Attack";
    const defenceStat = String(this.actor.system?.stat || "hard");
    const tn = Number(this.actor.system?.tn ?? 0);
    const damageResolve = Number(this.actor.system?.damage?.resolve ?? 0);
    const damageWounds = Number(this.actor.system?.damage?.wounds ?? 0);

    await createEntityDefenceRequest({
      entityActor: this.actor,
      target,
      targetToken,
      titleHtml: `${foundry.utils.escapeHTML(this.actor.name)} attacks ${foundry.utils.escapeHTML(target.name)}`,
      attackName,
      defenceStat,
      basicDefenceMode: "normal",
      forceAdvantage: false,
      tn,
      damageResolve,
      damageWounds,
      attackData: {
        rollMod: 0,
        threatSpent: 0,
        followUp: { enabled: false }
      }
    });
  }
}
