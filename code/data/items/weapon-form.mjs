import ScriptField from "../fields/script-field.mjs";

export default class WeaponFormData extends foundry.abstract.TypeDataModel {
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      weaponType: new fields.StringField({ initial: "" }),
      text: new fields.StringField({ initial: "" }),
      damage: new fields.SchemaField({
        resolve: new fields.NumberField({ initial: 0 }),
        wounds: new fields.NumberField({ initial: 0 }),
      }),
      capacity: new fields.SchemaField({
        max: new fields.NumberField({ initial: 0 }),
      }),
      script: new ScriptField(),
    };
  }
}
