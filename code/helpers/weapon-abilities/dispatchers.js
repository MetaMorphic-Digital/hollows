/**
 * Dispatchers — entry points called from existing game code (combat hooks,
 * sheet handlers, damage flow). Each selects the relevant mechanics and runs
 * mechanic-specific logic for abilities the actor actually carries.
 */

import { Mechanic } from "../../data/mechanics/Mechanic.js";
import { REFUGE_WEAPON_DAMAGE } from "../../data/refuge/mechanics.js";
import { ECHO_REPLACE_DYING_STATE } from "../../data/echo/mechanics.js";
import BattleEquipment, { EQUIPMENT_ATTACK_DAMAGE, EQUIPMENT_ATTACK_CONSUME } from "../../documents/item/battle-equipment.mjs";
import { runRelicTriggers, runRelicDeathSave, runRelicActionCancel } from "../../data/relic/apply-effect.js";
import { relicHunterStatDelta, relicIncomingDamageDelta } from "../../data/relic/passive.js";
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
import { ApplyToZone } from "../../data/mechanics/ApplyToZone.js";
import { StatModifier } from "../../data/mechanics/StatModifier.js";
import { StatOverride } from "../../data/mechanics/StatOverride.js";
import { EntityStatModifier } from "../../data/mechanics/EntityStatModifier.js";
import { EntityAbilityModifier } from "../../data/mechanics/EntityAbilityModifier.js";
import { TakeCoverModifier } from "../../data/mechanics/TakeCoverModifier.js";
import { EntityActionPause } from "../../data/mechanics/EntityActionPause.js";
import { ThreatLock } from "../../data/mechanics/ThreatLock.js";
import { OnDeath } from "../../data/mechanics/OnDeath.js";
import { WeaponModifier } from "../../data/mechanics/WeaponModifier.js";
import ScriptCompiler, { ScriptedEvent } from "../../documents/item/script-compiler.mjs";

/** Group reactions that share a scope and group key. */
function groupReactions(mechanics, scope) {
  const groups = new Map();
  for (const ability of mechanics) {
    const key = ((ability.scope === scope) && ability.group) || ability;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(ability);
  }
  return groups.values();
}

/** Offer one choice per owner, stopping when an owner accepts. */
async function runReactionGroup(candidates, context, run) {
  const { primaryOwnerOf } = await import("../reactions.js");
  const byOwner = new Map();
  for (const candidate of candidates) {
    if (candidate.ability.rateLimit && Mechanic.isRateLimited(candidate.carrier, candidate.ability)) continue;
    const owner = primaryOwnerOf(candidate.carrier) || game.user;
    const list = byOwner.get(owner.id) || [];
    list.push(candidate);
    byOwner.set(owner.id, list);
  }
  for (const owned of byOwner.values()) {
    const { ability, carrier } = owned[0];
    const candidateIds = owned.map(candidate => candidate.carrier.id);
    const result = await run(ability, { ...context, carrier, candidateIds });
    if ((result != null) && (result !== false)) {
      return ability.redirectsDamage ? { ...result, damageRedirected: true } : result;
    }
  }
  return false;
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
  const scripted = ScriptCompiler.getMechanics(actor, EndOfTurnAction);
  for (const ability of scripted) {
    await ability.run(actor);
  }
}

export async function runEntityActionPauses(context = {}) {
  const state = {
    ...context,
    targetTokens: Array.isArray(context.targetTokens) ? Array.from(context.targetTokens) : [],
    selectedZones: Array.isArray(context.selectedZones) ? Array.from(context.selectedZones) : [],
  };
  if (!game.user?.isGM) return state;
  const seen = new Set();

  for (const ability of ScriptCompiler.getSceneMechanics(EntityActionPause)) {
    if (ability.group && seen.has(ability.group)) continue;
    const carrier = ability.carrier;
    if (!ability.match(carrier, state)) continue;
    if (ability.group) seen.add(ability.group);
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
  if (await BattleEquipment.cancelManoeuvre(state)) return { ...state, cancelled: true };
  if (await runRelicActionCancel(state)) return { ...state, cancelled: true };
  return state;
}

// ─── Start-of-turn handshakes ────────────────────────────────────────────
/** Run start-of-turn abilities on the GM for the selected turn scope and cleanup/effects stage. */
export async function runStartOfTurnAbilities({ actor, entity, on = "actor", stage = "effects" } = {}) {
  if (!game.user?.isGM) return;
  if (on === "entity") {
    for (const carrier of getActiveSceneHunters()) {
      const scripted = ScriptCompiler.getMechanics(carrier, StartOfTurnAction);
      for (const ability of scripted) {
        if ((ability.on !== "entity") || ((ability.stage || "effects") !== stage)) continue;
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
    for (const ability of ScriptCompiler.getSceneMechanics(StartOfTurnAction)) {
      if ((ability.on !== "actorAll") || ((ability.stage || "effects") !== stage)) continue;
      const carrier = ability.carrier;
      await ability.run({ actor, carrier });
    }
    return;
  }
  if (!actor) return;
  const scripted = ScriptCompiler.getMechanics(actor, StartOfTurnAction);
  for (const ability of scripted) {
    if ((ability.on !== on) || ((ability.stage || "effects") !== stage)) continue;
    await ability.run({ actor, entity });
  }
}

// ─── Attack damage changes (set/add passive modifiers) ───────────────────
export function applyAttackDamageChanges(actor, damage = {}, context = {}) {
  const out = {
    resolve: Number(damage.resolve || 0),
    wounds: Number(damage.wounds || 0),
  };
  const scriptMatches = [
    ...ScriptCompiler.getMechanics(actor, AttackDamageChange).filter(m => !m.aura),
    ...ScriptCompiler.getAuras(AttackDamageChange),
  ];
  const matching = [REFUGE_WEAPON_DAMAGE, EQUIPMENT_ATTACK_DAMAGE, ...scriptMatches]
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
  const scripted = ScriptCompiler.getMechanics(actor, StatModifier);
  for (const ability of scripted) {
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
  for (const ability of ScriptCompiler.getMechanics(actor, WeaponModifier)) {
    total += ability.value(weapon, statKey);
  }
  return total;
}

// ─── Stat overrides available to actor (returns array of available overrides) ─
export function getStatOverrides(actor, scope) {
  const out = [];
  for (const ability of ScriptCompiler.getMechanics(actor, StatOverride)) {
    if (ability.scope !== scope) continue;
    if (!ability.available(actor)) continue;
    if (ability.rateLimit && Mechanic.isRateLimited(actor, ability)) continue;
    out.push(ability);
  }
  return out;
}

// Pay cost + mark rate limit. Returns true unless the override is on cooldown.
// The Resolve cost is paid through the shared payResourceCost (Resolve first,
// shortfall in Wounds) — same path as activated abilities.
export async function tryActivateStatOverride(actor, override) {
  if (!actor || !override) return false;
  if (override.rateLimit && Mechanic.isRateLimited(actor, override)) {
    ui.notifications?.warn?.(`${override.name} is on cooldown.`);
    return false;
  }
  await payResourceCost(actor, override);
  if (override.rateLimit) await Mechanic.markRateLimit(actor, override);
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

// ─── On attack result ────────────────────────────────────────────────────
// Unlike the turn-based dispatchers, this runs on the attacker's own client
// (the hunter-sheet attack flow) or on the GM (Hunter attack damage apply).
//
// `scope: "self"` abilities belong to the attacker and run on their client.
// `scope: "zoneMate"` abilities belong to a Hunter sharing the attacker's
// area; they run on each carrier's own client. `context` carries
// `damageType`/`damageValue` for reactions that depend on the damage dealt.
export async function runOnAttackResult(actor, result, context = {}) {
  const out = {
    damageType: context.damageType || null,
    damageValue: Math.max(0, Number(context.damageValue || 0)),
    cardLines: [],
  };
  if (!actor) return out;
  const currentContext = () => ({
    ...context,
    damageType: out.damageType,
    damageValue: out.damageValue,
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
    ...ScriptCompiler.getMechanics(actor, OnAttackResultAction).filter(m => !m.aura),
    ...ScriptCompiler.getAuras(OnAttackResultAction),
    ...ScriptCompiler.getSceneMechanics(OnAttackResultAction).filter(m => (m.scope === "zoneMate") && (m.carrier !== actor)),
  ];
  for (const ability of [...borneMechanics, EQUIPMENT_ATTACK_CONSUME]) {
    if (!ability.matchResult(result)) continue;
    if (context.timing && ability.timing !== context.timing && ability.timing !== "any") continue;
    if (!ability.matchDamage(currentContext())) continue;
    if (ability.weaponType && String(context.weaponType || "") !== ability.weaponType) continue;

    if (ability.scope === "zoneMate") {
      const myZone = getActorZone(actor);
      if (!myZone) continue;
      const carrier = ability.carrier;
      if ((carrier.id === actor.id) || (getActorZone(carrier) !== myZone)) continue;
      if (ability.rateLimit && Mechanic.isRateLimited(carrier, ability)) continue;
      const fired = await ability.run({ actor, carrier, result, ...currentContext() });
      if ((fired !== false) && ability.rateLimit) await Mechanic.markRateLimit(carrier, ability);
      continue;
    }

    if (ability.matchCarrier) {
      if (!game.user?.isGM) continue;
      const carrier = ability.matchCarrier(actor, currentContext());
      if (!carrier) continue;
      await ability.run({ actor, carrier, result, ...currentContext() });
      continue;
    }

    if (!actor.isOwner) continue;
    if (!ability.matchActive(actor, currentContext())) continue;
    if (ability.rateLimit && Mechanic.isRateLimited(actor, ability)) continue;
    const fired = await ability.run({ actor, result, ...currentContext() });
    applyMutation(fired);
    if (fired !== false && ability.rateLimit) await Mechanic.markRateLimit(actor, ability);
  }
  return out;
}

// ─── On defence result (entity attack resolved against a hunter) ─────────
// Returns { damageRedirected } so the damage-intake flow can skip its own
// application when a reaction redirected the hit.
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
  const mechanics = [
    ...ScriptCompiler.getMechanics(actor, OnDefenceResultAction).filter(m => m.scope === "self"),
    ...ScriptCompiler.getSceneMechanics(OnDefenceResultAction).filter(m => m.scope === "zoneMate"),
  ];
  const zone = getActorZone(actor);
  for (const group of groupReactions(mechanics, "zoneMate")) {
    const candidates = group.flatMap(ability => {
      if (!ability.matches(ctx)) return [];
      if (ability.scope === "self") {
        if (ability.when && !ability.when({ actor })) return [];
        return [{ ability, carrier: actor }];
      }
      if (ability.scope !== "zoneMate") return [];
      const carrier = ability.carrier;
      if ((carrier.id === actor.id) || !zone || (getActorZone(carrier) !== zone)) return [];
      if (!(ability.when?.({ actor: carrier }) ?? true)) return [];
      return [{ ability, carrier }];
    });
    const choice = await runReactionGroup(candidates, { ...ctx, actor, targetId: actor.id, entity: ctx.entityActor },
      (ability, context) => ability.run(context));
    if (choice?.damageRedirected) out.damageRedirected = true;
    if (choice?.convertTo) {
      out.damageConverted = true;
      out.damageType = choice.convertTo.damageType;
      out.damageValue = Number(choice.convertTo.damageValue ?? 0);
    }
  }
  await runRelicTriggers("onHuntersDefend", { bearer: actor });
  await runRelicTriggers("onEntityAttack", { bearer: actor });
  return out;
}

// ─── On move ─────────────────────────────────────────────────────────────
/** Dispatch movement effects on the GM after a token changes zones. */
export async function runOnMove(actor, { fromZone, toZone, byOwner } = {}) {
  if (!actor || !game.user.isActiveGM) return;
  const borneMechanics = [
    ...ScriptCompiler.getMechanics(actor, OnMoveAction).filter(m => !m.aura), ...ScriptCompiler.getAuras(OnMoveAction),
  ];
  for (const ability of borneMechanics) {
    await ability.run({ actor, fromZone, toZone, byOwner });
  }
  await runRelicTriggers("onEnterZone", { bearer: actor });
}

// ─── Entity action cost delta (sums across all carriers on canvas) ───────
export function getEntityAbilityCostDelta(entity, actionType) {
  let threatDelta = 0;
  for (const ability of ScriptCompiler.getSceneMechanics(EntityAbilityModifier)) {
    const carrier = ability.carrier;
    if (!ability.match(carrier, { entity, actionType })) continue;
    threatDelta += Number(ability.costDelta?.threat || 0);
  }
  return { threat: threatDelta };
}

// ─── Entity stat delta (sums across all carriers on canvas) ──────────────
export function getEntityStatDelta(entity, stat) {
  let delta = 0;
  for (const ability of ScriptCompiler.getSceneMechanics(EntityStatModifier)) {
    const carrier = ability.carrier;
    if (!ability.match(carrier, { entity, stat })) continue;
    delta += ability.delta;
  }
  return delta;
}

// ─── Take Cover modifier ─────────────────────────────────────────────────
export function getTakeCoverModifier(actor) {
  const out = { expandZones: false, statKey: null, allowOtherTarget: false };
  for (const mod of ScriptCompiler.getMechanics(actor, TakeCoverModifier)) {
    if (mod.expandZones) out.expandZones = true;
    if (mod.statKey) out.statKey = mod.statKey;
    if (mod.allowOtherTarget) out.allowOtherTarget = true;
  }
  return out;
}

// ─── Activated abilities (sheet buttons) ─────────────────────────────────
export function getActivatedAbilities(actor) {
  const out = [];
  const scripted = [
    ...ScriptCompiler.getMechanics(actor, ActivatedAbility).filter(m => !m.aura),
    ...ScriptCompiler.getAuras(ActivatedAbility),
  ];
  for (const ability of scripted) {
    if (!ability.available(actor)) continue;
    out.push(ability);
  }
  return out;
}

export async function activateAbility(actor, ability, extraCtx = {}) {
  if (!actor || !ability) return false;
  if (!game.combat?.started) return false;
  if (ability.rateLimit && Mechanic.isRateLimited(actor, ability)) {
    ui.notifications?.warn?.(`${ability.name} is on cooldown.`);
    return false;
  }
  if (!(await canAffordCost(actor, ability))) return false;
  // Spend conditions before effects so they cannot grant bonuses during
  // the granted action. Charge resources only after the action succeeds.
  await payConditionCost(actor, ability);
  const ctx = { actor, ...extraCtx };
  if (ability.run) {
    if (await ability.run(actor, ctx) === false) return false;
  }
  else await applyEffects(ability.effects, ctx);
  if (ctx._cancelled) return false;
  await payResourceCost(actor, ability);
  if (ability.rateLimit) await Mechanic.markRateLimit(actor, ability);
  return true;
}

// Preflight: caller must hold any condition the ability demands. Resolve costs
// always succeed — a shortfall is paid in Wounds (see payResourceCost).
async function canAffordCost(actor, ability) {
  const cost = ability?.cost;
  if (!cost) return true;
  if (cost.condition) {
    if (!actor.statuses.has(cost.condition)) {
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
  const scripted = ScriptCompiler.getMechanics(actor, ApplyToZone);
  for (const ability of scripted) {
    if (!ability.available(actor)) continue;
    if (ability.rateLimit && Mechanic.isRateLimited(actor, ability)) continue;
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

// Reload full-refill check. Reload is initiated by the carrier's own client, so
// matching reactions are prompted locally (promptOnPlayer runs here, no query).
// Returns true if any reaction converts this reload to a full refill (Come Out
// Shooting). reload.js consults this and never names the ability.
export async function runReloadFullCheck(actor, weapon) {
  if (!actor || !weapon) return false;
  for (const reaction of ScriptCompiler.getMechanics(actor, ScriptedEvent)) {
    if (reaction.event.type !== "reloadFullCheck") continue;
    const result = await reaction.run(actor, { weaponId: weapon.id, weaponType: weapon.system.weaponType });
    if (result?.fullReload) return true;
  }
  return false;
}

// Bleeding start-of-turn check: a carrier ability may consume the Entity's
// Bleeding instead of the normal damage. Returns true when consumed.
export async function runEntityBleedingStartCheck(entity) {
  if (!game.user?.isGM) return false;
  await ScriptCompiler.runEvents(event => event.type === "entityBleedingStart", {
    payload: { entityId: entity.id },
  });
  return !entity.statuses.has("bleeding");
}

export async function runDeathInterceptors(actor) {
  if (!actor || !game.user?.isGM) return false;
  const interceptors = [ECHO_REPLACE_DYING_STATE, ...ScriptCompiler.getMechanics(actor, OnDeath)]
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
  await ScriptCompiler.runEvents(
    (event) => (event.type === "conditionRemoved") && (!event.key || (event.key === key)),
    { actor, payload: { conditionKey: key } },
  );
}

// Zones locked against Threat by passive abilities. `kind` is "placement"
// (Threat can't be placed — Sanctify) or "spend" (Entity can't spend — Annul).
// ThreatLock mechanics are global (state-checked), so no carriership gate.
export function getThreatLockedZones(kind) {
  const out = new Set();
  for (const lock of [...ScriptCompiler.getSceneMechanics(ThreatLock), ...ScriptCompiler.getAuras(ThreatLock)]) {
    for (const z of (lock.lockedZones({ kind }) || [])) {
      if (z) out.add(z);
    }
  }
  return out;
}

export async function runOnThreatPlaced(zone, delta) {
  await ScriptCompiler.runEvents(
    (event) => event.type === "threatPlaced",
    { payload: { zone, delta } },
  );
}

// A Hunter places Threat via placeThreatFromHunter — offered actor-scoped to
// the placer. Distinct from the generic threatPlaced funnel event.
export async function runOnHunterPlacedThreat(actor, zone, amount, context = {}) {
  await ScriptCompiler.runEvents(
    (event) => event.type === "hunterPlacedThreat",
    { actor, payload: { ...context, zone, amount } },
  );
}

export async function runOnThreatSpent(zone, amount, context = {}) {
  await ScriptCompiler.runEvents(
    (event) => event.type === "threatSpent",
    { payload: { ...context, zone, amount } },
  );
}

export async function runOnTurnEnd(actor) {
  await ScriptCompiler.runEvents(
    (event) => event.type === "turnEnd",
    { actor },
  );
}

export async function runOnFocus(actor) {
  await ScriptCompiler.runEvents(
    (event) => event.type === "focus",
    { actor },
  );
}

// Reload events. Two phases per successful reload:
//   "before" — emitted before the weapon state changes (Kicking and Screaming
//              window for Shotgun in Close).
//   "after"  — emitted after the weapon state changes (Fresh Shells, etc.).
// reload.js only emits these on a real state change (Shotgun wasEmpty, or
// capacity actually increased) — no-op reload triggers no event.
export async function runOnReload(actor, { weapon, phase = "after" } = {}) {
  await ScriptCompiler.runEvents(
    (event) => event.type === "reload" && (event.phase || "after") === phase,
    { actor, payload: { weaponId: weapon?.id || "", weaponType: String(weapon?.system?.weaponType || "") } },
  );
}

// Guard event. Emitted after a successful Guard action; abilities subscribe via
// event-Reactions.
export async function runOnGuard(actor) {
  await ScriptCompiler.runEvents(
    (event) => event.type === "guard",
    { actor },
  );
}

export async function runOnTakeCover(actor) {
  await ScriptCompiler.runEvents(
    (event) => event.type === "takeCover",
    { actor },
  );
}

export async function runOnSwordFeint(actor) {
  await ScriptCompiler.runEvents(
    (event) => event.type === "swordFeint",
    { actor },
  );
}

export async function runOnEntityAttack(entityActor, targetTokens = []) {
  if (!game.user?.isGM) return;
  const targetActorIds = targetTokens.map(t => t.actor?.id).filter(Boolean);
  const targetZones = Array.from(new Set(targetTokens.map(t => getTokenZone(t)).filter(Boolean)));
  await ScriptCompiler.runEvents(
    (event) => event.type === "entityAttack",
    { payload: { entityActorId: entityActor?.id || "", targetActorIds, targetZones } },
  );
}

/** Discard terrain after an owner's move, keeping the tag chosen by a script. */
export async function runTerrainDiscardOnMove(actor, { fromZone, byOwner } = {}) {
  if (!actor || !game.user.isActiveGM || !byOwner) return;
  const { getActorTerrainTags, discardTerrainCondition } = await import("../../documents/actor/conditions.js");
  const tags = getActorTerrainTags(actor);
  if (!tags.length) return;
  const choices = await ScriptCompiler.runEvents(event => event.type === "terrainDiscard", {
    actor, payload: { tags, fromZone },
  });
  const keepTag = choices.find(choice => choice?.keepTag)?.keepTag;
  for (const tag of tags) {
    if (tag !== keepTag) await discardTerrainCondition(actor, tag, fromZone);
  }
}

/** Resolve optional reductions before applying Wound damage from an Entity attack. */
export async function runOnIncomingEntityWoundDamage(actor, { damageValue } = {}) {
  if (!actor || !game.user?.isGM) return { damageValue: Number(damageValue || 0) };
  let remaining = Number(damageValue || 0);
  const choices = await ScriptCompiler.runEvents(event => event.type === "incomingEntityWoundDamage", {
    actor, payload: { damageValue: remaining },
  });
  for (const choice of choices) {
    const reduction = Number(choice?.damageReduction || 0);
    if (reduction > 0) remaining = Math.max(0, remaining - reduction);
  }
  return { damageValue: remaining };
}

// ─── Attack roll mode (zone-wide buffs from other carriers) ──────────────
export function getAttackRollMode(attacker, context = {}) {
  if (!attacker) return null;
  let mode = null;
  for (const ability of ScriptCompiler.getSceneMechanics(AttackRollModifier)) {
    const carrier = ability.carrier;
    if (ability.scope === "zoneMate") {
      const myZone = getActorZone(attacker);
      if (myZone && (carrier.id !== attacker.id) && (getActorZone(carrier) === myZone) && ability.active(carrier, context)) {
        mode = mode || ability.rollMode;
      }
      continue;
    }
    if (!ability.active(carrier, context)) continue;
    if (carrier.id === attacker.id) {
      if (ability.scope === "self") mode = mode || ability.rollMode;
      continue;
    }
    if (ability.appliesTo(attacker, context)) mode = mode || ability.rollMode;
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
    notes: Array.isArray(context.notes) ? context.notes : [],
  };
  if (!target || !out.damageType || out.damageValue <= 0) return out;
  const source = context.source || "any";
  const timing = context.timing || "preMitigation";
  const local = ScriptCompiler.getMechanics(target, IncomingDamageModifier).filter(m => !m.aura);
  const selfMechanics = local.filter(m => m.scope === "self");
  const scripted = [
    ...ScriptCompiler.getSceneMechanics(IncomingDamageModifier).filter(m => m.carrier !== target),
    ...local.filter(m => m.scope !== "self"),
    ...ScriptCompiler.getAuras(IncomingDamageModifier),
  ];
  for (const group of groupReactions(scripted, "sceneRanged")) {
    const ability = group[0];
    if (ability.timing !== timing) continue;
    // A carrier anywhere on the scene can react to damage against a Hunter in Ranged.
    if (ability.scope === "sceneRanged") {
      if (ability.damageSource !== "any" && ability.damageSource !== source) continue;
      if (!isRangedZone(getActorZone(target))) continue;
      const candidates = group.filter(member => member.active(member.carrier))
        .map(member => ({ ability: member, carrier: member.carrier }));
      const before = out.damageValue;
      const result = await runReactionGroup(candidates, {
        ...context, target, targetId: target.id, damageType: out.damageType, damageValue: out.damageValue,
      }, (member, ctx) => member.modify(ctx));
      applyDamageModifierResult(out, result, before);
      continue;
    }
    if (ability.scope === "targetState") {
      if (!ability.active(target)) continue;
      if (!ability.appliesToTarget(target, target, source)) continue;
      const before = out.damageValue;
      const result = await ability.modify({ ...context, carrier: ability.carrier, target, damageType: out.damageType, damageValue: out.damageValue });
      applyDamageModifierResult(out, result, before);
      continue;
    }
    if (ability.scope === "zoneMate") {
      if (ability.damageSource !== "any" && ability.damageSource !== source) continue;
      const targetZone = getActorZone(target);
      if (!targetZone) continue;
      const carrier = ability.carrier;
      if (carrier.id === target.id) continue;
      if (getActorZone(carrier) !== targetZone) continue;

      if (!ability.active(carrier)) continue;
      const before = out.damageValue;
      const result = await ability.modify({ ...context, carrier, target, damageType: out.damageType, damageValue: out.damageValue });
      applyDamageModifierResult(out, result, before);
      continue;
    }
    const carrier = ability.carrier;
    if (!ability.active(carrier)) continue;
    if (!ability.appliesToTarget(carrier, target, source)) continue;
    const before = out.damageValue;
    const result = await ability.modify({ ...context, carrier, target, damageType: out.damageType, damageValue: out.damageValue });
    applyDamageModifierResult(out, result, before);
  }
  for (const ability of selfMechanics) {
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
