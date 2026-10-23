import ScriptField from "../fields/script-field.mjs";
import WeaponFormData from "./weapon-form.mjs";

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
      appliedForm: new fields.SchemaField({
        ...WeaponFormData.defineSchema(),
        uuid: new fields.StringField({ initial: "" }),
        name: new fields.StringField({ initial: "" }),
        attackProfileVariant: new fields.StringField({ initial: "primary", choices: ["primary", "alternative"] }),
      }, { nullable: true, initial: null }),
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
        script: new ScriptField(),
      }),
      loaded: new fields.BooleanField({ initial: true }),
      coreAbility: new fields.StringField({ initial: "" }),
      script: new ScriptField(),
      outlook: new fields.StringField({ initial: "" }),
      lies: new fields.StringField({ initial: "" }),
      fears: new fields.StringField({ initial: "" }),
      attackProfiles: new fields.ArrayField(attackProfileSchema(), { initial: [] }),
    };
  }

  /* -------------------------------------------------- */

  /**
   * Copy a form onto this weapon; null removes the current form.
   * @param {Item|null} form
   * @param {object} [options]
   * @param {string} [options.variant] Attack variant already chosen during character creation.
   * @returns {Promise<Item|undefined>} The updated weapon, or undefined if incompatible or canceled.
   */
  async applyForm(form, { variant } = {}) {
    if (form && ((form.type !== "weaponForm") || (form.system.weaponType !== this.weaponType))) {
      ui.notifications.warn(`Select a ${this.weaponType} Weapon Form.`);
      return;
    }
    if (form) {
      variant ??= await form.system.chooseAttackProfile();
      if (!variant) return;
    }
    return this.parent.update({
      "system.appliedForm": form ? {
        ...form.system.toObject(), uuid: form.uuid, name: form.name, attackProfileVariant: variant,
      } : null,
      "system.capacity.value": 0,
    });
  }
}
