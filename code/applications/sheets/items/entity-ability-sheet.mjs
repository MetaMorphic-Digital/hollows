import { ENTITY_ACTION_CHOICES } from "../../../data/entity/action-schema.js";
import EntityAbilityData from "../../../data/items/entity-ability.mjs";
import { ZONE_GROUPS } from "../../../data/gameplay-constants.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

const ENTITY_ZONES = ["Support", ...ZONE_GROUPS.ranged, ...ZONE_GROUPS.close];

/**
 * Entity ability builder over the nested Phase 4 action schema.
 *
 * Uses the shared item-sheet markup (hollows-form-row / stat-label / checkbox-group) so it
 * matches the other sheets; selects render from ENTITY_ACTION_CHOICES.
 */
export default class HollowsEntityAbilitySheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["hollows", "sheet", "item", "entity-ability", "builder"],
    position: { width: 620, height: 760 },
    window: { resizable: true, contentClasses: ["hollows-sheet"] },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      setMode: async function(event, target) {
        const mode = target?.dataset?.mode;
        if (!mode) return;
        await this.document.update({ "system.builderMode": mode });
      },
      addGroup: async function(event, target) {
        const path = target?.dataset?.groupPath;
        if (!path) return;
        const groups = foundry.utils.deepClone(foundry.utils.getProperty(this.item.system, `${path}.groups`) || []);
        groups.push(this.item.system.createGroup(path));
        await this._writeArrayField(`system.${path}.groups`, groups);
      },
      removeGroup: async function(event, target) {
        const path = target?.dataset?.groupPath;
        const index = Number(target?.dataset?.index);
        if (!path || Number.isNaN(index)) return;
        const groups = foundry.utils.deepClone(foundry.utils.getProperty(this.item.system, `${path}.groups`) || []);
        groups.splice(index, 1);
        if (!groups.length && path !== "followUp") groups.push(this.item.system.createGroup(path));
        await this._writeArrayField(`system.${path}.groups`, groups);
      },
      addCondition: async function(event, target) {
        const path = target?.dataset?.conditionPath;
        if (!path) return;
        const conditions = foundry.utils.deepClone(foundry.utils.getProperty(this.document, path) || []);
        conditions.push(EntityAbilityData.createCondition(path, conditions));
        await this._writeArrayField(path, conditions);
      },
      removeCondition: async function(event, target) {
        const path = target?.dataset?.conditionPath;
        const index = Number(target?.dataset?.index);
        if (!path || Number.isNaN(index)) return;
        const conditions = foundry.utils.deepClone(foundry.utils.getProperty(this.document, path) || []);
        conditions.splice(index, 1);
        if (!conditions.length) conditions.push(EntityAbilityData.createCondition(path));
        await this._writeArrayField(path, conditions);
      },
    },
  };

  static PARTS = {
    sheet: {
      template: "systems/hollows/templates/item/entity-ability-sheet.html",
      scrollable: [""],
      root: true,
    },
  };

  /** @inheritdoc */
  get title() {
    return this.item?.name ?? "Entity Ability";
  }

  /** @inheritdoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.item.system;
    const isAttackAction = system.profile?.actionType === "attack";
    const isWhenBrokenKind = system.kind === "whenBroken";
    const specialTriggerTargetMode = String(system.special?.trigger?.targetMode || "eventTarget");
    return {
      ...context,
      item: this.item,
      system,
      choices: ENTITY_ACTION_CHOICES,
      triggeredAbilityChoices: system.triggeredAbilityChoices,
      zoneList: ENTITY_ZONES,
      profileZones: isAttackAction ? ENTITY_ZONES.filter((z) => z !== "Support") : ENTITY_ZONES,
      targetModeChoices: system.targetModeChoices,
      showProfileAdjacentTargeting: String(system.profile?.targetMode || "") === "adjacentZones",
      followUpGroups: system.followUpGroupContexts,
      isActionKind: ["attack", "interrupt", "manoeuvre"].includes(system.kind),
      isSpecialKind: ["special", "doom", "whenBroken"].includes(system.kind),
      specialSectionTitle: isWhenBrokenKind ? "When Broken" : system.kind === "doom" ? "Doom" : "Special",
      showSpecialRuntimeConfig: !isWhenBrokenKind,
      showTriggeredEffectConfig: isWhenBrokenKind || system.special?.type === "triggeredEffect",
      showSpecialTriggerGate: !isWhenBrokenKind,
      showSpecialTriggerZones: ["multiZone", "allInSelectedZones"].includes(specialTriggerTargetMode),
      passiveGroups: system.passiveGroupContexts,
      isThresholdEvent: ["entityCurseThreshold", "hunterCurseThreshold"].includes(system.special?.trigger?.event),
      editable: this.isEditable,
    };
  }

  /** Inputs inside group arrays carry no name; they are written here instead of submitted. */
  _onChangeForm(formConfig, event) {
    const input = event.target;
    const arrayPath = input.dataset.arrayPath;
    if (arrayPath) {
      const values = Array.from(this.element.querySelectorAll(`.array-toggle[data-array-path="${arrayPath}"]:checked`))
        .map((checkbox) => checkbox.dataset.value);
      return this._writeArrayField(arrayPath, values);
    }
    const fieldPath = input.dataset.fieldPath;
    if (!fieldPath) return super._onChangeForm(formConfig, event);
    const value = input.type === "checkbox" ? input.checked
      : input.type === "number" ? (Number(input.value) || 0)
        : String(input.value ?? "");
    return this._writeArrayField(fieldPath, value);
  }

  /** Foundry cannot merge array updates by index, so the outermost array is rewritten whole. */
  async _writeArrayField(path, value) {
    const m = path.match(/^(.*?\.(?:groups|conditions|applyIfConditions))\.(\d+)\.(.+)$/);
    if (!m) {
      await this.document.update({ [path]: value });
      return;
    }
    const [, arrayPath, index, subpath] = m;
    const array = foundry.utils.deepClone(foundry.utils.getProperty(this.document, arrayPath) || []);
    if (!array[Number(index)]) return;
    foundry.utils.setProperty(array[Number(index)], subpath, value);
    await this.document.update({ [arrayPath]: array });
  }
}
