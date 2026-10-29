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
      requiredUpgrades: new fields.SetField(new fields.StringField()),
      requiresAnchoredEntity: new fields.BooleanField({ initial: false }),
      weaponTiers: new fields.SetField(new fields.NumberField({
        integer: true, choices: { 2: "Tier 2", 3: "Tier 3" },
      })),
      weaponDamage: new fields.SchemaField({
        types: new fields.SetField(new fields.StringField()),
        resolve: new fields.NumberField({ initial: 0, integer: true }),
        wounds: new fields.NumberField({ initial: 0, integer: true }),
      }),
      extraRelicSlot: new fields.BooleanField({ initial: false }),
      hardTestOnInstall: new fields.BooleanField({ initial: false }),
      pending: new fields.BooleanField({ initial: false }),
      recoverOnEntry: new fields.BooleanField({ initial: false }),
      temporaryHealthBonus: new fields.SchemaField({
        resolve: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
        wounds: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
      }),
      actions: new fields.ArrayField(new fields.SchemaField({
        type: new fields.StringField({
          initial: "fullRecovery",
          choices: {
            fullRecovery: "HOLLOWS.REFUGE.fullRecovery",
            temporaryHealth: "HOLLOWS.REFUGE.temporaryHealth",
            rearm: "HOLLOWS.REFUGE.rearm",
            reforge: "HOLLOWS.REFUGE.reforge",
            removeEcho: "HOLLOWS.REFUGE.removeEcho",
            reshape: "HOLLOWS.REFUGE.reshape",
          },
        }),
        cost: new fields.SchemaField({
          actions: new fields.NumberField({ initial: 1, integer: true, min: 0 }),
          bone: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
          hearts: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
        }),
        resolve: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
        wounds: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
      })),
    };
  }

  /** The template shared by an upgrade and its imported or installed copies. */
  static getSourceUuid(item) {
    return item.uuid.startsWith("Compendium.") ? item.uuid
      : item._stats.compendiumSource || item._stats.duplicateSource || item.uuid;
  }

  /** Whether this installed upgrade can provide its actions and benefits. */
  isAvailable(refuge) {
    return !this.pending && !this.getMissingRequirements(refuge).length;
  }

  /** Unmet operating requirements for an installed upgrade. */
  getMissingRequirements(refuge) {
    const roles = getRefugeNpcRoles();
    const missing = this.getMissingNpcRoles(refuge).map(key => roles.find(role => role.key === key).label);
    if (this.requiresAnchoredEntity && !refuge.system.anchoredEntity) {
      missing.push(game.i18n.localize("HOLLOWS.REFUGE.anchoredEntity"));
    }
    const installed = new Set(refuge.system.upgradeItems.filter(item => !item.system.pending)
      .map(item => RefugeUpgradeData.getSourceUuid(item)));
    for (const uuid of this.requiredUpgrades) {
      if (!installed.has(uuid)) missing.push(fromUuidSync(uuid)?.name || uuid);
    }
    return missing;
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
   * @returns {Promise<{uuid: string, sourceUuid: string, name: string}[]>}
   */
  static async getAvailableUpgrades({ defaultsOnly = false } = {}) {
    const packs = game.packs.filter(pack => (pack.documentName === "Item") && pack.visible);
    const indexes = await Promise.all(packs.map(pack => pack.getIndex({ fields: ["type", "system.default"] })));
    const items = [...game.items.filter(item => item.visible), ...indexes.flatMap(index => index.contents)]
      .filter(item => (item.type === "refugeUpgrade") && (!defaultsOnly || item.system?.default));
    const upgrades = new Map(items.map(item => {
      const sourceUuid = this.getSourceUuid(item);
      return [sourceUuid, { uuid: item.uuid, sourceUuid, name: item.name }];
    }));
    return [...upgrades.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
}
