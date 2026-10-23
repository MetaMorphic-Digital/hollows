import { registerActorDataModelHooks } from "../data/actor-models.js";
import { getEffectiveEntityStat } from "../documents/entity/entity-stats.js";
import { HOLLOWS_CONDITIONS } from "../data/_module.mjs";
import { registerHollowsHandlebarsHelpers } from "./handlebars.js";
import { preloadHollowsTemplates } from "./templates.js";
import { registerQueries } from "./queries.js";
import ScriptCompiler from "../documents/item/script-compiler.mjs";
import { registerAttackOptionProvider } from "../data/actions/attack-options.js";
import { registerDefenceOptionProvider } from "../data/actions/defence-options.js";
import { registerTerrainDiscardProvider } from "../data/actions/terrain-discard-options.js";
import { registerManoeuvreAvailabilityProvider } from "../data/actions/manoeuvre-availability.js";
import { registerThreatEnhancementModifier } from "../documents/entity/entity-threat.js";
import HunterData from "../data/actors/hunter.mjs";
import { registerService } from "./extensions.js";

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
  registerScriptProviders();

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

/** Register adapters that read current item scripts when an action runs. */
function registerScriptProviders() {
  for (const [hook, register] of [
    ["attackOptions", registerAttackOptionProvider],
    ["defenceOptions", registerDefenceOptionProvider],
  ]) {
    register((actor, ctx) => ScriptCompiler.getProviders(hook, actor).flatMap(mechanic => mechanic.run(actor, ctx) || []));
  }
  registerTerrainDiscardProvider((actor, key, ctx) => ({
    async handle() {
      for (const mechanic of ScriptCompiler.getProviders("terrainDiscard", actor)) {
        if (await mechanic.run(actor, { ...ctx, terrainKey: key })) return true;
      }
      return false;
    },
  }));
  registerManoeuvreAvailabilityProvider((actor, manoeuvre, ctx) => {
    for (const mechanic of ScriptCompiler.getProviders("manoeuvreAvailability", actor)) {
      const result = mechanic.run(actor, { ...ctx, manoeuvre });
      if (result?.available === false) return result;
    }
    return null;
  });
  HunterData.registerResourceLimitModifier((actor, resource, value) => {
    for (const mechanic of ScriptCompiler.getProviders("resourceLimit", actor)) {
      value = mechanic.run(actor, { resource, value }) ?? value;
    }
    return value;
  });
  registerThreatEnhancementModifier((actor, value) => {
    for (const mechanic of ScriptCompiler.getProviders("threatEnhancement", actor)) {
      value = mechanic.run(actor, { value }) ?? value;
    }
    return value;
  });
  registerService("scriptInterceptors", async (event, ctx, value) => {
    for (const mechanic of ScriptCompiler.getProviders("interceptor", ctx.actor, ctx.item)) {
      if (mechanic.event !== event) continue;
      const actor = ctx.actor ?? mechanic.carrier;
      const carrier = mechanic.matchCarrier ? mechanic.matchCarrier(actor, { ...ctx, value }) : mechanic.carrier;
      if (!carrier) continue;
      const result = await mechanic.run(actor, { ...ctx, carrier, value });
      if (result != null) value = result;
    }
    return value;
  });
}
