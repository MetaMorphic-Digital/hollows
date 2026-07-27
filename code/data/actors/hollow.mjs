export default class HollowData extends foundry.abstract.TypeDataModel {
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    const stepSchema = () => new fields.SchemaField({
      done: new fields.BooleanField({ initial: false }),
      notes: new fields.StringField({ initial: "" }),
      performerActorId: new fields.StringField({ initial: "" }),
      performerName: new fields.StringField({ initial: "" }),
      performerImg: new fields.StringField({ initial: "" }),
    });
    const sceneSchema = new fields.SchemaField({
      sceneId: new fields.StringField({ initial: "" }),
      name: new fields.StringField({ initial: "" }),
      notes: new fields.StringField({ initial: "" }),
      revealed: new fields.BooleanField({ initial: false }),
      publicSnapshot: new fields.ObjectField({ initial: {} }),
      hazardIds: new fields.ArrayField(new fields.StringField({ initial: "" }), { initial: [] }),
      entityIds: new fields.ArrayField(new fields.StringField({ initial: "" }), { initial: [] }),
      thrallIds: new fields.ArrayField(new fields.StringField({ initial: "" }), { initial: [] }),
      rumourIds: new fields.ArrayField(new fields.StringField({ initial: "" }), { initial: [] }),
      relicIds: new fields.ArrayField(new fields.StringField({ initial: "" }), { initial: [] }),
    });
    const publicLinkSchema = () => new fields.SchemaField({
      ref: new fields.StringField({ initial: "" }),
      id: new fields.StringField({ initial: "" }),
      uuid: new fields.StringField({ initial: "" }),
      name: new fields.StringField({ initial: "" }),
      img: new fields.StringField({ initial: "" }),
      system: new fields.ObjectField({ initial: {} }),
    });

    return {
      status: new fields.StringField({ initial: "active" }),
      malignancy: new fields.StringField({ initial: "" }),
      summary: new fields.StringField({ initial: "" }),
      headerImg: new fields.StringField({ initial: "" }),
      lordId: new fields.StringField({ initial: "" }),
      doom: new fields.SchemaField({
        current: new fields.NumberField({ initial: 0, integer: true }),
        cap: new fields.NumberField({ initial: 25, integer: true }),
        show: new fields.BooleanField({ initial: false }),
      }),
      incursion: new fields.SchemaField({
        omensText: new fields.StringField({ initial: "" }),
        historyText: new fields.StringField({ initial: "" }),
        steps: new fields.SchemaField({
          gather: stepSchema(),
          resonate: stepSchema(),
          commune: stepSchema(),
          rend: stepSchema(),
        }),
      }),
      scenes: new fields.ArrayField(sceneSchema, { initial: [] }),
      trackedHazards: new fields.ArrayField(new fields.StringField({ initial: "" }), { initial: [] }),
      trackedThralls: new fields.ArrayField(new fields.StringField({ initial: "" }), { initial: [] }),
      trackedEntities: new fields.ArrayField(new fields.StringField({ initial: "" }), { initial: [] }),
      rumourIds: new fields.ArrayField(new fields.StringField({ initial: "" }), { initial: [] }),
      relicIds: new fields.ArrayField(new fields.StringField({ initial: "" }), { initial: [] }),
      publicLinks: new fields.SchemaField({
        hazards: new fields.ArrayField(publicLinkSchema(), { initial: [] }),
        thralls: new fields.ArrayField(publicLinkSchema(), { initial: [] }),
        entities: new fields.ArrayField(publicLinkSchema(), { initial: [] }),
        rumours: new fields.ArrayField(publicLinkSchema(), { initial: [] }),
        relics: new fields.ArrayField(publicLinkSchema(), { initial: [] }),
      }),
    };
  }
}
