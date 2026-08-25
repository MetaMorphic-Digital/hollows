import * as applications from "./code/applications/_module.mjs";
// import * as canvas from "./code/canvas/_module.mjs";
import * as data from "./code/data/_module.mjs";
import * as dice from "./code/dice/_module.mjs";
import * as documents from "./code/documents/_module.mjs";
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
  documents,
  helpers,
  // utils,
};

/* -------------------------------------------------- */

Hooks.once("init", () => {
  registerDocumentClasses();
  registerSubtypes();
  registerSheets();
  registerSidebars();
  registerFonts();
});

/* -------------------------------------------------- */

/**
 * Register document classes.
 */
function registerDocumentClasses() {
  CONFIG.ActiveEffect.documentClass = documents.HollowsActiveEffect;
  CONFIG.Actor.documentClass = documents.HollowsActor;
  CONFIG.ChatMessage.documentClass = documents.HollowsChatMessage;
  CONFIG.Combat.documentClass = documents.HollowsCombat;
  CONFIG.Combatant.documentClass = documents.HollowsCombatant;
  CONFIG.Item.documentClass = documents.HollowsItem;
  CONFIG.Region.documentClass = documents.HollowsRegionDocument;
  CONFIG.Scene.documentClass = documents.HollowsScene;
  CONFIG.Token.documentClass = documents.HollowsTokenDocument;
}

/* -------------------------------------------------- */

/**
 * Register document subtypes.
 */
function registerSubtypes() {
  // FIXME: clean this up
  const {
    EchoDataModel,
    RelicDataModel,
    RumourDataModel,
  } = data;

  Object.assign(CONFIG.Actor.dataModels, {
    entity: data.actors.EntityData,
    hazard: data.actors.HazardData,
    hollow: data.actors.HollowData,
    hunter: data.actors.HunterData,
    npc: data.actors.NpcData,
    refuge: data.actors.RefugeData,
    thrall: data.actors.ThrallData,
  });

  Object.assign(CONFIG.Item.dataModels, {
    entityAbility: data.items.EntityAbilityData,
    entityEnhancement: data.items.EntityEnhancementData,
    weaponAbility: data.items.WeaponAbilityData,
    echo: EchoDataModel,
    equipment: data.items.EquipmentData,
    relic: RelicDataModel,
    rumour: RumourDataModel,
    weapon: data.items.WeaponData,
  });

}

/* -------------------------------------------------- */

/**
 * Register document sheets.
 */
function registerSheets() {
  const { Actor, Item, JournalEntry } = foundry.documents;
  const { DocumentSheetConfig } = foundry.applications.apps;

  const register = (documentClass, SheetClass, types = []) => {
    DocumentSheetConfig.registerSheet(
      documentClass,
      hollows.id,
      SheetClass,
      { types, makeDefault: true },
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
  register(Item, applications.sheets.items.HollowsEntityAbilitySheet, ["entityAbility"]);
  register(Item, applications.sheets.items.HollowsEntityEnhancementSheet, ["entityEnhancement"]);
  register(Item, applications.sheets.items.HollowsEquipmentSheet, ["equipment"]);
  register(Item, applications.sheets.items.HollowsRelicSheet, ["relic"]);
  register(Item, applications.sheets.items.HollowsRumourSheet, ["rumour"]);
  register(Item, applications.sheets.items.HollowsWeaponAbilitySheet, ["weaponAbility"]);
  register(Item, applications.sheets.items.HollowsWeaponSheet, ["weapon"]);

  // Register journal entry sheets.
  register(JournalEntry, applications.sheets.journals.HollowsJournalEntrySheet);
}

/* -------------------------------------------------- */

/**
 * Register sidebar subclasses.
 */
function registerSidebars() {
  CONFIG.ui.combat = applications.sidebar.HollowsCombatTracker;
}

/* ------------------------------------------------- */

/**
 * Register fonts.
 */
function registerFonts() {
  const fontPath = `systems/${hollows.id}/assets/fonts`;

  Object.assign(CONFIG.fontDefinitions, {
    /* -------------------- Shallot -------------------- */
    Shallot: {
      editor: true,
      fonts: [
        { urls: [`${fontPath}/shallot/Shallot-Regular.otf`], weight: "normal", style: "normal" },
        { urls: [`${fontPath}/shallot/Shallot-Italic.otf`], weight: "normal", style: "italic" },
        { urls: [`${fontPath}/shallot/Shallot-Medium.otf`], weight: 500, style: "normal" },
        { urls: [`${fontPath}/shallot/Shallot-MediumItalic.otf`], weight: 500, style: "italic" },
        { urls: [`${fontPath}/shallot/Shallot-Bold.otf`], weight: "bold", style: "normal" },
        { urls: [`${fontPath}/shallot/Shallot-BoldItalic.otf`], weight: "bold", style: "italic" },
        { urls: [`${fontPath}/shallot/Shallot-ExtraBold.otf`], weight: 800, style: "normal" },
        { urls: [`${fontPath}/shallot/Shallot-ExtraBoldItalic.otf`], weight: 800, style: "italic" },
      ],
    },
    "Shallot Variable": {
      editor: true,
      fonts: [
        { urls: [`${fontPath}/shallot/ShallotVariable-Regular.ttf`], weight: "normal", style: "normal" },
        { urls: [`${fontPath}/shallot/ShallotVariable-Italic.ttf`], weight: "normal", style: "italic" },
      ],
    },

    /* -------------------- Mourich -------------------- */
    Mourich: {
      editor: true,
      fonts: [
        { urls: [`${fontPath}/mourich/Mourich-Regular.otf`], weight: "normal", style: "normal" },
        { urls: [`${fontPath}/mourich/Mourich-Bold.otf`], weight: "bold", style: "normal" },
      ],
    },

    /* ------------------ Cobblestone ------------------ */
    Cobblestone: {
      editor: true,
      fonts: [
        { urls: [`${fontPath}/cobblestone/Cobblestone.ttf`], weight: "normal", style: "normal" },
        { urls: [`${fontPath}/cobblestone/Cobblestone-Italic.ttf`], weight: "normal", style: "italic" },
      ],
    },
    "Cobblestone Aged": {
      editor: true,
      fonts: [
        { urls: [`${fontPath}/cobblestone/Cobblestone-Aged.ttf`], weight: "bold", style: "normal" },
      ],
    },

    /* ----------------- Feliz en Vista ---------------- */
    "Feliz en Vista": {
      editor: true,
      fonts: [
        { urls: [`${fontPath}/feliz-en-vista/HVFelizenVista-Regular.ttf`], weight: "normal", style: "normal" },
        { urls: [`${fontPath}/feliz-en-vista/HVFelizenVista-Bold.ttf`], weight: "bold", style: "normal" },
      ],
    },
    "Feliz en Vista Alt": {
      editor: true,
      fonts: [
        { urls: [`${fontPath}/feliz-en-vista/HVFelizenVista-Alternative.ttf`], weight: "normal", style: "normal" },
      ],
    },

    /* ---------------------- Misc --------------------- */
    "Bell MT": {
      editor: true,
      fonts: [
        { urls: [`${fontPath}/misc/BellMTItalic.ttf`], weight: "normal", style: "italic" },
      ],
    },
    "Go Around The Books": {
      editor: true,
      fonts: [
        { urls: [`${fontPath}/misc/Go-Around-The-Books.ttf`], weight: "normal", style: "normal" },
      ],
    },
  });
}
