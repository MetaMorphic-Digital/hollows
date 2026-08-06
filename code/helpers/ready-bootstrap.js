import { ensureWeaponAbilityCompendiumFolders, isShotgunWeapon, syncHunterLoadedStatusFromShotguns } from "./weapon-utils.js";
import { getHollowsWeaponIndex, setHollowsWeaponIndex } from "./runtime-state.js";
import { getWeaponPackDocs } from "../data/weapons/index.js";

async function normalizeHollowsSheetFlags() {
  if (!game.user?.isGM) return;

  const actors = game.actors?.contents || [];
  for (const actor of actors) {
    if (!actor || !["hunter", "entity", "npc", "refuge", "thrall", "hollow", "hazard"].includes(actor.type)) continue;
    const sheetClass = actor.getFlag("core", "sheetClass");
    if (sheetClass) {
      const normalized = String(sheetClass).toLowerCase();
      if (normalized.includes("core") || !normalized.startsWith("hollows.")) {
        await actor.unsetFlag("core", "sheetClass");
        if (actor.sheet) actor.sheet.close();
        actor._sheet = null;
      }
    }

    for (const item of actor.items?.contents || []) {
      const itemSheetClass = item.getFlag("core", "sheetClass");
      if (!itemSheetClass) continue;
      const normalizedItem = String(itemSheetClass).toLowerCase();
      if (normalizedItem.includes("core") || !normalizedItem.startsWith("hollows.")) {
        await item.unsetFlag("core", "sheetClass");
        if (item.sheet) item.sheet.close();
        item._sheet = null;
      }
    }
  }

  for (const item of game.items?.contents || []) {
    const itemSheetClass = item.getFlag("core", "sheetClass");
    if (!itemSheetClass) continue;
    const normalizedItem = String(itemSheetClass).toLowerCase();
    if (normalizedItem.includes("core") || !normalizedItem.startsWith("hollows.")) {
      await item.unsetFlag("core", "sheetClass");
      if (item.sheet) item.sheet.close();
      item._sheet = null;
    }
  }
}

async function buildWeaponIndex() {
  const docs = await getWeaponPackDocs();
  const index = new Map();
  for (const doc of docs) index.set(doc.name, doc);
  setHollowsWeaponIndex(index);
}

async function hydrateWeaponsFromPack() {
  const applyFromPack = async (item) => {
    if (!item?.system || item.type !== "weapon") return;
    const weaponIndex = getHollowsWeaponIndex();
    if (!weaponIndex) return;
    const byName = weaponIndex.get(item.name);
    const byType = weaponIndex.get(item.system.weaponType);
    const source = byName || byType;
    const sourceSystem = source?.system || source?.systemData || source?.system;
    if (!sourceSystem) return;

    const update = {};
    const fields = ["outlook", "lies", "fears", "description", "coreAbility"];
    for (const field of fields) {
      if (!item.system[field] && sourceSystem[field]) {
        update[`system.${field}`] = sourceSystem[field];
      }
    }
    if (Object.keys(update).length) {
      await item.update(update);
    }
  };

  for (const item of game.items.contents) await applyFromPack(item);

  for (const actor of game.actors.contents) {
    for (const item of actor.items.contents) {
      await applyFromPack(item);
    }
  }
}

async function ensureWeaponCoreDefaults() {
  const ensureShotgunDefaults = async (item) => {
    if (!item || item.type !== "weapon") return;
    if (!isShotgunWeapon(item)) return;
    if (item.system?.loaded !== undefined) return;
    await item.update({ "system.loaded": true });
  };

  for (const item of game.items.contents) {
    await ensureShotgunDefaults(item);
  }

  for (const actor of game.actors.contents) {
    for (const item of actor.items.contents) {
      await ensureShotgunDefaults(item);
    }
    if (actor.type === "hunter") {
      await syncHunterLoadedStatusFromShotguns(actor);
    }
  }
}

async function normalizeActorDefaults(actor) {
  if (!actor) return;

  if (actor.type === "hunter") {
    if (actor.system?.curse?.value === undefined) {
      await actor.update({ "system.curse.value": 0 });
    }
    const updateData = {};
    let changed = false;
    if (actor.system?.identity === undefined) { updateData["system.identity"] = { faction: "", factionText: "", origin: "", originText: "", seed: "", seedText: "" }; changed = true; }
    if (actor.system?.identity?.factionText === undefined) { updateData["system.identity.factionText"] = ""; changed = true; }
    if (actor.system?.identity?.originText === undefined) { updateData["system.identity.originText"] = ""; changed = true; }
    if (actor.system?.identity?.seedText === undefined) { updateData["system.identity.seedText"] = ""; changed = true; }
    if (actor.system?.statsMarks === undefined) { updateData["system.statsMarks"] = { strong: 0, hard: 0, quick: 0, sharp: 0, wise: 0 }; changed = true; }
    if (actor.system?.bio === undefined) { updateData["system.bio"] = { appearance: "", notes: "" }; changed = true; }
    if (actor.system?.equipment === undefined) {
      updateData["system.equipment"] = { relic: { used: false } };
      changed = true;
    }
    if (actor.system?.equipment?.relic === undefined) { updateData["system.equipment.relic"] = { used: false }; changed = true; }
    if (actor.system?.equipment?.relic?.used === undefined) { updateData["system.equipment.relic.used"] = false; changed = true; }
    if (actor.system?.focus === undefined) { updateData["system.focus"] = { value: 0 }; changed = true; }
    if (actor.system?.malignancy === undefined) { updateData["system.malignancy"] = ""; changed = true; }
    if (changed) await actor.update(updateData);
    return;
  }

  if (actor.type === "npc") {
    const updateData = {};
    let changed = false;
    if (actor.system?.description === undefined) { updateData["system.description"] = ""; changed = true; }
    if (actor.system?.refugeOccupation === undefined) { updateData["system.refugeOccupation"] = ""; changed = true; }
    if (actor.system?.inRefuge === undefined) { updateData["system.inRefuge"] = false; changed = true; }
    if (changed) await actor.update(updateData);
    return;
  }

  if (actor.type === "refuge") {
    const updateData = {};
    let changed = false;
    if (actor.system?.resources?.bone === undefined) { updateData["system.resources.bone"] = 0; changed = true; }
    if (actor.system?.resources?.hearts === undefined) { updateData["system.resources.hearts"] = 0; changed = true; }
    if (actor.system?.npcRoles === undefined) { updateData["system.npcRoles"] = { doctor: "", apprentice: "", smith: "", magus: "" }; changed = true; }
    if (!actor.system?.upgrades || typeof actor.system.upgrades !== "object") { updateData["system.upgrades"] = {}; changed = true; }
    if (!Array.isArray(actor.system?.residents)) { updateData["system.residents"] = []; changed = true; }
    if (actor.system?.notes === undefined) { updateData["system.notes"] = ""; changed = true; }
    if (changed) await actor.update(updateData);
    return;
  }

  if (actor.type !== "entity") return;

  const updateData = {};
  let changed = false;
  if (actor.system?.description === undefined) { updateData["system.description"] = ""; changed = true; }
  if (actor.system?.descriptionBehavior === undefined) { updateData["system.descriptionBehavior"] = ""; changed = true; }
  if (actor.system?.descriptionNotes === undefined) { updateData["system.descriptionNotes"] = ""; changed = true; }
  if (actor.system?.curse?.enabled === undefined) { updateData["system.curse.enabled"] = false; changed = true; }
  if (actor.system?.curse?.value === undefined) { updateData["system.curse.value"] = 0; changed = true; }
  if (actor.system?.curse?.targets?.hunter === undefined) { updateData["system.curse.targets.hunter"] = false; changed = true; }
  if (actor.system?.curse?.targets?.entity === undefined) { updateData["system.curse.targets.entity"] = false; changed = true; }
  if (actor.system?.curse?.targets?.zone === undefined) { updateData["system.curse.targets.zone"] = false; changed = true; }
  if (changed) {
    await actor.update(updateData);
  }
}

async function normalizeActorDefaultsForWorld() {
  for (const actor of game.actors.contents) {
    await normalizeActorDefaults(actor);
  }
}

export async function runHollowsReady() {
  await normalizeHollowsSheetFlags();
  await buildWeaponIndex();
  await hydrateWeaponsFromPack();
  await ensureWeaponCoreDefaults();
  await normalizeActorDefaultsForWorld();
  await ensureWeaponAbilityCompendiumFolders();
  Hooks.callAll("hollows.ready");
}
