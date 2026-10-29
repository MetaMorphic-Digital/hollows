import RefugeData from "./refuge.mjs";
import { STAT_LABELS } from "../system-constants.js";
import { getPrimaryRefugeActor } from "../refuge/resolvers.js";
import { getHunterEquipmentItemsForSlot } from "../../documents/actor/hunter-equipment.js";

export default class HunterData extends foundry.abstract.TypeDataModel {
  static #resourceLimitModifiers = [];

  /** Register a modifier for maximum Focus, Resolve or Wounds. */
  static registerResourceLimitModifier(modifier) {
    this.#resourceLimitModifiers.push(modifier);
  }

  /** Apply the hunter's resource limit modifiers to the base maximum. */
  static getResourceLimit(actor, resource, value) {
    return this.#resourceLimitModifiers.reduce((limit, modifier) => modifier(actor, resource, limit), value);
  }

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
      refuge: new fields.SchemaField({
        id: new fields.StringField({ initial: "" }),
        heart: new fields.SchemaField({
          state: new fields.StringField({ initial: "none", choices: ["none", "open", "closed"] }),
          hollowId: new fields.StringField({ initial: "" }),
        }),
        renewals: new fields.ArrayField(new fields.SchemaField({
          hollowId: new fields.StringField(),
          stat: new fields.StringField({ choices: ["none", ...Object.keys(STAT_LABELS)] }),
        })),
        revelEchoes: new fields.ArrayField(new fields.SchemaField({
          hollowId: new fields.StringField(), echoId: new fields.StringField(),
        })),
        installationTests: new fields.ArrayField(new fields.SchemaField({
          id: new fields.StringField(), name: new fields.StringField(),
        })),
        recoveryAvailable: new fields.BooleanField({ initial: false }),
        actions: new fields.SchemaField({
          value: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
          max: new fields.NumberField({ initial: 1, integer: true, min: 0 }),
        }),
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

  /** Report a conflict between the Relic and Battle Equipment slots. */
  validateEquipmentSlot(slot) {
    if (!["battle", "relic"].includes(slot)) return true;
    const refuge = getPrimaryRefugeActor();
    if (refuge?.system.upgradeItems.some(item => item.system.extraRelicSlot && item.system.isAvailable(refuge))) return true;
    const otherSlot = slot === "battle" ? "relic" : "battle";
    if (!getHunterEquipmentItemsForSlot(this.parent, otherSlot).length) return true;
    ui.notifications.warn(game.i18n.localize("HOLLOWS.REFUGE.sharedBattleSlot"));
    return false;
  }

  /** Restore the action allowance when starting a new visit. */
  async enterRefuge(refuge) {
    if (this.refuge.id === refuge.id) return false;
    await refuge.system.activateUpgrades();
    await this.parent.update({
      "system.refuge.id": refuge.id,
      "system.refuge.actions.value": this.refuge.actions.max,
      "system.refuge.recoveryAvailable": refuge.system.upgradeItems.some(item =>
        item.system.recoverOnEntry && item.system.isAvailable(refuge)),
    });
    return true;
  }

  /** Temporary Renew increases still in effect for this stat. */
  getRenewBonus(stat) {
    return this.refuge.renewals.filter(renewal => renewal.stat === stat).length;
  }

  /** The Hunter's contribution when determining Entity Enhancements. */
  get enhancementWeight() {
    if (this.refuge.heart.state === "closed") return 0;
    if ((this.refuge.heart.state === "open") || this.parent.items.some(item => (item.type === "relic") && item.system.anchor.enabled)) return 2;
    return 1;
  }

  /** Death ends temporary Renew and Heart effects, retaining Renew usage. */
  async clearDeathBenefits() {
    if ((this.refuge.heart.state === "none") && !this.refuge.renewals.some(renewal => renewal.stat !== "none")) return;
    await this.parent.update({
      "system.refuge.renewals": this.refuge.renewals.map(renewal => ({ ...renewal, stat: "none" })),
      "system.refuge.heart": { state: "none", hollowId: "" },
    });
  }

  /** End temporary effects belonging to a cleansed Hollow. */
  async clearHollowBenefits(hollowId) {
    const { renewals, revelEchoes } = this.refuge;
    const clearHeart = this.refuge.heart.hollowId === hollowId;
    if (!clearHeart && ![...renewals, ...revelEchoes].some(entry => entry.hollowId === hollowId)) return;
    const remainingEchoes = revelEchoes.filter(entry => entry.hollowId !== hollowId);
    const updates = revelEchoes.filter(entry => (entry.hollowId === hollowId)
      && !remainingEchoes.some(other => other.echoId === entry.echoId))
      .map(entry => this.parent.items.get(entry.echoId)).filter(Boolean)
      .map(echo => ({ _id: echo.id, "system.state": [...echo.system.state].filter(state => state !== "suppressed") }));
    if (updates.length) await this.parent.updateEmbeddedDocuments("Item", updates);
    await this.parent.update({
      "system.refuge.renewals": renewals.filter(entry => entry.hollowId !== hollowId),
      "system.refuge.revelEchoes": remainingEchoes,
      ...(clearHeart ? { "system.refuge.heart": { state: "none", hollowId: "" } } : {}),
    });
  }

  /** @inheritdoc */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    if (("name" in changed) || ("img" in changed) || foundry.utils.hasProperty(changed, "system.refuge")) {
      RefugeData.renderSheets();
    }
  }

  /** @inheritdoc */
  _onDelete(options, userId) {
    super._onDelete(options, userId);
    RefugeData.renderSheets();
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
      const healthBonus = weapon.system.health_bonus;
      resolveBonus += healthBonus.resolve || 0;
      woundsBonus += healthBonus.wounds || 0;
    }

    const benefits = getPrimaryRefugeActor()?.system.benefits;
    resolveBonus += Math.max(0, Math.min(benefits?.resolve ?? 0, 10 - resolveBonus));
    woundsBonus += Math.max(0, Math.min(benefits?.wounds ?? 0, 10 - woundsBonus));

    const penalty = this.parent.getFlag("hollows", "battleMaxPenalty") || {};
    this.health.resolve.max = Math.max(0, HunterData.getResourceLimit(this.parent, "resolve", resolveBonus) - (Number(penalty.resolve) || 0));
    this.health.wounds.max = Math.max(0, HunterData.getResourceLimit(this.parent, "wounds", woundsBonus) - (Number(penalty.wounds) || 0));
  }
}
