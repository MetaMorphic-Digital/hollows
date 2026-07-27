import { registerActorDataModelHooks } from "../data/actor-models.js";
import { getEffectiveEntityStat } from "../documents/entity/entity-stats.js";
import { HOLLOWS_CONDITIONS } from "../data/_module.mjs";
import { registerHollowsHandlebarsHelpers } from "./handlebars.js";
import { preloadHollowsTemplates } from "./templates.js";
import { registerQueries } from "./queries.js";

export function runHollowsInit() {
  console.log("Hollows | System init (Blackjack Engine)");

  try {
    registerActorDataModelHooks({
      getEffectiveEntityStat,
    });
  } catch (err) {
    console.error("Hollows | Failed to register actor data model hooks", err);
  }

  try {
    registerHollowsHandlebarsHelpers();
  } catch (err) {
    console.error("Hollows | Failed to register Handlebars helpers", err);
  }

  try {
    CONFIG.statusEffects = Object.values(HOLLOWS_CONDITIONS).map(cfg => ({
      id: cfg.id,
      name: cfg.label,
      icon: cfg.icon,
      img: cfg.icon,
    }));
  } catch (err) {
    console.error("Hollows | Failed to register status effects", err);
  }

  try {
    preloadHollowsTemplates();
  } catch (err) {
    console.error("Hollows | Failed to preload templates", err);
  }

  try {
    registerQueries();
  } catch (err) {
    console.error("Hollows | Failed to register queries", err);
  }

  if (!game.hollows) game.hollows = {};
  if (!game.hollows._rollInitiativePatched) {
    game.hollows._rollInitiativePatched = true;
    const originalRollInitiative = Combat.prototype.rollInitiative;
    Combat.prototype.rollInitiative = async function (...args) {
      ui.notifications.warn("Use Setup Rolls for Hollows initiative.");
      return this;
    };
    game.hollows._originalRollInitiative = originalRollInitiative;
  }
}
