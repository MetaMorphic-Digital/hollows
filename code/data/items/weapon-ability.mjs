export default class WeaponAbilityData extends foundry.abstract.TypeDataModel {
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      weaponType: new fields.StringField({ initial: "" }),
      tier: new fields.NumberField({ initial: 1, integer: true }),
      durationType: new fields.StringField({ initial: "permanent" }),
      boundWeaponId: new fields.StringField({ initial: "" }),
      text: new fields.StringField({ initial: "" }),
    };
  }
}
