import { ENTITY_ACTION_CHOICES } from "../../data/entity/action-schema.js";
import { DEFENCE_LABELS, STAT_LABELS } from "../../data/system-constants.js";
import { ZONE_GROUPS } from "../../data/gameplay-constants.js";
import { EffectBuilderItemSheet } from "./shared/effect-builder.js";

const ENTITY_ZONES = ["Support", ...ZONE_GROUPS.ranged, ...ZONE_GROUPS.close];

const ENHANCEMENT_BUILDER_CHOICES = {
  ruleType: {
    triggeredEffect: "Triggered Effect",
    modifyEntityAbility: "Modify Entity Ability",
    modifyEntityStat: "Modify Entity Stat",
    generatedAbility: "Generated Ability"
  },
  stat: {
    close: DEFENCE_LABELS.close,
    ranged: DEFENCE_LABELS.ranged,
    wyrd: DEFENCE_LABELS.wyrd,
    resolveMax: "Maximum Resolve",
    woundsMax: "Maximum Wounds",
    threatPerRound: "Threat per Round",
    threatCap: "Maximum Threat"
  },
  amountMode: { fixed: "Fixed", dynamic: "Dynamic" },
  statAmountSource: { hunterCountOnGrid: "Hunters on Grid" },
  amountSource: {
    hunterCountOnGrid: "Hunters on Grid",
    damageValue: "Event Damage",
    targetZoneThreat: "Threat in Event Zone",
    targetCount: "Event Targets",
    entityResolve: "Current Entity Resolve",
    entityWounds: "Current Entity Wounds"
  },
  actionScope: { any: "All Matching Abilities", selectedAbility: "Chosen Ability" },
  actionKind: { attack: "Attack", interrupt: "Interrupt" },
  modifierTargetMode: { "": "No Change", zone: "Zone", adjacentZones: "Adjacent Zones" },
  generatedTargetMode: {
    "": "No Change",
    single: ENTITY_ACTION_CHOICES.targetMode.single,
    zone: ENTITY_ACTION_CHOICES.targetMode.zone,
    multiZone: ENTITY_ACTION_CHOICES.targetMode.multiZone,
    adjacentZones: ENTITY_ACTION_CHOICES.targetMode.adjacentZones,
    noTargets: ENTITY_ACTION_CHOICES.targetMode.noTargets
  },
  adjacentScope: ENTITY_ACTION_CHOICES.targetAdjacentScope,
  adjacentCount: ENTITY_ACTION_CHOICES.targetAdjacentCount,
  triggerHook: {
    beforeEntityAttack: "Before Entity Attack",
    afterHunterDamage: "After Hunter Damage",
    onEntityInflictsDamage: "Entity Inflicts Damage",
    onEntitySuffersWound: "Entity Suffers Wound",
    onEntityBroken: "Entity Broken",
    onEntityStartTurn: "Entity Start Turn",
    onAttackResolved: "Generated Attack Resolved"
  },
  triggerStage: { afterDamageApplied: "After Damage Applied", afterAfterAttackApply: "After Attack Effects" },
  damageType: { "": "Any Damage", Resolve: "Resolve", Wounds: "Wounds" },
  triggerCondition: { "": "No Extra Condition", hunterBreaks: "Hunter Breaks", noWoundDamage: "No Wound Damage" },
  effectOperation: {
    chat: "Chat Reminder",
    damageHuntersInZones: "Damage Hunters in Zones",
    destroyTerrain: "Destroy Target Terrain",
    promptShiftHunter: "Shift Event Hunter",
    damageEventHunter: "Damage Event Hunter",
    addThreatToEventZone: "Add Threat to Event Zone",
    entityResource: "Entity Resources",
    promptEntityResolveCost: "Prompt Entity Resolve Cost",
    runEntityAbilityAgainstEventHunter: "Run Ability Against Event Hunter",
    stagedBreakRepositionReminder: "Staged Break Reposition Reminder"
  },
  generatedMode: { template: "New Ability", cloneSelectedAbility: "Clone Chosen Ability", useExistingManoeuvre: "Use Existing Manoeuvre" }
};

const RERENDER_FIELD_SEGMENTS = new Set([
  "enabled",
  "mode",
  "operation",
  "hook",
  "scope",
  "targetMode",
  "actionType",
  "amountMode",
  "choice",
  "defenceStatFromSelected"
]);

const EFFECT_DEFAULTS = {
  chat: { text: "" },
  damageHuntersInZones: { zones: [], damage: { resolve: 0, wounds: 0 } },
  destroyTerrain: {},
  promptShiftHunter: { title: "Shift" },
  damageEventHunter: { damage: { resolve: 0, wounds: 1 } },
  addThreatToEventZone: { amount: 1 },
  entityResource: { amountMode: "fixed", amountSource: "hunterCountOnGrid", resolve: 0, wounds: 0, oncePerRound: false, onceKey: "", chatLabel: "" },
  promptEntityResolveCost: { amount: 2, title: "", prompt: "Apply extra Resolve cost?" },
  runEntityAbilityAgainstEventHunter: { title: "Counterattack" },
  stagedBreakRepositionReminder: {
    title: "Reposition",
    stateKey: "breakRepositionReminder",
    firstText: "Reposition all Hunters to adjacent Close or Ranged areas.",
    laterText: "Reposition only the Hunter who Broke the Entity to an adjacent Close or Ranged area."
  }
};

const EFFECTS_BY_HOOK = {
  beforeEntityAttack: ["chat", "entityResource", "promptEntityResolveCost"],
  afterHunterDamage: ["chat", "damageHuntersInZones", "damageEventHunter", "addThreatToEventZone", "promptShiftHunter", "destroyTerrain"],
  onEntityBroken: ["chat", "damageHuntersInZones", "entityResource", "runEntityAbilityAgainstEventHunter", "stagedBreakRepositionReminder"],
  onEntitySuffersWound: ["chat", "damageHuntersInZones", "entityResource"],
  onEntityInflictsDamage: ["chat", "entityResource"],
  onAttackResolved: ["chat", "entityResource"]
};

function buildEntityAbilityChoices(item) {
  const actor = item?.parent;
  if (!actor?.items) return { "": "Attach to an Entity" };
  const choices = { "": "Choose Ability" };
  const abilities = actor.items
    .filter((entry) => entry.type === "entity-ability" && ["attack", "interrupt"].includes(String(entry.system?.kind || "")))
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  for (const ability of abilities) {
    const kind = String(ability.system?.kind || "");
    choices[ability.id] = `${ability.name || "Entity Ability"} (${kind === "interrupt" ? "Interrupt" : "Attack"})`;
  }
  return choices;
}

function buildManoeuvreChoices(item) {
  const choices = { "basic:prowl": "Prowl", "basic:shrug": "Shrug Off", "basic:turn": "Turn Around" };
  const actor = item?.parent;
  if (!actor?.items) return choices;
  const manoeuvres = actor.items
    .filter((entry) => entry.type === "entity-ability" && String(entry.system?.kind || "") === "manoeuvre")
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  for (const ability of manoeuvres) {
    choices[`item:${ability.id}`] = ability.name || "Entity Manoeuvre";
  }
  return choices;
}

function createDefaultStatModifier() {
  return { stat: ["close"], amount: 0 };
}

function createDefaultActionModifier() {
  return {
    scope: "any",
    actionKind: ["attack"],
    damage: { resolve: 0, wounds: 0 },
    cost: { threat: 0 },
    tn: 0,
    targetMode: "",
    adjacentScope: "any",
    adjacentCount: "one"
  };
}

function defaultTriggerForHook(hook) {
  const key = String(hook || "");
  return {
    hook: key || "afterHunterDamage",
    ...(key === "afterHunterDamage" ? { stage: "afterDamageApplied", damageType: "Resolve" } : {}),
    effects: [key === "beforeEntityAttack"
      ? createDefaultEffect("promptEntityResolveCost")
      : createDefaultEffect("chat")]
  };
}

function createDefaultEffect(operation = "chat") {
  const key = EFFECT_DEFAULTS[operation] ? operation : "chat";
  return { operation: key, ...foundry.utils.deepClone(EFFECT_DEFAULTS[key]) };
}

function normalizeEffect(effect = {}) {
  const operation = String(effect.operation || "chat");
  const defaults = EFFECT_DEFAULTS[operation];
  if (!defaults) return foundry.utils.deepClone(effect);
  const next = createDefaultEffect(operation);
  for (const key of Object.keys(defaults)) {
    if (effect[key] !== undefined) next[key] = foundry.utils.deepClone(effect[key]);
  }
  return next;
}

function createDefaultGeneratedAbility() {
  return {
    mode: "template",
    name: "New Ability",
    kind: "interrupt",
    system: {
      profile: {
        actionType: "attack",
        targetMode: "single",
        adjacentScope: "any",
        adjacentCount: "one",
        defenceStat: "hard",
        tn: 8,
        damage: { resolve: 0, wounds: 0 },
        text: "",
        effectText: ""
      },
      cost: { enabled: false, type: "threat", amount: 0 }
    }
  };
}

const RULE_TYPES = {
  modifyEntityStat: ["system.builder.statModifiers", createDefaultStatModifier],
  modifyEntityAbility: ["system.builder.actionModifiers", createDefaultActionModifier],
  generatedAbility: ["system.builder.generatedAbility", createDefaultGeneratedAbility],
  triggeredEffect: ["system.builder.triggers", () => defaultTriggerForHook("afterHunterDamage")]
};

function buildTriggerContexts(triggers = []) {
  return foundry.utils.deepClone(triggers || []).map((trigger, index) => ({
    ...trigger,
    index,
    effects: trigger.effects || [],
    effectChoices: effectOperationChoices(trigger.hook)
  }));
}

function effectOperationChoices(hookName = "") {
  return Object.fromEntries(
    (EFFECTS_BY_HOOK[String(hookName || "")] || ["chat"])
      .map((key) => [key, ENHANCEMENT_BUILDER_CHOICES.effectOperation[key]])
  );
}

function needsRerender(name) {
  const parts = String(name || "").split(".");
  return RERENDER_FIELD_SEGMENTS.has(parts.at(-1));
}

function objectRule(value) {
  return value && typeof value === "object" && Object.keys(value).length
    ? foundry.utils.deepClone(value)
    : null;
}

export class HollowsEntityEnhancementSheet extends EffectBuilderItemSheet {
  static DEFAULT_OPTIONS = {
    classes: ["hollows", "sheet", "item", "entity-enhancement", "builder"],
    position: { width: 660, height: 760 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      addRule: async function(event, target) {
        const select = this.element.querySelector("[data-enhancement-rule-type]");
        const type = String(select?.value || "triggeredEffect");
        const [path, factory] = RULE_TYPES[type] || RULE_TYPES.triggeredEffect;
        if (type === "generatedAbility") {
          if (objectRule(foundry.utils.getProperty(this.item, path))) {
            ui.notifications.warn("This Enhancement already has a generated ability.");
            return;
          }
          this._captureScroll();
          await this.document.update({ "system.builder.enabled": true, [path]: factory() });
          return;
        }
        const items = foundry.utils.deepClone(foundry.utils.getProperty(this.item, path) || []);
        this._captureScroll();
        items.push(factory());
        await this.document.update({ "system.builder.enabled": true, [path]: items });
      },
      removeRule: async function(event, target) {
        const path = target?.dataset?.rulePath || target?.dataset?.arrayPath;
        if (path === "system.builder.generatedAbility") {
          const current = foundry.utils.getProperty(this.document, path) || {};
          const updateData = Object.fromEntries(Object.keys(current).map((key) => [`${path}.-=${key}`, null]));
          updateData["system.builder.configure.-=action"] = null;
          this._captureScroll();
          await this.document.update(updateData);
          return;
        }
        const index = Number(target?.dataset?.index);
        if (!path || Number.isNaN(index)) return;
        const items = foundry.utils.deepClone(foundry.utils.getProperty(this.document, path) || []);
        items.splice(index, 1);
        this._captureScroll();
        await this.document.update({ [path]: items });
      },
      addEffect: async function(event, target) {
        const triggerIndex = Number(target?.dataset?.triggerIndex);
        if (Number.isNaN(triggerIndex)) return;
        const triggers = foundry.utils.deepClone(this.item.system.builder?.triggers || []);
        if (!triggers[triggerIndex]) return;
        const effects = triggers[triggerIndex].effects ||= [];
        effects.push(defaultTriggerForHook(triggers[triggerIndex].hook).effects[0]);
        this._captureScroll();
        await this.document.update({ "system.builder.triggers": triggers });
      },
      removeEffect: async function(event, target) {
        const triggerIndex = Number(target?.dataset?.triggerIndex);
        const effectIndex = Number(target?.dataset?.effectIndex);
        if (Number.isNaN(triggerIndex) || Number.isNaN(effectIndex)) return;
        const triggers = foundry.utils.deepClone(this.item.system.builder?.triggers || []);
        if (!triggers[triggerIndex]) return;
        const effects = triggers[triggerIndex].effects ||= [];
        effects.splice(effectIndex, 1);
        if (!effects.length) effects.push(defaultTriggerForHook(triggers[triggerIndex].hook).effects[0]);
        this._captureScroll();
        await this.document.update({ "system.builder.triggers": triggers });
      }
    }
  };

  static PARTS = {
    sheet: {
      template: "systems/hollows/templates/item/entity-enhancement-sheet.html",
      root: true
    }
  };

  get title() {
    return this.item?.name ?? "Entity Enhancement";
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const builder = this.item.system?.builder || {};
    const statModifiers = foundry.utils.deepClone(builder.statModifiers || []);
    const actionModifiers = foundry.utils.deepClone(builder.actionModifiers || []);
    const triggers = foundry.utils.deepClone(builder.triggers || []);
    const generatedAbility = objectRule(builder.generatedAbility);
    return {
      ...context,
      item: this.item,
      system: this.item.system,
      builder,
      configureActionKinds: foundry.utils.deepClone(builder.configure?.action?.kinds || []),
      choices: ENHANCEMENT_BUILDER_CHOICES,
      actionChoices: ENTITY_ACTION_CHOICES,
      entityAbilityChoices: buildEntityAbilityChoices(this.item),
      manoeuvreChoices: buildManoeuvreChoices(this.item),
      statChoices: STAT_LABELS,
      zoneList: ENTITY_ZONES,
      statModifiers,
      actionModifiers,
      triggers: buildTriggerContexts(triggers),
      generatedAbility,
      hasRules: statModifiers.length || actionModifiers.length || triggers.length || generatedAbility,
      editable: this.isEditable,
      owner: this.document.isOwner,
      limited: this.document.limited
    };
  }

  _arrayToggleRender(path) { return path.startsWith("system.builder."); }

  _needsRerender(name) { return needsRerender(name); }

  async _writeField(name, value, render = false) {
    const generatedPath = "system.builder.generatedAbility";
    if (String(name).startsWith(`${generatedPath}.`)) {
      const field = String(name).slice(generatedPath.length + 1);
      const config = foundry.utils.deepClone(foundry.utils.getProperty(this.document, generatedPath) || {});
      const updateData = { [generatedPath]: config };
      foundry.utils.setProperty(config, field, value);
      if (field.endsWith("profile.targetMode") && value === "adjacentZones") {
        const prefix = field.slice(0, -"targetMode".length);
        foundry.utils.setProperty(
          config,
          `${prefix}adjacentScope`,
          foundry.utils.getProperty(config, `${prefix}adjacentScope`) || "any"
        );
        foundry.utils.setProperty(
          config,
          `${prefix}adjacentCount`,
          foundry.utils.getProperty(config, `${prefix}adjacentCount`) || "one"
        );
      }
      if (field === "mode") {
        if (value === "cloneSelectedAbility") {
          const actionConfig = this.item.system.builder?.configure?.action || {};
          if (config.name === "New Ability") config.name = "";
          updateData["system.builder.configure.action"] = {
            ...actionConfig,
            label: actionConfig.label || "Choose Attack",
            kinds: ["attack"],
            targetMode: actionConfig.targetMode || "single",
            requiresDamage: false
          };
        } else {
          updateData["system.builder.configure.-=action"] = null;
        }
        if (value === "useExistingManoeuvre") {
          config.kind = "interrupt";
          config.manoeuvre ||= {};
          config.manoeuvre.choice ||= "basic:prowl";
          config.manoeuvre.threatCost = Number(config.manoeuvre.threatCost ?? 1) || 0;
        }
      }
      if (field === "defenceStatFromSelected" && value === true) {
        updateData["system.builder.configure.stat"] = {
          enabled: true,
          title: "Choose Stat",
          default: "hard",
          ...(this.item.system.builder?.configure?.stat || {})
        };
      }
      await this.document.update(updateData, { render });
      return;
    }

    const match = String(name).match(/^(.*?\.(?:statModifiers|actionModifiers|triggers|effects))\.(\d+)\.(.+)$/);
    if (match) {
      const arrayPath = match[1];
      const index = Number(match[2]);
      const field = match[3];
      const arr = foundry.utils.deepClone(foundry.utils.getProperty(this.document, arrayPath) || []);
      const isTrigger = arrayPath === "system.builder.triggers";
      if (!arr[index]) return;
      if (isTrigger && field.startsWith("effects.")) arr[index].effects ||= [];
      foundry.utils.setProperty(arr[index], field, value);
      if (isTrigger && field === "hook") {
        arr[index] = defaultTriggerForHook(value);
      }
      const effectOperationMatch = isTrigger ? field.match(/^effects\.(\d+)\.operation$/) : null;
      if (effectOperationMatch) {
        const effectIndex = Number(effectOperationMatch[1]);
        arr[index].effects[effectIndex] = normalizeEffect(arr[index].effects[effectIndex]);
      }
      const updateData = { [arrayPath]: arr };
      if (arrayPath === "system.builder.actionModifiers" && field === "targetMode" && value === "adjacentZones") {
        arr[index].adjacentScope ||= "any";
        arr[index].adjacentCount ||= "one";
      }
      if (arrayPath === "system.builder.statModifiers" && field === "mode" && value === "dynamic") {
        arr[index].source ||= "hunterCountOnGrid";
      }
      await this.document.update(updateData, { render });
      return;
    }
    await this.document.update({ [name]: value }, { render });
  }
}
