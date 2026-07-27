export default class ThrallData extends foundry.abstract.TypeDataModel {
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      stat: new fields.StringField({ initial: "strong" }),
      tn: new fields.NumberField({ initial: 10 }),
      damage: new fields.SchemaField({
        resolve: new fields.NumberField({ initial: 0 }),
        wounds: new fields.NumberField({ initial: 0 }),
      }),
      health: new fields.SchemaField({
        resolve: new fields.SchemaField({
          value: new fields.NumberField({ initial: 0 }),
          max: new fields.NumberField({ initial: 0 }),
        }),
        wounds: new fields.SchemaField({
          value: new fields.NumberField({ initial: 0 }),
          max: new fields.NumberField({ initial: 0 }),
        }),
      }),
      notes: new fields.StringField({ initial: "" }),
    };
  }
}
