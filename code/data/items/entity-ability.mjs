import {
  createAfterAttackGroupConfig,
  createBeforeAttackGroupConfig,
  createFollowUpGroupConfig,
  createModifyIfGroupConfig,
  createPassiveGroupConfig,
  ENTITY_ACTION_CHOICES,
  entityAbilityFields,
} from "../entity/action-schema.js";

export default class EntityAbilityData extends foundry.abstract.TypeDataModel {
  /** @inheritdoc */
  static defineSchema() {
    return entityAbilityFields();
  }

  /* -------------------------------------------------- */

  /** `special.passive` was a single modifier before it became a group list. */
  static migrateData(source, options) {
    const passive = source.special?.passive;
    if (passive && !Array.isArray(passive.groups)) source.special.passive = { groups: [passive] };
    return super.migrateData(source, options);
  }

  /* -------------------------------------------------- */

  /** Only "other" actions may skip targets. */
  static _cleanData(data, options, _state) {
    const targeted = (profile) => profile?.actionType && (profile.actionType !== "other");
    if (targeted(data?.profile) && (data.profile.targetMode === "noTargets")) data.profile.targetMode = "single";
    for (const group of data?.followUp?.groups ?? []) {
      if (targeted(group?.profile) && (group.targetMode === "noTargets")) group.targetMode = "single";
    }
    return super._cleanData(data, options, _state);
  }

  /* -------------------------------------------------- */
  /*   Builder Contexts                                 */
  /* -------------------------------------------------- */

  /** Choices for the builder's Targeting select. */
  get targetModeChoices() {
    const C = ENTITY_ACTION_CHOICES.targetMode;
    if (String(this.profile.actionType || "attack") === "other") return C;
    return { single: C.single, zone: C.zone, multiZone: C.multiZone, adjacentZones: C.adjacentZones };
  }

  /* -------------------------------------------------- */

  /** Choices for a follow-up group's Targeting select. */
  static #followUpTargetModeChoices(actionType) {
    const C = ENTITY_ACTION_CHOICES.followUpTargetMode;
    const choices = { sameTarget: C.sameTarget, single: C.single, multiZone: C.multiZone };
    if (String(actionType || "attack") === "other") choices.noTargets = C.noTargets;
    return choices;
  }

  /* -------------------------------------------------- */

  /** Render data for the builder's follow-up section. */
  get followUpGroupContexts() {
    return this.followUp.groups.map((group, index) => {
      const targetMode = String(group?.targetMode || "single");
      const actionType = String(group?.profile?.actionType || "attack");
      const targetAreas = Array.isArray(group?.targetAreas) ? group.targetAreas : [];
      return {
        group,
        index,
        displayIndex: index + 1,
        showTrigger: index > 0,
        afterAttackPath: `followUp.groups.${index}.afterAttack`,
        targetModeChoices: EntityAbilityData.#followUpTargetModeChoices(actionType),
        applyIfChoices: actionType === "other" ? ENTITY_ACTION_CHOICES.beforeAttackIf : ENTITY_ACTION_CHOICES.applyIf,
        showTargetArea: !["sameTarget", "noTargets"].includes(targetMode),
        showAdjacentMode: targetAreas.includes("adjacentClose") || targetAreas.includes("adjacentRanged"),
        showAfterAttack: ["attack", "test", "other"].includes(actionType),
      };
    });
  }

  /* -------------------------------------------------- */

  /** Render data for the builder's passive-modifier section. */
  get passiveGroupContexts() {
    return this.special.passive.groups.map((group, index) => {
      const type = String(group?.type || "");
      const condition = String(group?.condition || "always");
      return {
        group,
        index,
        displayIndex: index + 1,
        isThreshold: ["entityCurseThreshold", "targetCurseThreshold", "zoneThreatThreshold", "entityTerrainThreshold"].includes(condition),
        isDamage: ["damageTaken", "attackDamage", "interruptDamage"].includes(type),
        isDefence: type === "modifyDefences",
      };
    });
  }

  /* -------------------------------------------------- */

  /** Choices for the builder's triggered-ability picker. */
  get triggeredAbilityChoices() {
    const choices = { "": "Choose Ability" };
    const abilities = (this.parent?.actor?.items ?? [])
      .filter((entry) => (entry.type === "entityAbility") && ["attack", "interrupt"].includes(String(entry.system?.kind || "")))
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    for (const ability of abilities) {
      const kind = String(ability.system?.kind || "");
      choices[ability.id] = `${ability.name || "Entity Ability"} (${kind === "interrupt" ? "Interrupt" : "Attack"})`;
    }
    return choices;
  }

  /* -------------------------------------------------- */
  /*   Builder Group Factories                          */
  /* -------------------------------------------------- */

  /** Default data for a new group, by section path such as "followUp" or "special.passive". */
  createGroup(path) {
    if (path === "beforeAttack") return createBeforeAttackGroupConfig();
    if (path === "modifyIf") return createModifyIfGroupConfig();
    if (path === "special.passive") return createPassiveGroupConfig();
    if (path === "followUp") return createFollowUpGroupConfig();
    if (path === "afterAttack") return createAfterAttackGroupConfig();
    if (path === "special.trigger.afterAttack") return createAfterAttackGroupConfig("always");
    const followUpAfterAttack = path.match(/^followUp\.groups\.(\d+)\.afterAttack$/);
    if (followUpAfterAttack) {
      const actionType = String(this.followUp.groups[Number(followUpAfterAttack[1])]?.profile?.actionType || "attack");
      return createAfterAttackGroupConfig({ test: "successAny", other: "always" }[actionType] || "anyDamageDealt");
    }
    if (path.endsWith(".afterAttack")) return createAfterAttackGroupConfig();
    return {};
  }

  /* -------------------------------------------------- */

  /** Default entry for a condition list, repeating the previous condition. */
  static createCondition(path, conditions = []) {
    const previous = conditions.at(-1)?.condition;
    const key = String(path || "");
    const fallback = key.endsWith(".applyIfConditions")
      ? (key.includes("beforeAttack") ? "always" : "anyDamageDealt")
      : "targetHasTerrain";
    return { condition: previous || fallback };
  }
}
