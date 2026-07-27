export default class EntityData extends foundry.abstract.TypeDataModel {
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      description: new fields.StringField({ initial: "" }),
      descriptionBehavior: new fields.StringField({ initial: "" }),
      descriptionNotes: new fields.StringField({ initial: "" }),
      defences: new fields.SchemaField({
        close: new fields.NumberField({ initial: 10, integer: true, min: 0 }),
        ranged: new fields.NumberField({ initial: 10, integer: true, min: 0 }),
        wyrd: new fields.NumberField({ initial: 10, integer: true, min: 0 }),
      }),
      health: new fields.SchemaField({
        resolve: new fields.SchemaField({
          value: new fields.NumberField({ initial: 0 }),
          max: new fields.NumberField({ initial: 0, min: 0 }),
        }),
        wounds: new fields.SchemaField({
          value: new fields.NumberField({ initial: 0 }),
          max: new fields.NumberField({ initial: 0, min: 0 }),
        }),
      }),
      threat: new fields.SchemaField({
        perRound: new fields.NumberField({ initial: 0, min: 0 }),
        max: new fields.NumberField({ initial: 0, min: 0 }),
      }),
      curse: new fields.SchemaField({
        enabled: new fields.BooleanField({ initial: false }),
        value: new fields.NumberField({ initial: 0, integer: true }),
        targets: new fields.SchemaField({
          hunter: new fields.BooleanField({ initial: false }),
          entity: new fields.BooleanField({ initial: false }),
          zone: new fields.BooleanField({ initial: false }),
        }),
      }),
      terrainPool: new fields.SchemaField({
        elevated: new fields.NumberField({ initial: 3 }),
        sheltered: new fields.NumberField({ initial: 3 }),
      }),
      terrainEngineEnabled: new fields.BooleanField({ initial: false }),
      terrain: new fields.SchemaField({
        elevated: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
        sheltered: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
      }),
      abilities: new fields.ArrayField(
        new fields.SchemaField({
          name: new fields.StringField({ initial: "Ability" }),
          text: new fields.StringField({ initial: "" }),
        }),
        { initial: [] },
      ),
      attacks: new fields.ArrayField(
        new fields.SchemaField({
          name: new fields.StringField({ initial: "Attack" }),
          defenceStat: new fields.StringField({ initial: "hard" }),
          tn: new fields.NumberField({ initial: 0 }),
          damage: new fields.SchemaField({
            resolve: new fields.NumberField({ initial: 0 }),
            wounds: new fields.NumberField({ initial: 0 }),
          }),
          targetMode: new fields.StringField({ initial: "single" }),
          allowedZones: new fields.ArrayField(
            new fields.StringField({ initial: "" }),
            { initial: [] },
          ),
          conditionText: new fields.StringField({ initial: "" }),
          followUpEnabled: new fields.BooleanField({ initial: false }),
          followUpWhen: new fields.StringField({ initial: "success" }),
          followUpTargets: new fields.StringField({ initial: "" }),
          followUpDamage: new fields.SchemaField({
            resolve: new fields.NumberField({ initial: 0 }),
            wounds: new fields.NumberField({ initial: 0 }),
          }),
          followUpDefenceStat: new fields.StringField({ initial: "" }),
          followUpTN: new fields.NumberField({ initial: 0 }),
          followUpTargetMode: new fields.StringField({ initial: "multiZone" }),
          followUpZoneSource: new fields.StringField({ initial: "same" }),
          followUpZoneCount: new fields.StringField({ initial: "all" }),
          followUpAllowedZones: new fields.ArrayField(
            new fields.StringField({ initial: "" }),
            { initial: [] },
          ),
          followUpExcludeOriginal: new fields.BooleanField({ initial: true }),
        }),
        { initial: [] },
      ),
      interrupts: new fields.ArrayField(
        new fields.SchemaField({
          name: new fields.StringField({ initial: "Interrupt" }),
          cost: new fields.NumberField({ initial: 1 }),
          targetMode: new fields.StringField({ initial: "single" }),
          allowedZones: new fields.ArrayField(
            new fields.StringField({ initial: "" }),
            { initial: [] },
          ),
          actionType: new fields.StringField({ initial: "attack" }),
          defenceStat: new fields.StringField({ initial: "hard" }),
          testStat: new fields.StringField({ initial: "hard" }),
          tn: new fields.NumberField({ initial: 0 }),
          damage: new fields.SchemaField({
            resolve: new fields.NumberField({ initial: 0 }),
            wounds: new fields.NumberField({ initial: 0 }),
          }),
          conditionText: new fields.StringField({ initial: "" }),
          effectText: new fields.StringField({ initial: "" }),
        }),
        { initial: [] },
      ),
    };
  }

  /** @inheritdoc */
  prepareDerivedData() {
    super.prepareDerivedData();

    // Clamp resolve/wounds to their maximum.
    const { resolve, wounds } = this.health;
    resolve.value = Math.min(resolve.value, resolve.max);
    wounds.value = Math.min(wounds.value, wounds.max);
  }
}
