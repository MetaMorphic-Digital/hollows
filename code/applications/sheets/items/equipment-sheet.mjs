import EquipmentData from "../../../data/items/equipment.mjs";
import { HOLLOWS_CONDITIONS } from "../../../data/system-constants.js";
import { getWeaponTypeChoices } from "../../../data/weapons/index.js";
import { pickOne } from "../../apps/selection-dialogs.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

export default class HollowsEquipmentSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["hollows", "sheet", "item", "builder", "equipment"],
    position: { width: 520, height: 600 },
    window: { resizable: true, contentClasses: ["hollows-sheet"] },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: { addEffect: HollowsEquipmentSheet.#addEffect, removeEffect: HollowsEquipmentSheet.#removeEffect },
  };

  static PARTS = {
    sheet: { template: "systems/hollows/templates/item/equipment-sheet.html", scrollable: [""], root: true },
  };

  /** @inheritdoc */
  async _prepareContext(options) {
    const system = this.item.system;
    const fields = system.schema.fields.effects.element.fields;
    const weaponChoices = system.effects.some(effect => ["capacity", "nextAttack"].includes(effect.type))
      ? await getWeaponTypeChoices(system.effects.flatMap(effect => Array.from(effect.weaponTypes))) : {};
    return {
      ...await super._prepareContext(options), item: this.item, system, systemFields: system.schema.fields,
      effects: system.effects.map((effect, index) => ({
        index, type: effect.type, label: EquipmentData.EFFECTS[effect.type].label,
        fields: EquipmentData.EFFECTS[effect.type].fields.filter(key => {
          if (key === "amount") return !((effect.type === "resource") && (effect.resourceMode === "full"))
            && !((effect.type === "capacity") && effect.full) && !((effect.type === "threat") && (effect.threatMode === "towards"));
          if (key === "freeTerrain") return HOLLOWS_CONDITIONS[effect.condition].terrain;
          return true;
        }).map(key => ({
          field: fields[key], name: "system.effects." + index + "." + key, value: effect[key],
          options: key === "weaponTypes" ? Object.entries(weaponChoices).map(([value, label]) => ({ value, label })) : undefined,
        })),
      })),
    };
  }

  /** Add an effect supported by the selected trigger. */
  static async #addEffect() {
    const type = await pickOne({
      title: game.i18n.localize("HOLLOWS.EQUIPMENT.addEffect"),
      options: Object.entries(EquipmentData.EFFECTS)
        .filter(([, definition]) => !definition.trigger || (definition.trigger === this.item.system.trigger))
        .map(([value, { label }]) => ({ value, label: game.i18n.localize(label) })),
    });
    if (!type) return;
    const effects = this.item.system.toObject().effects;
    effects.push({ ...this.item.system.schema.fields.effects.element.getInitialValue(), type });
    await this.item.update({ "system.effects": effects });
  }

  /** Remove the selected effect. */
  static async #removeEffect(event, target) {
    const effects = this.item.system.toObject().effects;
    effects.splice(Number(target.dataset.index), 1);
    await this.item.update({ "system.effects": effects });
  }
}
