export default class EntityEnhancementData extends foundry.abstract.TypeDataModel {
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      category: new fields.StringField({ initial: "default" }),
      text: new fields.StringField({ initial: "" }),
      builder: new fields.SchemaField({
        enabled: new fields.BooleanField({ initial: true }),
        configure: new fields.ObjectField({ initial: {} }),
        statModifiers: new fields.ArrayField(new fields.ObjectField(), { initial: [] }),
        actionModifiers: new fields.ArrayField(new fields.ObjectField(), { initial: [] }),
        generatedAbility: new fields.ObjectField({ initial: {} }),
        triggers: new fields.ArrayField(new fields.ObjectField(), { initial: [] }),
      }),
    };
  }
}
