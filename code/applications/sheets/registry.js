import {
  HollowsHollowSheet,
  HollowsHunterSheet,
} from "./actors/_module.mjs";
import { HollowsEchoSheet } from "./echo-sheet.js";
import { HollowsEquipmentSheet } from "./equipment-sheet.js";
import { HollowsEntityAbilitySheet } from "./entity-ability-sheet.js";
import { HollowsEntitySheet } from "./entity-sheet.js";
import { HollowsEntityEnhancementSheet } from "./entity-enhancement-sheet.js";
import { HollowsHazardSheet } from "./hazard-sheet.js";
import { HollowsNpcSheet } from "./npc-sheet.js";
import { HollowsRefugeSheet } from "./refuge-sheet.js";
import { HollowsRelicSheet } from "./relic-sheet.js";
import { HollowsRumourSheet } from "./rumour-sheet.js";
import { HollowsThrallSheet } from "./thrall-sheet.js";
import { HollowsWeaponAbilitySheet } from "./weapon-ability-sheet.js";
import { HollowsWeaponSheet } from "./weapon-sheet.js";
import { getService } from "../../helpers/extensions.js";

export function registerHollowsSheets() {
  const cfg = foundry.applications.apps.DocumentSheetConfig;

  const reg = (docClass, sheetClass, types) =>
    cfg.registerSheet(docClass, "hollows", getService(`sheet:${types[0]}`) || sheetClass, { types, makeDefault: true });

  reg(Actor, HollowsHunterSheet, ["hunter"]);
  reg(Actor, HollowsEntitySheet, ["entity"]);
  reg(Actor, HollowsThrallSheet, ["thrall"]);
  reg(Actor, HollowsNpcSheet, ["npc"]);
  reg(Actor, HollowsRefugeSheet, ["refuge"]);
  reg(Actor, HollowsHollowSheet, ["hollow"]);
  reg(Actor, HollowsHazardSheet, ["hazard"]);

  reg(Item, HollowsWeaponSheet, ["weapon"]);
  reg(Item, HollowsWeaponAbilitySheet, ["weapon-ability"]);
  reg(Item, HollowsEquipmentSheet, ["equipment"]);
  reg(Item, HollowsEntityEnhancementSheet, ["entity-enhancement"]);
  reg(Item, HollowsEchoSheet, ["echo"]);
  reg(Item, HollowsEntityAbilitySheet, ["entity-ability"]);
  reg(Item, HollowsRelicSheet, ["relic"]);
  reg(Item, HollowsRumourSheet, ["rumour"]);
}
