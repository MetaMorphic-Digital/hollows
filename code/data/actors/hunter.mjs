export default class HunterData extends foundry.abstract.TypeDataModel {
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      stats: new fields.SchemaField({
        strong: new fields.NumberField({ initial: 1, integer: true }),
        hard: new fields.NumberField({ initial: 1, integer: true }),
        quick: new fields.NumberField({ initial: 1, integer: true }),
        sharp: new fields.NumberField({ initial: 1, integer: true }),
        wise: new fields.NumberField({ initial: 1, integer: true }),
      }),
      statsMarks: new fields.SchemaField({
        strong: new fields.NumberField({ initial: 0, integer: true }),
        hard: new fields.NumberField({ initial: 0, integer: true }),
        quick: new fields.NumberField({ initial: 0, integer: true }),
        sharp: new fields.NumberField({ initial: 0, integer: true }),
        wise: new fields.NumberField({ initial: 0, integer: true }),
      }),
      identity: new fields.SchemaField({
        faction: new fields.StringField({ initial: "" }),
        factionText: new fields.StringField({ initial: "" }),
        origin: new fields.StringField({ initial: "" }),
        originText: new fields.StringField({ initial: "" }),
        seed: new fields.StringField({ initial: "" }),
        seedText: new fields.StringField({ initial: "" }),
      }),
      equipment: new fields.SchemaField({
        relic: new fields.SchemaField({
          used: new fields.BooleanField({ initial: false }),
        }),
      }),
      bio: new fields.SchemaField({
        appearance: new fields.StringField({ initial: "" }),
        notes: new fields.StringField({ initial: "" }),
      }),
      health: new fields.SchemaField({
        resolve: new fields.SchemaField({
          value: new fields.NumberField({ initial: 0 }),
          max: new fields.NumberField({ initial: 0 }),
        }),
        wounds: new fields.SchemaField({
          value: new fields.NumberField({ initial: 0 }),
          max: new fields.NumberField({ initial: 0 }),
        }),
      }),
      corruption: new fields.SchemaField({
        value: new fields.NumberField({ initial: 0 }),
      }),
      malignancy: new fields.StringField({ initial: "" }),
      focus: new fields.SchemaField({
        value: new fields.NumberField({ initial: 0, integer: true }),
      }),
      curse: new fields.SchemaField({
        value: new fields.NumberField({ initial: 0, integer: true, min: 0, max: 6, nullable: false }),
      }),
    };
  }

  /* -------------------------------------------------- */

  /**
   * Can this actor be revived?
   * @type {boolean}
   */
  get isRevivable() {
    const actor = this.parent;
    return actor.statuses.has("dying")
      && !actor.statuses.has("dead")
      && !actor.getFlag(hollows.id, "dyingRevivedOnce");
  }

  /* -------------------------------------------------- */

  /** @inheritdoc */
  prepareDerivedData() {
    super.prepareDerivedData();

    let resolveBonus = 0;
    let woundsBonus = 0;
    const weapons = this.parent.items
      .filter((item) => item.type === "weapon")
      .slice(0, 2);

    for (const weapon of weapons) {
      const healthBonus = weapon.system.getEffectiveWeaponHealthBonus();
      resolveBonus += healthBonus.resolve || 0;
      woundsBonus += healthBonus.wounds || 0;
    }

    this.health.resolve.max = resolveBonus;
    this.health.wounds.max = woundsBonus;
  }
}
