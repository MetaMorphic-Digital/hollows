/** A stored mechanic script shared by weapons and weapon abilities. */
export default class ScriptField extends foundry.data.fields.SchemaField {
  /** @type {Record<string, string>} */
  static modes = {
    single: "HOLLOWS.SCRIPT.modes.single",
    multiple: "HOLLOWS.SCRIPT.modes.multiple",
  };

  /**
   * @type {Record<string, {
   *   label?: string, ctx?: string[], returns?: string, sync?: boolean,
   *   hasOn?: boolean, hasEvent?: boolean, multipleOnly?: boolean
   * }>}
   */
  static hooks = {
    statOverride: { multipleOnly: true },
    attackRoll: { multipleOnly: true, sync: true },
    entityStat: { multipleOnly: true, sync: true },
    entityCost: { multipleOnly: true, sync: true },
    takeCover: { multipleOnly: true, sync: true },
    activated: {
      label: "HOLLOWS.SCRIPT.hooks.activated.label",
      ctx: [
        "actor",
        "item",
      ],
    },
    applyToZone: {
      label: "HOLLOWS.SCRIPT.hooks.applyToZone.label",
      ctx: ["actor", "item", "target", "payload"],
    },
    startOfTurn: {
      label: "HOLLOWS.SCRIPT.hooks.startOfTurn.label",
      ctx: [
        "actor",
        "entity",
        "item",
      ],
      hasOn: true,
    },
    endOfTurn: {
      label: "HOLLOWS.SCRIPT.hooks.endOfTurn.label",
      ctx: [
        "actor",
        "item",
      ],
    },
    onAttackResult: {
      label: "HOLLOWS.SCRIPT.hooks.onAttackResult.label",
      ctx: [
        "actor",
        "item",
        "entity",
        "result",
        "damageType",
        "damageValue",
        "weapon",
        "weaponId",
        "weaponType",
        "targetActor",
        "targetType",
        "attackerZone",
      ],
      returns: "HOLLOWS.SCRIPT.hooks.onAttackResult.returns",
    },
    onDefenceResult: {
      label: "HOLLOWS.SCRIPT.hooks.onDefenceResult.label",
      returns: "HOLLOWS.SCRIPT.hooks.onDefenceResult.returns",
      ctx: [
        "actor",
        "entity",
        "avoided",
        "damageType",
        "damageValue",
        "threatSpent",
        "item",
      ],
    },
    onMove: {
      label: "HOLLOWS.SCRIPT.hooks.onMove.label",
      ctx: [
        "actor",
        "fromZone",
        "toZone",
        "byOwner",
        "item",
      ],
    },
    onEvent: {
      label: "HOLLOWS.SCRIPT.hooks.onEvent.label",
      ctx: [
        "actor",
        "item",
        "event",
        "payload",
      ],
      hasEvent: true,
    },
    statModifier: {
      label: "HOLLOWS.SCRIPT.hooks.statModifier.label",
      ctx: [
        "actor",
        "item",
        "stat",
      ],
      returns: "HOLLOWS.SCRIPT.hooks.statModifier.returns",
      sync: true,
    },
    attackDamage: {
      label: "HOLLOWS.SCRIPT.hooks.attackDamage.label",
      ctx: [
        "actor",
        "weapon",
        "weaponType",
        "attackerZone",
        "targetType",
        "item",
      ],
      returns: "HOLLOWS.SCRIPT.hooks.attackDamage.returns",
      sync: true,
    },
    incomingDamage: {
      label: "HOLLOWS.SCRIPT.hooks.incomingDamage.label",
      ctx: [
        "actor",
        "damageType",
        "damageValue",
        "source",
        "item",
      ],
      returns: "HOLLOWS.SCRIPT.hooks.incomingDamage.returns",
    },
  };

  /** @type {Record<string, string>} */
  static events = {
    conditionRemoved: "HOLLOWS.SCRIPT.events.conditionRemoved",
    threatPlaced: "HOLLOWS.SCRIPT.events.threatPlaced",
    hunterPlacedThreat: "HOLLOWS.SCRIPT.events.hunterPlacedThreat",
    focus: "HOLLOWS.SCRIPT.events.focus",
    guard: "HOLLOWS.SCRIPT.events.guard",
    takeCover: "HOLLOWS.SCRIPT.events.takeCover",
    reload: "HOLLOWS.SCRIPT.events.reload",
    swordFeint: "HOLLOWS.SCRIPT.events.swordFeint",
    turnEnd: "HOLLOWS.SCRIPT.events.turnEnd",
    threatSpent: "HOLLOWS.SCRIPT.events.threatSpent",
    entityAttack: "HOLLOWS.SCRIPT.events.entityAttack",
    entityBleedingStart: "HOLLOWS.SCRIPT.events.entityBleedingStart",
    incomingEntityWoundDamage: "HOLLOWS.SCRIPT.events.incomingEntityWoundDamage",
  };

  /** @type {Record<string, string>} */
  static clients = {
    applyToZone: "HOLLOWS.SCRIPT.clients.activated",
    activated: "HOLLOWS.SCRIPT.clients.activated",
    startOfTurn: "HOLLOWS.SCRIPT.clients.startOfTurn",
    endOfTurn: "HOLLOWS.SCRIPT.clients.endOfTurn",
    onAttackResult: "HOLLOWS.SCRIPT.clients.onAttackResult",
    onDefenceResult: "HOLLOWS.SCRIPT.clients.onDefenceResult",
    onMove: "HOLLOWS.SCRIPT.clients.onMove",
    onEvent: "HOLLOWS.SCRIPT.clients.onEvent",
    attackDamage: "HOLLOWS.SCRIPT.clients.attackDamage",
    statModifier: "HOLLOWS.SCRIPT.clients.statModifier",
    incomingDamage: "HOLLOWS.SCRIPT.clients.incomingDamage",
  };

  /** @type {Record<string, string>} */
  static rateLimits = {
    none: "HOLLOWS.SCRIPT.rateLimits.none",
    oncePerTurn: "HOLLOWS.SCRIPT.rateLimits.oncePerTurn",
    oncePerRound: "HOLLOWS.SCRIPT.rateLimits.oncePerRound",
    oncePerCombat: "HOLLOWS.SCRIPT.rateLimits.oncePerCombat",
  };

  /** @type {Record<string, string>} */
  static turnScopes = {
    actor: "HOLLOWS.SCRIPT.turnScopes.actor",
    entity: "HOLLOWS.SCRIPT.turnScopes.entity",
    actorAll: "HOLLOWS.SCRIPT.turnScopes.actorAll",
  };

  /** @param {object} [options] SchemaField options. */
  constructor(options = {}) {
    const fields = foundry.data.fields;
    super({
      enabled: new fields.BooleanField({ initial: false }),
      label: new fields.StringField({ initial: "" }),
      mode: new fields.StringField({ initial: "single", choices: Object.keys(ScriptField.modes) }),
      hook: new fields.StringField({ initial: "activated", choices: Object.keys(ScriptField.hooks) }),
      on: new fields.StringField({ initial: "actor", choices: Object.keys(ScriptField.turnScopes) }),
      eventType: new fields.StringField({ initial: "guard", choices: Object.keys(ScriptField.events) }),
      rateLimit: new fields.StringField({ initial: "none", choices: Object.keys(ScriptField.rateLimits) }),
      source: new fields.StringField({ initial: "", trim: false }),
    }, options);
  }
}
