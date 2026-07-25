import {
  EntityDataModel,
  HazardDataModel,
  HollowDataModel,
  HunterDataModel,
  NpcDataModel,
  RefugeDataModel,
  registerActorDataModelHooks,
  ThrallDataModel
} from "../data/actor-models.js";
import {
  EchoDataModel,
  EntityAbilityDataModel,
  EntityEnhancementDataModel,
  EquipmentDataModel,
  RelicDataModel,
  RumourDataModel,
  WeaponAbilityDataModel,
  WeaponDataModel
} from "../data/item-models.js";
import { getEffectiveEntityStat } from "../documents/entity/entity-stats.js";
import { HOLLOWS_CONDITIONS } from "../data/_module.mjs";
import { applyHollowsCombatTrackerEntryContext } from "./combat-runtime.js";
import { registerHollowsHandlebarsHelpers } from "./handlebars.js";
import { registerHollowsSheets } from "../applications/sheets/registry.js";
import { preloadHollowsTemplates } from "./templates.js";
import { registerQueries } from "./queries.js";

export function runHollowsInit() {
  console.log("Hollows | System init (Blackjack Engine)");

  try {
    registerHollowsSheets();
  } catch (err) {
    console.error("Hollows | Failed to register sheets during init", err);
  }

  try {
    registerActorDataModelHooks({
      getEffectiveEntityStat
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
      img: cfg.icon
    }));
  } catch (err) {
    console.error("Hollows | Failed to register status effects", err);
  }

  try {
    CONFIG.Actor.dataModels.hunter = HunterDataModel;
    CONFIG.Actor.dataModels.entity = EntityDataModel;
    CONFIG.Actor.dataModels.npc = NpcDataModel;
    CONFIG.Actor.dataModels.thrall = ThrallDataModel;
    CONFIG.Actor.dataModels.refuge = RefugeDataModel;
    CONFIG.Actor.dataModels.hollow = HollowDataModel;
    CONFIG.Actor.dataModels.hazard = HazardDataModel;
  } catch (err) {
    console.error("Hollows | Failed to register actor data models", err);
  }

  try {
    CONFIG.Item.dataModels.weapon = WeaponDataModel;
    CONFIG.Item.dataModels["weapon-ability"] = WeaponAbilityDataModel;
    CONFIG.Item.dataModels.equipment = EquipmentDataModel;
    CONFIG.Item.dataModels.echo = EchoDataModel;
    CONFIG.Item.dataModels["entity-ability"] = EntityAbilityDataModel;
    CONFIG.Item.dataModels["entity-enhancement"] = EntityEnhancementDataModel;
    CONFIG.Item.dataModels.relic = RelicDataModel;
    CONFIG.Item.dataModels.rumour = RumourDataModel;
  } catch (err) {
    console.error("Hollows | Failed to register item data models", err);
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

  const FoundryCombatTracker = foundry?.applications?.sidebar?.tabs?.CombatTracker || null;
  if (!game.hollows._combatTrackerEntryContextPatched && FoundryCombatTracker) {
    game.hollows._combatTrackerEntryContextPatched = true;
    const originalGetEntryContextOptions = FoundryCombatTracker.prototype._getEntryContextOptions;
    FoundryCombatTracker.prototype._getEntryContextOptions = function (...args) {
      const options = typeof originalGetEntryContextOptions === "function"
        ? originalGetEntryContextOptions.apply(this, args)
        : [];
      return applyHollowsCombatTrackerEntryContext(options);
    };
  }
}
