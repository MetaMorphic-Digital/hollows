export default class HazardData extends foundry.abstract.TypeDataModel {
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      category: new fields.StringField({ initial: "hazard" }),
      stat: new fields.StringField({ initial: "strong" }),
      tn: new fields.NumberField({ initial: 10 }),
      targetMode: new fields.StringField({ initial: "any" }),
      damageSuccessResolve: new fields.NumberField({ initial: 0 }),
      damageFailureWounds: new fields.NumberField({ initial: 0 }),
      doomOnFailure: new fields.NumberField({ initial: 0 }),
      notes: new fields.StringField({ initial: "" }),
    };
  }
}
