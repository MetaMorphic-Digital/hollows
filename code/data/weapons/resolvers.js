import WeaponFormData from "../items/weapon-form.mjs";
import { ItemCatalog } from "../item-catalog.js";

/** Load the available Weapon templates. */
export async function getWeaponPackDocs() {
  return ItemCatalog.getDocuments("weapon");
}

/** Read weapon types from visible compendiums, including types already stored on the item. */
export async function getWeaponTypeChoices(extraTypes = []) {
  const weapons = await ItemCatalog.getIndex("weapon");
  const types = new Set(weapons.map(weapon => weapon.system.weaponType));
  for (const type of extraTypes) if (type) types.add(type);
  return Object.fromEntries([...types].sort().map(type => [type, type]));
}

function getWeaponType(weaponOrType) {
  if (typeof weaponOrType === "string") return weaponOrType;
  return String(weaponOrType?.system?.weaponType || weaponOrType?.name || "");
}

/**
 * List forms from the world and visible Item compendium indexes.
 * @param {Item|string} [weaponOrType] Restrict the catalogue to this weapon type.
 * @returns {Promise<{uuid: string, name: string, weaponType: string}[]>}
 */
export async function getAvailableWeaponForms(weaponOrType) {
  const weaponType = weaponOrType ? getWeaponType(weaponOrType) : "";
  const matches = item => (item.type === "weaponForm") && (!weaponType || (item.system.weaponType === weaponType));
  const packs = game.packs.filter(pack => (pack.documentName === "Item") && pack.visible);
  const indexes = await Promise.all(packs.map(async pack => {
    const index = await pack.getIndex({ fields: ["type", "system.weaponType"] });
    return index.filter(matches);
  }));
  return [...game.items.filter(item => item.visible && matches(item)), ...indexes.flat()]
    .map(item => ({ uuid: item.uuid, name: item.name, weaponType: item.system.weaponType }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Read the local form copy without loading its source compendium. */
export function getSelectedWeaponForm(weapon) {
  return weapon?.system?.appliedForm || null;
}

export function getEffectiveWeaponDamage(weapon) {
  const form = getSelectedWeaponForm(weapon);
  return form ? { ...form.damage } : { resolve: 0, wounds: 0 };
}

export function getEffectiveWeaponCapacity(weapon) {
  const form = getSelectedWeaponForm(weapon);
  const max = form?.capacity.max ?? weapon.system.capacity.max;
  return { value: Math.max(0, Math.min(weapon.system.capacity.value, max)), max };
}

export function getEffectiveWeaponAttackProfiles(weapon) {
  const form = getSelectedWeaponForm(weapon);
  if (form?.changesAttackProfile) return WeaponFormData.getAttackProfiles(form, form.attackProfileVariant);
  return foundry.utils.deepClone(weapon.system.attackProfiles);
}

export function getEffectiveWeaponModifiers(weapon) {
  const choice = weapon.system.modifierChoices.find(entry => entry.id === weapon.system.modifierChoice);
  return { ...(choice?.modifiers || weapon.system.modifiers) };
}
