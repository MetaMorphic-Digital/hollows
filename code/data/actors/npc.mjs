export default class NpcData extends foundry.abstract.TypeDataModel {
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      description: new fields.StringField({ initial: "" }),
      inRefuge: new fields.BooleanField({ initial: false }),
      refugeOccupation: new fields.StringField({ initial: "" }),
    };
  }

  /** @inheritdoc */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    this.#renderRefuges();
  }

  /** @inheritdoc */
  _onDelete(options, userId) {
    super._onDelete(options, userId);
    this.#renderRefuges();
  }

  /** Refresh resident lists and upgrade availability when this NPC changes. */
  #renderRefuges() {
    for (const actor of game.actors) {
      if ((actor.type === "refuge") && actor.system.residents.includes(this.parent.id)) actor.render(false);
    }
  }
}
