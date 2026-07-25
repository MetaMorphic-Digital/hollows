import { getActorZone } from "../../../canvas/zone.js";
import { applyEntityTriggeredAbilityEffects } from "./entity-special.js";

export async function triggerEntityWhenBrokenAbilities(entityActor, sourceHunter = null) {
  if (!game.user?.isGM) return false;
  if (!entityActor || entityActor.type !== "entity") return false;
  const combatId = String(game.combat?.id || "");
  const state = foundry.utils.deepClone(entityActor.getFlag("hollows", "whenBrokenState") || {});
  const sameCombat = String(state.combatId || "") === combatId;
  const brokenCount = sameCombat ? Number(state.brokenCount ?? 0) : 0;
  const nextCount = brokenCount + 1;
  let triggered = false;
  for (const ability of entityActor.items.filter((item) => item.type === "entity-ability" && item.system?.kind === "whenBroken")) {
    const sys = ability.system || {};
    const mode = String(sys.whenBroken?.mode || "first");
    if (mode === "first" && brokenCount > 0) continue;
    if (sys.whenBroken?.returnHalfTerrain) {
      const { getEntityTerrainCounts } = await import("../../../documents/actor/conditions.js");
      const { adjustEntityTerrain } = await import("../../../canvas/terrain-pool.js");
      const counts = getEntityTerrainCounts(entityActor);
      let toReturn = Math.ceil((counts.elevated + counts.sheltered) / 2);
      for (const k of ["sheltered", "elevated"]) {
        if (toReturn <= 0) break;
        const take = Math.min(toReturn, Math.max(0, Number(counts[k] || 0)));
        if (take > 0) { await adjustEntityTerrain(entityActor, k, -take, { fromPool: true }); toReturn -= take; }
      }
      triggered = true;
    }
    const appliedPayload = await applyEntityTriggeredAbilityEffects(ability, entityActor, {
      targetActor: sourceHunter,
      targetZone: sourceHunter ? getActorZone(sourceHunter) : ""
    });
    if (appliedPayload) triggered = true;
  }
  await entityActor.setFlag("hollows", "whenBrokenState", { combatId, brokenCount: nextCount });
  return triggered;
}
