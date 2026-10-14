import { registerActorDataModelHooks } from "../data/actor-models.js";
import { getEffectiveEntityStat } from "../documents/entity/entity-stats.js";
import { HOLLOWS_CONDITIONS } from "../data/_module.mjs";
import { registerHollowsHandlebarsHelpers } from "./handlebars.js";
import { preloadHollowsTemplates } from "./templates.js";
import { registerQueries } from "./queries.js";

export function runHollowsInit() {
  console.log("Hollows | System init (Blackjack Engine)");

  registerActorDataModelHooks({
    getEffectiveEntityStat,
  });

  registerHollowsHandlebarsHelpers();

  CONFIG.statusEffects = Object.values(HOLLOWS_CONDITIONS).map(cfg => ({
    id: cfg.id,
    name: cfg.label,
    icon: cfg.icon,
    img: cfg.icon,
  }));

  preloadHollowsTemplates();

  registerQueries();

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
