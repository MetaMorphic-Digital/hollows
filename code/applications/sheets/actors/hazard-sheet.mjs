import { STAT_LABELS } from "../../../data/_module.mjs";
import { postHazardChatCard } from "../../../documents/actor/hazard-damage.js";

const HAZARD_ART = "systems/hollows/assets/hazard.webp";
const HUNT_ART = "systems/hollows/assets/hunt.webp";

function hazardCategoryArt(category) {
  return (category === "hunt") || (category === "obstacle") ? HUNT_ART : HAZARD_ART;
}

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

export default class HollowsHazardSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["hollows", "sheet", "actor", "hazard"],
    position: { width: 520, height: 640 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      useHazard: async function(event) {
        return this._onHazardUse(event);
      },
    },
  };

  static PARTS = {
    sheet: {
      template: "systems/hollows/templates/actor/hazard-sheet.html",
      root: true,
    },
  };

  get title() {
    return this.actor?.name ?? "Hazard";
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const category = String(this.actor.system?.category || "hazard");
    const isHunt = (category === "hunt") || (category === "obstacle");
    return {
      ...context,
      actor: this.actor,
      system: this.actor.system,
      editable: this.isEditable,
      owner: this.document.isOwner,
      limited: this.document.limited,
      statLabels: STAT_LABELS,
      isHunt,
      categoryLabel: isHunt ? "Hunt" : "Hazard",
    };
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
  }

  async _onChangeForm(formConfig, event) {
    const input = event?.target;
    const name = String(input?.name ?? "");
    if (name && ((name === "name") || name.startsWith("system."))) {
      event.preventDefault?.();
      event.stopPropagation?.();
      const value = input.type === "checkbox" ? input.checked
        : input.type === "number" ? (Number(input.value) || 0)
          : String(input.value ?? "");
      const update = { [name]: value };
      if (name === "system.category") {
        const art = hazardCategoryArt(value);
        update.img = art;
        update["prototypeToken.texture.src"] = art;
      }
      await this.document.update(update, { render: false, hollowsAutoConfigure: true });
      if (update.img) this.element.querySelector("[data-edit=\"img\"]")?.setAttribute("src", update.img);
      if (update.img) await this._syncSceneTokenArt(update.img);
      return;
    }
    return super._onChangeForm(formConfig, event);
  }

  async _syncSceneTokenArt(src) {
    const tokens = (canvas?.tokens?.placeables || [])
      .map((token) => token.document)
      .filter((tokenDoc) => tokenDoc?.actor?.id === this.actor.id);
    for (const tokenDoc of tokens) {
      try {
        await tokenDoc.update({ "texture.src": src }, { hollowsAutoConfigure: true });
      } catch (err) {
        console.warn("Hollows | Failed to update hazard token art", err);
      }
    }
  }

  async _onHazardUse(event) {
    event.preventDefault();
    await postHazardChatCard(this.actor);
  }
}
