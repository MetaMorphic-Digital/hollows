/**
 * Weapon-ability provisioning — generic helpers to look up weapon-ability
 * compendium docs and grant them to a hunter. Shared, not Refuge-owned:
 * consumed by Refuge, character creation, and Echo.
 */
import { ItemCatalog } from "../../data/item-catalog.js";

export async function getWeaponAbilityDocs(weaponType, tier) {
  return ItemCatalog.getDocuments("weaponAbility", { weaponType, tier });
}

export function isDuplicateWeaponAbility(hunter, abilityDoc) {
  if (!hunter || !abilityDoc) return false;
  const weaponType = String(abilityDoc.system?.weaponType || "");
  const tier = Number(abilityDoc.system?.tier ?? 0);
  const name = String(abilityDoc.name || "");
  return hunter.items
    .filter(i => i.type === "weaponAbility")
    .some(i => String(i.name || "") === name &&
      String(i.system?.weaponType || "") === weaponType &&
      Number(i.system?.tier ?? 0) === tier);
}

export async function grantWeaponAbilityToHunter(hunter, abilityDoc, durationType, boundWeaponId = "") {
  if (!hunter || hunter.type !== "hunter" || !abilityDoc) return null;
  const data = foundry.utils.deepClone(abilityDoc.toObject());
  delete data._id;
  if (abilityDoc.pack) foundry.utils.setProperty(data, "_stats.compendiumSource", abilityDoc.uuid);
  data.system = data.system || {};
  data.system.durationType = durationType || "temporary";
  data.system.boundWeaponId = boundWeaponId || "";
  const created = await hunter.createEmbeddedDocuments("Item", [data]);
  return created?.[0] || null;
}
