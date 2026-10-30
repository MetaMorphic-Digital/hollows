import RefugeData from "./refuge.mjs";
import { getPrimaryRefugeActor } from "../refuge/resolvers.js";

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
    RefugeData.renderSheets(this.parent.id);
    if ("inRefuge" in (changed.system || {})) getPrimaryRefugeActor()?.system.refreshHunters();
  }

  /** @inheritdoc */
  _onDelete(options, userId) {
    super._onDelete(options, userId);
    RefugeData.renderSheets(this.parent.id);
    getPrimaryRefugeActor()?.system.refreshHunters();
  }
}
