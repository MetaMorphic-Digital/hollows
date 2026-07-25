/**
 * Reaction registry — collects all `Reaction` instances declared across the
 * codebase and registers their player-side handlers with CONFIG.queries.
 *
 * The Reaction class itself lives in `code/data/mechanics/Reaction.js`.
 * Individual reactions live next to the ability/feature that owns them:
 *   - Weapon-ability reactions:  code/data/abilities/<weapon>/<ability>.js
 *   - Weapon-form reactions:     code/data/weapons/forms/<weapon>/<form>.js
 *   - Entity-tied reactions:     code/documents/entity/<file>.js
 */

import { Reaction } from "../data/mechanics/Reaction.js";
import { getAllRegisteredWeaponFormMechanics } from "../data/weapons/registry.js";
import { MECHANIC_BUCKETS } from "./mechanic-registry.js";
import { BAPTISM_REWARD } from "../documents/entity/baptism.js";
import { GRANT_MANOEUVRE } from "../data/actions/index.js";

// GRANT_MANOEUVRE (generic "grant a manoeuvre") and BAPTISM_REWARD (entity
// reward) are general reactions, not weapon abilities — they stay named here.
// Weapon-ability reactions are NOT named-exported: resolve them by key via
// getReactionByKey so the lookup tracks the full bucket registry, not a manual
// list that silently drifts out of sync.
export {
  Reaction,
  BAPTISM_REWARD,
  GRANT_MANOEUVRE
};

// Built lazily (a function, not a module-eval const) so every cross-module
// reaction import is initialised before the list is read — avoids a
// circular-import temporal-dead-zone error.
export function getAllReactions() {
  const formReactions = getAllRegisteredWeaponFormMechanics()
    .filter((mechanic) => mechanic instanceof Reaction);
  return [
    ...MECHANIC_BUCKETS.reactions,
    BAPTISM_REWARD,
    GRANT_MANOEUVRE,
    ...formReactions
  ];
}

export function registerReactions(registerHandler) {
  for (const reaction of getAllReactions()) {
    // Defensive: an accidental non-Reaction in the list (e.g. an OnAttackResultAction
    // mixed in by mistake) would throw and abort the loop, leaving every Reaction
    // after it unregistered. Skip with a warning instead.
    if (typeof reaction?.register !== "function") {
      console.warn("Hollows | reactions list contains non-Reaction entry, skipping:", reaction?.key, reaction);
      continue;
    }
    try {
      reaction.register(registerHandler);
    } catch (err) {
      console.error("Hollows | Reaction register failed:", reaction?.key, err);
    }
  }
}

// Resolve a Reaction instance by its `key` from the full reaction registry.
// Single source of truth for reaction-routed mechanics (OnDefenceResultAction,
// IncomingDamageModifier, grantReaction effect). Returns null if not found.
export function getReactionByKey(key) {
  if (!key) return null;
  return getAllReactions().find((reaction) => reaction.key === String(key)) || null;
}

export function primaryOwnerOf(actor) {
  if (!actor) return null;
  const owners = game.users.filter((u) => !u.isGM && actor.testUserPermission?.(u, "OWNER"));
  return owners[0] || null;
}
