import { EffectBuilderItemSheet } from "./shared/effect-builder.js";

export class HollowsRumourSheet extends EffectBuilderItemSheet {
  static DEFAULT_OPTIONS = {
    classes: ["hollows", "sheet", "item", "rumour", "builder"]
  };

  static PARTS = {
    sheet: {
      template: "systems/hollows/templates/item/rumour-sheet.html",
      root: true
    }
  };

  get title() {
    return this.item?.name ?? "Rumour";
  }
}
