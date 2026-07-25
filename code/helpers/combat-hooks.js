import {
  onCombatAwaitingFirstPickUpdate,
  onCombatStart,
  onCombatInitializeUpdate,
  onDeleteCombat,
  onPreUpdateCombat,
  onUpdateCombat,
  onUpdateCombatant
} from "./combat-turn-hooks.js";
import {
  onGetCombatTrackerEntryContext,
  onRenderCombatTracker
} from "../applications/sidebar/combat-tracker.js";

export function registerCombatRuntimeHooks() {
  Hooks.on("updateCombat", onCombatInitializeUpdate);
  Hooks.on("updateCombat", onCombatAwaitingFirstPickUpdate);
  Hooks.on("preUpdateCombat", onPreUpdateCombat);
  Hooks.on("updateCombat", onUpdateCombat);
  Hooks.on("combatStart", onCombatStart);
  Hooks.on("deleteCombat", onDeleteCombat);
  Hooks.on("updateCombatant", onUpdateCombatant);
}

export function registerCombatUiHooks() {
  Hooks.on("renderCombatTracker", onRenderCombatTracker);
  Hooks.on("getCombatTrackerEntryContext", onGetCombatTrackerEntryContext);
}
