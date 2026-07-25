/**
 * Base class for game-mechanic primitives.
 *
 * Mechanic instances are declarative templates: a config object describes
 * triggers + effects, the class encapsulates the runtime behavior. The same
 * mechanic class can be reused across weapon abilities, entity edges, weapon
 * forms, hazards, etc.
 *
 * Contract:
 *   - `key` — canonical id (e.g. "knife.t1.backstab", "edge.demolish").
 *   - `weapon|source`, `tier`, `name`, `text` — metadata for UI / lookups.
 *
 * Subclasses add mechanic-specific fields and methods (match/run/apply).
 * Aggregation happens in helpers/weapon-abilities/registry.js (or future
 * registries for edges/forms/etc).
 */
export class Mechanic {
  constructor({ key, weapon, tier, name, text, form } = {}) {
    if (!key) throw new Error("Mechanic requires `key`");
    this.key = key;
    this.weapon = weapon || "";
    this.tier = tier || 0;
    this.name = name || key;
    this.text = text || "";
    this.form = form || "";
  }
}
