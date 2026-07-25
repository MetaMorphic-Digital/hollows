import {
  applySupportStartOfTurn,
  clearGritYourTeeth,
  clearSkirmisherBonus
} from "../documents/actor/hunter-combat.js";
import { applyEntityBleedingStartOfTurn } from "../data/entity/actions/entity-special.js";
import { runEntityStartOfTurnEnhancements } from "../documents/entity/entity-enhancements.js";
import { runStartOfTurnAbilities } from "./weapon-abilities/dispatchers.js";

export async function runStartOfTurnEffects(combat, newCombatant, { triggerEntitySpecialsOnPhase }) {
  if (!combat || !newCombatant) return;
  if (newCombatant?.actor?.type === "hunter") {
    await clearGritYourTeeth(newCombatant.actor);
    await clearSkirmisherBonus(newCombatant.actor);
    await applySupportStartOfTurn(newCombatant.actor);
    await runStartOfTurnAbilities({ actor: newCombatant.actor, on: "actor" });
    await runStartOfTurnAbilities({ actor: newCombatant.actor, on: "actorAll" });
  }
  if (newCombatant?.actor?.type === "entity") {
    await applyEntityBleedingStartOfTurn(newCombatant.actor);
    await runStartOfTurnAbilities({ entity: newCombatant.actor, on: "entity" });
    await runEntityStartOfTurnEnhancements(newCombatant.actor);
  }
  if (newCombatant?.actor?.type === "entity") {
    await triggerEntitySpecialsOnPhase("entityStart");
  } else if (newCombatant?.actor?.type === "hunter") {
    await triggerEntitySpecialsOnPhase("hunterStart");
  }
}
