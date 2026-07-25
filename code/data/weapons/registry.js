import { WEAPONS } from "./config.js";
import { getContentPacks } from "../../helpers/extensions.js";

const FORMS_BY_WEAPON = new Map();
const FORM_BY_WEAPON_AND_KEY = new Map();

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
}

function clone(value) {
  if (value == null) return value;
  if (typeof foundry !== "undefined" && foundry?.utils?.deepClone) return foundry.utils.deepClone(value);
  return JSON.parse(JSON.stringify(value));
}

function formMapKey(weaponType, formKey) {
  return `${normalizeKey(weaponType)}:${normalizeKey(formKey)}`;
}

function formData(form) {
  if (!form) return null;
  const { mechanics, ...data } = form;
  return data;
}

export function registerWeaponForm(form) {
  const weaponType = String(form?.weaponType || "").trim();
  const key = String(form?.key || form?.name || "").trim();
  if (!weaponType || !key) {
    throw new Error("Hollows weapon form registration requires weaponType and key.");
  }
  const mechanics = Array.isArray(form.mechanics)
    ? form.mechanics.filter(Boolean).map((mechanic) => {
      if (!mechanic.weapon) mechanic.weapon = weaponType;
      if (!mechanic.form) mechanic.form = key;
      return mechanic;
    })
    : [];

  const normalized = Object.freeze({
    ...form,
    key,
    weaponType,
    name: String(form.name || form.label || key),
    label: String(form.label || form.name || key),
    damage: {
      resolve: Number(form.damage?.resolve ?? 0),
      wounds: Number(form.damage?.wounds ?? 0)
    },
    capacity: {
      value: Number(form.capacity?.value ?? 0),
      max: Number(form.capacity?.max ?? 0)
    },
    healthBonus: {
      resolve: Number(form.healthBonus?.resolve ?? 0),
      wounds: Number(form.healthBonus?.wounds ?? 0)
    },
    modifiers: {
      strong: Number(form.modifiers?.strong ?? 0),
      hard: Number(form.modifiers?.hard ?? 0),
      quick: Number(form.modifiers?.quick ?? 0),
      sharp: Number(form.modifiers?.sharp ?? 0),
      wise: Number(form.modifiers?.wise ?? 0)
    },
    modifierChoices: Array.isArray(form.modifierChoices) ? form.modifierChoices : [],
    attackProfiles: Array.isArray(form.attackProfiles) ? form.attackProfiles : [],
    mechanics
  });

  const listKey = normalizeKey(weaponType);
  const list = FORMS_BY_WEAPON.get(listKey) || [];
  const next = list.filter((entry) => normalizeKey(entry.key) !== normalizeKey(key));
  next.push(normalized);
  FORMS_BY_WEAPON.set(listKey, next);
  FORM_BY_WEAPON_AND_KEY.set(formMapKey(weaponType, key), normalized);
  FORM_BY_WEAPON_AND_KEY.set(formMapKey(weaponType, normalized.name), normalized);
  return normalized;
}

export function getWeaponDefinition(weaponOrType) {
  const weaponType = typeof weaponOrType === "string"
    ? weaponOrType
    : String(weaponOrType?.system?.weaponType || weaponOrType?.name || "");
  return WEAPONS[weaponType] ? clone(WEAPONS[weaponType]) : null;
}

export function getRegisteredWeaponForm(weaponType, formKey) {
  const form = FORM_BY_WEAPON_AND_KEY.get(formMapKey(weaponType, formKey));
  return form ? clone(formData(form)) : null;
}

export function getRegisteredWeaponFormMechanics(weaponType, formKey) {
  const form = FORM_BY_WEAPON_AND_KEY.get(formMapKey(weaponType, formKey));
  return Array.isArray(form?.mechanics) ? form.mechanics.filter(Boolean) : [];
}

export function getAllRegisteredWeaponFormMechanics() {
  return Array.from(FORMS_BY_WEAPON.values())
    .flatMap((forms) => forms)
    .flatMap((form) => Array.isArray(form?.mechanics) ? form.mechanics.filter(Boolean) : []);
}

export function getRegisteredWeaponForms(weaponType) {
  const forms = FORMS_BY_WEAPON.get(normalizeKey(weaponType)) || [];
  return clone(forms.map(formData).filter(Boolean));
}

export function getWeaponsPacks() {
  return [
    game.packs.get("hollows.weapons") ||
      game.packs.find((p) => p.metadata?.package === "hollows" && p.metadata?.name === "weapons"),
    ...getContentPacks("weapons").map((id) => game.packs.get(id))
  ].filter(Boolean);
}

export async function getWeaponPackDocs() {
  const packDocs = await Promise.all(getWeaponsPacks().map((p) => p.getDocuments()));
  return packDocs.flat().filter((d) => d.type === "weapon");
}
