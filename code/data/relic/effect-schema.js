// Composable effect-group schema for the Relic / Rumour / Cypher builder.
//
// A relic/rumour/cypher effect is an array of effect GROUPS. Each group is a
// `trigger` + optional `gate` + a `target` + a flat set of toggled effect
// clauses + an `otherText` chat fallback. The group's `target.side` (entity /
// hunter / zone) is the single source of truth: hunter and entity have distinct
// modifiable properties and clauses, and the builder shows only the side's set
// (never mixed). The runtime interprets each clause against that side.
//
// Mirrors the factory-function composition of data/entity/action-schema.js so
// the same schema-driven builder pattern applies, but is its own (adapted) code
// — entity-attack particularities (defence profiles, TN-from-defence, threat
// spend, repeat) are intentionally absent.
import { RELIC_EFFECT_CHOICES as C } from "./effect-choices.js";
import { fieldDefaults } from "../../utils/field-defaults.js";

const damageField = () => {
  const f = foundry.data.fields;
  return new f.SchemaField({
    resolve: new f.NumberField({ initial: 0 }),
    wounds: new f.NumberField({ initial: 0 })
  });
};

const stringList = () => {
  const f = foundry.data.fields;
  return new f.ArrayField(new f.StringField({ initial: "" }), { initial: [] });
};

// Where the group's effects land. `side` selects the clause/property set. For
// zone side, `zoneMode` picks how zones are resolved: explicit `zones`,
// bearer's zone, or adjacency (adj* flags; `adjSelect` prompts on active use,
// ignored on passives).
const targetField = () => {
  const f = foundry.data.fields;
  return new f.SchemaField({
    side: new f.StringField({ initial: "entity", choices: C.targetSide }),
    entityScope: new f.StringField({ initial: "active", choices: C.entityScope }),
    entityId: new f.StringField({ initial: "" }),
    hunterScope: new f.StringField({ initial: "self", choices: C.hunterScope }),
    zoneMode: new f.StringField({ initial: "selected", choices: C.zoneMode }),
    zones: stringList(),
    adjClose: new f.BooleanField({ initial: false }),
    adjRanged: new f.BooleanField({ initial: false }),
    adjSelect: new f.BooleanField({ initial: false }),
    adjBearer: new f.BooleanField({ initial: false })
  });
};

// Optional precondition.
const gateField = () => {
  const f = foundry.data.fields;
  return new f.SchemaField({
    source: new f.StringField({ initial: "none", choices: C.gateSource }),
    comparison: new f.StringField({ initial: "lowerEqual", choices: C.gateComparison }),
    value: new f.NumberField({ initial: 0 })
  });
};

// ── Effect clauses (each toggled by `enabled`; valid sides noted) ───────────

// entity or hunter — `properties` are the side-appropriate keys (entityProperty
// vs hunterProperty), chosen in the builder. Covers defences / threat-per-round
// / threat-cap / max health (entity) and stats (hunter).
const characteristicClause = () => {
  const f = foundry.data.fields;
  return new f.SchemaField({
    enabled: new f.BooleanField({ initial: false }),
    properties: stringList(),
    value: new f.NumberField({ initial: 0 })
  });
};

// entity or hunter — `focus`/`allowTemporary` apply to hunters only (builder
// hides them for entity; runtime routes to adjustEntityResource vs
// adjustHunterResource by side).
const resourceClause = () => {
  const f = foundry.data.fields;
  return new f.SchemaField({
    enabled: new f.BooleanField({ initial: false }),
    resolve: new f.NumberField({ initial: 0 }),
    wounds: new f.NumberField({ initial: 0 }),
    focus: new f.NumberField({ initial: 0 }),
    allowTemporary: new f.BooleanField({ initial: false })
  });
};

// entity or hunter — an attack roll dealing damage on a hit. Flat resolve/wounds
// changes go through the resource clause; this is purely the roll variant.
const attackClause = () => {
  const f = foundry.data.fields;
  return new f.SchemaField({
    enabled: new f.BooleanField({ initial: false }),
    amount: damageField(),
    attackStat: new f.StringField({ initial: "quick", choices: C.stat }),
    defence: new f.StringField({ initial: "close", choices: C.attackDefence }),
    advantage: new f.BooleanField({ initial: false })
  });
};

// zone side — area threat.
const threatClause = () => {
  const f = foundry.data.fields;
  return new f.SchemaField({
    enabled: new f.BooleanField({ initial: false }),
    mode: new f.StringField({ initial: "add", choices: C.threatMode }),
    amount: new f.NumberField({ initial: 0 })
  });
};

// entity or zone — curse on the target side.
const curseClause = () => {
  const f = foundry.data.fields;
  return new f.SchemaField({
    enabled: new f.BooleanField({ initial: false }),
    mode: new f.StringField({ initial: "add", choices: C.curseMode }),
    amount: new f.NumberField({ initial: 0 })
  });
};

// entity or hunter — terrain via the dedicated terrain engine (NOT zone-bound):
// entity terrain pool (adjustEntityTerrain, `amount` = count) vs hunter terrain
// tags (claimed/removed; `amount` ignored).
const terrainClause = () => {
  const f = foundry.data.fields;
  return new f.SchemaField({
    enabled: new f.BooleanField({ initial: false }),
    mode: new f.StringField({ initial: "grant", choices: C.terrainMode }),
    tags: stringList(),
    amount: new f.NumberField({ initial: 1 })
  });
};

// hunter side — conditions on the target hunter(s).
const conditionClause = () => {
  const f = foundry.data.fields;
  return new f.SchemaField({
    enabled: new f.BooleanField({ initial: false }),
    mode: new f.StringField({ initial: "add", choices: C.conditionMode }),
    conditions: stringList()
  });
};

// Targets a specific entity ability (entityId + abilityKey) and either disables
// it (Entity-Sheet button gate) or modifies its TN / damage by deltas.
const abilityClause = () => {
  const f = foundry.data.fields;
  return new f.SchemaField({
    enabled: new f.BooleanField({ initial: false }),
    entityId: new f.StringField({ initial: "" }),
    abilityKey: new f.StringField({ initial: "" }),
    mode: new f.StringField({ initial: "disable", choices: C.abilityMode }),
    tnDelta: new f.NumberField({ initial: 0 }),
    damageResolve: new f.NumberField({ initial: 0 }),
    damageWounds: new f.NumberField({ initial: 0 })
  });
};

// bearer side — mitigate/increase damage the bearer would take.
const incomingDamageClause = () => {
  const f = foundry.data.fields;
  return new f.SchemaField({
    enabled: new f.BooleanField({ initial: false }),
    source: new f.StringField({ initial: "entity", choices: C.incomingSource }),
    delta: damageField()       // negative = mitigate incoming damage
  });
};

// bearer side — grant a reaction/manoeuvre, cancel an entity action, death-save,
// or post a manual Move reminder.
const reactionClause = () => {
  const f = foundry.data.fields;
  return new f.SchemaField({
    enabled: new f.BooleanField({ initial: false }),
    kind: new f.StringField({ initial: "none", choices: C.reactionKind }),
    reactionKey: new f.StringField({ initial: "guard", choices: C.grantableReaction })
  });
};

// ── Group + top-level ───────────────────────────────────────────────────────

export const effectGroupField = () => {
  const f = foundry.data.fields;
  return new f.SchemaField({
    enabled: new f.BooleanField({ initial: true }),
    label: new f.StringField({ initial: "" }),
    trigger: new f.StringField({ initial: "onUse", choices: C.trigger }),
    gate: gateField(),
    target: targetField(),
    characteristic: characteristicClause(),
    resource: resourceClause(),
    attack: attackClause(),
    threat: threatClause(),
    curse: curseClause(),
    terrain: terrainClause(),
    condition: conditionClause(),
    ability: abilityClause(),
    incomingDamage: incomingDamageClause(),
    reaction: reactionClause(),
    otherText: new f.StringField({ initial: "" })
  });
};

export const effectGroupsField = () => {
  const f = foundry.data.fields;
  return new f.ArrayField(effectGroupField(), { initial: [] });
};

export function createDefaultEffectGroup() {
  return fieldDefaults(effectGroupField());
}
