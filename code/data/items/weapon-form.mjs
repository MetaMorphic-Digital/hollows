import ScriptField from "../fields/script-field.mjs";
import { STAT_LABELS } from "../system-constants.js";

export default class WeaponFormData extends foundry.abstract.TypeDataModel {
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    const stats = { none: "None", ...Object.fromEntries(Object.values(STAT_LABELS).map(stat => [stat, stat])) };
    const attackProfile = () => new fields.SchemaField({
      close: new fields.StringField({ initial: "none", choices: stats }),
      ranged: new fields.StringField({ initial: "none", choices: stats }),
    });
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
      changesAttackProfile: new fields.BooleanField({ initial: false }),
      attackProfile: attackProfile(),
      versusWyrd: new fields.SchemaField({
        close: new fields.BooleanField({ initial: false }),
        ranged: new fields.BooleanField({ initial: false }),
      }),
      alternativeVariant: new fields.BooleanField({ initial: false }),
      alternativeAttackProfile: attackProfile(),
      script: new ScriptField(),
    };
  }

  /**
   * Build the attacks allowed by one variant of a form.
   * @param {WeaponFormData|object} form The form model or its copy on a weapon.
   * @param {"primary"|"alternative"} [variant="primary"]
   * @returns {{range: string, stat: string, defence: string}[]}
   */
  static getAttackProfiles(form, variant = "primary") {
    const profile = variant === "alternative" ? form.alternativeAttackProfile : form.attackProfile;
    return ["Close", "Ranged"].filter(range => profile[range.toLowerCase()] !== "none").map(range => ({
      range,
      stat: profile[range.toLowerCase()],
      defence: form.versusWyrd[range.toLowerCase()] ? "Wyrd" : range,
    }));
  }

  /** Choose the attack variant when taking a form; closing the dialog cancels. */
  async chooseAttackProfile() {
    if (!this.changesAttackProfile || !this.alternativeVariant) return "primary";
    return foundry.applications.api.DialogV2.wait({
      window: { title: this.parent.name },
      content: "<p>Choose this weapon's attack profile.</p>",
      buttons: ["primary", "alternative"].map(variant => ({
        action: variant,
        label: WeaponFormData.getAttackProfiles(this, variant)
          .map(({ range, stat, defence }) => `${range} with ${stat} vs ${defence}`).join(" / ") || "No attacks",
        callback: () => variant,
      })),
      rejectClose: false,
    });
  }
}
