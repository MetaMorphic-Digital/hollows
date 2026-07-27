import EffectBuilderItemSheet from "./effect-builder.mjs";

// Cypher upgrade trigger to the document pool its target is chosen from.
const CYPHER_TRIGGER_TARGETS = {
  rumourRevealed: { label: "Rumour", documentName: "Item", type: "rumour" },
  thrallDefeated: { label: "Thrall", documentName: "Actor", type: "thrall" },
  hazardPassed: { label: "Hazard", documentName: "Actor", type: "hazard" },
  entityDefeated: { label: "Entity", documentName: "Actor", type: "entity" },
};

function cypherTargetChoices(trigger) {
  const cfg = CYPHER_TRIGGER_TARGETS[String(trigger || "")];
  if (!cfg) return { label: "Target", choices: [] };
  const collection = cfg.documentName === "Item" ? game.items : game.actors;
  const choices = (collection?.contents || [])
    .filter((doc) => doc.type === cfg.type)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((doc) => ({ id: doc.id, name: doc.name }));
  return { label: cfg.label, choices };
}

export default class HollowsRelicSheet extends EffectBuilderItemSheet {
  static DEFAULT_OPTIONS = {
    classes: ["hollows", "sheet", "item", "relic", "builder"],
  };

  static PARTS = {
    sheet: {
      template: "systems/hollows/templates/item/relic-sheet.html",
      root: true,
    },
  };

  get title() {
    return this.item?.name ?? "Relic";
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const { label, choices } = cypherTargetChoices(this.item.system?.cypherTrigger);
    context.cypherTargetLabel = label;
    context.cypherTargetChoices = choices;
    return context;
  }

  async _onChangeForm(formConfig, event) {
    const input = event?.target;
    const name = String(input?.name ?? "");

    // Cypher-upgrade authoring re-shapes the form, so let these re-render.
    if (name === "system.cypherUpgradable") {
      event.preventDefault?.();
      event.stopPropagation?.();
      this._captureScroll();
      await this.document.update({ "system.cypherUpgradable": !!input.checked });
      return;
    }
    if (name === "system.cypherTrigger") {
      event.preventDefault?.();
      event.stopPropagation?.();
      this._captureScroll();
      await this.document.update({
        "system.cypherTrigger": String(input.value || ""),
        "system.cypherTriggerTargetId": "",
      });
      return;
    }
    if (name === "system.cypherTriggerTargetId") {
      event.preventDefault?.();
      event.stopPropagation?.();
      this._captureScroll();
      const id = String(input.value || "");
      await this.document.update({ "system.cypherTriggerTargetId": id });
      return;
    }

    return super._onChangeForm(formConfig, event);
  }
}
