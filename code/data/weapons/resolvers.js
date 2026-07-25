import "./forms/index.js";
import {
  getRegisteredWeaponForm,
  getRegisteredWeaponFormMechanics,
  getRegisteredWeaponForms,
  getWeaponDefinition
} from "./registry.js";

const EMPTY_DAMAGE = Object.freeze({ resolve: 0, wounds: 0 });
const EMPTY_CAPACITY = Object.freeze({ value: 0, max: 0 });
const EMPTY_HEALTH = Object.freeze({ resolve: 0, wounds: 0 });
const EMPTY_MODIFIERS = Object.freeze({ strong: 0, hard: 0, quick: 0, sharp: 0, wise: 0 });

function clone(value) {
  if (value == null) return value;
  if (typeof foundry !== "undefined" && foundry?.utils?.deepClone) return foundry.utils.deepClone(value);
  return JSON.parse(JSON.stringify(value));
}

function asNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function statBlock(source = {}) {
  return {
    strong: asNumber(source.strong),
    hard: asNumber(source.hard),
    quick: asNumber(source.quick),
    sharp: asNumber(source.sharp),
    wise: asNumber(source.wise)
  };
}

function sameKey(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

function legacyForms(weapon) {
  return Array.isArray(weapon?.system?.forms) ? clone(weapon.system.forms) : [];
}

function normalizeLegacyForm(weapon, form) {
  if (!form) return null;
  const weaponType = getWeaponType(weapon);
  const name = String(form.name || form.key || "");
  if (!name) return null;
  return {
    key: String(form.key || name),
    weaponType,
    name,
    label: String(form.label || name),
    text: String(form.text || ""),
    damage: {
      resolve: asNumber(form.damage?.resolve),
      wounds: asNumber(form.damage?.wounds)
    },
    capacity: {
      value: asNumber(form.capacity?.value),
      max: asNumber(form.capacity?.max)
    },
    healthBonus: {
      resolve: asNumber(form.healthBonus?.resolve),
      wounds: asNumber(form.healthBonus?.wounds)
    },
    modifiers: statBlock(form.modifiers || EMPTY_MODIFIERS),
    modifierChoices: Array.isArray(form.modifierChoices) ? clone(form.modifierChoices) : [],
    attackProfiles: Array.isArray(form.attackProfiles) ? clone(form.attackProfiles) : []
  };
}

function getLegacySelectedForm(weapon, selected) {
  const found = legacyForms(weapon).find((form) => sameKey(form.name, selected) || sameKey(form.key, selected));
  return normalizeLegacyForm(weapon, found);
}

function resolveCurrentCapacityValue(weapon, capacity) {
  const current = weapon?.system?.capacity?.value;
  if (current == null) return asNumber(capacity?.value);
  return Math.max(0, Math.min(asNumber(current), asNumber(capacity?.max)));
}

function applyFormAttackChoice(weapon, profiles) {
  if (!Array.isArray(profiles)) return [];
  const selected = String(weapon?.system?.selectedForm || "");
  const weaponType = getWeaponType(weapon);
  if (!sameKey(weaponType, "Armour") || !sameKey(selected, "Silk")) return clone(profiles);
  const choice = String(weapon?.system?.formAttackChoice || "Quick");
  const picked = profiles.find((profile) => sameKey(profile.stat, choice));
  return picked ? [clone(picked)] : clone(profiles);
}

export function getWeaponType(weaponOrType) {
  if (typeof weaponOrType === "string") return weaponOrType;
  return String(weaponOrType?.system?.weaponType || weaponOrType?.name || "");
}

export function getWeaponConfig(weaponOrType) {
  return getWeaponDefinition(getWeaponType(weaponOrType));
}

export function getAvailableWeaponForms(weaponOrType) {
  const weaponType = getWeaponType(weaponOrType);
  const registered = getRegisteredWeaponForms(weaponType);
  if (registered.length) return registered;
  return typeof weaponOrType === "string"
    ? []
    : legacyForms(weaponOrType).map((form) => normalizeLegacyForm(weaponOrType, form)).filter(Boolean);
}

export function getSelectedWeaponForm(weapon) {
  const selected = String(weapon?.system?.selectedForm || "");
  if (!selected) return null;
  if (selected === "Custom") {
    return normalizeLegacyForm(weapon, {
      ...(weapon?.system?.customForm || {}),
      name: weapon?.system?.customForm?.name || "Custom",
      key: "Custom",
      healthBonus: weapon?.system?.health_bonus || EMPTY_HEALTH,
      modifierChoices: weapon?.system?.modifierChoices || []
    });
  }
  return getRegisteredWeaponForm(getWeaponType(weapon), selected) || getLegacySelectedForm(weapon, selected);
}

export function getSelectedWeaponFormMechanics(weapon) {
  const selected = String(weapon?.system?.selectedForm || "");
  if (!selected || selected === "Custom") return [];
  return getRegisteredWeaponFormMechanics(getWeaponType(weapon), selected);
}

export function getEffectiveWeaponDamage(weapon) {
  const form = getSelectedWeaponForm(weapon);
  const source = form?.damage || EMPTY_DAMAGE;
  return {
    resolve: asNumber(source.resolve),
    wounds: asNumber(source.wounds)
  };
}

export function getEffectiveWeaponCapacity(weapon) {
  const form = getSelectedWeaponForm(weapon);
  const source = form?.capacity || weapon?.system?.capacity || EMPTY_CAPACITY;
  return {
    value: resolveCurrentCapacityValue(weapon, source),
    max: asNumber(source.max)
  };
}

export function getEffectiveWeaponHealthBonus(weapon) {
  const form = getSelectedWeaponForm(weapon);
  const source = form?.healthBonus || weapon?.system?.health_bonus || EMPTY_HEALTH;
  return {
    resolve: asNumber(source.resolve),
    wounds: asNumber(source.wounds)
  };
}

export function getEffectiveWeaponAttackProfiles(weapon) {
  const form = getSelectedWeaponForm(weapon);
  if (form?.attackProfiles?.length) return applyFormAttackChoice(weapon, form.attackProfiles);
  const profiles = weapon?.system?.attackProfiles;
  return Array.isArray(profiles) ? clone(profiles) : [];
}

export function getEffectiveWeaponModifierChoices(weapon) {
  const form = getSelectedWeaponForm(weapon);
  if (form?.modifierChoices?.length) return clone(form.modifierChoices);
  const choices = weapon?.system?.modifierChoices;
  return Array.isArray(choices) ? clone(choices) : [];
}

export function getEffectiveWeaponModifiers(weapon) {
  const form = getSelectedWeaponForm(weapon);
  const formMods = statBlock(form?.modifiers || EMPTY_MODIFIERS);
  const choices = getEffectiveWeaponModifierChoices(weapon);
  const choiceId = String(weapon?.system?.modifierChoice || "");
  const choice = choices.find((entry) => String(entry.id || "") === choiceId);
  const choiceMods = choice?.modifiers
    ? statBlock(choice.modifiers)
    : (form ? statBlock(EMPTY_MODIFIERS) : statBlock(weapon?.system?.modifiers || EMPTY_MODIFIERS));
  return {
    strong: formMods.strong + choiceMods.strong,
    hard: formMods.hard + choiceMods.hard,
    quick: formMods.quick + choiceMods.quick,
    sharp: formMods.sharp + choiceMods.sharp,
    wise: formMods.wise + choiceMods.wise
  };
}
