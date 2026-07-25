/**
 * Permission guards for CONFIG.queries handlers (and any GM-proxy code path).
 *
 * Every query handler runs ON THE GM SIDE but is INVOKED by a client. The
 * payload tells the GM what to do, but the GM must still verify the caller
 * had authority to ask. These helpers centralize that check.
 *
 * Convention: helpers return the resolved document on success and throw a
 * QueryPermissionError on failure. The query dispatcher catches the error and
 * relays a notification to the caller's UI.
 */

export class QueryPermissionError extends Error {
  constructor(message, { code } = {}) {
    super(message);
    this.name = "QueryPermissionError";
    this.code = code || "permission-denied";
  }
}

function resolveUser(user) {
  if (user) return user;
  return game.user || null;
}

/**
 * Caller must be GM or OWNER of `actor`. Returns the actor on success.
 * Used for: setActorFlag, applyDamage to own actor, hunter ability triggers
 * on own hunter, condition changes initiated by owner.
 */
export function requireOwnerOrGM(actor, user) {
  const u = resolveUser(user);
  if (!actor) throw new QueryPermissionError("Actor missing", { code: "no-actor" });
  if (u?.isGM) return actor;
  if (actor.testUserPermission?.(u, "OWNER")) return actor;
  throw new QueryPermissionError(`User ${u?.name || "?"} is not OWNER of ${actor.name || actor.id}`, { code: "not-owner" });
}

/**
 * Caller must be GM. For destructive global state ops or anything that no
 * single actor "owns" (combat turn flow, scene mutations).
 */
export function assertGM(user) {
  const u = resolveUser(user);
  if (!u?.isGM) throw new QueryPermissionError("GM required", { code: "not-gm" });
  return u;
}

/**
 * Caller must own at least one actor in `actors`. Returns the first owned
 * actor on success. Used for ability cards where any participant can trigger
 * follow-up (e.g. defender choosing reaction from a list of options).
 */
export function requireOwnerOfAny(actors, user) {
  const u = resolveUser(user);
  if (u?.isGM) return actors?.[0] ?? null;
  const list = Array.isArray(actors) ? actors : [];
  for (const a of list) {
    if (a && a.testUserPermission?.(u, "OWNER")) return a;
  }
  throw new QueryPermissionError("Caller does not own any of the candidate actors", { code: "no-owned-actor" });
}

/**
 * Caller must be GM or the OWNER of the current combatant's actor in the
 * given combat. Used for turn-flow events (advanceTurn, passInitiative).
 * Returns the combatant on success.
 */
export function requireActiveCombatant(combat, user) {
  const u = resolveUser(user);
  if (!combat) throw new QueryPermissionError("Combat missing", { code: "no-combat" });
  if (u?.isGM) return combat.combatant ?? null;
  const c = combat.combatant;
  if (!c) throw new QueryPermissionError("No active combatant", { code: "no-combatant" });
  if (c.actor?.testUserPermission?.(u, "OWNER")) return c;
  throw new QueryPermissionError("Caller is not OWNER of the active combatant", { code: "not-active-owner" });
}

/**
 * Caller must own `combatant` (specific combatant, not necessarily active).
 * Used for passInitiative where caller passes FROM their own combatant.
 */
export function requireOwnerOfCombatant(combatant, user) {
  const u = resolveUser(user);
  if (!combatant) throw new QueryPermissionError("Combatant missing", { code: "no-combatant" });
  if (u?.isGM) return combatant;
  if (combatant.actor?.testUserPermission?.(u, "OWNER")) return combatant;
  throw new QueryPermissionError("Caller is not OWNER of the combatant", { code: "not-combatant-owner" });
}
