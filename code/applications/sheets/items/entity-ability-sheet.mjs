import {
  createAfterAttackGroupConfig,
  createBeforeAttackGroupConfig,
  createFollowUpGroupConfig,
  createModifyIfGroupConfig,
  ENTITY_ACTION_CHOICES,
  PASSIVE_CONDITION_GROUPS,
} from "../../../data/entity/action-schema.js";
import { ZONE_GROUPS } from "../../../data/gameplay-constants.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

const ENTITY_ZONES = ["Support", ...ZONE_GROUPS.ranged, ...ZONE_GROUPS.close];

function targetModeChoicesForActionType(actionType) {
  return String(actionType || "attack") === "other"
    ? ENTITY_ACTION_CHOICES.targetMode
    : {
      single: ENTITY_ACTION_CHOICES.targetMode.single,
      zone: ENTITY_ACTION_CHOICES.targetMode.zone,
      multiZone: ENTITY_ACTION_CHOICES.targetMode.multiZone,
      adjacentZones: ENTITY_ACTION_CHOICES.targetMode.adjacentZones,
    };
}

function followUpTargetModeChoicesForActionType(actionType) {
  const choices = {
    sameTarget: ENTITY_ACTION_CHOICES.followUpTargetMode.sameTarget,
    single: ENTITY_ACTION_CHOICES.followUpTargetMode.single,
    multiZone: ENTITY_ACTION_CHOICES.followUpTargetMode.multiZone,
  };
  if (String(actionType || "attack") === "other") choices.noTargets = ENTITY_ACTION_CHOICES.followUpTargetMode.noTargets;
  return choices;
}

function buildFollowUpGroupContexts(groups = []) {
  return (Array.isArray(groups) ? groups : []).map((group, index) => {
    const targetMode = String(group?.targetMode || "single");
    const targetAreas = Array.isArray(group?.targetAreas) ? group.targetAreas : [];
    return {
      group,
      index,
      displayIndex: index + 1,
      showTrigger: index > 0,
      afterAttackPath: `followUp.groups.${index}.afterAttack`,
      targetModeChoices: followUpTargetModeChoicesForActionType(group?.profile?.actionType),
      showTargetArea: !["sameTarget", "noTargets"].includes(targetMode),
      showAdjacentMode: targetAreas.includes("adjacentClose") || targetAreas.includes("adjacentRanged"),
      showAfterAttack: ["attack", "test"].includes(String(group?.profile?.actionType || "attack")),
    };
  });
}

function createGroupForPath(path, system) {
  if (path === "beforeAttack") return createBeforeAttackGroupConfig();
  if (path === "modifyIf") return createModifyIfGroupConfig();
  if (path === "followUp") return createFollowUpGroupConfig();
  if (path === "afterAttack") return createAfterAttackGroupConfig();
  if (path === "special.trigger.afterAttack") return createAfterAttackGroupConfig("always");
  const followUpAfterAttackMatch = path.match(/^followUp\.groups\.(\d+)\.afterAttack$/);
  if (followUpAfterAttackMatch) {
    const group = system?.followUp?.groups?.[Number(followUpAfterAttackMatch[1])];
    const defaultApplyIf = String(group?.profile?.actionType || "attack") === "test" ? "successAny" : "anyDamageDealt";
    return createAfterAttackGroupConfig(defaultApplyIf);
  }
  if (path.endsWith(".afterAttack")) return createAfterAttackGroupConfig();
  return {};
}

function createConditionForPath(path, conditions = []) {
  const previous = conditions.at(-1)?.condition;
  const key = String(path || "");
  const fallback = key.endsWith(".applyIfConditions")
    ? (key.includes("beforeAttack") ? "always" : "anyDamageDealt")
    : "targetHasTerrain";
  return { condition: previous || fallback };
}

function buildTriggeredAbilityChoices(item) {
  const choices = { "": "Choose Ability" };
  const actor = item?.parent;
  if (!actor?.items) return choices;
  const abilities = actor.items
    .filter((entry) => entry.type === "entity-ability" && ["attack", "interrupt"].includes(String(entry.system?.kind || "")))
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  for (const ability of abilities) {
    const kind = String(ability.system?.kind || "");
    choices[ability.id] = `${ability.name || "Entity Ability"} (${kind === "interrupt" ? "Interrupt" : "Attack"})`;
  }
  return choices;
}

/** Only these field changes flip section visibility; everything else patches silently. */
const RERENDER_FIELDS = new Set([
  "system.kind",
  "system.cost.type",
  "system.profile.actionType",
  "system.profile.targetMode",
  "system.profile.tnMode",
  "system.profile.damageMode",
  "system.restoreResolve.mode",
  "system.restoreResolve.dynamicSource",
  "system.special.type",
  "system.special.passive.condition",
  "system.special.passive.type",
  "system.special.passive.amountMode",
  "system.special.passive.amountSource",
  "system.special.passive.amountScope",
  "system.special.use.mode",
  "system.special.use.amountSuccessMode",
  "system.special.use.amountFailureMode",
  "system.special.trigger.event",
  "system.special.trigger.effectType",
  "system.special.trigger.targetMode",
  "system.special.trigger.abilitySource",
]);

/**
 * Entity ability builder over the nested Phase 4 action schema.
 *
 * Uses the shared item-sheet markup (hollows-form-row / stat-label / checkbox-group) so it
 * matches the other sheets; selects render from ENTITY_ACTION_CHOICES. Re-renders only
 * when a change flips visibility, and preserves scroll position across those renders.
 */
export default class HollowsEntityAbilitySheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["hollows", "sheet", "item", "entity-ability", "builder"],
    position: { width: 620, height: 760 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      setMode: async function(event, target) {
        const mode = target?.dataset?.mode;
        if (!mode) return;
        this._captureScroll();
        await this.document.update({ "system.builderMode": mode });
      },
      addGroup: async function(event, target) {
        const path = target?.dataset?.groupPath;
        if (!path) return;
        const groups = foundry.utils.deepClone(foundry.utils.getProperty(this.item.system, `${path}.groups`) || []);
        groups.push(createGroupForPath(path, this.item.system));
        this._captureScroll();
        await this._writeField(`system.${path}.groups`, groups, true);
      },
      removeGroup: async function(event, target) {
        const path = target?.dataset?.groupPath;
        const index = Number(target?.dataset?.index);
        if (!path || Number.isNaN(index)) return;
        const groups = foundry.utils.deepClone(foundry.utils.getProperty(this.item.system, `${path}.groups`) || []);
        groups.splice(index, 1);
        if (!groups.length && path !== "followUp") groups.push(createGroupForPath(path, this.item.system));
        this._captureScroll();
        await this._writeField(`system.${path}.groups`, groups, true);
      },
      addCondition: async function(event, target) {
        const path = target?.dataset?.conditionPath;
        if (!path) return;
        const conditions = foundry.utils.deepClone(foundry.utils.getProperty(this.document, path) || []);
        conditions.push(createConditionForPath(path, conditions));
        this._captureScroll();
        await this._writeField(path, conditions, true);
      },
      removeCondition: async function(event, target) {
        const path = target?.dataset?.conditionPath;
        const index = Number(target?.dataset?.index);
        if (!path || Number.isNaN(index)) return;
        const conditions = foundry.utils.deepClone(foundry.utils.getProperty(this.document, path) || []);
        conditions.splice(index, 1);
        if (!conditions.length) conditions.push(createConditionForPath(path));
        this._captureScroll();
        await this._writeField(path, conditions, true);
      },
    },
  };

  static PARTS = {
    sheet: {
      template: "systems/hollows/templates/item/entity-ability-sheet.html",
      root: true,
    },
  };

  get title() {
    return this.item?.name ?? "Entity Ability";
  }

  _captureScroll() {
    this._scrollTop = this.element?.querySelector(".window-content")?.scrollTop ?? 0;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.item.system;
    const isAttackAction = system.profile?.actionType === "attack";
    const isWhenBrokenKind = system.kind === "whenBroken";
    const targetModeChoices = targetModeChoicesForActionType(system.profile?.actionType);
    const specialTriggerTargetMode = String(system.special?.trigger?.targetMode || "eventTarget");
    return {
      ...context,
      item: this.item,
      system,
      choices: ENTITY_ACTION_CHOICES,
      triggeredAbilityChoices: buildTriggeredAbilityChoices(this.item),
      zoneList: ENTITY_ZONES,
      profileZones: isAttackAction ? ENTITY_ZONES.filter((z) => z !== "Support") : ENTITY_ZONES,
      targetModeChoices,
      showProfileAdjacentTargeting: String(system.profile?.targetMode || "") === "adjacentZones",
      followUpGroups: buildFollowUpGroupContexts(system.followUp?.groups),
      isActionKind: ["attack", "interrupt", "manoeuvre"].includes(system.kind),
      isSpecialKind: ["special", "doom", "whenBroken"].includes(system.kind),
      specialSectionTitle: isWhenBrokenKind ? "When Broken" : system.kind === "doom" ? "Doom" : "Special",
      showSpecialRuntimeConfig: !isWhenBrokenKind,
      showTriggeredEffectConfig: isWhenBrokenKind || system.special?.type === "triggeredEffect",
      showSpecialTriggerGate: !isWhenBrokenKind,
      showSpecialTriggerZones: ["multiZone", "allInSelectedZones"].includes(specialTriggerTargetMode),
      passiveConditionGroups: PASSIVE_CONDITION_GROUPS,
      isPassiveThreshold: ["entityCurseThreshold", "targetCurseThreshold", "zoneThreatThreshold", "entityTerrainThreshold"].includes(system.special?.passive?.condition),
      isDamagePassive: ["damageTaken", "attackDamage", "interruptDamage"].includes(system.special?.passive?.type),
      isDefencePassive: system.special?.passive?.type === "modifyDefences",
      isThresholdEvent: ["entityCurseThreshold", "hunterCurseThreshold"].includes(system.special?.trigger?.event),
      editable: this.isEditable,
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const wc = this.element.querySelector(".window-content");
    wc?.classList.add("hollows-sheet");
    if (wc && this._scrollTop) {
      wc.scrollTop = this._scrollTop;
      this._scrollTop = 0;
    }
  }

  async _onChangeForm(formConfig, event) {
    const input = event?.target;

    // Generic checkbox-array field (zones, conditions) keyed by its target path.
    if (input?.classList?.contains("array-toggle")) {
      event.preventDefault();
      event.stopPropagation();
      const path = input.dataset.arrayPath;
      if (!path) return;
      const values = Array.from(this.element.querySelectorAll(`.array-toggle[data-array-path="${path}"]:checked`))
        .map((cb) => cb.dataset.value)
        .filter(Boolean);
      const render = /^system\.followUp\.groups\.\d+\.targetAreas$/.test(path);
      if (render) this._captureScroll();
      await this._writeField(path, values, render);
      return;
    }

    const name = String(input?.name ?? "");
    if (name !== "name" && !name.startsWith("system.")) {
      return super._onChangeForm(formConfig, event);
    }
    event.preventDefault();
    event.stopPropagation();
    const value = input.type === "checkbox" ? input.checked
      : input.type === "number" ? (Number(input.value) || 0)
        : String(input.value ?? "");

    const render = RERENDER_FIELDS.has(name) || name.endsWith(".enabled")
      || /^system\.followUp\.groups\.\d+\.(profile\.actionType|targetMode|profile\.tnMode|profile\.damageMode)$/.test(name);
    if (render) this._captureScroll();
    if (name === "system.profile.actionType" && value !== "other" && this.item.system.profile?.targetMode === "noTargets") {
      await this.document.update({ [name]: value, "system.profile.targetMode": "single" }, { render });
      return;
    }
    const followUpActionMatch = name.match(/^system\.followUp\.groups\.(\d+)\.profile\.actionType$/);
    if (followUpActionMatch && value !== "other") {
      const index = Number(followUpActionMatch[1]);
      const groups = foundry.utils.deepClone(this.item.system.followUp?.groups || []);
      const group = groups[index];
      if (group?.targetMode === "noTargets") {
        foundry.utils.setProperty(group, "profile.actionType", value);
        group.targetMode = "single";
        await this.document.update({ "system.followUp.groups": groups }, { render });
        return;
      }
    }
    await this._writeField(name, value, render);
  }

  /**
   * Persist a single field. Array-element paths (`groups.N.subpath`,
   * `conditions.N.subpath`) must rebuild the whole array: Foundry does not
   * reliably merge array updates by index, so we clone the array, set the nested
   * value, and write the array back (same approach as addGroup / array toggles).
   *
   * The match is non-greedy so it anchors on the OUTERMOST `groups` array. Nested
   * arrays (e.g. `followUp.groups.N.afterAttack.groups.M.field`) then collapse into
   * a subpath applied within the cloned outer element, and the write targets the
   * outer array only; never a key that itself contains an array index.
   */
  async _writeField(name, value, render = false) {
    const m = name.match(/^(.*?\.(?:groups|conditions|applyIfConditions))\.(\d+)\.(.+)$/);
    if (m) {
      const arrayPath = m[1];
      const idx = Number(m[2]);
      const arr = foundry.utils.deepClone(foundry.utils.getProperty(this.document, arrayPath) || []);
      if (!arr[idx]) return;
      foundry.utils.setProperty(arr[idx], m[3], value);
      await this.document.update({ [arrayPath]: arr }, { render });
      return;
    }
    await this.document.update({ [name]: value }, { render });
  }
}
