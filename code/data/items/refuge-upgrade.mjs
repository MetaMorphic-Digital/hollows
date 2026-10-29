import HollowsItem from "../../documents/item.mjs";
import { NPC_ROLES } from "../refuge/resolvers.js";

export default class RefugeUpgradeData extends foundry.abstract.TypeDataModel {
  static ACTIONS = {
    fullRecovery: { label: "HOLLOWS.REFUGE.fullRecovery", group: "recover" },
    temporaryHealth: { label: "HOLLOWS.REFUGE.temporaryHealth", group: "recover" },
    rearm: { label: "HOLLOWS.REFUGE.rearm", group: "weapons" },
    reforge: { label: "HOLLOWS.REFUGE.reforge", group: "weapons" },
    removeEcho: { label: "HOLLOWS.REFUGE.removeEcho", group: "weapons" },
    reshape: { label: "HOLLOWS.REFUGE.reshape", group: "weapons" },
    renew: { label: "HOLLOWS.REFUGE.renewAction", group: "renewRevel" },
    revel: { label: "HOLLOWS.REFUGE.revelAction", group: "renewRevel" },
    uncoverEdge: { label: "HOLLOWS.REFUGE.uncoverEdge", group: "research" },
    craftAnchor: { label: "HOLLOWS.REFUGE.craftAnchor", group: "research" },
    openHeart: { label: "HOLLOWS.REFUGE.openHeart", group: "research" },
    closeHeart: { label: "HOLLOWS.REFUGE.closeHeart", group: "research" },
    essenceSyphon: { label: "HOLLOWS.REFUGE.essenceSyphon", group: "research" },
    resupply: { label: "HOLLOWS.REFUGE.resupply", group: "resupply" },
    unlockExploration: { label: "HOLLOWS.REFUGE.unlockExploration", group: "resupply" },
    unlockBattle: { label: "HOLLOWS.REFUGE.unlockBattle", group: "resupply" },
  };

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
      repeatable: new fields.BooleanField({ initial: false }),
      costIncrease: new fields.SchemaField({
        bone: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
        hearts: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
      }),
      requiredNpcRoles: new fields.SetField(new fields.StringField({
        choices: Object.fromEntries(NPC_ROLES.map(({ key, label }) => [key, label])),
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
      extraEquipmentSlots: new fields.SetField(new fields.StringField({ choices: {
        exploration: "HOLLOWS.EQUIPMENT.exploration", battle: "HOLLOWS.EQUIPMENT.battle",
      } })),
      hardTestOnInstall: new fields.BooleanField({ initial: false }),
      pending: new fields.BooleanField({ initial: false }),
      recoverOnEntry: new fields.BooleanField({ initial: false }),
      temporaryHealthBonus: new fields.SchemaField({
        resolve: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
        wounds: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
      }),
      healthBonus: new fields.SchemaField({
        resolve: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
        wounds: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
      }),
      renew: new fields.SchemaField({
        marks: new fields.NumberField({ initial: 3, integer: true, min: 1, max: 3 }),
        disadvantage: new fields.BooleanField({ initial: false }),
      }),
      revel: new fields.SchemaField({
        additionalEchoes: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
        advantage: new fields.BooleanField({ initial: false }),
      }),
      echoRollModifier: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
      research: new fields.SchemaField({
        advantage: new fields.BooleanField({ initial: false }),
        anyStat: new fields.BooleanField({ initial: false }),
      }),
      actions: new fields.ArrayField(new fields.SchemaField({
        type: new fields.StringField({
          initial: "fullRecovery",
          choices: Object.fromEntries(Object.entries(this.ACTIONS).map(([type, { label }]) => [type, label])),
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

  /** @inheritdoc */
  _onCreate(data, options, userId) {
    super._onCreate(data, options, userId);
    if (this.parent.actor?.type === "refuge") this.parent.actor.system.refreshHunters();
  }

  /** @inheritdoc */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    if (this.parent.actor?.type === "refuge") this.parent.actor.system.refreshHunters();
  }

  /** @inheritdoc */
  _onDelete(options, userId) {
    super._onDelete(options, userId);
    if (this.parent.actor?.type === "refuge") this.parent.actor.system.refreshHunters();
  }

  /** Price of the next copy, including purchases awaiting installation. */
  getPurchaseCost(refuge) {
    const source = HollowsItem.getSourceUuid(this.parent);
    const copies = this.repeatable ? refuge.system.upgradeItems
      .filter(item => HollowsItem.getSourceUuid(item) === source).length : 0;
    return {
      bone: this.cost.bone + (copies * this.costIncrease.bone),
      hearts: this.cost.hearts + (copies * this.costIncrease.hearts),
    };
  }

  /** Minimum price before choosing payment, or the final price including the player's choices. */
  getActionCost(action, choice) {
    const cost = { ...action.cost };
    if ((action.type === "craftAnchor") && (!choice || choice.relicId)) cost.bone = 0;
    if (action.type === "uncoverEdge") cost.bone += choice?.bone ?? 0;
    return cost;
  }

  /** Whether this installed upgrade can provide its actions and benefits. */
  isAvailable(refuge) {
    return !this.pending && !this.getMissingRequirements(refuge).length;
  }

  /** Unmet operating requirements for an installed upgrade. */
  getMissingRequirements(refuge) {
    const missing = this.getMissingNpcRoles(refuge).map(key => game.i18n.localize(NPC_ROLES.find(role => role.key === key).label));
    if (this.requiresAnchoredEntity && !refuge.system.anchoredEntities.size) {
      missing.push(game.i18n.localize("HOLLOWS.REFUGE.anchoredEntity"));
    }
    const installed = new Set(refuge.system.upgradeItems.filter(item => !item.system.pending)
      .map(item => HollowsItem.getSourceUuid(item)));
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
      const sourceUuid = HollowsItem.getSourceUuid(item);
      return [sourceUuid, { uuid: item.uuid, sourceUuid, name: item.name }];
    }));
    return [...upgrades.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
}
