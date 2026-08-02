import { getActorZone } from "../../canvas/zone.js";
import { updateTerrainPool } from "../../canvas/terrain-pool.js";
import {
  hasCondition, addCondition, removeCondition,
  isFreeTerrainTag, getSpecialConditionStatDelta,
  getTerrainTagKeys, isPooledTerrainTag,
} from "../actor/conditions.js";
import { adjustHunterResource, getFocusCount, setFocusCount } from "./resources.js";
import { getEchoStatMods } from "../../data/echo/index.js";
import { getWeaponStatModsForActor } from "../../data/actor-models.js";
import {
  getShotgunWeapons,
  restoreWeaponsCapacity,
  setShotgunsLoaded,
  hasWeaponEquipped,
} from "../../helpers/weapon-utils.js";
import { applyInterceptors } from "../../helpers/extensions.js";
import { getStatModifier } from "../../helpers/weapon-abilities/dispatchers.js";

function getSkirmisherBonusForActor(actor, statKey) {
  if (!actor || !statKey) return 0;
  const bonus = actor.getFlag("hollows", "skirmisherBonus");
  if (!bonus) return 0;
  // Flag accumulates per stat: { quick?: 2, sharp?: 2 }.
  return Number(bonus[String(statKey).toLowerCase()] ?? 0) || 0;
}

export function getTotalStatForActor(actor, statKey) {
  const base = Number(actor.system?.stats?.[statKey] ?? 0);
  const mods = getWeaponStatModsForActor(actor);
  const skirmisherBonus = getSkirmisherBonusForActor(actor, statKey);
  const echoMods = getEchoStatMods(actor);
  const total = base + Number(mods[statKey] ?? 0) + Number(echoMods[statKey] ?? 0) + skirmisherBonus + getStatModifier(actor, statKey) + getSpecialConditionStatDelta(actor, statKey);
  return Math.max(1, Math.min(19, total));
}

export function hasGritYourTeethActive(actor) {
  if (!actor) return false;
  return !!actor.getFlag("hollows", "gritYourTeeth");
}

export async function clearGritYourTeeth(actor) {
  if (!actor) return;
  if (hasGritYourTeethActive(actor)) {
    await actor.unsetFlag("hollows", "gritYourTeeth");
  }
}

export async function clearSkirmisherBonus(actor) {
  if (!actor) return;
  if (actor.getFlag("hollows", "skirmisherBonus")) {
    await actor.unsetFlag("hollows", "skirmisherBonus");
  }
}

export async function initializeHunterCoreStatesForCombat(combat) {
  if (!game.user?.isGM) return;
  if (!combat?.started) return;
  const already = combat.getFlag("hollows", "coreStatesInitialized");
  if (already) return;
  const hunters = combat.combatants
    .map((c) => c.actor)
    .filter((a) => a?.type === "hunter");
  for (const hunter of hunters) {
    if (hasWeaponEquipped(hunter, "Armour")) {
      await addCondition(hunter, "ready");
    } else if (hasCondition(hunter, "ready")) {
      await removeCondition(hunter, "ready");
    }
    await setShotgunsLoaded(hunter, true);
    if (hasWeaponEquipped(hunter, "Rifle") && (getFocusCount(hunter) > 0)) {
      await setFocusCount(hunter, 0);
    }
    await applyInterceptors("combat-start-hunter", { hunter }, null);
  }
  await combat.setFlag("hollows", "coreStatesInitialized", true);
}

export async function cleanupCombatStates(combat) {
  if (!game.user.isGM || !combat) return;
  const actors = new Set(combat.combatants.map((c) => c.actor).filter(_ => _));
  const operations = [];

  const poolRestore = {};
  for (const actor of actors) {
    for (const tag of getTerrainTagKeys()) {
      if (!hasCondition(actor, tag)) continue;
      if (isPooledTerrainTag(tag) && !isFreeTerrainTag(actor, tag)) {
        poolRestore[tag] = (poolRestore[tag] || 0) + 1;
      }
      await removeCondition(actor, tag);
    }
    if ((actor.type === "hunter") && (getFocusCount(actor) > 0)) {
      await setFocusCount(actor, 0);
    }

    const flags = {
      wardGranted: _del,
      wardSuppressed: _del,
    };

    if (actor.type === "hunter") {
      if (hasCondition(actor, "dying")) {
        await removeCondition(actor, "dying");
      }
      if (hasCondition(actor, "dead")) {
        await removeCondition(actor, "dead");
      }

      flags.dead = _del;
      flags.dyingRevivedOnce = false;
      flags.echoReplaceDyingUsed = _del;
    }

    operations.push({
      action: "update",
      documentName: actor.documentName,
      parent: actor.parent,
      updates: [{ _id: actor.id, [`flags.${hollows.id}`]: flags }],
    });
  }

  await foundry.documents.modifyBatch(operations);

  for (const [tag, count] of Object.entries(poolRestore)) {
    if (count > 0) await updateTerrainPool(tag, count);
  }
}

export async function applySupportStartOfTurn(actor) {
  if (!actor || (actor.type !== "hunter")) return;
  const zone = getActorZone(actor);
  if (zone !== "Support") return;
  await adjustHunterResource(actor, { resolve: 2 });
  await restoreWeaponsCapacity(actor);
  if (hasWeaponEquipped(actor, "Armour") && !hasCondition(actor, "ready")) {
    await addCondition(actor, "ready");
  }
  if (getShotgunWeapons(actor).length) {
    await setShotgunsLoaded(actor, true);
  }
}
