export default class EquipmentData extends foundry.abstract.TypeDataModel {
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      category: new fields.StringField({ initial: "exploration" }),
      text: new fields.StringField({ initial: "" }),
    };
  }
}
