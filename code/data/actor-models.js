const actorDataModelHooks = {
  getEffectiveEntityStat: (actor, stat) => {
    const system = actor?._source?.system || actor?.system || {};
    if ((stat === "close") || (stat === "ranged") || (stat === "wyrd")) return Math.max(0, Number(system?.defences?.[stat] ?? 0) || 0);
    if (stat === "threatCap") return Math.max(0, Number(system?.threat?.max ?? 0) || 0);
    if (stat === "threatPerRound") return Math.max(0, Number(system?.threat?.perRound ?? 0) || 0);
    if (stat === "resolveMax") return Math.max(0, Number(system?.health?.resolve?.max ?? 0) || 0);
    if (stat === "woundsMax") return Math.max(0, Number(system?.health?.wounds?.max ?? 0) || 0);
    return Math.max(0, Number(system?.[stat] ?? 0) || 0);
  },
};

import { getEffectiveWeaponModifiers } from "./weapons/index.js";

export function registerActorDataModelHooks(hooks = {}) {
  if (typeof hooks.getEffectiveEntityStat === "function") {
    actorDataModelHooks.getEffectiveEntityStat = hooks.getEffectiveEntityStat;
  }
}

export function getWeaponStatModsForActor(actor) {
  const mods = { strong: 0, hard: 0, quick: 0, sharp: 0, wise: 0 };
  const weapons = actor.items
    ?.filter((item) => item.type === "weapon")
    .slice(0, 2) || [];
  for (const weapon of weapons) {
    const wmods = getEffectiveWeaponModifiers(weapon);
    mods.strong += Number(wmods.strong ?? 0);
    mods.hard += Number(wmods.hard ?? 0);
    mods.quick += Number(wmods.quick ?? 0);
    mods.sharp += Number(wmods.sharp ?? 0);
    mods.wise += Number(wmods.wise ?? 0);
  }
  return mods;
}

export function getDefaultHunterTokenConfig() {
  const dt = CONST.TOKEN_DISPOSITIONS;
  const dm = CONST.TOKEN_DISPLAY_MODES;
  return {
    disposition: dt.FRIENDLY,
    displayName: dm.ALWAYS,
    displayBars: dm.ALWAYS,
    actorLink: true,
    bar1: { attribute: "health.wounds" },
    bar2: { attribute: "health.resolve" },
  };
}

export function tokenConfigMatchesDefaults(data) {
  if (!data) return true;
  const defaults = getDefaultHunterTokenConfig();
  const resolved = data.toObject ? data.toObject() : data;
  const matchesPrimitive = (key) => resolved[key] === undefined || resolved[key] === defaults[key];
  const barMatches = (key) => {
    const bar = resolved[key];
    if (!bar || bar.attribute === undefined) return true;
    return bar.attribute === defaults[key].attribute;
  };
  return matchesPrimitive("disposition") &&
    matchesPrimitive("displayName") &&
    matchesPrimitive("displayBars") &&
    matchesPrimitive("actorLink") &&
    barMatches("bar1") &&
    barMatches("bar2");
}

export function isHunterTokenCustomized(data) {
  if (!data) return false;
  const flags = data.flags || {};
  if (flags?.hollows?.tokenCustomized) return true;
  return !tokenConfigMatchesDefaults(data);
}

export function shouldConfigureHunterTokenForActor(actor, tokenData) {
  if (!actor || actor.type !== "hunter") return false;
  if (actor.getFlag && actor.getFlag("hollows", "tokenCustomized")) return false;
  if (isHunterTokenCustomized(tokenData)) return false;
  return true;
}

export function shouldConfigureHunterTokenForNewActor(actor) {
  if (!actor || actor.type !== "hunter") return false;
  if (actor.getFlag && actor.getFlag("hollows", "tokenCustomized")) return false;
  if (actor.getFlag && actor.getFlag("hollows", "tokenConfigured")) return false;
  return true;
}
