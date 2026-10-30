import { STAT_LABELS, DEFENCE_LABELS, HOLLOWS_CONDITIONS } from "../system-constants.js";

export default class EquipmentData extends foundry.abstract.TypeDataModel {
  static EFFECTS = {
    resource: { label: "HOLLOWS.EQUIPMENT.effects.resource", fields: ["target", "resource", "resourceMode", "amount"] },
    capacity: { label: "HOLLOWS.EQUIPMENT.effects.capacity", fields: ["weaponTypes", "full", "amount"] },
    nextAttack: { label: "HOLLOWS.EQUIPMENT.effects.nextAttack", fields: ["weaponTypes", "resolve", "wounds"] },
    condition: { label: "HOLLOWS.EQUIPMENT.effects.condition", fields: ["target", "condition", "conditionMode", "freeTerrain"] },
    threat: { label: "HOLLOWS.EQUIPMENT.effects.threat", fields: ["threatMode", "amount"] },
    cancelAction: { label: "HOLLOWS.EQUIPMENT.effects.cancelAction", fields: [], trigger: "entityManoeuvre" },
    recovery: { label: "HOLLOWS.EQUIPMENT.effects.recovery", fields: ["multiplier"], trigger: "entityRestore" },
    movement: { label: "HOLLOWS.EQUIPMENT.effects.movement", fields: ["direction"] },
  };

  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      category: new fields.StringField({ initial: "exploration", choices: {
        exploration: "HOLLOWS.EQUIPMENT.exploration", battle: "HOLLOWS.EQUIPMENT.battle",
      } }),
      text: new fields.StringField({ initial: "" }),
      used: new fields.BooleanField({ initial: false }),
      trigger: new fields.StringField({ initial: "onUse", choices: {
        onUse: "HOLLOWS.EQUIPMENT.triggers.onUse", combatStart: "HOLLOWS.EQUIPMENT.triggers.combatStart",
        weaponEmpty: "HOLLOWS.EQUIPMENT.triggers.weaponEmpty", entityManoeuvre: "HOLLOWS.EQUIPMENT.triggers.entityManoeuvre",
        entityRestore: "HOLLOWS.EQUIPMENT.triggers.entityRestore",
      } }),
      zone: new fields.StringField({ initial: "any", choices: {
        any: "HOLLOWS.EQUIPMENT.zones.any", close: "HOLLOWS.EQUIPMENT.zones.close",
        ranged: "HOLLOWS.EQUIPMENT.zones.ranged", support: "HOLLOWS.EQUIPMENT.zones.support",
      } }),
      resolveCost: new fields.NumberField({ initial: 0, min: 0, integer: true }),
      attack: new fields.SchemaField({
        enabled: new fields.BooleanField({ initial: false }),
        stat: new fields.StringField({ initial: "sharp", choices: STAT_LABELS }),
        defence: new fields.StringField({ initial: "ranged", choices: DEFENCE_LABELS }),
        resolve: new fields.NumberField({ initial: 0, min: 0, integer: true }),
        wounds: new fields.NumberField({ initial: 0, min: 0, integer: true }),
      }),
      effects: new fields.ArrayField(new fields.SchemaField({
        type: new fields.StringField({ initial: "resource", choices: Object.fromEntries(
          Object.entries(this.EFFECTS).map(([key, { label }]) => [key, label]),
        ) }),
        target: new fields.StringField({ initial: "self", label: "HOLLOWS.EQUIPMENT.target", choices: {
          self: "HOLLOWS.EQUIPMENT.targets.self", chosen: "HOLLOWS.EQUIPMENT.targets.chosen",
          zone: "HOLLOWS.EQUIPMENT.targets.zone", close: "HOLLOWS.EQUIPMENT.targets.close",
          all: "HOLLOWS.EQUIPMENT.targets.all",
        } }),
        resource: new fields.StringField({ initial: "wounds", label: "HOLLOWS.EQUIPMENT.resource", choices: {
          wounds: "Wounds", resolve: "Resolve",
        } }),
        resourceMode: new fields.StringField({ initial: "heal", label: "HOLLOWS.EQUIPMENT.resourceMode", choices: {
          heal: "HOLLOWS.EQUIPMENT.resourceModes.heal", full: "HOLLOWS.EQUIPMENT.resourceModes.full",
          temporary: "HOLLOWS.EQUIPMENT.resourceModes.temporary", lose: "HOLLOWS.EQUIPMENT.resourceModes.lose",
        } }),
        amount: new fields.NumberField({ initial: 1, min: 1, integer: true, label: "HOLLOWS.EQUIPMENT.amount" }),
        weaponTypes: new fields.SetField(new fields.StringField(), { label: "HOLLOWS.EQUIPMENT.weaponTypes" }),
        full: new fields.BooleanField({ initial: false, label: "HOLLOWS.EQUIPMENT.fullCapacity" }),
        resolve: new fields.NumberField({ initial: 0, integer: true, label: "HOLLOWS.EQUIPMENT.resolveDamage" }),
        wounds: new fields.NumberField({ initial: 0, integer: true, label: "HOLLOWS.EQUIPMENT.woundDamage" }),
        condition: new fields.StringField({ initial: "sheltered", label: "HOLLOWS.EQUIPMENT.condition", choices: Object.fromEntries(
          ["focus", "elevated", "sheltered"].map(key => [key, HOLLOWS_CONDITIONS[key].label]),
        ) }),
        conditionMode: new fields.StringField({ initial: "add", label: "HOLLOWS.EQUIPMENT.conditionMode", choices: {
          add: "HOLLOWS.EQUIPMENT.addCondition", remove: "HOLLOWS.EQUIPMENT.removeCondition",
        } }),
        freeTerrain: new fields.BooleanField({ initial: false, label: "HOLLOWS.EQUIPMENT.freeTerrain" }),
        threatMode: new fields.StringField({ initial: "remove", label: "HOLLOWS.EQUIPMENT.threatMode", choices: {
          remove: "HOLLOWS.EQUIPMENT.threatModes.remove", towards: "HOLLOWS.EQUIPMENT.threatModes.towards",
        } }),
        multiplier: new fields.NumberField({ initial: 0.5, min: 0, label: "HOLLOWS.EQUIPMENT.multiplier" }),
        direction: new fields.StringField({ initial: "choose", label: "HOLLOWS.EQUIPMENT.direction", choices: {
          choose: "HOLLOWS.EQUIPMENT.chooseDirection", towards: "HOLLOWS.EQUIPMENT.towards", away: "HOLLOWS.EQUIPMENT.away",
        } }),
      })),
    };
  }

  /** Reactions and combat-start effects have no manual Use button. */
  get hasManualUse() {
    return (this.category === "battle") && (this.trigger === "onUse");
  }
}
