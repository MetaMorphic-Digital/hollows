export default class NpcData extends foundry.abstract.TypeDataModel {
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      description: new fields.StringField({ initial: "" }),
      inRefuge: new fields.BooleanField({ initial: false }),
      refugeOccupation: new fields.StringField({ initial: "" }),
    };
  }
}
