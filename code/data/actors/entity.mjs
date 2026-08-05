import { THREAT_PLACEMENT_SCOPE_LABELS } from "../gameplay-constants.js";

export default class EntityData extends foundry.abstract.TypeDataModel {
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      description: new fields.StringField({ initial: "" }),
      descriptionBehavior: new fields.StringField({ initial: "" }),
      descriptionNotes: new fields.StringField({ initial: "" }),
      defences: new fields.SchemaField({
        close: new fields.NumberField({ initial: 10, integer: true, min: 0 }),
        ranged: new fields.NumberField({ initial: 10, integer: true, min: 0 }),
        wyrd: new fields.NumberField({ initial: 10, integer: true, min: 0 }),
      }),
      health: new fields.SchemaField({
        resolve: new fields.SchemaField({
          value: new fields.NumberField({ initial: 0 }),
          max: new fields.NumberField({ initial: 0, min: 0 }),
        }),
        wounds: new fields.SchemaField({
          value: new fields.NumberField({ initial: 0 }),
          max: new fields.NumberField({ initial: 0, min: 0 }),
        }),
      }),
      threat: new fields.SchemaField({
        perRound: new fields.NumberField({ initial: 0, min: 0 }),
        max: new fields.NumberField({ initial: 0, min: 0 }),
        placement: new fields.ArrayField(
          new fields.SchemaField({
            scope: new fields.StringField({ initial: "all", choices: Object.keys(THREAT_PLACEMENT_SCOPE_LABELS) }),
            zones: new fields.ArrayField(
              new fields.StringField({ initial: "" }),
              { initial: [] },
            ),
            amount: new fields.NumberField({ initial: 0, min: 0 }),
            perZoneMax: new fields.NumberField({ initial: 0, min: 0 }),
          }),
          { initial: [] },
        ),
      }),
      curse: new fields.SchemaField({
        enabled: new fields.BooleanField({ initial: false }),
        value: new fields.NumberField({ initial: 0, integer: true }),
        targets: new fields.SchemaField({
          hunter: new fields.BooleanField({ initial: false }),
          entity: new fields.BooleanField({ initial: false }),
          zone: new fields.BooleanField({ initial: false }),
        }),
      }),
      terrainPool: new fields.SchemaField({
        elevated: new fields.NumberField({ initial: 3 }),
        sheltered: new fields.NumberField({ initial: 3 }),
      }),
      terrainEngineEnabled: new fields.BooleanField({ initial: false }),
      terrain: new fields.SchemaField({
        elevated: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
        sheltered: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
      }),
    };
  }

  /** @inheritdoc */
  prepareDerivedData() {
    super.prepareDerivedData();

    // Clamp resolve/wounds to their maximum.
    const { resolve, wounds } = this.health;
    resolve.value = Math.min(resolve.value, resolve.max);
    wounds.value = Math.min(wounds.value, wounds.max);
  }
}
