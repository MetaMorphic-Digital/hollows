/** Entity ability schema and defaults. */
import { fieldDefaults } from "../../utils/field-defaults.js";

const damageField = () => {
  const fields = foundry.data.fields;
  return new fields.SchemaField({
    resolve: new fields.NumberField({ initial: 0 }),
    wounds: new fields.NumberField({ initial: 0 }),
  });
};

const zonesField = () => {
  const fields = foundry.data.fields;
  return new fields.ArrayField(new fields.StringField({ initial: "" }), { initial: [] });
};

const ATTACK_OUTCOME_CONDITIONS = { successAny: "On Success (Any)", failureAny: "On Failure (Any)", anyDamageDealt: "On Any Damage Dealt", noDamageDealt: "On No Damage Dealt", resolveDamageDealt: "On Resolve Damage Dealt", woundsDamageDealt: "On Wounds Damage Dealt", onBreak: "On Break", onKill: "On Kill", onMakingDying: "On Making Dying" };
const SHARED_STATE_CONDITION_LABELS = { targetAlone: "Target Is Alone", targetNotAlone: "Target Is Not Alone", targetHasCurse: "Target Has Curse", targetHasNoCurse: "Target Has No Curse", targetZoneHasCurse: "Target Zone Has Curse", targetZoneHasNoCurse: "Target Zone Has No Curse", targetZoneHasThreat: "Target Zone Has Threat", targetZoneHasNoThreat: "Target Zone Has No Threat", entityHasCurse: "Entity Has Curse", entityHasNoCurse: "Entity Has No Curse", entityIsBroken: "Entity Is Broken", entityIsNotBroken: "Entity Is Not Broken", entityHasTerrain: "Entity Has Terrain", entityHasNoTerrain: "Entity Has No Terrain", targetHasTerrain: "Target Has Terrain", targetHasNoTerrain: "Target Has No Terrain", targetHasFocus: "Target Has Focus", targetHasNoFocus: "Target Has No Focus", targetHasCapacity: "Target Has Capacity", targetHasNoCapacity: "Target Has No Capacity" };

const conditionListField = (choices, initial = []) => {
  const fields = foundry.data.fields;
  const list = (Array.isArray(initial) ? initial : [initial]).filter((condition) => String(condition || ""));
  return new fields.ArrayField(new fields.SchemaField({
    condition: new fields.StringField({ initial: list[0] || "", choices }),
  }), { initial: list.map((condition) => ({ condition })) });
};

/** Choices shared by schema fields and builder selects. */
export const ENTITY_ACTION_CHOICES = {
  kind: { attack: "Attack", interrupt: "Interrupt", manoeuvre: "Manoeuvre", special: "Special", doom: "Doom", whenBroken: "When Broken" },
  builderMode: { basic: "Basic", advanced: "Advanced", manual: "Manual" },
  actionType: { attack: "Attack", test: "Test", other: "Other" },
  stat: { hard: "Hard", quick: "Quick", sharp: "Sharp", strong: "Strong", wise: "Wise" },
  entityDefence: { close: "Close", ranged: "Ranged", wyrd: "Wyrd" },
  rollMode: { normal: "Normal", adv: "Advantage", dis: "Disadvantage" },
  tnMode: { fixed: "Fixed", dynamic: "Dynamic" },
  tnDynamicType: { modify: "TN modified by X", set: "TN set to X" },
  tnDynamicSource: { targetCurse: "Curse on Target", entityCurse: "Curse on Entity", zoneCurse: "Curse on Target Zone", threat: "Threat in Target Zone", targetCapacity: "Capacity on Target", entityTerrain: "Terrain on Entity" },
  tnSetSource: { entityDefence: "Entity Defence", entityResolve: "Entity Resolve", entityWounds: "Entity Wounds", targetStat: "Target Stats" },
  damageMode: { fixed: "Fixed", dynamic: "Dynamic" },
  damageDynamicMode: { both: "Resolve & Wounds modified by X", resolve: "Resolve modified by X", wounds: "Wounds modified by X" },
  damageDynamicScale: { full: "By X", halfUp: "By X/2 (Rounded Up)" },
  damageDynamicSource: { targetCurse: "Curse on Target", entityCurse: "Curse on Entity", zoneCurse: "Curse on Zone", threat: "Threat", entityTerrain: "Terrain on Entity", huntersInZone: "Hunters in Zone" },
  targetMode: { single: "Single", zone: "Zone", multiZone: "Select Zones", adjacentZones: "Adjacent Zones", noTargets: "No Targets" },
  targetAdjacentScope: { any: "Adjacent Any", close: "Adjacent Close", ranged: "Adjacent Ranged" },
  targetAdjacentCount: { one: "One Adjacent", two: "Two Adjacent (If Eligible)", all: "All Adjacent (No Support)" },
  costType: { threat: "Threat", closeDefence: "Close Defence", rangedDefence: "Ranged Defence", wyrdDefence: "Wyrd Defence", entityResolve: "Entity's Resolve", entityWounds: "Entity's Wounds", entityCurse: "Curse on Entity", hunterCurse: "Curse on Hunter", zoneCurse: "Curse on Zone", entityTerrain: "Entity Terrain Tag" },
  condition: { targetHasTerrain: "Target Has Terrain", targetNoTerrain: "Target Has No Terrain", targetHasFocus: "Target Has Focus", targetNoFocus: "Target Has No Focus", targetHasCapacity: "Target Has Capacity", targetHasCurse: "Target Has Curse", targetNoCurse: "Target Has No Curse", targetZoneHasCurse: "Target Zone Has Curse", targetZoneNoCurse: "Target Zone Has No Curse", targetZoneThreat: "Target Zone Has Threat", targetZoneNoThreat: "Target Zone Has No Threat", entityHasCurse: "Entity Has Curse" },
  applyIf: { always: "Always", ...ATTACK_OUTCOME_CONDITIONS, targetBrokenBeforeAttack: "Target Broken Before Attack", targetNotBrokenBeforeAttack: "Target Not Broken Before Attack", ...SHARED_STATE_CONDITION_LABELS },
  beforeAttackIf: { always: "Always", targetBroken: "Target Is Broken", targetNotBroken: "Target Is Not Broken", ...SHARED_STATE_CONDITION_LABELS },
  outcomeWhen: { ...ATTACK_OUTCOME_CONDITIONS, always: "Always" },
  conditionLogic: { and: "All (AND)", or: "Any (OR)" },
  followUpTargetMode: { sameTarget: "Same Target", single: "Single", multiZone: "Select Zones", noTargets: "No Targets" },
  followUpTargetArea: { original: "Original Zone", adjacentClose: "Adjacent Close", adjacentRanged: "Adjacent Ranged" },
  followUpAdjacentMode: { all: "All Marked Adjacent", select: "Select Adjacent at Runtime" },
  followUpTrigger: { afterMain: "After Main Attack", afterPrevious: "After Previous Group" },
  restoreMode: { fixed: "Fixed", dynamic: "Dynamic" },
  restoreSource: { curseZones: "Curse In Zones", curseHunters: "Curse On Hunters", huntersInZones: "Hunters In Zones", numberMinusHunters: "Number Minus Hunters", entityCurse: "Curse on Entity", entityTerrain: "Terrain on Entity (× Number)" },
  zoneMode: { single: "Single", multiZone: "Select Zones" },
  specialType: { textOnly: "Text Only", passiveModifier: "Passive Modifier", triggeredEffect: "Triggered Effect" },
  passiveType: { damageTaken: "Damage Taken", attackDamage: "Attack Damage", interruptDamage: "Interrupt Damage", actionsTN: "Actions TN", modifyDefences: "Modify Defences", modifyMaxResolve: "Modify Max Resolve", modifyMaxWounds: "Modify Max Wounds", modifyThreatCap: "Modify Threat Cap", modifyThreatPerRound: "Modify Threat Per Round" },
  passiveCondition: { always: "Always", entityHasCurse: "Entity Has Curse", entityNoCurse: "Entity Has No Curse", entityCurseThreshold: "Entity Curse ≥ N", targetHasCurse: "Target Has Curse", targetNoCurse: "Target Has No Curse", targetCurseThreshold: "Target Curse ≥ N", entityHasTerrain: "Entity Has Terrain", entityNoTerrain: "Entity Has No Terrain", entityTerrainThreshold: "Entity Terrain ≥ N", targetHasTerrain: "Target Has Terrain", targetNoTerrain: "Target Has No Terrain", zoneHasThreat: "Target Zone Has Threat", zoneNoThreat: "Target Zone Has No Threat", zoneThreatThreshold: "Target Zone Threat ≥ N", targetInZones: "Target In Selected Zones", targetAlone: "Target Alone In Zone", targetNotAlone: "Target Not Alone In Zone" },
  defenceScope: { all: "All Defences", close: "Close", ranged: "Ranged", wyrd: "Wyrd" },
  amountSource: { curseEntity: "Curse on Entity", curseZones: "Curse in Zones", threatZones: "Threat in Zones", curseHunters: "Curse on Hunters", entityTerrain: "Terrain on Entity" },
  zoneScope: { all: "All Zones", select: "Select Zones" },
  terrainTag: { any: "Any", elevated: "Elevated", sheltered: "Sheltered" },
  shiftResource: { threat: "Threat", curse: "Curse" },
  shiftDirection: { towardEntity: "Toward Entity (Ranged→Close)", awayFromEntity: "Away (Close→Ranged)", towardZone: "Toward Zone", intoTargetZone: "Into Target Zone", outFromTargetZone: "Out From Target Zone", intoAdjacentZone: "Into Adjacent Zone" },
  thresholdSource: { curseEntity: "Curse on Entity", curseZones: "Curse on Zones", curseHunters: "Curse on Hunters", threatZones: "Threat on Zones", entityResolve: "Entity Resolve", entityWounds: "Entity Wounds" },
  thresholdComparison: { lowerEqual: "Lower / Equal (≤)", higherEqual: "Higher / Equal (≥)" },
  useMode: { removeCurse: "Remove Curse", removeSpecialCondition: "Remove Special Condition", transferCurse: "Transfer Curse" },
  useTarget: { selfOnly: "Self Only", selectHunter: "Select Hunter", allHunters: "All Hunters", zone: "Zone" },
  useScope: { anywhere: "Anywhere", allInZone: "From All In Zone", adjacentZone: "Adjacent Zone" },
  useOutcome: { removeNothing: "Remove Nothing", removeAmount: "Remove (Amount)", removeAll: "Remove All" },
  weaponDamageSource: { weaponResolve: "Weapon Damage (Resolve)", weaponWounds: "Weapon Damage (Wounds)" },
  transferEnd: { zone: "Zone", hunter: "Hunter" },
  useManoeuvre: { use: "Use", move: "Move", takeCover: "Take Cover", focus: "Focus" },
  specialConditionSlot: { special1: "Special 1", special2: "Special 2", special3: "Special 3" },
  triggerEvent: { entityStart: "Entity Turn Start", entityEnd: "Entity Turn End", hunterStart: "Hunter Turn Start", hunterEnd: "Hunter Turn End", battleStart: "Battle Start", entityBreaksHunter: "Entity Breaks Hunter", entityDealsResolveDamage: "Entity Deals Resolve Damage", entityDealsWoundsDamage: "Entity Deals Wounds Damage", hunterInflictsResolveDamage: "Hunter Inflicts Resolve Damage", hunterInflictsWoundsDamage: "Hunter Inflicts Wounds Damage", hunterInflictsNoDamage: "Hunter Inflicts No Damage", entityCurseThreshold: "Entity Curse Threshold Reached", hunterCurseThreshold: "Hunter Curse Threshold Reached", entityTerrainDestroyed: "Entity Terrain Destroyed (by Hunter)" },
  effectType: { afterEffects: "After Effects", triggerAbility: "Trigger Ability" },
  triggerTargetMode: { entity: "Entity", eventTarget: "Event Target", eventZone: "Event Target Zone", allInEventZone: "All Hunters In Event Zone", allInSelectedZones: "All Hunters In Selected Zones", single: "Single", multiZone: "Select Zones" },
  abilitySource: { existing: "Existing", custom: "Custom" },
  abilityKind: { attack: "Attack", interrupt: "Interrupt" },
  whenBrokenMode: { first: "First Time Only", every: "Every Time" },
};

const profileField = () => {
  const fields = foundry.data.fields;
  const C = ENTITY_ACTION_CHOICES;
  return new fields.SchemaField({
    actionType: new fields.StringField({ initial: "attack", choices: C.actionType }),
    defenceStat: new fields.StringField({ initial: "hard", choices: C.stat }),
    basicDefenceMode: new fields.StringField({ initial: "normal", choices: C.rollMode }),
    basicRollMode: new fields.StringField({ initial: "normal", choices: C.rollMode }),
    testStat: new fields.StringField({ initial: "hard", choices: C.stat }),
    tn: new fields.NumberField({ initial: 0 }),
    tnMode: new fields.StringField({ initial: "fixed", choices: C.tnMode }),
    tnDynamicType: new fields.StringField({ initial: "modify", choices: C.tnDynamicType }),
    tnDynamicSource: new fields.StringField({ initial: "targetCurse", choices: C.tnDynamicSource }),
    tnSetSource: new fields.StringField({ initial: "entityDefence", choices: C.tnSetSource }),
    tnSetDefence: new fields.StringField({ initial: "close", choices: C.entityDefence }),
    tnSetStat: new fields.StringField({ initial: "hard", choices: C.stat }),
    damageMode: new fields.StringField({ initial: "fixed", choices: C.damageMode }),
    damage: damageField(),
    damageDynamicMode: new fields.StringField({ initial: "both", choices: C.damageDynamicMode }),
    damageDynamicSource: new fields.StringField({ initial: "targetCurse", choices: C.damageDynamicSource }),
    damageDynamicScale: new fields.StringField({ initial: "full", choices: C.damageDynamicScale }),
    damageDynamicReduce: new fields.BooleanField({ initial: false }),
    damageDynamicFloor: new fields.NumberField({ initial: 0 }),
    targetMode: new fields.StringField({ initial: "single", choices: C.targetMode }),
    adjacentScope: new fields.StringField({ initial: "any", choices: C.targetAdjacentScope }),
    adjacentCount: new fields.StringField({ initial: "one", choices: C.targetAdjacentCount }),
    allowedZones: zonesField(),
    conditionText: new fields.StringField({ initial: "" }),
    effectText: new fields.StringField({ initial: "" }),
    text: new fields.StringField({ initial: "" }),
  });
};

const costField = () => {
  const fields = foundry.data.fields;
  return new fields.SchemaField({
    enabled: new fields.BooleanField({ initial: false }),
    type: new fields.StringField({ initial: "threat", choices: ENTITY_ACTION_CHOICES.costType }),
    amount: new fields.NumberField({ initial: 0 }),
    terrainTag: new fields.StringField({ initial: "any", choices: ENTITY_ACTION_CHOICES.terrainTag }),
  });
};

const threatSpendField = () => {
  const fields = foundry.data.fields;
  return new fields.SchemaField({
    enabled: new fields.BooleanField({ initial: false }),
    affectsTN: new fields.BooleanField({ initial: true }),
    modifyDamage: new fields.BooleanField({ initial: false }),
    damage: damageField(),
    specialText: new fields.StringField({ initial: "" }),
  });
};

const possibleIfField = () => {
  const fields = foundry.data.fields;
  return new fields.SchemaField({
    enabled: new fields.BooleanField({ initial: false }),
    logic: new fields.StringField({ initial: "and", choices: ENTITY_ACTION_CHOICES.conditionLogic }),
    conditions: conditionListField(ENTITY_ACTION_CHOICES.condition, ["targetHasTerrain"]),
  });
};

const thresholdField = () => {
  const fields = foundry.data.fields;
  return new fields.SchemaField({
    enabled: new fields.BooleanField({ initial: false }),
    source: new fields.StringField({ initial: "entityResolve", choices: ENTITY_ACTION_CHOICES.thresholdSource }),
    comparison: new fields.StringField({ initial: "lowerEqual", choices: ENTITY_ACTION_CHOICES.thresholdComparison }),
    value: new fields.NumberField({ initial: 0 }),
  });
};

const modifyGroupField = () => {
  const fields = foundry.data.fields;
  return new fields.SchemaField({
    logic: new fields.StringField({ initial: "and", choices: ENTITY_ACTION_CHOICES.conditionLogic }),
    conditions: conditionListField(ENTITY_ACTION_CHOICES.condition, ["targetHasTerrain"]),
    threshold: thresholdField(),
    tn: new fields.NumberField({ initial: 0 }),
    damage: damageField(),
    selfDamage: damageField(),
    effectText: new fields.StringField({ initial: "" }),
  });
};

const modifyIfField = () => {
  const fields = foundry.data.fields;
  return new fields.SchemaField({
    enabled: new fields.BooleanField({ initial: false }),
    groups: new fields.ArrayField(modifyGroupField(), { initial: [fieldDefaults(modifyGroupField())] }),
  });
};

const repeatField = () => {
  const fields = foundry.data.fields;
  return new fields.SchemaField({
    enabled: new fields.BooleanField({ initial: false }),
    repeatIf: new fields.StringField({ initial: "successAny", choices: ENTITY_ACTION_CHOICES.outcomeWhen }),
    modifyTN: new fields.NumberField({ initial: 0 }),
    damage: damageField(),
    hasCost: new fields.BooleanField({ initial: false }),
    repeatCount: new fields.NumberField({ initial: 0 }),
  });
};

const specialConditionField = () => {
  const fields = foundry.data.fields;
  return new fields.SchemaField({
    enabled: new fields.BooleanField({ initial: false }),
    slot: new fields.StringField({ initial: "special1", choices: ENTITY_ACTION_CHOICES.specialConditionSlot }),
    blocksMovement: new fields.BooleanField({ initial: false }),
    blocksTakeCover: new fields.BooleanField({ initial: false }),
    blocksFocus: new fields.BooleanField({ initial: false }),
    disadvAttacks: new fields.BooleanField({ initial: false }),
    disadvDefence: new fields.BooleanField({ initial: false }),
    disadvTests: new fields.BooleanField({ initial: false }),
    statMod: new fields.SchemaField({
      stat: new fields.StringField({ initial: "hard", choices: ENTITY_ACTION_CHOICES.stat }),
      amount: new fields.NumberField({ initial: 0 }),
    }),
    tnMod: new fields.NumberField({ initial: 0 }),
    damageTaken: damageField(),
  });
};

const shiftField = () => {
  const fields = foundry.data.fields;
  return new fields.SchemaField({
    enabled: new fields.BooleanField({ initial: false }),
    resource: new fields.StringField({ initial: "threat", choices: ENTITY_ACTION_CHOICES.shiftResource }),
    direction: new fields.StringField({ initial: "towardEntity", choices: ENTITY_ACTION_CHOICES.shiftDirection }),
    amount: new fields.NumberField({ initial: 0 }),
    zone: new fields.StringField({ initial: "" }),
  });
};

const effectPayloadFields = () => {
  const fields = foundry.data.fields;
  return {
    destroyTerrain: new fields.BooleanField({ initial: false }),
    discardTerrain: new fields.BooleanField({ initial: false }),
    removeFocus: new fields.BooleanField({ initial: false }),
    removeCapacity: new fields.BooleanField({ initial: false }),
    killHunter: new fields.BooleanField({ initial: false }),
    curseZone: new fields.NumberField({ initial: 0 }),
    curseTarget: new fields.NumberField({ initial: 0 }),
    curseEntity: new fields.NumberField({ initial: 0 }),
    threat: new fields.NumberField({ initial: 0 }),
    targetDelta: damageField(),
    entityDelta: damageField(),
    entityTerrain: new fields.NumberField({ initial: 0 }),
    entityTerrainTag: new fields.StringField({ initial: "any", choices: ENTITY_ACTION_CHOICES.terrainTag }),
    entityTerrainFromPool: new fields.BooleanField({ initial: false }),
    transferTerrainToEntity: new fields.BooleanField({ initial: false }),
    shift: shiftField(),
    otherText: new fields.StringField({ initial: "" }),
    specialCondition: specialConditionField(),
  };
};

const beforeAttackGroupField = () => {
  const fields = foundry.data.fields;
  return new fields.SchemaField({
    applyIfLogic: new fields.StringField({ initial: "and", choices: ENTITY_ACTION_CHOICES.conditionLogic }),
    applyIfConditions: conditionListField(ENTITY_ACTION_CHOICES.beforeAttackIf, ["always"]),
    ...effectPayloadFields(),
  });
};

const beforeAttackField = () => {
  const fields = foundry.data.fields;
  return new fields.SchemaField({
    enabled: new fields.BooleanField({ initial: false }),
    groups: new fields.ArrayField(beforeAttackGroupField(), { initial: [fieldDefaults(beforeAttackGroupField())] }),
  });
};

const afterAttackGroupField = (applyIf = "anyDamageDealt") => {
  const fields = foundry.data.fields;
  return new fields.SchemaField({
    // No per-group enabled flag: a group that exists is active (gated only by
    // applyIf). Remove a group to remove that rule; the section-level `enabled`
    // on afterAttackField toggles the whole After-Attack feature.
    applyIfLogic: new fields.StringField({ initial: "and", choices: ENTITY_ACTION_CHOICES.conditionLogic }),
    applyIfConditions: conditionListField(ENTITY_ACTION_CHOICES.applyIf, [applyIf]),
    ...effectPayloadFields(),
  });
};

const afterAttackField = (applyIf = "anyDamageDealt", enabled = false) => {
  const fields = foundry.data.fields;
  return new fields.SchemaField({
    enabled: new fields.BooleanField({ initial: enabled }),
    groups: new fields.ArrayField(afterAttackGroupField(applyIf), { initial: [fieldDefaults(afterAttackGroupField(applyIf))] }),
  });
};

const followUpGroupField = () => {
  const fields = foundry.data.fields;
  return new fields.SchemaField({
    // `trigger` is ignored for the first group (it always evaluates against the
    // main action). For later groups it selects whether the group fires off the
    // main action's outcome (afterMain = independent branch) or off the
    // previous group's outcome (afterPrevious = chained). See followUpBranches.
    trigger: new fields.StringField({ initial: "afterPrevious", choices: ENTITY_ACTION_CHOICES.followUpTrigger }),
    when: new fields.StringField({ initial: "successAny", choices: ENTITY_ACTION_CHOICES.outcomeWhen }),
    profile: profileField(),
    targetMode: new fields.StringField({ initial: "single", choices: ENTITY_ACTION_CHOICES.followUpTargetMode }),
    targetAreas: new fields.ArrayField(new fields.StringField({ initial: "" }), { initial: ["original"] }),
    adjacentMode: new fields.StringField({ initial: "all", choices: ENTITY_ACTION_CHOICES.followUpAdjacentMode }),
    excludeOriginal: new fields.BooleanField({ initial: true }),
    damageBonus: damageField(),
    afterAttack: afterAttackField(),
  });
};

const followUpField = () => {
  const fields = foundry.data.fields;
  return new fields.SchemaField({
    enabled: new fields.BooleanField({ initial: false }),
    groups: new fields.ArrayField(followUpGroupField(), { initial: [] }),
  });
};

const restoreResolveField = () => {
  const fields = foundry.data.fields;
  return new fields.SchemaField({
    enabled: new fields.BooleanField({ initial: false }),
    mode: new fields.StringField({ initial: "fixed", choices: ENTITY_ACTION_CHOICES.restoreMode }),
    fixed: new fields.NumberField({ initial: 0 }),
    dynamicSource: new fields.StringField({ initial: "curseZones", choices: ENTITY_ACTION_CHOICES.restoreSource }),
    dynamicNumber: new fields.NumberField({ initial: 0 }),
    zoneMode: new fields.StringField({ initial: "single", choices: ENTITY_ACTION_CHOICES.zoneMode }),
    zones: zonesField(),
  });
};

const useField = () => {
  const fields = foundry.data.fields;
  return new fields.SchemaField({
    enabled: new fields.BooleanField({ initial: false }),
    mode: new fields.StringField({ initial: "removeCurse", choices: ENTITY_ACTION_CHOICES.useMode }),
    target: new fields.StringField({ initial: "selfOnly", choices: ENTITY_ACTION_CHOICES.useTarget }),
    scope: new fields.StringField({ initial: "anywhere", choices: ENTITY_ACTION_CHOICES.useScope }),
    test: new fields.SchemaField({
      enabled: new fields.BooleanField({ initial: false }),
      stat: new fields.StringField({ initial: "hard", choices: ENTITY_ACTION_CHOICES.stat }),
      tn: new fields.NumberField({ initial: 0 }),
    }),
    onSuccess: new fields.StringField({ initial: "removeAll", choices: ENTITY_ACTION_CHOICES.useOutcome }),
    onFailure: new fields.StringField({ initial: "removeNothing", choices: ENTITY_ACTION_CHOICES.useOutcome }),
    amountSuccess: new fields.NumberField({ initial: 1 }),
    amountSuccessMode: new fields.StringField({ initial: "fixed", choices: ENTITY_ACTION_CHOICES.damageMode }),
    amountSuccessSource: new fields.StringField({ initial: "weaponResolve", choices: ENTITY_ACTION_CHOICES.weaponDamageSource }),
    amountFailure: new fields.NumberField({ initial: 0 }),
    amountFailureMode: new fields.StringField({ initial: "fixed", choices: ENTITY_ACTION_CHOICES.damageMode }),
    amountFailureSource: new fields.StringField({ initial: "weaponResolve", choices: ENTITY_ACTION_CHOICES.weaponDamageSource }),
    damageSuccess: damageField(),
    damageFailure: damageField(),
    transferFrom: new fields.StringField({ initial: "zone", choices: ENTITY_ACTION_CHOICES.transferEnd }),
    transferTo: new fields.StringField({ initial: "hunter", choices: ENTITY_ACTION_CHOICES.transferEnd }),
    applyOnManoeuvre: new fields.ArrayField(new fields.StringField({ initial: "" }), { initial: ["use"] }),
  });
};

const passiveGroupField = () => {
  const fields = foundry.data.fields;
  return new fields.SchemaField({
    type: new fields.StringField({ initial: "damageTaken", choices: ENTITY_ACTION_CHOICES.passiveType }),
    condition: new fields.StringField({ initial: "always", choices: ENTITY_ACTION_CHOICES.passiveCondition }),
    amount: new fields.NumberField({ initial: 1 }),
    amountWounds: new fields.NumberField({ initial: 0 }),
    amountMode: new fields.StringField({ initial: "fixed", choices: ENTITY_ACTION_CHOICES.damageMode }),
    amountSource: new fields.StringField({ initial: "curseEntity", choices: ENTITY_ACTION_CHOICES.amountSource }),
    amountScope: new fields.StringField({ initial: "all", choices: ENTITY_ACTION_CHOICES.zoneScope }),
    amountZones: zonesField(),
    curseThreshold: new fields.NumberField({ initial: 3 }),
    conditionZones: zonesField(),
    defenceScope: new fields.StringField({ initial: "all", choices: ENTITY_ACTION_CHOICES.defenceScope }),
  });
};

const specialField = () => {
  const fields = foundry.data.fields;
  return new fields.SchemaField({
    type: new fields.StringField({ initial: "textOnly", choices: ENTITY_ACTION_CHOICES.specialType }),
      passive: new fields.SchemaField({
      groups: new fields.ArrayField(passiveGroupField(), { initial: [fieldDefaults(passiveGroupField())] }),
    }),
    trigger: new fields.SchemaField({
      event: new fields.StringField({ initial: "entityStart", choices: ENTITY_ACTION_CHOICES.triggerEvent }),
      thresholdValue: new fields.NumberField({ initial: 3 }),
      effectType: new fields.StringField({ initial: "afterEffects", choices: ENTITY_ACTION_CHOICES.effectType }),
      targetMode: new fields.StringField({ initial: "eventTarget", choices: ENTITY_ACTION_CHOICES.triggerTargetMode }),
      zones: zonesField(),
      abilitySource: new fields.StringField({ initial: "existing", choices: ENTITY_ACTION_CHOICES.abilitySource }),
      abilityId: new fields.StringField({ initial: "" }),
      abilityKind: new fields.StringField({ initial: "attack", choices: ENTITY_ACTION_CHOICES.abilityKind }),
      abilityName: new fields.StringField({ initial: "" }),
      profile: profileField(),
      afterAttack: afterAttackField("always", true),
    }),
    use: useField(),
    colossal: new fields.BooleanField({ initial: false }),
    terrainShield: new fields.BooleanField({ initial: false }),
  });
};

const doomField = () => {
  const fields = foundry.data.fields;
  return new fields.SchemaField({ threshold: new fields.NumberField({ initial: 1 }) });
};

const whenBrokenField = () => {
  const fields = foundry.data.fields;
  return new fields.SchemaField({ mode: new fields.StringField({ initial: "first", choices: ENTITY_ACTION_CHOICES.whenBrokenMode }), returnHalfTerrain: new fields.BooleanField({ initial: false }) });
};

/** EntityAbilityData schema fields. */
export function entityAbilityFields() {
  const fields = foundry.data.fields;
  return {
    kind: new fields.StringField({ initial: "attack", choices: ENTITY_ACTION_CHOICES.kind }),
    builderMode: new fields.StringField({ initial: "advanced", choices: ENTITY_ACTION_CHOICES.builderMode }),
    profile: profileField(),
    cost: costField(),
    threatSpend: threatSpendField(),
    possibleIf: possibleIfField(),
    modifyIf: modifyIfField(),
    beforeAttack: beforeAttackField(),
    repeat: repeatField(),
    afterAttack: afterAttackField(),
    followUp: followUpField(),
    restoreResolve: restoreResolveField(),
    special: specialField(),
    doom: doomField(),
    whenBroken: whenBrokenField(),
  };
}

/** Normalize builder mode, defaulting to advanced. */
export function normalizeEntityAttackBuilderMode(mode) {
  const normalized = String(mode || "advanced");
  if (["basic", "advanced", "manual"].includes(normalized)) return normalized;
  return "advanced";
}

/** Normalize an after-attack condition. */
export function normalizeAfterAttackApplyIf(value, fallback = "anyDamageDealt") {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  return raw;
}

/** Normalize a before-attack condition. */
export function normalizeBeforeAttackApplyIf(value, fallback = "always") {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  return raw;
}

/** Get authored display text for an ability. */
export function getEntityAbilityText(system) {
  const profile = system?.profile || {};
  const authored = String(profile.text || profile.effectText || "").trim();
  if (authored) return authored;
  const groups = Array.isArray(system?.afterAttack?.groups) ? system.afterAttack.groups : [];
  const other = groups.find((group) => String(group?.otherText || "").trim());
  return other ? String(other.otherText || "").trim() : "";
}

/** Create an action profile. */
export function createEntityActionProfile(overrides = {}) {
  return { ...fieldDefaults(profileField()), ...(overrides || {}) };
}

/** Create repeat config from source data. */
export function createRepeatConfig(source = {}, repeatCount = 0) {
  const base = { ...fieldDefaults(repeatField()), ...(source || {}) };
  return {
    ...base,
    repeatIf: normalizeAfterAttackApplyIf(base.repeatIf, "successAny"),
    repeatCount: Math.max(0, Number(repeatCount ?? 0) || 0),
  };
}

/** Create an after-attack group. */
export function createAfterAttackGroupConfig(applyIf = "anyDamageDealt") {
  return fieldDefaults(afterAttackGroupField(applyIf));
}

/** Create a before-attack group. */
export function createBeforeAttackGroupConfig() {
  return fieldDefaults(beforeAttackGroupField());
}

/** Create a conditional-modifier group. */
export function createModifyIfGroupConfig() {
  return fieldDefaults(modifyGroupField());
}

/** Create a passive-modifier group. */
export function createPassiveGroupConfig() {
  return fieldDefaults(passiveGroupField());
}

/** Create a follow-up group from source data. */
export function createFollowUpGroupConfig(source = {}, damageBonus = { resolve: 0, wounds: 0 }) {
  return {
    ...fieldDefaults(followUpGroupField()),
    ...(source || {}),
    when: normalizeAfterAttackApplyIf(source?.when, "successAny"),
    damageBonus: {
      resolve: Number(damageBonus?.resolve ?? 0) || 0,
      wounds: Number(damageBonus?.wounds ?? 0) || 0,
    },
  };
}

/** Create follow-up config with its groups. */
export function createFollowUpConfig(source = {}, damageBonus = { resolve: 0, wounds: 0 }) {
  const groups = Array.isArray(source?.groups) ? source.groups : [];
  return {
    enabled: !!source?.enabled && groups.length > 0,
    groups: groups.map((group) => createFollowUpGroupConfig(group, damageBonus)),
  };
}

/** Create default attack data. */
export function createDefaultEntityAttack() {
  return {
    kind: "attack",
    builderMode: "advanced",
    profile: createEntityActionProfile({ actionType: "attack" }),
    cost: fieldDefaults(costField()),
    threatSpend: fieldDefaults(threatSpendField()),
    possibleIf: fieldDefaults(possibleIfField()),
    modifyIf: fieldDefaults(modifyIfField()),
    beforeAttack: fieldDefaults(beforeAttackField()),
    repeat: fieldDefaults(repeatField()),
    afterAttack: fieldDefaults(afterAttackField()),
    followUp: fieldDefaults(followUpField()),
  };
}

/** Create default interrupt data. */
export function createDefaultEntityInterrupt() {
  return {
    kind: "interrupt",
    profile: createEntityActionProfile({ actionType: "attack" }),
    cost: { ...fieldDefaults(costField()), enabled: true, type: "threat", amount: 1 },
    possibleIf: fieldDefaults(possibleIfField()),
    modifyIf: fieldDefaults(modifyIfField()),
    afterAttack: fieldDefaults(afterAttackField()),
  };
}

/** Create default manoeuvre data. */
function createDefaultEntityManoeuvre() {
  return {
    kind: "manoeuvre",
    profile: createEntityActionProfile({ actionType: "other", targetMode: "noTargets" }),
    cost: fieldDefaults(costField()),
    possibleIf: fieldDefaults(possibleIfField()),
    modifyIf: fieldDefaults(modifyIfField()),
    afterAttack: fieldDefaults(afterAttackField()),
    restoreResolve: fieldDefaults(restoreResolveField()),
  };
}

/** Create default data for a special-like kind. */
function createDefaultEntitySpecial(kind = "special") {
  return {
    kind,
    profile: createEntityActionProfile({ actionType: "other", targetMode: "noTargets" }),
    special: fieldDefaults(specialField()),
    doom: fieldDefaults(doomField()),
    whenBroken: fieldDefaults(whenBrokenField()),
  };
}

/** Create default ability data for a kind. */
export function createDefaultEntityAbility(kind = "attack") {
  if (kind === "attack") return createDefaultEntityAttack();
  if (kind === "interrupt") return createDefaultEntityInterrupt();
  if (kind === "manoeuvre") return createDefaultEntityManoeuvre();
  if (["special", "whenBroken", "doom"].includes(kind)) return createDefaultEntitySpecial(kind);
  throw new Error(`Unknown entity ability kind: ${kind}`);
}
