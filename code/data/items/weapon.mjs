import { getSelectedWeaponForm } from "../weapons/resolvers.js";
import { scriptField } from "./script-schema.js";

export default class WeaponData extends foundry.abstract.TypeDataModel {
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    const attackProfileSchema = () => new fields.SchemaField({
      range: new fields.StringField({ initial: "Close" }),
      stat: new fields.StringField({ initial: "Strong" }),
      defence: new fields.StringField({ initial: "Close" }),
    });
    const modifierChoiceSchema = new fields.SchemaField({
      label: new fields.StringField({ initial: "" }),
      id: new fields.StringField({ initial: "" }),
      modifiers: new fields.SchemaField({
        strong: new fields.NumberField({ initial: 0 }),
        hard: new fields.NumberField({ initial: 0 }),
        quick: new fields.NumberField({ initial: 0 }),
        sharp: new fields.NumberField({ initial: 0 }),
        wise: new fields.NumberField({ initial: 0 }),
      }),
    });
    return {
      weaponType: new fields.StringField({ initial: "" }),
      form: new fields.StringField({ initial: "" }),
      capacity: new fields.SchemaField({
        value: new fields.NumberField({ initial: 0 }),
        max: new fields.NumberField({ initial: 0 }),
      }),
      modifiers: new fields.SchemaField({
        strong: new fields.NumberField({ initial: 0 }),
        hard: new fields.NumberField({ initial: 0 }),
        quick: new fields.NumberField({ initial: 0 }),
        sharp: new fields.NumberField({ initial: 0 }),
        wise: new fields.NumberField({ initial: 0 }),
      }),
      health_bonus: new fields.SchemaField({
        resolve: new fields.NumberField({ initial: 0 }),
        wounds: new fields.NumberField({ initial: 0 }),
      }),
      modifierChoice: new fields.StringField({ initial: "" }),
      modifierChoices: new fields.ArrayField(modifierChoiceSchema, { initial: [] }),
      // Additive on top of the weapon's normal stats and abilities;
      renown: new fields.SchemaField({
        enabled: new fields.BooleanField({ initial: false }),
        name: new fields.StringField({ initial: "" }),
        text: new fields.StringField({ initial: "" }),
        script: scriptField(),
      }),
      loaded: new fields.BooleanField({ initial: true }),
      coreAbility: new fields.StringField({ initial: "" }),
      outlook: new fields.StringField({ initial: "" }),
      lies: new fields.StringField({ initial: "" }),
      fears: new fields.StringField({ initial: "" }),
      forms: new fields.ArrayField(new fields.ObjectField(), { initial: [] }),
      selectedForm: new fields.StringField({ initial: "" }),
      formAttackChoice: new fields.StringField({ initial: "" }),
      customForm: new fields.SchemaField({
        name: new fields.StringField({ initial: "" }),
        text: new fields.StringField({ initial: "" }),
        capacity: new fields.SchemaField({
          max: new fields.NumberField({ initial: 0 }),
        }),
        damage: new fields.SchemaField({
          resolve: new fields.NumberField({ initial: 0 }),
          wounds: new fields.NumberField({ initial: 0 }),
        }),
        attackProfiles: new fields.ArrayField(attackProfileSchema(), { initial: [] }),
      }),
      attackProfiles: new fields.ArrayField(attackProfileSchema(), { initial: [] }),
    };
  }

  /* -------------------------------------------------- */

  /**
   * @returns {{ resolve: number, wounds: number }}
   */
  getEffectiveWeaponHealthBonus() {
    const weapon = this.parent;
    const form = getSelectedWeaponForm(weapon);
    const source = form?.healthBonus || this.health_bonus || { resolve: 0, wounds: 0 };
    return { resolve: source.resolve, wounds: source.wounds };
  }
}
