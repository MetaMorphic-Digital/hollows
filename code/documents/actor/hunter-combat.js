import BattleEquipment from "../item/battle-equipment.mjs";
import { getActorZone } from "../../canvas/zone.js";
import { getSpecialConditionStatDelta } from "../actor/conditions.js";
import { adjustHunterResource } from "./resources.js";
import { getEchoStatMods } from "../../data/echo/index.js";
import { getWeaponStatModsForActor } from "../../data/actor-models.js";
import { restoreWeaponsCapacity } from "../../helpers/weapon-utils.js";
import ScriptCompiler from "../item/script-compiler.mjs";
import { getStatModifier } from "../../helpers/weapon-abilities/dispatchers.js";

export function getTotalStatForActor(actor, statKey) {
  const base = Number(actor.system?.stats?.[statKey] ?? 0);
  const mods = getWeaponStatModsForActor(actor);
  const echoMods = getEchoStatMods(actor);
  const total = base + Number(mods[statKey] ?? 0) + Number(echoMods[statKey] ?? 0)
    + actor.system.getRenewBonus(statKey) + getStatModifier(actor, statKey) + getSpecialConditionStatDelta(actor, statKey);
  return Math.max(1, Math.min(19, total));
}

export async function initializeHunterCoreStatesForCombat(combat) {
  const hunters = combat.combatants
    .map((c) => c.actor)
    .filter((a) => a?.type === "hunter");
  for (const hunter of hunters) {
    await restoreWeaponsCapacity(hunter);
    await BattleEquipment.onCombatStart(hunter);
    await ScriptCompiler.runInterceptors("combat-start-hunter", { actor: hunter, hunter }, null);
  }
}

export async function applySupportStartOfTurn(actor) {
  if (!actor || (actor.type !== "hunter")) return;
  const zone = getActorZone(actor);
  if (zone !== "Support") return;
  await adjustHunterResource(actor, { resolve: 2 });
  await restoreWeaponsCapacity(actor);
  await ScriptCompiler.runInterceptors("support-recovery", { actor }, null);
}
