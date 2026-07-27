export default class RefugeData extends foundry.abstract.TypeDataModel {
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      resources: new fields.SchemaField({
        bone: new fields.NumberField({ initial: 0, integer: true }),
        hearts: new fields.NumberField({ initial: 0, integer: true }),
      }),
      npcRoles: new fields.SchemaField({
        keeper: new fields.StringField({ initial: "" }),
        doctor: new fields.StringField({ initial: "" }),
        apprentice: new fields.StringField({ initial: "" }),
        smith: new fields.StringField({ initial: "" }),
        magus: new fields.StringField({ initial: "" }),
      }),
      upgrades: new fields.ObjectField({ initial: {} }),
      residents: new fields.ArrayField(
        new fields.StringField({ initial: "" }),
        { initial: [] },
      ),
      unlockedExploration: new fields.ArrayField(new fields.StringField({ initial: "" }), { initial: [] }),
      unlockedBattle: new fields.ArrayField(new fields.StringField({ initial: "" }), { initial: [] }),
      notes: new fields.StringField({ initial: "" }),
    };
  }
}
