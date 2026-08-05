/**
 * Echo reads — side-effect-free resolvers over a hunter actor's echo items.
 * Leaf module; shared by the echo engine (documents/actor/echo.js) and the base
 * consumers (hunter combat, attack, sheet, canvas hooks). Moved out of echo.js.
 */

export function getEchoStatMods(actor) {
  const mods = { strong: 0, hard: 0, quick: 0, sharp: 0, wise: 0 };
  for (const echo of actor.activeEchoes) {
    const m = echo.system.modifiers || {};
    mods.strong += Number(m.strong ?? 0);
    mods.hard += Number(m.hard ?? 0);
    mods.quick += Number(m.quick ?? 0);
    mods.sharp += Number(m.sharp ?? 0);
    mods.wise += Number(m.wise ?? 0);
  }
  return mods;
}

export function getEchoDamageBonus(actor, weapon = null) {
  const bonus = { resolve: 0, wounds: 0 };
  const weaponId = weapon?.id || "";
  const weaponType = String(weapon?.system?.weaponType || "");
  const sources = [];
  for (const echo of actor.activeEchoes) {
    const b = echo.system?.damageBonus || {};
    const res = Number(b.resolve ?? 0);
    const wnd = Number(b.wounds ?? 0);
    if (!res && !wnd) continue;
    const sourceId = String(echo.system?.sourceWeaponId || "");
    const echoWeaponType = String(echo.system?.weaponType || "");
    if (sourceId && weaponId && sourceId !== weaponId) {
      const stillExists = !!(actor?.items || []).find(i => i.type === "weapon" && i.id === sourceId);
      if (stillExists) continue;
      if (echoWeaponType && weaponType && echoWeaponType !== weaponType) continue;
    }
    if (!sourceId && echoWeaponType && weaponType && echoWeaponType !== weaponType) continue;
    bonus.resolve += res;
    bonus.wounds += wnd;
    sources.push(echo.name || "Echo");
  }
  return { ...bonus, sources };
}

export function hasEchoRestriction(actor, restrictionKey) {
  if (!restrictionKey) return false;
  return actor.activeEchoes.some(e => {
    return e.system.restrictions.includes(restrictionKey);
  });
}
