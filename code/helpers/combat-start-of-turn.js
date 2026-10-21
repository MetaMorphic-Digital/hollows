import { applySupportStartOfTurn } from "../documents/actor/hunter-combat.js";
import { applyEntityBleedingStartOfTurn } from "../data/entity/actions/entity-special.js";
import { runEntityStartOfTurnEnhancements } from "../documents/entity/entity-enhancements.js";
import { runStartOfTurnAbilities } from "./weapon-abilities/dispatchers.js";
import { triggerEntitySpecialsOnPhase } from "./combat-end-of-turn.js";

/** Run start-of-turn combat effects. */
export async function runStartOfTurnEffects(combat, newCombatant) {
  if (!combat || !newCombatant) return;
  const actor = newCombatant.actor;
  if (actor?.type === "hunter") {
    await runStartOfTurnAbilities({ actor, stage: "cleanup" });
    await applySupportStartOfTurn(actor);
    await runStartOfTurnAbilities({ actor, on: "actor" });
    await runStartOfTurnAbilities({ actor, on: "actorAll" });
    await triggerEntitySpecialsOnPhase("hunterStart");
    return;
  }
  if (actor?.type === "entity") {
    await applyEntityBleedingStartOfTurn(actor);
    await runStartOfTurnAbilities({ entity: actor, on: "entity" });
    await runEntityStartOfTurnEnhancements(actor);
    await triggerEntitySpecialsOnPhase("entityStart");
  }
}
