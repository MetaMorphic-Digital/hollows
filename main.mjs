import * as applications from "./code/applications/_module.mjs";
// import * as canvas from "./code/canvas/_module.mjs";
import * as data from "./code/data/_module.mjs";
import * as dice from "./code/dice/_module.mjs";
// import * as documents from "./code/documents/_module.mjs";
import * as helpers from "./code/helpers/_module.mjs";
// import * as utils from "./code/utils/_module.mjs";

// FIXME: remove this when possible.
import { default as HOOK_SETUP } from "./code/main.js";
HOOK_SETUP();

globalThis.hollows = {
  id: "hollows",
  applications,
  // canvas,
  data,
  dice,
  // documents,
  helpers,
  // utils,
};

/* -------------------------------------------------- */

Hooks.once("init", () => {
  registerSubtypes();
  registerSheets();
  registerSidebars();
});

/* -------------------------------------------------- */

/**
 * Register document subtypes.
 */
function registerSubtypes() {
  // FIXME: clean this up
  const {
    EchoDataModel, NpcDataModel, RelicDataModel, EntityDataModel, HazardDataModel,
    HollowDataModel, HunterDataModel, RefugeDataModel, RumourDataModel,
    ThrallDataModel, WeaponDataModel, EquipmentDataModel, EntityAbilityDataModel,
    WeaponAbilityDataModel, EntityEnhancementDataModel,
  } = data;

  Object.assign(CONFIG.Actor.dataModels, {
    entity: EntityDataModel,
    hazard: HazardDataModel,
    hollow: HollowDataModel,
    hunter: HunterDataModel,
    npc: NpcDataModel,
    refuge: RefugeDataModel,
    thrall: ThrallDataModel,
  });

  Object.assign(CONFIG.Item.dataModels, {
    "entity-ability": EntityAbilityDataModel,
    "entity-enhancement": EntityEnhancementDataModel,
    "weapon-ability": WeaponAbilityDataModel,
    echo: EchoDataModel,
    equipment: EquipmentDataModel,
    relic: RelicDataModel,
    rumour: RumourDataModel,
    weapon: WeaponDataModel,
  });

}

/* -------------------------------------------------- */

/**
 * Register document sheets.
 */
function registerSheets() {
  const { Actor, Item } = foundry.documents;
  const { DocumentSheetConfig } = foundry.applications.apps;

  const register = (documentClass, SheetClass, types) => {
    DocumentSheetConfig.registerSheet(
      documentClass,
      hollows.id,
      SheetClass,
      { types },
    );
  };

  // Register actor sheets.
  register(Actor, applications.sheets.actors.HollowsEntitySheet, ["entity"]);
  register(Actor, applications.sheets.actors.HollowsHazardSheet, ["hazard"]);
  register(Actor, applications.sheets.actors.HollowsHollowSheet, ["hollow"]);
  register(Actor, applications.sheets.actors.HollowsHunterSheet, ["hunter"]);
  register(Actor, applications.sheets.actors.HollowsNpcSheet, ["npc"]);
  register(Actor, applications.sheets.actors.HollowsRefugeSheet, ["refuge"]);
  register(Actor, applications.sheets.actors.HollowsThrallSheet, ["thrall"]);

  // Register item sheets.
  register(Item, applications.sheets.items.HollowsEchoSheet, ["echo"]);
  register(Item, applications.sheets.items.HollowsEntityAbilitySheet, ["entity-ability"]);
  register(Item, applications.sheets.items.HollowsEntityEnhancementSheet, ["entity-enhancement"]);
  register(Item, applications.sheets.items.HollowsEquipmentSheet, ["equipment"]);
  register(Item, applications.sheets.items.HollowsRelicSheet, ["relic"]);
  register(Item, applications.sheets.items.HollowsRumourSheet, ["rumour"]);
  register(Item, applications.sheets.items.HollowsWeaponAbilitySheet, ["weapon-ability"]);
  register(Item, applications.sheets.items.HollowsWeaponSheet, ["weapon"]);
}

/* -------------------------------------------------- */

/**
 * Register sidebar subclasses.
 */
function registerSidebars() {
  CONFIG.ui.combat = applications.sidebar.HollowsCombatTracker;
}
