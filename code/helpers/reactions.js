/** Player-side handlers for Baptism and granted manoeuvres. */

import { Reaction } from "../data/mechanics/Reaction.js";
import { BAPTISM_REWARD } from "../documents/entity/baptism.js";
import { GRANT_MANOEUVRE } from "../data/actions/index.js";

export {
  Reaction,
  BAPTISM_REWARD,
  GRANT_MANOEUVRE
};

/** Resolve the system reactions after their modules have initialized. */
export function getAllReactions() {
  return [
    BAPTISM_REWARD,
    GRANT_MANOEUVRE,
  ];
}

/** Install the system reactions in the query handlers. */
export function registerReactions(registerHandler) {
  for (const reaction of getAllReactions()) reaction.register(registerHandler);
}

export function primaryOwnerOf(actor) {
  if (!actor) return null;
  const owners = game.users.filter((u) => !u.isGM && actor.testUserPermission?.(u, "OWNER"));
  return owners[0] || null;
}
