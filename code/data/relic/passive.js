// Passive relic contributions (Phase 4): a relic with a `passiveWhileHeld` group
// whose `characteristic` clause is a `delta` modifier contributes a persistent
// stat/defence change while held. The existing stat dispatchers sum these
// alongside weapon-ability modifiers (the dynamic-adapter integration) — no
// per-relic code, no static registry entry.
import { getActiveSceneHunters, getActiveHollowActor } from "../../canvas/zone.js";

// Entity stat keys (as getEffectiveEntityStat asks) ↔ builder property keys. Max
// resolve/wounds are derived via getEffectiveEntityStat too (actor-models
// prepareDerivedData), so the relic delta flows into the entity's effective max.
const PROPERTY_FOR_STAT = {
  close: "closeDefence", ranged: "rangedDefence", wyrd: "wyrdDefence",
  threatCap: "threatCap", threatPerRound: "threatPerRound",
  resolveMax: "maxResolve", woundsMax: "maxWounds"
};

function activeGroups(item) {
  return (item.system?.upgraded ? item.system?.cypher?.groups : item.system?.groups) || [];
}

function* passiveCharacteristics(item) {
  for (const group of activeGroups(item)) {
    if (!group?.enabled) continue;
    if (String(group.trigger || "") !== "passiveWhileHeld") continue;
    const characteristic = group.characteristic;
    if (!characteristic?.enabled) continue;
    yield { group, characteristic };
  }
}

function matchesEntity(group, entity) {
  const target = group.target || {};
  if (target.entityScope === "specific" && target.entityId) {
    return String(target.entityId) === String(entity?.id || "");
  }
  return true;   // active entity
}

// Sum the entity defence delta contributed by held relics across scene hunters.
// `stat` is the dispatcher's key (close / ranged / wyrd).
export function relicEntityStatDelta(entity, stat) {
  const property = PROPERTY_FOR_STAT[String(stat)];
  if (!property) return 0;
  let delta = 0;
  for (const hunter of getActiveSceneHunters()) {
    for (const item of (hunter.items?.contents || [])) {
      if (item.type !== "relic") continue;
      for (const { group, characteristic } of passiveCharacteristics(item)) {
        if (String(group.target?.side || "") !== "entity") continue;
        if (!matchesEntity(group, entity)) continue;
        if ((characteristic.properties || []).includes(property)) delta += Number(characteristic.value || 0);
      }
    }
  }
  return delta;
}

// Flat incoming-damage delta from the target's own held relics (passive
// mitigation/aggravation). `source` is the damage source (entity/any),
// `damageType` is the dispatcher's "Resolve"/"Wounds". Negative = mitigate.
export function relicIncomingDamageDelta(target, { source = "any", damageType = "" } = {}) {
  if (!target || target.type !== "hunter") return 0;
  const key = String(damageType) === "Wounds" ? "wounds" : "resolve";
  let delta = 0;
  for (const item of (target.items?.contents || [])) {
    if (item.type !== "relic") continue;
    for (const group of activeGroups(item)) {
      if (!group?.enabled || String(group.trigger || "") !== "passiveWhileHeld") continue;
      const incoming = group.incomingDamage;
      if (!incoming?.enabled) continue;
      if (String(incoming.source || "any") !== "any" && String(incoming.source) !== String(source)) continue;
      delta += Number(incoming.delta?.[key] || 0);
    }
  }
  return delta;
}

// Items that can disable/modify entity abilities: relics held by scene hunters
// (cypher = upgraded relic, via active profile) and rumours revealed on the
// active hollow (revealed replaces "held" for rumours).
function* abilitySourceItems() {
  for (const hunter of getActiveSceneHunters()) {
    for (const item of (hunter.items?.contents || [])) {
      if (item.type === "relic") yield item;
    }
  }
  const hollow = getActiveHollowActor();
  for (const link of (hollow?.system?.publicLinks?.rumours || [])) {
    const item = link?.id ? game.items.get(String(link.id)) : null;
    if (item?.type === "rumour") yield item;
  }
}

function* passiveAbilityClauses(item, entityId) {
  for (const group of activeGroups(item)) {
    if (!group?.enabled || String(group.trigger || "") !== "passiveWhileHeld") continue;
    const ability = group.ability;
    if (!ability?.enabled) continue;
    if (String(ability.entityId || "") !== String(entityId || "")) continue;
    yield ability;
  }
}

// Name of the held relic/cypher disabling the given entity ability, or "" if
// none. Scans scene hunters' relics (cypher = upgraded relic, active profile).
// The Entity Sheet uses this to grey out and tooltip the ability's button.
export function entityAbilityBlockedBy(entity, abilityKey) {
  if (!entity || !abilityKey) return "";
  for (const item of abilitySourceItems()) {
    for (const ability of passiveAbilityClauses(item, entity.id)) {
      if (String(ability.mode || "") !== "disable") continue;
      if (String(ability.abilityKey || "") === String(abilityKey)) return item.name || item.type || "";
    }
  }
  return "";
}

// Sum the TN / damage deltas relics apply to an entity ability (modify mode).
export function entityAbilityModifyDelta(entity, abilityKey) {
  const out = { tn: 0, resolve: 0, wounds: 0 };
  if (!entity || !abilityKey) return out;
  for (const item of abilitySourceItems()) {
    for (const ability of passiveAbilityClauses(item, entity.id)) {
      if (String(ability.mode || "") !== "modify") continue;
      if (String(ability.abilityKey || "") !== String(abilityKey)) continue;
      out.tn += Number(ability.tnDelta || 0);
      out.resolve += Number(ability.damageResolve || 0);
      out.wounds += Number(ability.damageWounds || 0);
    }
  }
  return out;
}

// Sum the hunter stat delta contributed by the actor's own held relics
// (self-targeted passive). `statKey` is strong / hard / quick / sharp / wise.
export function relicHunterStatDelta(actor, statKey) {
  if (!actor || actor.type !== "hunter") return 0;
  let delta = 0;
  for (const item of (actor.items?.contents || [])) {
    if (item.type !== "relic") continue;
    for (const { group, characteristic } of passiveCharacteristics(item)) {
      if (String(group.target?.side || "") !== "hunter") continue;
      if (String(group.target?.hunterScope || "self") !== "self") continue;
      if ((characteristic.properties || []).includes(String(statKey))) delta += Number(characteristic.value || 0);
    }
  }
  return delta;
}
