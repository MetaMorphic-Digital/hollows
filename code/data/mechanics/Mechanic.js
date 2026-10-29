/**
 * Base class for game-mechanic primitives.
 *
 * Mechanic instances are declarative templates: a config object describes
 * a `when` predicate + effects, the class encapsulates the runtime behavior. The same
 * mechanic class can be reused across weapon abilities, entity edges, weapon
 * forms, hazards, etc.
 *
 * Contract:
 *   - `key` — unique mechanic id.
 *   - `weapon|source`, `tier`, `name`, `text` — metadata for UI / lookups.
 *   - `when` — optional gating predicate; each subclass decides what context
 *     it receives and when it is consulted. Absent means "always".
 *
 * Subclasses add mechanic-specific fields and methods (match/run/apply).
 * System and scripted mechanics use the same dispatchers.
 */
export class Mechanic {
  constructor({ key, weapon, tier, name, text, when } = {}) {
    if (!key) throw new Error("Mechanic requires `key`");
    this.key = key;
    this.weapon = weapon || "";
    this.tier = tier || 0;
    this.name = name || key;
    this.text = text || "";
    this.when = when ?? null;
  }

  /** Check a mechanic's persisted combat usage limit. */
  static isRateLimited(actor, ability) {
    const flag = actor.getFlag("hollows", `ability.${ability.key}.usedAt`);
    if (!flag) return false;
    const combat = game.combat;
    if (!combat?.started) return false;
    if (ability.rateLimit === "oncePerCombat") {
      return flag.combatId === combat.id;
    }
    if (ability.rateLimit === "oncePerRound") {
      return (flag.combatId === combat.id) && (Number(flag.round) === Number(combat.round ?? 0));
    }
    if (ability.rateLimit === "oncePerTurn") {
      return (flag.combatId === combat.id)
        && (Number(flag.round) === Number(combat.round ?? 0))
        && (flag.turnId === combat.combatant?.id);
    }
    return false;
  }

  /** Record a completed use on the carrier, routing through the GM when needed. */
  static async markRateLimit(actor, ability) {
    const combat = game.combat;
    if (!combat?.started) return;
    const key = `ability.${ability.key}.usedAt`;
    const value = {
      combatId: combat.id,
      round: Number(combat.round ?? 0),
      turnId: combat.combatant?.id || null,
    };
    if (actor.isOwner) return actor.setFlag("hollows", key, value);
    const { runGMQuery } = await import("../../helpers/queries.js");
    await runGMQuery("hollows.actorMutation", {
      actorUuid: actor.uuid, type: "flag", payload: { key, value },
    });
  }
}
