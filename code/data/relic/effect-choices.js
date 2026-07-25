import { HOLLOWS_CONDITIONS } from "../system-constants.js";

// Choice vocabularies for the Relic / Rumour / Cypher effect builder. Kept as a
// single constants object (mirrors ENTITY_ACTION_CHOICES) so the schema and the
// schema-driven builder sheet read the same source.
//
// A group's `target.side` is the single source of truth for hunter vs entity —
// the two have DIFFERENT modifiable properties and clauses (entity has defences
// / threat-per-round / threat-cap; hunter has stats / focus / capacity), so the
// builder shows only the side-appropriate set and never mixes them.
export const RELIC_EFFECT_CHOICES = {
  // When an effect group fires.
  trigger: {
    onUse: "On Use (declared)",
    onTurnStart: "At Start of Entity Turn",
    onEntityCurse: "When Entity Spends Curse",
    onEntityAttack: "When Bearer Is Attacked",
    onHuntersDefend: "When Hunters Defend",
    onEntityBroken: "When Entity Becomes Broken",
    onEnterZone: "When Bearer Enters a Zone",
    onDeath: "When Bearer Dies",
    passiveWhileHeld: "Passive (while held)"
  },

  // Optional gate before the group applies.
  gateSource: {
    none: "Always",
    entityResolve: "Entity Resolve",
    entityWounds: "Entity Wounds",
    entityCurse: "Curse on Entity",
    bearerZoneCurse: "Curse in Bearer's Zone",
    bearerZoneThreat: "Threat in Bearer's Zone"
  },
  gateComparison: { lowerEqual: "≤", higherEqual: "≥", equal: "=" },

  // Who the group's effects land on. Drives which clauses / properties show.
  targetSide: { entity: "Entity", hunter: "Hunter(s)", zone: "Zone(s)", none: "No mechanical target" },
  // How Zone-side targets are picked.
  zoneMode: { selected: "Selected Zone(s)", bearer: "Bearer's Zone", adjacent: "Adjacent Zone(s)" },
  entityScope: { active: "Active Entity", specific: "Specific Entity" },
  hunterScope: { self: "Bearer", bearerArea: "Bearer's area", chosenZone: "Chosen zone", allHunters: "All Hunters", chosen: "Chosen Hunter" },

  // Modifiable properties — segregated by side, never mixed.
  entityProperty: {
    closeDefence: "Close Defence", rangedDefence: "Ranged Defence", wyrdDefence: "Wyrd Defence",
    threatPerRound: "Threat Per Round", threatCap: "Threat Cap",
    maxResolve: "Max Resolve", maxWounds: "Max Wounds"
  },
  hunterProperty: {
    strong: "Strong", hard: "Hard", quick: "Quick", sharp: "Sharp", wise: "Wise"
  },

  // Stat the bearer rolls, and the entity defence it tests against, for the
  // attack clause (resolved via the standard weaponless attack flow).
  stat: { strong: "Strong", hard: "Hard", quick: "Quick", sharp: "Sharp", wise: "Wise" },
  attackDefence: { close: "Close Defence", ranged: "Ranged Defence", wyrd: "Wyrd Defence" },

  threatMode: { add: "Add", remove: "Remove", shiftToBearer: "Shift to bearer's zone" },
  curseMode: { add: "Add", remove: "Remove", clamp: "Clamp to X" },
  terrainMode: { grant: "Grant", remove: "Remove" },
  entityTerrainTag: { elevated: "Elevated", sheltered: "Sheltered" },
  get hunterTerrainTag() {
    return Object.fromEntries(
      Object.entries(HOLLOWS_CONDITIONS)
        .filter(([, cfg]) => cfg?.terrain)
        .map(([key, cfg]) => [key, cfg.label || key])
    );
  },
  conditionMode: { add: "Add", remove: "Remove" },

  // Entity ability modification: disable (Entity-Sheet button gate) or modify
  // (TN / damage deltas). No replace.
  abilityMode: { disable: "Disable", modify: "Modify (TN / damage)" },

  // Incoming-damage modifier (bearer side only).
  incomingSource: { entity: "From Entity", any: "From Any Source" },

  // Reaction / grant clause (bearer side only).
  reactionKind: {
    none: "None",
    grantReaction: "Grant Reaction",
    grantManoeuvre: "Grant Manoeuvre",
    cancelAction: "Cancel Entity Action",
    deathSave: "Prevent Death",
    immediateMove: "Immediate Move (chat reminder)"
  },
  // Reactions a relic can grant standalone (mirrors Bulwark / Control).
  grantableReaction: { guard: "Guard", control: "Control" },

  // Item-level consumption.
  uses: { oneOff: "One-Off", reusable: "Reusable" }
};
