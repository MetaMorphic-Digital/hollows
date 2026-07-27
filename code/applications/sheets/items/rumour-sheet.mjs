import EffectBuilderItemSheet from "./effect-builder.mjs";

export default class HollowsRumourSheet extends EffectBuilderItemSheet {
  /** @inheritdoc */
  static DEFAULT_OPTIONS = {
    classes: ["hollows", "sheet", "item", "rumour", "builder"],
  };

  /** @inheritdoc */
  static PARTS = {
    sheet: {
      template: "systems/hollows/templates/item/rumour-sheet.html",
      root: true,
    },
  };

  /** @inheritdoc */
  get title() {
    return this.item.name;
  }
}
