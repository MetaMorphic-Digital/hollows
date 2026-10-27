import { getRefugeNpcRoles } from "../refuge/action-handlers.js";

export default class RefugeUpgradeData extends foundry.abstract.TypeDataModel {
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      text: new fields.StringField({ initial: "" }),
      default: new fields.BooleanField({ initial: false }),
      category: new fields.StringField({
        initial: "recover",
        choices: {
          recover: "HOLLOWS.REFUGE.categories.recover",
          rearm: "HOLLOWS.REFUGE.categories.rearm",
          reforge: "HOLLOWS.REFUGE.categories.reforge",
          renew: "HOLLOWS.REFUGE.categories.renew",
          research: "HOLLOWS.REFUGE.categories.research",
          resupply: "HOLLOWS.REFUGE.categories.resupply",
          revel: "HOLLOWS.REFUGE.categories.revel",
        },
      }),
      cost: new fields.SchemaField({
        bone: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
        hearts: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
      }),
      requiredNpcRoles: new fields.SetField(new fields.StringField({
        choices: Object.fromEntries(getRefugeNpcRoles().map(({ key, label }) => [key, label])),
      })),
      actions: new fields.SetField(new fields.StringField({
        choices: { fullRecovery: "HOLLOWS.REFUGE.fullRecovery" },
      })),
    };
  }

  /** Return required roles without an assigned NPC living in this Refuge. */
  getMissingNpcRoles(refuge) {
    return [...this.requiredNpcRoles].filter(role => {
      const id = refuge.system.npcRoles[role];
      const npc = game.actors.get(id);
      return !refuge.system.residents.includes(id) || !npc?.system.inRefuge;
    });
  }

  /**
   * List upgrade templates from the world and visible Item compendiums.
   * @param {object} [options]
   * @param {boolean} [options.defaultsOnly=false] Include only starting upgrades.
   * @returns {Promise<{uuid: string, name: string}[]>}
   */
  static async getAvailableUpgrades({ defaultsOnly = false } = {}) {
    const packs = game.packs.filter(pack => (pack.documentName === "Item") && pack.visible);
    const indexes = await Promise.all(packs.map(pack => pack.getIndex({ fields: ["type", "system.default"] })));
    return [...game.items.filter(item => item.visible), ...indexes.flatMap(index => index.contents)]
      .filter(item => (item.type === "refugeUpgrade") && (!defaultsOnly || item.system?.default))
      .map(item => ({ uuid: item.uuid, name: item.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}
