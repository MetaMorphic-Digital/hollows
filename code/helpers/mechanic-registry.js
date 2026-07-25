import { EndOfTurnAction } from "../data/mechanics/EndOfTurnAction.js";
import { StartOfTurnAction } from "../data/mechanics/StartOfTurnAction.js";
import { AttackDamageChange } from "../data/mechanics/AttackDamageChange.js";
import { StatModifier } from "../data/mechanics/StatModifier.js";
import { StatOverride } from "../data/mechanics/StatOverride.js";
import { OnAttackResultAction } from "../data/mechanics/OnAttackResultAction.js";
import { OnDefenceResultAction } from "../data/mechanics/OnDefenceResultAction.js";
import { OnMoveAction } from "../data/mechanics/OnMoveAction.js";
import { EntityAbilityModifier } from "../data/mechanics/EntityAbilityModifier.js";
import { EntityStatModifier } from "../data/mechanics/EntityStatModifier.js";
import { EntitySelfStatModifier } from "../data/mechanics/EntitySelfStatModifier.js";
import { EntitySelfActionModifier } from "../data/mechanics/EntitySelfActionModifier.js";
import { ActivatedAbility } from "../data/mechanics/ActivatedAbility.js";
import { ApplyToZone } from "../data/mechanics/ApplyToZone.js";
import { AttackRollModifier } from "../data/mechanics/AttackRollModifier.js";
import { IncomingDamageModifier } from "../data/mechanics/IncomingDamageModifier.js";
import { EntityActionPause } from "../data/mechanics/EntityActionPause.js";
import { Reaction } from "../data/mechanics/Reaction.js";
import { TakeCoverModifier } from "../data/mechanics/TakeCoverModifier.js";
import { ThreatLock } from "../data/mechanics/ThreatLock.js";
import { OnDeath } from "../data/mechanics/OnDeath.js";
import { WeaponModifier } from "../data/mechanics/WeaponModifier.js";

import * as knife from "../data/abilities/knife/index.js";
import * as armour from "../data/abilities/armour/index.js";
import * as pistol from "../data/abilities/pistol/index.js";
import * as rifle from "../data/abilities/rifle/index.js";
import * as shotgun from "../data/abilities/shotgun/index.js";
import * as sword from "../data/abilities/sword/index.js";
import * as spear from "../data/abilities/spear/index.js";
import * as book from "../data/abilities/book/index.js";
import * as echo from "../data/echo/mechanics.js";
import * as refugeData from "../data/refuge/index.js";
import * as entityData from "../data/entity/index.js";

const BUCKETS = {
  endOfTurn: [],
  startOfTurn: [],
  attackDamage: [],
  statModifier: [],
  statOverride: [],
  onAttackResult: [],
  onDefenceResult: [],
  onMove: [],
  entityAbilityModifier: [],
  entityStatModifier: [],
  entitySelfStatModifier: [],
  entitySelfActionModifier: [],
  activated: [],
  applyToZone: [],
  attackRollModifier: [],
  incomingDamageModifier: [],
  entityActionPause: [],
  reactions: [],
  takeCoverModifier: [],
  threatLock: [],
  onDeath: [],
  weaponModifier: []
};

const CLASS_TO_BUCKET = new Map([
  [EndOfTurnAction, "endOfTurn"],
  [StartOfTurnAction, "startOfTurn"],
  [AttackDamageChange, "attackDamage"],
  [StatModifier, "statModifier"],
  [StatOverride, "statOverride"],
  [OnAttackResultAction, "onAttackResult"],
  [OnDefenceResultAction, "onDefenceResult"],
  [OnMoveAction, "onMove"],
  [EntityAbilityModifier, "entityAbilityModifier"],
  [EntityStatModifier, "entityStatModifier"],
  [EntitySelfStatModifier, "entitySelfStatModifier"],
  [EntitySelfActionModifier, "entitySelfActionModifier"],
  [ActivatedAbility, "activated"],
  [ApplyToZone, "applyToZone"],
  [AttackRollModifier, "attackRollModifier"],
  [IncomingDamageModifier, "incomingDamageModifier"],
  [EntityActionPause, "entityActionPause"],
  [Reaction, "reactions"],
  [TakeCoverModifier, "takeCoverModifier"],
  [ThreatLock, "threatLock"],
  [OnDeath, "onDeath"],
  [WeaponModifier, "weaponModifier"]
]);

function bucketOf(instance) {
  for (const [ctor, bucket] of CLASS_TO_BUCKET) {
    if (instance instanceof ctor) return bucket;
  }
  return null;
}

// Public: scan a module's exports and bucket any mechanic instances. Used for
// the core sources below; available for any future module (incl. external).
export function registerMechanicModule(mod) {
  for (const exp of Object.values(mod)) {
    if (!exp || typeof exp !== "object") continue;
    const bucket = bucketOf(exp);
    if (bucket) BUCKETS[bucket].push(exp);
    for (const mechanic of Array.isArray(exp.mechanics) ? exp.mechanics : []) {
      const mechanicBucket = bucketOf(mechanic);
      if (mechanicBucket) BUCKETS[mechanicBucket].push(mechanic);
    }
  }
}

registerMechanicModule(knife);
registerMechanicModule(armour);
registerMechanicModule(pistol);
registerMechanicModule(rifle);
registerMechanicModule(shotgun);
registerMechanicModule(sword);
registerMechanicModule(spear);
registerMechanicModule(book);
registerMechanicModule(echo);
registerMechanicModule(refugeData);
registerMechanicModule(entityData);

export const MECHANIC_BUCKETS = BUCKETS;

export function getCount() {
  return Object.values(BUCKETS).reduce((sum, list) => sum + list.length, 0);
}
