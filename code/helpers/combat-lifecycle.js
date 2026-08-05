import { runEndOfTurnEffects } from "./combat-end-of-turn.js";
import { runStartOfTurnEffects } from "./combat-start-of-turn.js";

/** Process the end-of-turn hook. */
export async function processEndOfTurn(combat, prevCombatant) {
  await runEndOfTurnEffects(combat, prevCombatant);
}

/** Process the start-of-turn hook. */
export async function processStartOfTurn(combat, newCombatant) {
  await runStartOfTurnEffects(combat, newCombatant);
}
