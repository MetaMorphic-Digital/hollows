import { entityAbilityFields } from "./entity/action-schema.js";
import { effectGroupsField } from "./relic/effect-schema.js";

// Shared effect-builder schema used by Rumour, Relic and the nested Cypher
// block. Relics/Cyphers opt into `uses`; Rumours are used from the Hollow sheet
// and do not carry their own spent-state.
function effectBuilderFields({ uses = false } = {}) {
  const fields = foundry.data.fields;
  const schema = {
    groups: effectGroupsField(),
    text: new fields.StringField({ initial: "" }),
    gmText: new fields.StringField({ initial: "" }),
    combatReminder: new fields.StringField({ initial: "" }),
    narrativeSetup: new fields.StringField({ initial: "" }),
  };
  if (uses) schema.uses = new fields.StringField({ initial: "oneOff" });
  return schema;
}

export class RelicDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...effectBuilderFields({ uses: true }),
      deleteWhenUsed: new fields.BooleanField({ initial: false }),
      // Cypher upgrade: a relic the GM marks upgradable transforms into a Cypher
      // when its trigger fires (see checkCypherUpgrades). The upgraded form swaps
      // in cypherName, the Cypher art, and the nested `cypher` effect block (same
      // shape as the base relic effect, surfaced via activeRelicEffect).
      cypherUpgradable: new fields.BooleanField({ initial: false }),
      cypherTrigger: new fields.StringField({ initial: "rumourRevealed" }),
      cypherTriggerTargetId: new fields.StringField({ initial: "" }),
      cypherName: new fields.StringField({ initial: "" }),
      cypher: new fields.SchemaField(effectBuilderFields({ uses: true })),
      upgraded: new fields.BooleanField({ initial: false }),
    };
  }
}

export class EchoDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      echoType: new fields.StringField({ initial: "bane" }),
      category: new fields.StringField({ initial: "seed" }),
      subtype: new fields.StringField({ initial: "" }),
      malignancy: new fields.StringField({ initial: "" }),
      weaponType: new fields.StringField({ initial: "" }),
      sourceWeaponId: new fields.StringField({ initial: "" }),
      suppressed: new fields.BooleanField({ initial: false }),
      onePerHollow: new fields.BooleanField({ initial: false }),
      usedThisHollow: new fields.BooleanField({ initial: false }),
      modifiers: new fields.SchemaField({
        strong: new fields.NumberField({ initial: 0 }),
        hard: new fields.NumberField({ initial: 0 }),
        quick: new fields.NumberField({ initial: 0 }),
        sharp: new fields.NumberField({ initial: 0 }),
        wise: new fields.NumberField({ initial: 0 }),
      }),
      damageBonus: new fields.SchemaField({
        resolve: new fields.NumberField({ initial: 0 }),
        wounds: new fields.NumberField({ initial: 0 }),
      }),
      onAcquire: new fields.SchemaField({
        createsThrall: new fields.BooleanField({ initial: false }),
        createsHazard: new fields.BooleanField({ initial: false }),
        enhancesExplorationRoll: new fields.BooleanField({ initial: false }),
        explorationTNMod: new fields.NumberField({ initial: 2 }),
        explorationRepeatTNMod: new fields.NumberField({ initial: 3 }),
        grantTier3Ability: new fields.BooleanField({ initial: false }),
        hazard: new fields.SchemaField({
          tn: new fields.NumberField({ initial: 9 }),
          resolve: new fields.NumberField({ initial: 2 }),
          wounds: new fields.NumberField({ initial: 2 }),
        }),
        thrall: new fields.SchemaField({
          tn: new fields.NumberField({ initial: 8 }),
          damageResolve: new fields.NumberField({ initial: 2 }),
          damageWounds: new fields.NumberField({ initial: 1 }),
          healthResolve: new fields.NumberField({ initial: 4 }),
          healthWounds: new fields.NumberField({ initial: 3 }),
        }),
      }),
      replaceDyingState: new fields.SchemaField({
        enabled: new fields.BooleanField({ initial: false }),
        outcome: new fields.StringField({ initial: "preventDeath" }),
        oncePerCombat: new fields.BooleanField({ initial: false }),
        resolve: new fields.NumberField({ initial: 1 }),
        wounds: new fields.NumberField({ initial: 1 }),
        groups: effectGroupsField(),
      }),
      restrictions: new fields.ArrayField(new fields.StringField({ initial: "" }), { initial: [] }),
      text: new fields.StringField({ initial: "" }),
      gmText: new fields.StringField({ initial: "" }),
    };
  }
}

export class EntityAbilityDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return entityAbilityFields();
  }
}

export class RumourDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return effectBuilderFields();
  }
}
