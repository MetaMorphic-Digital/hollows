const actorDataModelHooks = {
  getEffectiveEntityStat: (actor, stat) => {
    const system = actor?._source?.system || actor?.system || {};
    if ((stat === "close") || (stat === "ranged") || (stat === "wyrd")) return Math.max(0, Number(system?.defences?.[stat] ?? 0) || 0);
    if (stat === "threatCap") return Math.max(0, Number(system?.threat?.max ?? 0) || 0);
    if (stat === "threatPerRound") return Math.max(0, Number(system?.threat?.perRound ?? 0) || 0);
    if (stat === "resolveMax") return Math.max(0, Number(system?.health?.resolve?.max ?? 0) || 0);
    if (stat === "woundsMax") return Math.max(0, Number(system?.health?.wounds?.max ?? 0) || 0);
    return Math.max(0, Number(system?.[stat] ?? 0) || 0);
  },
};

import { getEffectiveWeaponHealthBonus, getEffectiveWeaponModifiers } from "./weapons/index.js";

export function registerActorDataModelHooks(hooks = {}) {
  if (typeof hooks.getEffectiveEntityStat === "function") {
    actorDataModelHooks.getEffectiveEntityStat = hooks.getEffectiveEntityStat;
  }
}

export class HunterDataModel extends foundry.abstract.TypeDataModel {
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
        value: new fields.NumberField({ initial: 0, integer: true }),
      }),
    };
  }

  prepareDerivedData() {
    let resolveBonus = 0;
    let woundsBonus = 0;
    const weapons = this.parent.items
      .filter((item) => item.type === "weapon")
      .slice(0, 2);

    for (const weapon of weapons) {
      const healthBonus = getEffectiveWeaponHealthBonus(weapon);
      resolveBonus += healthBonus.resolve || 0;
      woundsBonus += healthBonus.wounds || 0;
    }

    this.health.resolve.max = resolveBonus;
    this.health.wounds.max = woundsBonus;
  }
}

export function getWeaponStatModsForActor(actor) {
  const mods = { strong: 0, hard: 0, quick: 0, sharp: 0, wise: 0 };
  const weapons = actor.items
    ?.filter((item) => item.type === "weapon")
    .slice(0, 2) || [];
  for (const weapon of weapons) {
    const wmods = getEffectiveWeaponModifiers(weapon);
    mods.strong += Number(wmods.strong ?? 0);
    mods.hard += Number(wmods.hard ?? 0);
    mods.quick += Number(wmods.quick ?? 0);
    mods.sharp += Number(wmods.sharp ?? 0);
    mods.wise += Number(wmods.wise ?? 0);
  }
  return mods;
}

export function getDefaultHunterTokenConfig() {
  const dt = CONST.TOKEN_DISPOSITIONS;
  const dm = CONST.TOKEN_DISPLAY_MODES;
  return {
    disposition: dt.FRIENDLY,
    displayName: dm.ALWAYS,
    displayBars: dm.ALWAYS,
    actorLink: true,
    bar1: { attribute: "health.wounds" },
    bar2: { attribute: "health.resolve" },
  };
}

export function tokenConfigMatchesDefaults(data) {
  if (!data) return true;
  const defaults = getDefaultHunterTokenConfig();
  const resolved = data.toObject ? data.toObject() : data;
  const matchesPrimitive = (key) => resolved[key] === undefined || resolved[key] === defaults[key];
  const barMatches = (key) => {
    const bar = resolved[key];
    if (!bar || bar.attribute === undefined) return true;
    return bar.attribute === defaults[key].attribute;
  };
  return matchesPrimitive("disposition") &&
    matchesPrimitive("displayName") &&
    matchesPrimitive("displayBars") &&
    matchesPrimitive("actorLink") &&
    barMatches("bar1") &&
    barMatches("bar2");
}

export function isHunterTokenCustomized(data) {
  if (!data) return false;
  const flags = data.flags || {};
  if (flags?.hollows?.tokenCustomized) return true;
  return !tokenConfigMatchesDefaults(data);
}

export function shouldConfigureHunterTokenForActor(actor, tokenData) {
  if (!actor || actor.type !== "hunter") return false;
  if (actor.getFlag && actor.getFlag("hollows", "tokenCustomized")) return false;
  if (isHunterTokenCustomized(tokenData)) return false;
  return true;
}

export function shouldConfigureHunterTokenForNewActor(actor) {
  if (!actor || actor.type !== "hunter") return false;
  if (actor.getFlag && actor.getFlag("hollows", "tokenCustomized")) return false;
  if (actor.getFlag && actor.getFlag("hollows", "tokenConfigured")) return false;
  return true;
}

export class EntityDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      description: new fields.StringField({ initial: "" }),
      descriptionBehavior: new fields.StringField({ initial: "" }),
      descriptionNotes: new fields.StringField({ initial: "" }),
      defences: new fields.SchemaField({
        close: new fields.NumberField({ initial: 10, integer: true }),
        ranged: new fields.NumberField({ initial: 10, integer: true }),
        wyrd: new fields.NumberField({ initial: 10, integer: true }),
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
      threat: new fields.SchemaField({
        perRound: new fields.NumberField({ initial: 0 }),
        max: new fields.NumberField({ initial: 0 }),
      }),
      curse: new fields.SchemaField({
        enabled: new fields.BooleanField({ initial: false }),
        value: new fields.NumberField({ initial: 0, integer: true }),
        targets: new fields.SchemaField({
          hunter: new fields.BooleanField({ initial: false }),
          entity: new fields.BooleanField({ initial: false }),
          zone: new fields.BooleanField({ initial: false }),
        }),
      }),
      terrainPool: new fields.SchemaField({
        elevated: new fields.NumberField({ initial: 3 }),
        sheltered: new fields.NumberField({ initial: 3 }),
      }),
      terrainEngineEnabled: new fields.BooleanField({ initial: false }),
      terrain: new fields.SchemaField({
        elevated: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
        sheltered: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
      }),
      abilities: new fields.ArrayField(
        new fields.SchemaField({
          name: new fields.StringField({ initial: "Ability" }),
          text: new fields.StringField({ initial: "" }),
        }),
        { initial: [] },
      ),
      attacks: new fields.ArrayField(
        new fields.SchemaField({
          name: new fields.StringField({ initial: "Attack" }),
          defenceStat: new fields.StringField({ initial: "hard" }),
          tn: new fields.NumberField({ initial: 0 }),
          damage: new fields.SchemaField({
            resolve: new fields.NumberField({ initial: 0 }),
            wounds: new fields.NumberField({ initial: 0 }),
          }),
          targetMode: new fields.StringField({ initial: "single" }),
          allowedZones: new fields.ArrayField(
            new fields.StringField({ initial: "" }),
            { initial: [] },
          ),
          conditionText: new fields.StringField({ initial: "" }),
          followUpEnabled: new fields.BooleanField({ initial: false }),
          followUpWhen: new fields.StringField({ initial: "success" }),
          followUpTargets: new fields.StringField({ initial: "" }),
          followUpDamage: new fields.SchemaField({
            resolve: new fields.NumberField({ initial: 0 }),
            wounds: new fields.NumberField({ initial: 0 }),
          }),
          followUpDefenceStat: new fields.StringField({ initial: "" }),
          followUpTN: new fields.NumberField({ initial: 0 }),
          followUpTargetMode: new fields.StringField({ initial: "multiZone" }),
          followUpZoneSource: new fields.StringField({ initial: "same" }),
          followUpZoneCount: new fields.StringField({ initial: "all" }),
          followUpAllowedZones: new fields.ArrayField(
            new fields.StringField({ initial: "" }),
            { initial: [] },
          ),
          followUpExcludeOriginal: new fields.BooleanField({ initial: true }),
        }),
        { initial: [] },
      ),
      interrupts: new fields.ArrayField(
        new fields.SchemaField({
          name: new fields.StringField({ initial: "Interrupt" }),
          cost: new fields.NumberField({ initial: 1 }),
          targetMode: new fields.StringField({ initial: "single" }),
          allowedZones: new fields.ArrayField(
            new fields.StringField({ initial: "" }),
            { initial: [] },
          ),
          actionType: new fields.StringField({ initial: "attack" }),
          defenceStat: new fields.StringField({ initial: "hard" }),
          testStat: new fields.StringField({ initial: "hard" }),
          tn: new fields.NumberField({ initial: 0 }),
          damage: new fields.SchemaField({
            resolve: new fields.NumberField({ initial: 0 }),
            wounds: new fields.NumberField({ initial: 0 }),
          }),
          conditionText: new fields.StringField({ initial: "" }),
          effectText: new fields.StringField({ initial: "" }),
        }),
        { initial: [] },
      ),
    };
  }

  prepareDerivedData() {
    this.defences.close = actorDataModelHooks.getEffectiveEntityStat(this.parent, "close");
    this.defences.ranged = actorDataModelHooks.getEffectiveEntityStat(this.parent, "ranged");
    this.defences.wyrd = actorDataModelHooks.getEffectiveEntityStat(this.parent, "wyrd");
    this.threat.max = actorDataModelHooks.getEffectiveEntityStat(this.parent, "threatCap");
    this.threat.perRound = actorDataModelHooks.getEffectiveEntityStat(this.parent, "threatPerRound");
    this.health.resolve.max = actorDataModelHooks.getEffectiveEntityStat(this.parent, "resolveMax");
    this.health.wounds.max = actorDataModelHooks.getEffectiveEntityStat(this.parent, "woundsMax");
    this.health.resolve.value = Math.min(Number(this.health.resolve.value ?? 0), Number(this.health.resolve.max ?? 0));
    this.health.wounds.value = Math.min(Number(this.health.wounds.value ?? 0), Number(this.health.wounds.max ?? 0));
  }
}

export class NpcDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      description: new fields.StringField({ initial: "" }),
      refugeOccupation: new fields.StringField({ initial: "" }),
      inRefuge: new fields.BooleanField({ initial: false }),
    };
  }
}

export class ThrallDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      stat: new fields.StringField({ initial: "strong" }),
      tn: new fields.NumberField({ initial: 10 }),
      damage: new fields.SchemaField({
        resolve: new fields.NumberField({ initial: 0 }),
        wounds: new fields.NumberField({ initial: 0 }),
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
      notes: new fields.StringField({ initial: "" }),
    };
  }
}

export class HazardDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      category: new fields.StringField({ initial: "hazard" }),
      stat: new fields.StringField({ initial: "strong" }),
      tn: new fields.NumberField({ initial: 10 }),
      targetMode: new fields.StringField({ initial: "any" }),
      damageSuccessResolve: new fields.NumberField({ initial: 0 }),
      damageFailureWounds: new fields.NumberField({ initial: 0 }),
      doomOnFailure: new fields.NumberField({ initial: 0 }),
      notes: new fields.StringField({ initial: "" }),
    };
  }
}

export class HollowDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    const stepSchema = () => new fields.SchemaField({
      done: new fields.BooleanField({ initial: false }),
      notes: new fields.StringField({ initial: "" }),
      performerActorId: new fields.StringField({ initial: "" }),
      performerName: new fields.StringField({ initial: "" }),
      performerImg: new fields.StringField({ initial: "" }),
    });
    const sceneSchema = new fields.SchemaField({
      sceneId: new fields.StringField({ initial: "" }),
      name: new fields.StringField({ initial: "" }),
      notes: new fields.StringField({ initial: "" }),
      revealed: new fields.BooleanField({ initial: false }),
      publicSnapshot: new fields.ObjectField({ initial: {} }),
      hazardIds: new fields.ArrayField(new fields.StringField({ initial: "" }), { initial: [] }),
      entityIds: new fields.ArrayField(new fields.StringField({ initial: "" }), { initial: [] }),
      thrallIds: new fields.ArrayField(new fields.StringField({ initial: "" }), { initial: [] }),
      rumourIds: new fields.ArrayField(new fields.StringField({ initial: "" }), { initial: [] }),
      relicIds: new fields.ArrayField(new fields.StringField({ initial: "" }), { initial: [] }),
    });
    const publicLinkSchema = () => new fields.SchemaField({
      ref: new fields.StringField({ initial: "" }),
      id: new fields.StringField({ initial: "" }),
      uuid: new fields.StringField({ initial: "" }),
      name: new fields.StringField({ initial: "" }),
      img: new fields.StringField({ initial: "" }),
      system: new fields.ObjectField({ initial: {} }),
    });
    return {
      status: new fields.StringField({ initial: "active" }),
      malignancy: new fields.StringField({ initial: "" }),
      summary: new fields.StringField({ initial: "" }),
      headerImg: new fields.StringField({ initial: "" }),
      lordId: new fields.StringField({ initial: "" }),
      doom: new fields.SchemaField({
        current: new fields.NumberField({ initial: 0, integer: true }),
        cap: new fields.NumberField({ initial: 25, integer: true }),
        show: new fields.BooleanField({ initial: false }),
      }),
      incursion: new fields.SchemaField({
        omensText: new fields.StringField({ initial: "" }),
        historyText: new fields.StringField({ initial: "" }),
        steps: new fields.SchemaField({
          gather: stepSchema(),
          resonate: stepSchema(),
          commune: stepSchema(),
          rend: stepSchema(),
        }),
      }),
      scenes: new fields.ArrayField(sceneSchema, { initial: [] }),
      trackedHazards: new fields.ArrayField(new fields.StringField({ initial: "" }), { initial: [] }),
      trackedThralls: new fields.ArrayField(new fields.StringField({ initial: "" }), { initial: [] }),
      trackedEntities: new fields.ArrayField(new fields.StringField({ initial: "" }), { initial: [] }),
      rumourIds: new fields.ArrayField(new fields.StringField({ initial: "" }), { initial: [] }),
      relicIds: new fields.ArrayField(new fields.StringField({ initial: "" }), { initial: [] }),
      publicLinks: new fields.SchemaField({
        hazards: new fields.ArrayField(publicLinkSchema(), { initial: [] }),
        thralls: new fields.ArrayField(publicLinkSchema(), { initial: [] }),
        entities: new fields.ArrayField(publicLinkSchema(), { initial: [] }),
        rumours: new fields.ArrayField(publicLinkSchema(), { initial: [] }),
        relics: new fields.ArrayField(publicLinkSchema(), { initial: [] }),
      }),
    };
  }
}

export class RefugeDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      resources: new fields.SchemaField({
        bone: new fields.NumberField({ initial: 0, integer: true }),
        hearts: new fields.NumberField({ initial: 0, integer: true }),
      }),
      npcRoles: new fields.SchemaField({
        keeper: new fields.StringField({ initial: "" }),
        doctor: new fields.StringField({ initial: "" }),
        apprentice: new fields.StringField({ initial: "" }),
        smith: new fields.StringField({ initial: "" }),
        magus: new fields.StringField({ initial: "" }),
      }),
      upgrades: new fields.ObjectField({ initial: {} }),
      residents: new fields.ArrayField(
        new fields.StringField({ initial: "" }),
        { initial: [] },
      ),
      unlockedExploration: new fields.ArrayField(new fields.StringField({ initial: "" }), { initial: [] }),
      unlockedBattle: new fields.ArrayField(new fields.StringField({ initial: "" }), { initial: [] }),
      notes: new fields.StringField({ initial: "" }),
    };
  }
}
