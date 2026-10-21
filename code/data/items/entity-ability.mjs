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
