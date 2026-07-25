import { runEndOfTurnEffects, triggerEntitySpecialsOnPhase } from "./combat-end-of-turn.js";
import { runStartOfTurnEffects } from "./combat-start-of-turn.js";

export async function processEndOfTurn(combat, prevCombatant) {
  await runEndOfTurnEffects(combat, prevCombatant, { triggerEntitySpecialsOnPhase });
}

export async function processStartOfTurn(combat, newCombatant) {
  await runStartOfTurnEffects(combat, newCombatant, { triggerEntitySpecialsOnPhase });
}
