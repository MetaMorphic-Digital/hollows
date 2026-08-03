// Schema for GM-authored scripts, shared by a weapon's Renown block and a
// Weapon Ability.

// hook → the mechanic class the compiler builds, and the ctx the body receives.
export const SCRIPT_HOOKS = {
  activated: {
    label: "Activated — button on the Hunter sheet",
    ctx: ["actor"],
  },
  startOfTurn: {
    label: "Start of turn",
    ctx: ["actor", "entity"],
    hasOn: true,
  },
  endOfTurn: {
    label: "End of your turn",
    ctx: ["actor"],
  },
  onAttackResult: {
    label: "After your attack resolves",
    ctx: ["actor", "item", "entity", "result", "damageType", "damageValue", "weapon", "weaponId", "weaponType", "targetActor", "targetType", "attackerZone"],
    returns: "optionally { damageValue, cardLine } to change the attack before damage lands",
  },
  onDefenceResult: {
    label: "After you are attacked",
    ctx: ["actor", "entity", "result", "damageType", "damageValue"],
  },
  onMove: {
    label: "When you Move",
    ctx: ["actor", "fromZone", "toZone", "phase"],
  },
  // The Reaction family. Runs locally, so self-scoped events only.
  onEvent: {
    label: "On a game event (Guard, Reload, Feint…)",
    ctx: ["actor", "item", "event", "payload"],
    hasEvent: true,
  },
  statModifier: {
    label: "Passive stat bonus (return a number)",
    ctx: ["actor", "item", "stat"],
    returns: "the bonus added to that stat",
    sync: true,
  },
  attackDamage: {
    label: "Modify your attack damage (return { resolve, wounds })",
    ctx: ["actor", "weapon", "weaponType", "attackerZone", "targetType"],
    returns: "{ resolve, wounds } added to the attack's damage",
    // Synchronous dispatcher: no await, sync facade only.
    sync: true,
  },
  incomingDamage: {
    label: "Modify damage you take (return a number)",
    ctx: ["actor", "damageType", "damageValue", "source"],
    returns: "the new damage value",
  },
};

// Events the reaction dispatchers already emit, all through offerEventReactions.
export const SCRIPT_EVENTS = {
  guard: "When you Guard",
  takeCover: "When you Take Cover",
  reload: "When you Reload",
  swordFeint: "When you Feint",
  turnEnd: "When your turn ends",
  threatSpent: "When Threat is spent",
  entityAttack: "When the Entity attacks",
  entityBleedingStart: "When the Entity starts Bleeding",
  incomingEntityWoundDamage: "When you take Wound damage from the Entity",
};

// Which client a hook runs on — decides whether "direct" helpers are usable.
export const SCRIPT_HOOK_CLIENT = {
  activated: "the acting player",
  startOfTurn: "the GM",
  endOfTurn: "the GM",
  onAttackResult: "the attacking player",
  onDefenceResult: "the defending player",
  onMove: "the GM",
  onEvent: "whoever triggered the event",
  attackDamage: "the attacking player",
  statModifier: "whoever renders the sheet",
  incomingDamage: "the GM",
};

export const SCRIPT_RATE_LIMITS = {
  none: "No limit",
  oncePerTurn: "Once per turn",
  oncePerRound: "Once per round",
  oncePerCombat: "Once per combat",
};

export const SCRIPT_TURN_SCOPES = {
  actor: "Your own turn",
  entity: "The Entity's turn",
};

export const scriptField = () => {
  const fields = foundry.data.fields;
  return new fields.SchemaField({
    enabled: new fields.BooleanField({ initial: false }),
    label: new fields.StringField({ initial: "" }),
    hook: new fields.StringField({ initial: "activated", choices: Object.keys(SCRIPT_HOOKS) }),
    on: new fields.StringField({ initial: "actor", choices: Object.keys(SCRIPT_TURN_SCOPES) }),
    eventType: new fields.StringField({ initial: "guard", choices: Object.keys(SCRIPT_EVENTS) }),
    rateLimit: new fields.StringField({ initial: "none", choices: Object.keys(SCRIPT_RATE_LIMITS) }),
    source: new fields.StringField({ initial: "" }),
  });
};
