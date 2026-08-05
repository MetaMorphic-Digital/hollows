/**
 * Dispatchers — entry points called from existing game code (combat hooks,
 * sheet handlers, damage flow). Each iterates the relevant bucket and runs
 * mechanic-specific logic for abilities the actor actually carries.
 */

import { MECHANIC_BUCKETS } from "../mechanic-registry.js";
import { runRelicTriggers, runRelicDeathSave, runRelicActionCancel } from "../../data/relic/apply-effect.js";
import { relicHunterStatDelta, relicIncomingDamageDelta } from "../../data/relic/passive.js";
import { hasWeaponAbility } from "../weapon-utils.js";
import { evalTriggers } from "../../data/mechanics/dsl/triggers.js";
import { applyEffects } from "../../data/mechanics/dsl/effects.js";
import { getActorZone, getAdjacentZones, getTokenZone, isRangedZone, getActiveSceneHunters } from "../../canvas/zone.js";
import { AttackDamageChange } from "../../data/mechanics/AttackDamageChange.js";
import { AttackRollModifier } from "../../data/mechanics/AttackRollModifier.js";
import { IncomingDamageModifier } from "../../data/mechanics/IncomingDamageModifier.js";
import { getHunterSpecialConditions } from "../../documents/actor/conditions.js";
import { OnAttackResultAction } from "../../data/mechanics/OnAttackResultAction.js";
import { OnDefenceResultAction } from "../../data/mechanics/OnDefenceResultAction.js";
import { OnMoveAction } from "../../data/mechanics/OnMoveAction.js";
import { EndOfTurnAction } from "../../data/mechanics/EndOfTurnAction.js";
import { StartOfTurnAction } from "../../data/mechanics/StartOfTurnAction.js";
import { ActivatedAbility } from "../../data/mechanics/ActivatedAbility.js";
import { StatModifier } from "../../data/mechanics/StatModifier.js";
import { getSelectedWeaponFormMechanics, getAllRegisteredWeaponFormMechanics } from "../../data/weapons/index.js";
import { getScriptedMechanics, ScriptedEvent } from "../../documents/item/script-compiler.js";

function sameKey(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

function carries(actor, ability) {
  if (!actor) return false;
  if (ability?.weapon && Number(ability.tier || 0) <= 0) {
    return (actor.items || []).some((item) =>
      item.type === "weapon"
      && String(item.system?.weaponType || "") === String(ability.weapon)
      && (!ability.form || sameKey(item.system?.selectedForm, ability.form))
    );
  }
  return hasWeaponAbility(actor, {
    key: ability.key,
    name: ability.name,
    weaponType: ability.weapon,
    tier: ability.tier
  });
}

function selectedFormMechanics(context = {}, ctor = null) {
  const mechanics = getSelectedWeaponFormMechanics(context.weapon);
  return ctor ? mechanics.filter((mechanic) => mechanic instanceof ctor) : mechanics;
}

function selectedActorFormMechanics(actor, ctor = null) {
  const weapons = actor?.items?.filter?.((item) => item.type === "weapon") || [];
  const mechanics = weapons.flatMap((weapon) => getSelectedWeaponFormMechanics(weapon));
  return ctor ? mechanics.filter((mechanic) => mechanic instanceof ctor) : mechanics;
}

// Item-borne mechanics: gated by holding the item, not by carries().
// Use scriptedMechanics where forms already arrive by another path (otherwise
// they run twice), itemMechanics where they do not.
function scriptedMechanics(actor, ctor = null) {
  const mechanics = getScriptedMechanics(actor);
  return ctor ? mechanics.filter((mechanic) => mechanic instanceof ctor) : mechanics;
}

function itemMechanics(actor, ctor = null) {
  const mechanics = [...selectedActorFormMechanics(actor), ...getScriptedMechanics(actor)];
  return ctor ? mechanics.filter((mechanic) => mechanic instanceof ctor) : mechanics;
}

// Group reaction candidates by owning user (GM-fallback for ownerless), so a
// reaction is offered once per owner with that owner's candidate ids.
function groupByOwner(candidates, primaryOwnerOf) {
  const byOwner = new Map();
  for (const candidate of candidates) {
    const owner = primaryOwnerOf(candidate) || game.user;
    const list = byOwner.get(owner.id) || { owner, candidates: [] };
    list.candidates.push(candidate);
    byOwner.set(owner.id, list);
  }
  return byOwner.values();
}

// Fold an IncomingDamageModifier.modify() result into the running out{}: a
// number or { damageValue, note } sets the value; a note is kept if it changed.
function applyDamageModifierResult(out, result, before) {
  if (result == null || result === false) return;
  const nextValue = typeof result === "number" ? result : result.damageValue;
  out.damageValue = Math.max(0, Number(nextValue ?? out.damageValue));
  const note = typeof result === "object" ? result.note : "";
  if (note && out.damageValue !== before) out.notes.push(note);
}

// ─── Passive end-of-turn ─────────────────────────────────────────────────
// Dispatcher runs on GM (single point of truth). Effects that need owner
// input route the dialog to the actor's owner via per-effect queries.
export async function runEndOfTurnAbilities(actor) {
  if (!actor || !game.user?.isGM) return;
  const formActions = getAllRegisteredWeaponFormMechanics()
    .filter((mechanic) => mechanic instanceof EndOfTurnAction);
  const scripted = scriptedMechanics(actor, EndOfTurnAction);
  const borne = new Set(scripted);
  for (const ability of [...scripted, ...MECHANIC_BUCKETS.endOfTurn, ...formActions]) {
    if (!borne.has(ability) && !carries(actor, ability)) continue;
    await ability.run(actor);
  }
}

export async function runEntityActionPauses(context = {}) {
  const state = {
    ...context,
    targetTokens: Array.isArray(context.targetTokens) ? Array.from(context.targetTokens) : [],
    selectedZones: Array.isArray(context.selectedZones) ? Array.from(context.selectedZones) : []
  };
  if (!game.user?.isGM) return state;
  const carriers = getActiveSceneHunters();

  for (const ability of MECHANIC_BUCKETS.entityActionPause) {
    for (const carrier of carriers) {
      if (!carries(carrier, ability)) continue;
      if (!ability.match(carrier, state)) continue;
      const result = await ability.run(carrier, state);
      if (Array.isArray(result.targetTokens)) state.targetTokens = result.targetTokens;
      if (Array.isArray(result.selectedZones)) state.selectedZones = result.selectedZones;
      if (result.cancelled) return { ...state, cancelled: true };
      // Single-target redirect (Blockade): a carrier became the target instead.
      // Re-point the single-target context and stop — the target is now settled.
      if (result.target && result.target.id !== state.target?.id) {
        state.target = result.target;
        state.targetToken = result.targetToken || state.targetToken;
        state.targetZone = result.targetZone || state.targetZone;
        return state;
      }
    }
  }
  if (await runRelicActionCancel(state)) return { ...state, cancelled: true };
  return state;
}

// ─── Start-of-turn handshakes ────────────────────────────────────────────
export async function runStartOfTurnAbilities({ actor, entity, on = "actor" } = {}) {
  if (!game.user?.isGM) return;
  if (on === "entity") {
    const carriers = getActiveSceneHunters();
    for (const carrier of carriers) {
      const scripted = scriptedMechanics(carrier, StartOfTurnAction);
      const borne = new Set(scripted);
      for (const ability of [...scripted, ...MECHANIC_BUCKETS.startOfTurn]) {
        if (ability.on !== "entity") continue;
        if (!borne.has(ability) && !carries(carrier, ability)) continue;
        await ability.run({ actor: carrier, entity });
      }
    }
    await runRelicTriggers("onTurnStart");
    return;
  }
  // "actorAll": fires for every carrier on scene when any actor's turn starts.
  // run() receives { actor: turnActor, carrier } — carrier is who owns the ability.
  if (on === "actorAll") {
    if (!actor) return;
    const carriers = getActiveSceneHunters();
    for (const ability of MECHANIC_BUCKETS.startOfTurn) {
      if (ability.on !== "actorAll") continue;
      for (const carrier of carriers) {
        if (!carries(carrier, ability)) continue;
        await ability.run({ actor, carrier });
      }
    }
    return;
  }
  if (!actor) return;
  const scripted = scriptedMechanics(actor, StartOfTurnAction);
  const borne = new Set(scripted);
  for (const ability of [...scripted, ...MECHANIC_BUCKETS.startOfTurn]) {
    if (ability.on !== on) continue;
    if (!borne.has(ability) && !carries(actor, ability)) continue;
    await ability.run({ actor, entity });
  }
}

// ─── Attack damage changes (set/add passive modifiers) ───────────────────
export function applyAttackDamageChanges(actor, damage = {}, context = {}) {
  const out = {
    resolve: Number(damage.resolve || 0),
    wounds: Number(damage.wounds || 0)
  };
  const abilityMatches = MECHANIC_BUCKETS.attackDamage
    .filter((ability) => ability.aura || carries(actor, ability));
  const formMatches = selectedFormMechanics(context, AttackDamageChange);
  const scriptMatches = scriptedMechanics(actor, AttackDamageChange);
  const matching = [...abilityMatches, ...formMatches, ...scriptMatches]
    .filter((ability) => ability.match(actor, context));
  for (const ability of matching.filter((a) => a.mode === "set")) {
    out.resolve = Number(ability.value?.resolve ?? out.resolve);
    out.wounds = Number(ability.value?.wounds ?? out.wounds);
  }
  for (const ability of matching.filter((a) => a.mode !== "set")) {
    const delta = ability.getDelta(actor, context);
    out.resolve += delta.resolve;
    out.wounds += delta.wounds;
  }
  return out;
}

// Passive actor stat modifiers used by displayed totals and rolls.
export function getStatModifier(actor, statKey) {
  let total = 0;
  const scripted = scriptedMechanics(actor, StatModifier);
  const borne = new Set(scripted);
  for (const ability of [...scripted, ...MECHANIC_BUCKETS.statModifier]) {
    if (!borne.has(ability) && !carries(actor, ability)) continue;
    total += ability.value(actor, statKey);
  }
  total += relicHunterStatDelta(actor, statKey);
  return total;
}

// Passive weapon-stat modifiers (Capacity, …) from abilities the carrier holds.
// The weapon-stat mirror of getStatModifier; consulted by getEffectiveCapacity.
export function getWeaponModifier(weapon, statKey) {
  const actor = weapon?.actor;
  if (!actor) return 0;
  let total = 0;
  for (const ability of MECHANIC_BUCKETS.weaponModifier) {
    if (!carries(actor, ability)) continue;
    total += ability.value(weapon, statKey);
  }
  return total;
}

// ─── Stat overrides available to actor (returns array of available overrides) ─
export function getStatOverrides(actor, scope) {
  const out = [];
  for (const ability of MECHANIC_BUCKETS.statOverride) {
    if (ability.scope !== scope) continue;
    if (!carries(actor, ability)) continue;
    if (!ability.available(actor)) continue;
    if (ability.rateLimit && isRateLimited(actor, ability)) continue;
    out.push(ability);
  }
  return out;
}

// Pay cost + mark rate limit. Returns true unless the override is on cooldown.
// The Resolve cost is paid through the shared payResourceCost (Resolve first,
// shortfall in Wounds) — same path as activated abilities.
export async function tryActivateStatOverride(actor, override) {
  if (!actor || !override) return false;
  if (override.rateLimit && isRateLimited(actor, override)) {
    ui.notifications?.warn?.(`${override.name} is on cooldown.`);
    return false;
  }
  await payResourceCost(actor, override);
  if (override.rateLimit) await markRateLimit(actor, override);
  return true;
}

// Evaluate a StatOverride's successCondition against runtime context.
// Supported: { type: "rolledUnder", stat: "quick" }
//            { type: "damageType", damageType: "Wounds" }
export function evaluateStatOverrideSuccess(override, ctx = {}) {
  const cond = override?.successCondition;
  if (!cond) return false;
  if (cond.type === "rolledUnder") return Number(ctx.roll) < Number(ctx.statValue);
  if (cond.type === "damageType") {
    return String(ctx.damageType) === String(cond.damageType) && Number(ctx.damageValue) > 0;
  }
  return false;
}

export function isRateLimited(actor, ability) {
  const flag = actor.getFlag("hollows", `ability.${ability.key}.usedAt`);
  if (!flag) return false;
  const combat = game.combat;
  if (!combat?.started) return false;
  if (ability.rateLimit === "oncePerCombat") {
    return flag.combatId === combat.id;
  }
  if (ability.rateLimit === "oncePerRound") {
    return flag.combatId === combat.id && Number(flag.round) === Number(combat.round ?? 0);
  }
  if (ability.rateLimit === "oncePerTurn") {
    return flag.combatId === combat.id
      && Number(flag.round) === Number(combat.round ?? 0)
      && flag.turnId === combat.combatant?.id;
  }
  return false;
}

export async function markRateLimit(actor, ability) {
  const combat = game.combat;
  if (!combat?.started) return;
  await actor.setFlag("hollows", `ability.${ability.key}.usedAt`, {
    combatId: combat.id,
    round: Number(combat.round ?? 0),
    turnId: combat.combatant?.id || null
  });
}

// ─── On attack result ────────────────────────────────────────────────────
// Unlike the turn-based dispatchers, this runs on the attacker's own client
// (the hunter-sheet attack flow) or on the GM (Hunter attack damage apply).
//
// `scope: "self"` abilities belong to the attacker and run on their client.
// `scope: "zoneMate"` abilities belong to a Hunter sharing the attacker's
// area (Keep Up the Pressure — react to an ally's miss); they run on each
// carrier's own client. `context` carries `damageType`/`damageValue` so
// damage-typed abilities (Momentum, Hotfoot, …) can self-filter.
export async function runOnAttackResult(actor, result, context = {}) {
  const out = {
    damageType: context.damageType || null,
    damageValue: Math.max(0, Number(context.damageValue || 0)),
    cardLines: []
  };
  if (!actor) return out;
  const currentContext = () => ({
    ...context,
    damageType: out.damageType,
    damageValue: out.damageValue
  });
  const applyMutation = (mutation) => {
    if (!mutation || typeof mutation !== "object") return;
    if (mutation.damageType) out.damageType = mutation.damageType;
    if (mutation.damageValue != null) out.damageValue = Math.max(0, Number(mutation.damageValue || 0));
    if (mutation.damageValueDelta) out.damageValue = Math.max(0, out.damageValue + Number(mutation.damageValueDelta || 0));
    if (Array.isArray(mutation.cardLines)) out.cardLines.push(...mutation.cardLines.filter(Boolean));
    else if (mutation.cardLine) out.cardLines.push(mutation.cardLine);
  };
  const borneMechanics = [
    ...selectedFormMechanics(context, OnAttackResultAction),
    ...scriptedMechanics(actor, OnAttackResultAction),
  ];
  const formMechanicSet = new Set(borneMechanics);
  for (const ability of [...borneMechanics, ...MECHANIC_BUCKETS.onAttackResult]) {
    if (!ability.matchResult(result)) continue;
    if (context.timing && ability.timing !== context.timing && ability.timing !== "any") continue;
    if (!ability.matchDamage(currentContext())) continue;
    if (ability.weaponType && String(context.weaponType || "") !== ability.weaponType) continue;

    if (ability.scope === "zoneMate") {
      const myZone = getActorZone(actor);
      if (!myZone) continue;
      const zoneMates = getActiveSceneHunters()
        .filter((a) => a.id !== actor.id)
        .filter((a) => getActorZone(a) === myZone)
        .filter((a) => carries(a, ability));
      // reaction-routed: offer to each carrier's owner (cross-client safe).
      if (ability.reaction) {
        const reactionsMod = await import("../reactions.js");
        const reaction = reactionsMod.getReactionByKey(ability.reaction);
        if (!reaction) continue;
        for (const carrier of zoneMates) {
          if (ability.rateLimit && isRateLimited(carrier, ability)) continue;
          const owner = reactionsMod.primaryOwnerOf(carrier) || game.user;
          const choice = await reaction.offer(owner, { targetId: carrier.id, attackerId: actor.id, result, ...context });
          if (choice && ability.rateLimit) await markRateLimit(carrier, ability);
        }
        continue;
      }
      // effects-routed: run locally for carriers this client owns.
      for (const carrier of zoneMates.filter((a) => a.isOwner)) {
        if (ability.rateLimit && isRateLimited(carrier, ability)) continue;
        const fired = await ability.run({ actor: carrier, attacker: actor, result, ...currentContext() });
        if (fired !== false && ability.rateLimit) await markRateLimit(carrier, ability);
      }
      continue;
    }

    if (ability.matchCarrier) {
      if (!game.user?.isGM) continue;
      const carrier = ability.matchCarrier(actor, currentContext());
      if (!carrier) continue;
      await ability.run({ actor, carrier, result, ...currentContext() });
      continue;
    }

    const isFormMechanic = formMechanicSet.has(ability);
    if (!actor.isOwner) continue;
    if (!isFormMechanic && !ability.aura && !carries(actor, ability)) continue;
    if (!ability.matchActive(actor, currentContext())) continue;
    if (ability.rateLimit && isRateLimited(actor, ability)) continue;
    const fired = await ability.run({ actor, result, ...currentContext() });
    applyMutation(fired);
    if (fired !== false && ability.rateLimit) await markRateLimit(actor, ability);
  }
  return out;
}

// ─── On defence result (entity attack resolved against a hunter) ─────────
// Returns { damageRedirected } so the damage-intake flow can skip its own
// apply when a redirect ability (Martyr) consumed the hit.
//
// Called from two points, mutually exclusive per attack: the GM-side damage
// application (with damage values) and the player-side defend flow (with
// { avoided: true } for outcomes that never reach the apply step). Each runs
// on exactly one client, so reaction-based abilities are offered straight to
// the carrier's owner — self-resolving inline when the detecting client
// already owns them; effects-based abilities run on the detecting client.
export async function runOnDefenceResult(actor, ctx = {}) {
  const out = { damageRedirected: false };
  if (!actor) return out;
  const reactionsMod = await import("../reactions.js");
  const borneMechanics = itemMechanics(actor, OnDefenceResultAction);
  const formMechanicSet = new Set(borneMechanics);
  for (const ability of [...borneMechanics, ...MECHANIC_BUCKETS.onDefenceResult]) {
    if (!ability.matches(ctx)) continue;

    if (ability.scope === "self") {
      if (!formMechanicSet.has(ability) && !carries(actor, ability)) continue;
      if (!evalTriggers(ability.triggers, { actor })) continue;
      if (ability.reaction) {
        const reaction = reactionsMod.getReactionByKey(ability.reaction);
        if (!reaction) continue;
        const owner = reactionsMod.primaryOwnerOf(actor) || game.user;
        const choice = await reaction.offer(owner, { targetId: actor.id, damageType: ctx.damageType, damageValue: ctx.damageValue, threatSpent: ctx.threatSpent });
        if (ability.redirectsDamage && choice) out.damageRedirected = true;
        if (choice?.convertTo) {
          out.damageConverted = true;
          out.damageType = choice.convertTo.damageType;
          out.damageValue = Number(choice.convertTo.damageValue ?? 0);
        }
      } else {
        await ability.run({ actor, entity: ctx.entityActor });
      }
      continue;
    }

    if (ability.scope === "zoneMate") {
      const myZone = getActorZone(actor);
      if (!myZone) continue;
      const candidates = getActiveSceneHunters()
        .filter((a) => a.id !== actor.id)
        .filter((a) => getActorZone(a) === myZone)
        .filter((a) => carries(a, ability))
        .filter((a) => evalTriggers(ability.triggers, { actor: a }));
      if (!candidates.length) continue;
      if (ability.reaction) {
        const reaction = reactionsMod.getReactionByKey(ability.reaction);
        if (!reaction) continue;
        for (const { owner, candidates: ownerCandidates } of groupByOwner(candidates, reactionsMod.primaryOwnerOf)) {
          const choice = await reaction.offer(owner, {
            targetId: actor.id,
            candidateIds: ownerCandidates.map((a) => a.id),
            damageValue: ctx.damageValue
          });
          if (choice) {
            if (ability.redirectsDamage) out.damageRedirected = true;
            break;
          }
        }
      }
      continue;
    }
  }
  await runRelicTriggers("onHuntersDefend", { bearer: actor });
  await runRelicTriggers("onEntityAttack", { bearer: actor });
  return out;
}

// ─── On move ─────────────────────────────────────────────────────────────
export async function runOnMove(actor, { fromZone, toZone, phase, byOwner } = {}) {
  if (!actor || !game.user?.isGM) return;
  const borneMechanics = itemMechanics(actor, OnMoveAction);
  const formMechanicSet = new Set(borneMechanics);
  for (const ability of [...borneMechanics, ...MECHANIC_BUCKETS.onMove]) {
    if (!ability.aura && !formMechanicSet.has(ability) && !carries(actor, ability)) continue;
    await ability.run({ actor, fromZone, toZone, phase, byOwner });
  }
  if (phase === "after") await runRelicTriggers("onEnterZone", { bearer: actor });
}

// ─── Entity action cost delta (sums across all carriers on canvas) ───────
export function getEntityAbilityCostDelta(entity, actionType) {
  let threatDelta = 0;
  const carriers = getActiveSceneHunters();
  for (const ability of MECHANIC_BUCKETS.entityAbilityModifier) {
    for (const carrier of carriers) {
      if (!carries(carrier, ability)) continue;
      if (!ability.match(carrier, { entity, actionType })) continue;
      threatDelta += Number(ability.costDelta?.threat || 0);
    }
  }
  return { threat: threatDelta };
}

// ─── Entity stat delta (sums across all carriers on canvas) ──────────────
export function getEntityStatDelta(entity, stat) {
  let delta = 0;
  const carriers = getActiveSceneHunters();
  for (const ability of MECHANIC_BUCKETS.entityStatModifier) {
    for (const carrier of carriers) {
      if (!carries(carrier, ability)) continue;
      if (!ability.match(carrier, { entity, stat })) continue;
      delta += ability.delta;
    }
  }
  return delta;
}

// ─── Take Cover modifier ─────────────────────────────────────────────────
export function getTakeCoverModifier(actor) {
  const out = { expandZones: false, statKey: null, allowOtherTarget: false };
  for (const mod of MECHANIC_BUCKETS.takeCoverModifier) {
    if (!carries(actor, mod)) continue;
    if (mod.expandZones) out.expandZones = true;
    if (mod.statKey) out.statKey = mod.statKey;
    if (mod.allowOtherTarget) out.allowOtherTarget = true;
  }
  return out;
}

// ─── Activated abilities (sheet buttons) ─────────────────────────────────
export function getActivatedAbilities(actor) {
  const out = [];
  const scripted = scriptedMechanics(actor, ActivatedAbility);
  const borne = new Set(scripted);
  for (const ability of [...scripted, ...MECHANIC_BUCKETS.activated]) {
    // Aura abilities (e.g. Hollow-Way) surface on every Hunter; available() is
    // then the sole gate. Non-aura abilities still require carriership.
    if (!borne.has(ability) && !ability.aura && !carries(actor, ability)) continue;
    if (!ability.available(actor)) continue;
    out.push(ability);
  }
  return out;
}

export async function activateAbility(actor, ability, extraCtx = {}) {
  if (!actor || !ability) return false;
  if (ability.rateLimit && isRateLimited(actor, ability)) {
    ui.notifications?.warn?.(`${ability.name} is on cooldown.`);
    return false;
  }
  if (!(await canAffordCost(actor, ability))) return false;
  // Condition costs are spent BEFORE effects: the granted effect resolves
  // while the carrier no longer holds the condition (Bulwark — the ally's
  // Guard happens while you are no longer Ready, so it gets no zone bonus).
  // Resource costs are spent AFTER effects so a cancelled dialog
  // refunds them.
  await payConditionCost(actor, ability);
  const ctx = { actor, ...extraCtx };
  if (ability.run) await ability.run(actor, ctx);
  else await applyEffects(ability.effects, ctx);
  if (ctx._cancelled) return false;
  await payResourceCost(actor, ability);
  if (ability.rateLimit) await markRateLimit(actor, ability);
  return true;
}

// Preflight: caller must hold any condition the ability demands. Resolve costs
// always succeed — a shortfall is paid in Wounds (see payResourceCost).
async function canAffordCost(actor, ability) {
  const cost = ability?.cost;
  if (!cost) return true;
  if (cost.condition) {
    const { hasCondition } = await import("../../documents/actor/conditions.js");
    if (!hasCondition(actor, cost.condition)) {
      ui.notifications?.warn?.(`${ability.name} requires ${cost.condition}.`);
      return false;
    }
  }
  if (cost.resource === "focus") {
    const { getFocusCount } = await import("../../documents/actor/resources.js");
    if (getFocusCount(actor) < Number(cost.amount || 0)) {
      ui.notifications?.warn?.(`${ability.name} requires ${Number(cost.amount || 0)} Focus.`);
      return false;
    }
  }
  return true;
}

// Spent up-front (before effects) — condition discharge.
async function payConditionCost(actor, ability) {
  const cost = ability?.cost;
  if (!cost) return;
  if (cost.condition) {
    const { removeCondition } = await import("../../documents/actor/conditions.js");
    await removeCondition(actor, cost.condition);
  }
}

// Spent after effects — refundable on a cancelled dialog. A Resolve cost
// routes through resources.js spendResolve (Resolve first, shortfall → Wounds).
async function payResourceCost(actor, ability) {
  const cost = ability?.cost;
  if (!cost) return;
  if (cost.resource === "resolve") {
    const { spendResolve } = await import("../../documents/actor/resources.js");
    await spendResolve(actor, Number(cost.amount || 0));
  }
  if (cost.resource === "focus") {
    const { adjustHunterResource } = await import("../../documents/actor/resources.js");
    await adjustHunterResource(actor, { focus: -Number(cost.amount || 0) });
  }
}

// ─── ApplyToZone abilities (activate + pick zone-mate + run effects) ────
export function getApplyToZoneAbilities(actor) {
  const out = [];
  for (const ability of MECHANIC_BUCKETS.applyToZone) {
    if (!carries(actor, ability)) continue;
    if (!ability.available(actor)) continue;
    if (ability.rateLimit && isRateLimited(actor, ability)) continue;
    out.push(ability);
  }
  return out;
}

// Resolves the candidate target list based on the ability's `targetSelection`.
// Returns hunter Actors only (zone-mate semantics).
export function getApplyToZoneTargets(actor, ability) {
  const sel = ability?.targetSelection;
  if (!sel) return [];
  const myZone = getActorZone(actor) || "";
  const allowedZones = new Set();
  if (sel.zoneScope === "sameZone") allowedZones.add(myZone);
  else if (sel.zoneScope === "adjacent") {
    allowedZones.add(myZone);
    for (const z of getAdjacentZones(myZone)) allowedZones.add(z);
  } else if (sel.zoneScope === "anyZone") {
    // any zone — no filter applied below
  }
  const all = getActiveSceneHunters();
  return all.filter((a) => {
    if (sel.scope === "self" && a.id !== actor.id) return false;
    if (sel.scope === "ally" && a.id === actor.id) return false;
    if (sel.zoneScope !== "anyZone") {
      const z = getActorZone(a) || "";
      if (!allowedZones.has(z)) return false;
    }
    return true;
  });
}

export async function activateApplyToZone(actor, ability, target, extraCtx = {}) {
  if (!actor || !ability || !target) return false;
  return await activateAbility(actor, ability, { target, ...extraCtx });
}

// ─── Event-driven Reaction dispatchers ──────────────────────────────────
// Two shapes:
//   actor-scoped — the event belongs to one actor (conditionRemoved). The
//     caller (the removeCondition hook) only fires it on the owning client,
//     so we offer to that actor's owner directly.
//   global       — the event is grid-wide (threatPlaced). Only the GM fires
//     it; we iterate every hunter on canvas who carries the reaction.
// `payload` must be serialization-safe (ids, primitives) — it crosses the
// CONFIG.queries boundary when the reaction is offered to a remote user.
async function offerEventReactions(eventMatcher, { actor = null, payload = {} } = {}) {
  const { getAllReactions, primaryOwnerOf } = await import("../reactions.js");
  for (const reaction of getAllReactions()) {
    if (!reaction.event) continue;
    if (!eventMatcher(reaction.event)) continue;
    if (actor) {
      // zoneMate-scoped: the reaction belongs to a hunter SHARING the acting
      // hunter's zone, not the actor itself (Bulwark — a Ready ally grants the
      // guarder +1). Offer to the first eligible carrier only — the bonus is a
      // flat +1 regardless of how many carriers are present.
      if (reaction.event.scope === "zoneMate") {
        const zone = getActorZone(actor);
        if (!zone) continue;
        const mate = getActiveSceneHunters()
          .find((a) => a.id !== actor.id && getActorZone(a) === zone && carries(a, reaction));
        if (!mate) continue;
        const owner = primaryOwnerOf(mate) || game.user;
        try { await reaction.offer(owner, { actorId: actor.id, carrierId: mate.id, ...payload }); }
        catch (err) { console.warn(`Hollows | event-reaction ${reaction.key} failed:`, err); }
        continue;
      }
      if (!carries(actor, reaction)) continue;
      const owner = primaryOwnerOf(actor) || game.user;
      try { await reaction.offer(owner, { actorId: actor.id, ...payload }); }
      catch (err) { console.warn(`Hollows | event-reaction ${reaction.key} failed:`, err); }
    } else {
      if (!game.user?.isGM) continue;
      const carriers = getActiveSceneHunters()
        .filter((a) => carries(a, reaction));
      for (const carrier of carriers) {
        const owner = primaryOwnerOf(carrier) || game.user;
        try { await reaction.offer(owner, { actorId: carrier.id, ...payload }); }
        catch (err) { console.warn(`Hollows | event-reaction ${reaction.key} failed:`, err); }
      }
    }
  }
  await runScriptedEvents(eventMatcher, { actor, payload });
}

// Runs on whichever client fired the event, so self-scoped events only —
// zoneMate cases still need a Reaction.
async function runScriptedEvents(eventMatcher, { actor = null, payload = {} } = {}) {
  const carriers = actor ? [actor] : (game.user?.isGM ? getActiveSceneHunters() : []);
  for (const carrier of carriers) {
    for (const mechanic of scriptedMechanics(carrier, ScriptedEvent)) {
      if (!eventMatcher({ type: mechanic.eventType })) continue;
      try { await mechanic.run(carrier, payload); }
      catch (err) { console.warn(`Hollows | scripted event ${mechanic.key} failed:`, err); }
    }
  }
}

// Reload full-refill check. Reload is initiated by the carrier's own client, so
// matching reactions are prompted locally (promptOnPlayer runs here, no query).
// Returns true if any reaction converts this reload to a full refill (Come Out
// Shooting). reload.js consults this and never names the ability.
export async function runReloadFullCheck(actor, weapon) {
  if (!actor || !weapon) return false;
  const { getAllReactions } = await import("../reactions.js");
  for (const reaction of getAllReactions()) {
    if (reaction.event?.type !== "reloadFullCheck") continue;
    if (!carries(actor, reaction)) continue;
    const choice = await reaction.promptOnPlayer({
      actorId: actor.id,
      weaponId: weapon.id,
      weaponType: String(weapon.system?.weaponType || "")
    });
    if (choice?.fullReload) return true;
  }
  return false;
}

// Bleeding start-of-turn check: a carrier ability may consume the Entity's
// Bleeding instead of the normal damage. Returns true when consumed.
export async function runEntityBleedingStartCheck(entity) {
  if (!game.user?.isGM) return false;
  const { getAllReactions, primaryOwnerOf } = await import("../reactions.js");
  const carriers = getActiveSceneHunters();
  for (const reaction of getAllReactions()) {
    if (reaction.event?.type !== "entityBleedingStart") continue;
    for (const carrier of carriers.filter((c) => carries(c, reaction))) {
      const owner = primaryOwnerOf(carrier);
      if (!owner?.active) continue;
      const choice = await reaction.offer(owner, { entityId: entity.id, carrierId: carrier.id });
      if (choice?.applied) return true;
    }
  }
  return false;
}

export async function runDeathInterceptors(actor) {
  if (!actor || !game.user?.isGM) return false;
  const interceptors = MECHANIC_BUCKETS.onDeath
    .filter((m) => m.matches(actor))
    .sort((a, b) => b.priority - a.priority);
  for (const ic of interceptors) {
    const result = await ic.run(actor);
    if (result?.handled) return true;
  }
  if (await runRelicDeathSave(actor)) return true;
  return false;
}

export async function runOnDeathEffects(actor) {
  if (!actor || !game.user?.isGM) return;
  await runRelicTriggers("onDeath", { bearer: actor });
}

export async function runOnConditionRemoved(actor, key) {
  await offerEventReactions(
    (event) => event.type === "conditionRemoved" && event.key === key,
    { actor, payload: { conditionKey: key } }
  );
}

// Zones locked against Threat by passive abilities. `kind` is "placement"
// (Threat can't be placed — Sanctify) or "spend" (Entity can't spend — Annul).
// ThreatLock mechanics are global (state-checked), so no carriership gate.
export function getThreatLockedZones(kind) {
  const out = new Set();
  for (const lock of MECHANIC_BUCKETS.threatLock) {
    for (const z of (lock.lockedZones({ kind }) || [])) {
      if (z) out.add(z);
    }
  }
  return out;
}

export async function runOnThreatPlaced(zone, delta) {
  await offerEventReactions(
    (event) => event.type === "threatPlaced",
    { payload: { zone, delta } }
  );
}

// A Hunter places Threat via placeThreatFromHunter — offered actor-scoped to
// the placer. Distinct from the generic threatPlaced funnel event.
export async function runOnHunterPlacedThreat(actor, zone, amount, context = {}) {
  await offerEventReactions(
    (event) => event.type === "hunterPlacedThreat",
    { actor, payload: { ...context, zone, amount } }
  );
}

export async function runOnThreatSpent(zone, amount, context = {}) {
  await offerEventReactions(
    (event) => event.type === "threatSpent",
    { payload: { ...context, zone, amount } }
  );
}

export async function runOnTurnEnd(actor) {
  await offerEventReactions(
    (event) => event.type === "turnEnd",
    { actor }
  );
}

export async function runOnFocus(actor) {
  await offerEventReactions(
    (event) => event.type === "focus",
    { actor }
  );
}

// Reload events. Two phases per successful reload:
//   "before" — emitted before the weapon state changes (Kicking and Screaming
//              window for Shotgun in Close).
//   "after"  — emitted after the weapon state changes (Fresh Shells, etc.).
// reload.js only emits these on a real state change (Shotgun wasEmpty, or
// capacity actually increased) — no-op reload triggers no event.
export async function runOnReload(actor, { weapon, phase = "after" } = {}) {
  await offerEventReactions(
    (event) => event.type === "reload" && (event.phase || "after") === phase,
    { actor, payload: { weaponId: weapon?.id || "", weaponType: String(weapon?.system?.weaponType || "") } }
  );
}

// Guard event. Emitted after a successful Guard action; abilities subscribe via
// event-Reactions.
export async function runOnGuard(actor) {
  await offerEventReactions(
    (event) => event.type === "guard",
    { actor }
  );
}

export async function runOnTakeCover(actor) {
  await offerEventReactions(
    (event) => event.type === "takeCover",
    { actor }
  );
}

export async function runOnSwordFeint(actor) {
  await offerEventReactions(
    (event) => event.type === "swordFeint",
    { actor }
  );
}

export async function runOnEntityAttack(entityActor, targetTokens = []) {
  if (!game.user?.isGM) return;
  const targetActorIds = targetTokens.map(t => t.actor?.id).filter(Boolean);
  const targetZones = Array.from(new Set(targetTokens.map(t => getTokenZone(t)).filter(Boolean)));
  await offerEventReactions(
    (event) => event.type === "entityAttack",
    { payload: { entityActorId: entityActor?.id || "", targetActorIds, targetZones } }
  );
}

export async function runTerrainDiscardOnMove(actor, { fromZone, byOwner } = {}) {
  if (!actor || !game.user?.isGM || !byOwner) return;
  const { getActorTerrainTags, discardTerrainCondition } = await import("../../documents/actor/conditions.js");
  const tags = getActorTerrainTags(actor);
  if (!tags.length) return;
  const { getAllReactions, primaryOwnerOf } = await import("../reactions.js");
  let keepTag = "";
  for (const reaction of getAllReactions()) {
    if (!reaction.event || reaction.event.type !== "terrainDiscard") continue;
    if (!carries(actor, reaction)) continue;
    const owner = primaryOwnerOf(actor) || game.user;
    const choice = await reaction.offer(owner, { actorId: actor.id, tags, fromZone });
    if (choice?.keepTag !== undefined) { keepTag = String(choice.keepTag || ""); break; }
  }
  for (const tag of tags) {
    if (tag !== keepTag) await discardTerrainCondition(actor, tag, fromZone);
  }
}

export async function runOnIncomingEntityWoundDamage(actor, { damageValue } = {}) {
  if (!actor || !game.user?.isGM) return { damageValue: Number(damageValue || 0) };
  const { getAllReactions, primaryOwnerOf } = await import("../reactions.js");
  let remaining = Number(damageValue || 0);
  for (const reaction of getAllReactions()) {
    if (!reaction.event || reaction.event.type !== "incomingEntityWoundDamage") continue;
    if (!carries(actor, reaction)) continue;
    const owner = primaryOwnerOf(actor) || game.user;
    const choice = await reaction.offer(owner, { actorId: actor.id, damageValue: remaining });
    const reduction = Number(choice?.damageReduction || 0);
    if (reduction > 0) remaining = Math.max(0, remaining - reduction);
  }
  return { damageValue: remaining };
}

// ─── Attack roll mode (zone-wide buffs from other carriers) ──────────────
export function getAttackRollMode(attacker, context = {}) {
  if (!attacker) return null;
  let mode = null;
  const carriers = getActiveSceneHunters();
  for (const ability of MECHANIC_BUCKETS.attackRollModifier) {
    if (ability.scope === "zoneMate") {
      const myZone = getActorZone(attacker);
      if (myZone && carriers.some(a => a.id !== attacker.id && getActorZone(a) === myZone && carries(a, ability) && ability.active(a, context))) {
        mode = mode || ability.rollMode;
      }
      continue;
    }
    for (const carrier of carriers) {
      if (!carries(carrier, ability)) continue;
      if (!ability.active(carrier, context)) continue;
      if (carrier.id === attacker.id) {
        if (ability.scope === "self") mode = mode || ability.rollMode;
        continue;
      }
      if (ability.appliesTo(attacker, context)) mode = mode || ability.rollMode;
    }
  }
  for (const ability of selectedFormMechanics(context, AttackRollModifier)) {
    if (!ability.active(attacker, context)) continue;
    if (ability.scope === "self") mode = mode || ability.rollMode;
    else if (ability.appliesTo(attacker, context)) mode = mode || ability.rollMode;
  }
  if (!mode && attacker?.type === "hunter" && getHunterSpecialConditions(attacker).some((c) => c.disadvAttacks)) {
    mode = "dis";
  }
  return mode;
}

// ─── Incoming damage modifiers (static deltas and dynamic reactions) ─────
export async function applyIncomingDamageModifiers(target, context = {}) {
  const out = {
    damageType: context.damageType,
    damageValue: Math.max(0, Number(context.damageValue || 0)),
    notes: Array.isArray(context.notes) ? context.notes : []
  };
  if (!target || !out.damageType || out.damageValue <= 0) return out;
  const source = context.source || "any";
  const timing = context.timing || "preMitigation";
  const carriers = getActiveSceneHunters();
  const formMechanics = itemMechanics(target, IncomingDamageModifier);
  for (const ability of MECHANIC_BUCKETS.incomingDamageModifier) {
    if (ability.timing !== timing) continue;
    // sceneRanged: a Ready carrier anywhere on the scene may react to ranged
    // damage against a target in a Ranged zone. Reaction-routed (interactive +
    // returns a modified damageValue) — mirrors runOnDefenceResult's reaction
    // branch. The ability supplies its own candidate gate via active().
    if (ability.scope === "sceneRanged") {
      if (ability.damageSource !== "any" && ability.damageSource !== source) continue;
      if (!isRangedZone(getActorZone(target))) continue;
      if (!ability.reaction) continue;
      const reactionsMod = await import("../reactions.js");
      const reaction = reactionsMod.getReactionByKey(ability.reaction);
      if (!reaction) continue;
      const candidates = carriers.filter((a) => carries(a, ability) && ability.active(a));
      if (!candidates.length) continue;
      const before = out.damageValue;
      for (const { owner, candidates: ownerCandidates } of groupByOwner(candidates, reactionsMod.primaryOwnerOf)) {
        const choice = await reaction.offer(owner, {
          targetId: target.id,
          candidateIds: ownerCandidates.map((a) => a.id),
          damageType: out.damageType,
          damageValue: out.damageValue
        });
        if (choice && typeof choice.damageValue === "number") {
          out.damageValue = Math.max(0, choice.damageValue);
          if (out.damageValue !== before && choice.note) out.notes.push(choice.note);
          break;
        }
      }
      continue;
    }
    if (ability.scope === "targetState") {
      if (!ability.active(target)) continue;
      if (!ability.appliesToTarget(target, target, source)) continue;
      const before = out.damageValue;
      const result = await ability.modify({ ...context, carrier: target, target, damageType: out.damageType, damageValue: out.damageValue });
      applyDamageModifierResult(out, result, before);
      continue;
    }
    if (ability.scope === "zoneMate") {
      if (ability.damageSource !== "any" && ability.damageSource !== source) continue;
      const targetZone = getActorZone(target);
      if (!targetZone) continue;
      for (const carrier of carriers) {
        if (carrier.id === target.id) continue;
        if (getActorZone(carrier) !== targetZone) continue;
        if (!carries(carrier, ability)) continue;
        if (!ability.active(carrier)) continue;
        const before = out.damageValue;
        const result = await ability.modify({ ...context, carrier, target, damageType: out.damageType, damageValue: out.damageValue });
        applyDamageModifierResult(out, result, before);
      }
      continue;
    }
    for (const carrier of carriers) {
      if (!carries(carrier, ability)) continue;
      if (!ability.active(carrier)) continue;
      if (!ability.appliesToTarget(carrier, target, source)) continue;
      const before = out.damageValue;
      const result = await ability.modify({ ...context, carrier, target, damageType: out.damageType, damageValue: out.damageValue });
      applyDamageModifierResult(out, result, before);
    }
  }
  for (const ability of formMechanics) {
    if (ability.timing !== timing) continue;
    if (!ability.active(target)) continue;
    if (!ability.appliesToTarget(target, target, source)) continue;
    const before = out.damageValue;
    const result = await ability.modify({ ...context, carrier: target, target, damageType: out.damageType, damageValue: out.damageValue });
    applyDamageModifierResult(out, result, before);
  }
  // Slot Special Conditions on the target add to incoming damage (Damage Taken).
  if (timing === "preMitigation" && target?.type === "hunter") {
    const key = out.damageType === "Wounds" ? "wounds" : "resolve";
    for (const c of getHunterSpecialConditions(target)) {
      const bump = Number(c.damageTaken?.[key] || 0);
      if (!bump) continue;
      out.damageValue = Math.max(0, out.damageValue + bump);
      out.notes.push(`Special Condition: +${bump} ${out.damageType}`);
    }
  }
  if (timing === "preMitigation" && target?.type === "hunter") {
    const relicDelta = relicIncomingDamageDelta(target, { source, damageType: out.damageType });
    if (relicDelta) {
      out.damageValue = Math.max(0, out.damageValue + relicDelta);
      out.notes.push(`Relic: ${relicDelta > 0 ? "+" : ""}${relicDelta} ${out.damageType}`);
    }
  }
  return out;
}
