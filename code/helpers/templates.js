export const HOLLOWS_TEMPLATE_PATHS = [
  "systems/hollows/templates/actor/hunter-sheet.html",
  "systems/hollows/templates/actor/entity-sheet.html",
  "systems/hollows/templates/actor/npc-sheet.html",
  "systems/hollows/templates/actor/refuge-sheet.html",
  "systems/hollows/templates/actor/thrall-sheet.html",
  "systems/hollows/templates/actor/hollow-sheet.html",
  "systems/hollows/templates/item/weapon-sheet.html",
  "systems/hollows/templates/item/weapon-ability-sheet.html",
  "systems/hollows/templates/item/equipment-sheet.html",
  "systems/hollows/templates/item/entity-enhancement-sheet.html",
  "systems/hollows/templates/actor/hazard-sheet.html",
  "systems/hollows/templates/item/echo-sheet.html",
  "systems/hollows/templates/item/entity-ability-sheet.html",
  "systems/hollows/templates/item/parts/entity-after-attack-group.html",
  "systems/hollows/templates/item/parts/effect-group.html",
  "systems/hollows/templates/item/rumour-sheet.html",
  "systems/hollows/templates/item/script-editor.html",
  "systems/hollows/templates/item/parts/script-controls.html",
  "systems/hollows/templates/chat/entity/defence-card.html",
  "systems/hollows/templates/chat/entity/notice-card.html",
  "systems/hollows/templates/chat/entity/test-card.html"
];

export function preloadHollowsTemplates() {
  const loader = foundry?.applications?.handlebars?.loadTemplates || globalThis.loadTemplates;
  if (typeof loader !== "function") {
    throw new Error("Hollows | Template loader is unavailable.");
  }
  return loader(HOLLOWS_TEMPLATE_PATHS);
}
