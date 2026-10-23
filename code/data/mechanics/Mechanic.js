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
 * Registered and scripted mechanics use the same dispatchers.
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
}
