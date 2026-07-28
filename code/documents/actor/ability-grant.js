/**
 * Weapon-ability provisioning — generic helpers to look up weapon-ability
 * compendium docs and grant them to a hunter. Shared, not Refuge-owned:
 * consumed by Refuge, character creation, and Echo.
 */
import { pickOne } from "../../applications/apps/selection-dialogs.mjs";
import { getWeaponAbilityPack } from "../../helpers/weapon-utils.js";
import { getContentPacks } from "../../helpers/extensions.js";

function getWeaponAbilityPacks() {
  return [
    getWeaponAbilityPack(),
    ...getContentPacks("weapon-abilities").map((id) => game.packs.get(id))
  ].filter(Boolean);
}

export async function getWeaponAbilityDocs(weaponType, tier) {
  const packDocs = await Promise.all(getWeaponAbilityPacks().map((p) => p.getDocuments()));
  return packDocs.flat()
    .filter(d => d.type === "weaponAbility")
    .filter(d => String(d.system?.weaponType || "") === String(weaponType || ""))
    .filter(d => Number(d.system?.tier ?? 0) === Number(tier ?? 0))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function chooseAbilityDoc(docs, title) {
  if (!docs.length) return null;
  const id = await pickOne({ title, label: "Ability", options: docs.map(d => ({ value: d.id, label: d.name })) });
  return id ? docs.find(d => d.id === id) || null : null;
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
  data.system = data.system || {};
  data.system.durationType = durationType || "temporary";
  data.system.boundWeaponId = boundWeaponId || "";
  const created = await hunter.createEmbeddedDocuments("Item", [data]);
  return created?.[0] || null;
}
