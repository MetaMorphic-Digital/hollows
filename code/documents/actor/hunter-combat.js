import { getActorZone } from "../../canvas/zone.js";
import { hasCondition, addCondition, removeCondition, getSpecialConditionStatDelta } from "../actor/conditions.js";
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
