/**
 * Entity Edges — transient stat-penalty definitions (granted via Refuge Research).
 * Moved out of gameplay-constants.js into the entity domain (data/entity/).
 * NB: the `desc` strings and the runtime description builder are scheduled to be
 * derived from `effects` in Phase 3 (kills the −2/−1 triplication).
 */
export const EDGE_DEFS = [
  { id: "cornered", name: "Cornered", desc: "Threat Cap -2, Threat per Round -1", effects: { threatCap: -2, threatPerRound: -1 } },
  { id: "protected", name: "Protected", desc: "Defend TN vs Entity attacks -1", effects: { defendTN: -1 } },
  { id: "exhausted", name: "Exhausted", desc: "Entity max Resolve -2", effects: { resolveMax: -2 } },
  { id: "hexed", name: "Hexed", desc: "Wyrd Defence -2", effects: { wyrd: -2 } },
  { id: "trapped", name: "Trapped", desc: "Ranged Defence -2", effects: { ranged: -2 } },
  { id: "undermined", name: "Undermined", desc: "Close Defence -2", effects: { close: -2 } }
];
