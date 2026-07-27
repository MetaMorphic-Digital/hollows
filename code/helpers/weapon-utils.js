import { WEAPON_TYPE_ORDER } from "../data/_module.mjs";
import { resolveSuggestedRollMode } from "../dice/_module.mjs";
import { getEffectiveWeaponCapacity } from "../data/weapons/index.js";
import { hasCondition, addCondition, removeCondition } from "../documents/actor/conditions.js";

/**
 * Weapon type checks, has-equipped helpers, weapon getters, and weapon ability lookups.
 * Eventually these will become methods on DataModel classes (HunterDataModel, weapon DataModel).
 */

// ─── Weapon Type Checks ─────────────────────────────────────────────

export function isWeaponOfType(weapon, weaponType) {
  if (!weapon) return false;
  return String(weapon.system?.weaponType || "") === weaponType || weapon.name === weaponType;
}

export function hasWeaponEquipped(actor, weaponType) {
  return !!actor?.items?.some((i) => i.type === "weapon" && isWeaponOfType(i, weaponType));
}

export function isFirearmWeapon(weapon) {
  if (!weapon) return false;
  const wt = String(weapon.system?.weaponType || "");
  return wt === "Pistol" || wt === "Rifle" || wt === "Shotgun";
}

export function isShotgunWeapon(weapon) {
  return isWeaponOfType(weapon, "Shotgun");
}

// ─── Weapon Getters ─────────────────────────────────────────────────

export function getShotgunWeapons(actor) {
  if (!actor) return [];
  return (actor.items || []).filter((i) => i.type === "weapon" && isShotgunWeapon(i));
}

export function isShotgunLoaded(weapon) {
  if (!weapon) return false;
  if (weapon.system?.loaded === undefined) return true;
  return !!weapon.system.loaded;
}

// ─── Weapon Ability Lookups ─────────────────────────────────────────

export function getWeaponAbilityByName(actor, name) {
  if (!actor || !name) return null;
  const needle = String(name).trim().toLowerCase();
  return (actor.items || []).find((i) => {
    if (i.type !== "weapon-ability") return false;
    const n = String(i.name || "").trim().toLowerCase();
    return n === needle;
  }) || null;
}

export function getWeaponAbilityByKey(actor, key) {
  if (!actor || !key) return null;
  const needle = String(key).trim().toLowerCase();
  return (actor.items || []).find((i) => {
    if (i.type !== "weapon-ability") return false;
    const k = String(i.system?.key || "").trim().toLowerCase();
    return k === needle;
  }) || null;
}

export function hasWeaponAbility(actor, { key = "", name = "", weaponType = "", tier = 0 } = {}) {
  if (!actor) return false;
  let ability = null;
  if (key) ability = getWeaponAbilityByKey(actor, key);
  if (!ability && name) ability = getWeaponAbilityByName(actor, name);
  if (!ability) return false;
  if (weaponType && String(ability.system?.weaponType || "") !== String(weaponType)) return false;
  if (tier && Number(ability.system?.tier ?? 0) !== Number(tier)) return false;
  return true;
}

export async function cleanupWeaponAbilitiesForActor(actor) {
  if (!actor) return;
  const weapons = (actor.items || []).filter((i) => i.type === "weapon");
  const weaponIds = new Set(weapons.map(w => w.id));
  const weaponTypes = new Set(weapons.map(w => String(w.system?.weaponType || "")));
  const abilities = (actor.items || []).filter((i) => i.type === "weapon-ability");
  const toDelete = abilities.filter((ability) => {
    const boundId = String(ability.system?.boundWeaponId || "");
    if (boundId && !weaponIds.has(boundId)) return true;
    const wt = String(ability.system?.weaponType || "");
    if (wt && !weaponTypes.has(wt)) return true;
    return false;
  });
  if (toDelete.length) {
    await actor.deleteEmbeddedDocuments("Item", toDelete.map((a) => a.id));
  }
}

// ─── Weapon Capacity ─────────────────────────────────────────────────

export async function restoreWeaponsCapacity(actor) {
  if (!actor || actor.type !== "hunter") return;
  const weapons = actor.items.filter(i => i.type === "weapon");
  const updates = [];
  for (const weapon of weapons) {
    const max = Number(getEffectiveWeaponCapacity(weapon).max ?? 0);
    if (max <= 0) continue;
    const cur = Number(weapon.system?.capacity?.value ?? 0);
    if (cur !== max) {
      updates.push({ _id: weapon.id, "system.capacity.value": max });
    }
  }
  if (updates.length) {
    await actor.updateEmbeddedDocuments("Item", updates);
  }
}

// ─── Choose Weapon Dialog ─────────────────────────────────────────────

export async function chooseHunterWeapon(actor, title = "Choose Weapon") {
  const weapons = (actor.items || []).filter(i => i.type === "weapon");
  if (!weapons.length) return null;
  const options = weapons.map(w => `<option value="${w.id}">${w.name} (${w.system.weaponType || "Weapon"})</option>`).join("");
  const content = `
      <form class="hollows-roll-dialog">
        <div class="form-group">
          <label>Weapon</label>
          <select name="weaponId">${options}</select>
        </div>
      </form>
    `;
  const id = await foundry.applications.api.DialogV2.wait({
    window: { title },
    content,
    rejectClose: false,
    buttons: [
      { action: "choose", label: "Choose", default: true, callback: (_e, _b, dialog) => String(dialog.element.querySelector("[name=weaponId]")?.value || "") },
      { action: "cancel", label: "Cancel", callback: () => null },
    ],
  }) ?? "";
  return weapons.find(w => w.id === id) || null;
}

// ─── Weapon Ability Compendium ────────────────────────────────────────

export function getWeaponAbilityPack() {
  return game.packs.get("hollows.weapon-abilities") ||
    game.packs.find(p => p.metadata?.package === "hollows" && p.metadata?.name === "weapon-abilities") ||
    null;
}

export async function ensureWeaponAbilityCompendiumFolders(packArg = null) {
  if (!game.user?.isGM) return;
  const pack = packArg || getWeaponAbilityPack();
  if (!pack) return;

  const collection = pack.collection || pack.metadata?.id;
  if (!collection) return;

  let relock = false;
  try {
    if (pack.locked && typeof pack.configure === "function") {
      await pack.configure({ locked: false });
      relock = true;
    }
  } catch (err) {
    console.warn("Hollows | Unable to unlock weapon-abilities pack for folder sync", err);
    return;
  }

  const folderIdOf = (f) => String(f?.id || f?._id || f || "");
  const parentIdOf = (f) => folderIdOf(f?.folder || "");

  const refreshFolders = () => Array.from(pack.folders?.contents || []);
  let folders = refreshFolders();

  const findFolder = (name, parentId = "") => {
    return folders.find((f) => String(f.name || "") === String(name) && parentIdOf(f) === String(parentId));
  };

  const ensureFolder = async (name, parent = null) => {
    const parentId = folderIdOf(parent);
    let existing = findFolder(name, parentId);
    if (existing) return existing;
    try {
      existing = await Folder.create({
        name,
        type: "Item",
        folder: parentId || null,
        sorting: "m",
      }, { pack: collection });
    } catch (err) {
      console.warn(`Hollows | Failed to create compendium folder "${name}"`, err);
      return null;
    }
    folders = refreshFolders();
    return existing || findFolder(name, parentId);
  };

  let docs = [];
  try {
    docs = await pack.getDocuments();
  } catch (err) {
    console.warn("Hollows | Failed to fetch weapon-abilities documents for folder sync", err);
  }

  // Create only the folders this pack's docs actually need — different packs
  // hold different weapon/tier slices, so the tree is derived from content.
  const neededTiers = new Map();
  for (const doc of docs) {
    if (doc.type !== "weapon-ability") continue;
    const wt = String(doc.system?.weaponType || "");
    const tier = Number(doc.system?.tier ?? 0);
    if (!wt || !tier) continue;
    if (!neededTiers.has(wt)) neededTiers.set(wt, new Set());
    neededTiers.get(wt).add(tier);
  }

  const orderIdx = (wt) => {
    const i = WEAPON_TYPE_ORDER.indexOf(wt);
    return i === -1 ? WEAPON_TYPE_ORDER.length : i;
  };
  const tierFolderByKey = new Map();
  for (const weaponType of [...neededTiers.keys()].sort((a, b) => orderIdx(a) - orderIdx(b))) {
    const top = await ensureFolder(weaponType, null);
    if (!top) continue;
    for (const tier of [1, 2, 3]) {
      if (!neededTiers.get(weaponType).has(tier)) continue;
      const sub = await ensureFolder(`Tier ${tier}`, top);
      if (sub) tierFolderByKey.set(`${weaponType}|${tier}`, sub);
    }
  }

  for (const doc of docs) {
    if (doc.type !== "weapon-ability") continue;
    const wt = String(doc.system?.weaponType || "");
    const tier = Number(doc.system?.tier ?? 0);
    const target = tierFolderByKey.get(`${wt}|${tier}`) || null;
    if (!target) continue;
    const currentFolderId = folderIdOf(doc.folder);
    const nextFolderId = folderIdOf(target);
    if (currentFolderId === nextFolderId) continue;
    try {
      await doc.update({ folder: nextFolderId });
    } catch (err) {
      console.warn(`Hollows | Failed to move ${doc.name} to ${wt}/Tier ${tier}`, err);
    }
  }

  if (relock) {
    try {
      await pack.configure({ locked: true });
    } catch (err) {
      console.warn("Hollows | Failed to relock weapon-abilities pack after folder sync", err);
    }
  }
}

// ─── Shotgun / Combat State ───────────────────────────────────────────

const HOLLOWS_SHOTGUN_SYNC_LOCKS = new Set();

export async function syncHunterLoadedStatusFromShotguns(actor) {
  if (!actor || actor.type !== "hunter") return;
  if (HOLLOWS_SHOTGUN_SYNC_LOCKS.has(actor.id)) return;
  HOLLOWS_SHOTGUN_SYNC_LOCKS.add(actor.id);
  try {
    const shotguns = getShotgunWeapons(actor);
    if (!shotguns.length) {
      if (hasCondition(actor, "loaded")) await removeCondition(actor, "loaded");
      return;
    }
    const anyLoaded = shotguns.some((w) => isShotgunLoaded(w));
    if (anyLoaded) await addCondition(actor, "loaded");
    else if (hasCondition(actor, "loaded")) await removeCondition(actor, "loaded");
  } finally {
    HOLLOWS_SHOTGUN_SYNC_LOCKS.delete(actor.id);
  }
}
export async function setShotgunsLoaded(actor, loaded) {
  if (!actor || actor.type !== "hunter") return;
  const shotguns = getShotgunWeapons(actor);
  if (!shotguns.length) return;
  const updates = [];
  for (const w of shotguns) {
    if (!!w.system?.loaded === !!loaded) continue;
    updates.push({ _id: w.id, "system.loaded": !!loaded });
  }
  if (updates.length) {
    await actor.updateEmbeddedDocuments("Item", updates);
  }
  await syncHunterLoadedStatusFromShotguns(actor);
}

// ─── Roll Mode ────────────────────────────────────────────────────────

export function bindSuggestedRollMode(root, {
  selectName = "mode",
  fallback = "normal",
  getAdvantages = () => [],
  getDisadvantages = () => [],
  watch = [],
} = {}) {
  const select = root.querySelector(`[name="${selectName}"]`);
  if (!select) return () => {};
  const update = () => {
    const nextMode = resolveSuggestedRollMode({
      advantages: getAdvantages(root),
      disadvantages: getDisadvantages(root),
      fallback,
    });
    select.value = nextMode;
  };
  for (const name of watch) {
    root.querySelector(`[name="${name}"]`)?.addEventListener("change", update);
  }
  update();
  return update;
}

// Attack damage changes are aggregated over AttackDamageChange mechanic
// classes by helpers/weapon-abilities.
