import {
  onCombatAwaitingFirstPickUpdate,
  onCombatStart,
  onCombatInitializeUpdate,
  onPreUpdateCombat,
  onUpdateCombat,
  onUpdateCombatant,
} from "./combat-turn-hooks.js";

export function registerCombatRuntimeHooks() {
  // TODO: Move all these hooks into the Combat class.
  Hooks.on("updateCombat", onCombatInitializeUpdate);
  Hooks.on("updateCombat", onCombatAwaitingFirstPickUpdate);
  Hooks.on("preUpdateCombat", onPreUpdateCombat);
  Hooks.on("updateCombat", onUpdateCombat);
  Hooks.on("combatStart", onCombatStart);
  Hooks.on("updateCombatant", onUpdateCombatant);
}
