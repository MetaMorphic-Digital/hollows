import {
  getActiveEntityActor,
  getActorTokenOnScene,
  getActorZone,
  getHunterTokensInZone,
  getTokenZone,
  getZoneList,
  sceneHunterTokens
} from "../../../canvas/zone.js";
import { promptForZoneSelection } from "../../../applications/apps/selection-dialogs.mjs";
import { chooseOneTarget } from "../../../applications/apps/selection-dialogs.mjs";
import {
  createDefaultEntityAttack,
  createDefaultEntityInterrupt,
  createEntityActionProfile
} from "../action-schema.js";
import { buildEntityAfterAttackConfigs } from "../action-rules.js";
import { getEntityEngineAbilities } from "../resolvers.js";
import { isEntityEngineAbilityActive } from "../../../documents/entity/entity-stats.js";
import { requestAfterAttackApply } from "../../../documents/entity/attack-effects.js";
import { hasCondition, removeCondition } from "../../../documents/actor/conditions.js";
import { adjustEntityResource } from "../../../documents/actor/resources.js";
import { getCombatTurnKey, isSameCombatRound } from "../../../helpers/combat-runtime.js";
import { performEntityAttack } from "./entity-attack.js";
import { triggerEntityInterrupt } from "./entity-interrupt.js";

export async function applyEntityTriggeredAbilityEffects(abilityItem, entityActor, context = {}) {
  if (!abilityItem || !entityActor) return false;
  const sys = abilityItem.system || {};
  if (String(sys.special?.trigger?.effectType || "afterEffects") === "triggerAbility") {
    return triggerEntityTriggeredAbilityAction(abilityItem, entityActor, context);
  }
  const groups = buildEntityAfterAttackConfigs({ afterAttack: sys.special?.trigger?.afterAttack }, "always");
  if (!groups.length) return false;
  const resolved = await resolveEntitySpecialTargets(entityActor, sys.special?.trigger || {}, context);
  if (!resolved.targets.length && !resolved.zones.length && !resolved.entityOnly) return false;
  if (resolved.entityOnly) {
    await requestAfterAttackApply(null, "", groups, entityActor.id, null, { entityActor });
    return true;
  }
  if (resolved.zones.length && !resolved.targets.length) {
    for (const zoneId of resolved.zones) {
      await requestAfterAttackApply(null, zoneId, groups, entityActor.id, null, { entityActor });
    }
    return true;
  }
  for (const target of resolved.targets) {
    const targetZone = getActorZone(target) || "";
    await requestAfterAttackApply(target, targetZone, groups, entityActor.id, null, { entityActor });
  }
  return !!resolved.targets.length;
}

async function resolveEntitySpecialTargets(entityActor, source, context = {}) {
  const mode = String(source?.targetMode || "eventTarget");
  const targetActor = context.targetActor || context.target || null;
  const targetToken = context.targetToken || getActorTokenOnScene(targetActor) || null;
  const eventZone = String(context.targetZone || (targetToken ? getTokenZone(targetToken) : (targetActor ? getActorZone(targetActor) : "")) || "");
  const allowedZones = Array.isArray(source?.zones) && source.zones.length
    ? source.zones.filter((zoneId) => !!zoneId)
    : getZoneList();
  if (mode === "entity") return { entityOnly: true, targets: [], zones: [] };
  if (mode === "eventTarget") return { entityOnly: false, targets: targetActor ? [targetActor] : [], zones: eventZone ? [eventZone] : [] };
  if (mode === "eventZone") return { entityOnly: false, targets: [], zones: eventZone ? [eventZone] : [] };
  if (mode === "allInEventZone") {
    if (!eventZone) return { entityOnly: false, targets: [], zones: [] };
    return { entityOnly: false, targets: getHunterTokensInZone(eventZone).map((token) => token.actor).filter(Boolean), zones: [eventZone] };
  }
  if (mode === "allInSelectedZones") {
    const targetTokens = sceneHunterTokens().filter((token) => token.actor?.id && allowedZones.includes(getTokenZone(token)));
    const targets = Array.from(new Map(targetTokens.map((token) => [token.actor.id, token.actor])).values());
    return { entityOnly: false, targets, zones: allowedZones };
  }
  if (mode === "single") {
    let targetTokens = sceneHunterTokens().filter((token) => token.actor?.id);
    if (allowedZones.length) targetTokens = targetTokens.filter((token) => allowedZones.includes(getTokenZone(token)));
    if (!targetTokens.length) return { entityOnly: false, targets: [], zones: [] };
    if (targetTokens.length === 1) {
      return { entityOnly: false, targets: [targetTokens[0].actor].filter(Boolean), zones: [getTokenZone(targetTokens[0])].filter(Boolean) };
    }
    const chosen = await chooseOneTarget(targetTokens);
    const chosenActor = chosen?.actor || null;
    return { entityOnly: false, targets: chosenActor ? [chosenActor] : [], zones: chosen ? [getTokenZone(chosen)].filter(Boolean) : [] };
  }
  if (mode === "multiZone") {
    const zones = await promptForZoneSelection(allowedZones, { title: "Choose Zones" });
    return { entityOnly: false, targets: [], zones };
  }
  return { entityOnly: false, targets: [], zones: [] };
}

function buildSpecialTriggeredCustomAbility(source) {
  const trigger = source?.special?.trigger || {};
  const kind = String(trigger.abilityKind || "attack");
  const name = String(trigger.abilityName || "Triggered Ability").trim() || "Triggered Ability";
  const base = kind === "interrupt" ? createDefaultEntityInterrupt() : createDefaultEntityAttack();
  const profile = createEntityActionProfile({
    ...base.profile,
    ...(trigger.profile || {}),
    actionType: "attack"
  });
  return {
    id: "",
    name,
    system: {
      ...base,
      profile,
      kind: kind === "interrupt" ? "interrupt" : "attack"
    }
  };
}

async function triggerEntityAttackAbility(entityActor, attackItemOrData, options = {}) {
  if (!entityActor || !attackItemOrData) return false;
  const liveActor = game.actors?.get(entityActor.id) || entityActor;
  return performEntityAttack(liveActor, attackItemOrData, options);
}

async function triggerEntityTriggeredAbilityAction(abilityItem, entityActor, context = {}) {
  const sys = abilityItem.system || {};
  const trigger = sys.special?.trigger || {};
  const sourceMode = String(trigger.abilitySource || "existing");
  if (sourceMode === "existing") {
    const abilityId = String(trigger.abilityId || "");
    const entry = abilityId ? entityActor.items.get(abilityId) : null;
    if (!entry) return false;
    if (String(entry.system?.kind || "") === "interrupt") return triggerEntityInterrupt(entityActor, entry.system, entry, { freeCost: true });
    if (String(entry.system?.kind || "") === "attack") {
      return triggerEntityAttackAbility(entityActor, entry, context?.repeatContext ? { repeatContext: context.repeatContext } : {});
    }
    return false;
  }
  const custom = buildSpecialTriggeredCustomAbility(sys);
  if (String(custom.system?.kind || "") === "interrupt") return triggerEntityInterrupt(entityActor, custom.system, custom, { freeCost: true });
  return triggerEntityAttackAbility(entityActor, custom, context?.repeatContext ? { repeatContext: context.repeatContext } : {});
}

export async function triggerEntityTriggeredAbilities(entityActor, eventName, context = {}, kinds = ["special", "doom"]) {
  if (!game.user?.isGM) return false;
  if (!entityActor || entityActor.type !== "entity") return false;
  let triggered = false;
  for (const ability of getEntityEngineAbilities(entityActor, kinds)) {
    if (!isEntityEngineAbilityActive(entityActor, ability)) continue;
    const sys = ability.system || {};
    if (String(sys.special?.type || "textOnly") !== "triggeredEffect") continue;
    if (String(sys.special?.trigger?.event || "") !== String(eventName || "")) continue;
    await applyEntityTriggeredAbilityEffects(ability, entityActor, context);
    triggered = true;
  }
  return triggered;
}

export async function maybeTriggerEntityCurseThresholdAbilities(subjectActor) {
  if (!game.user?.isGM) return;
  if (!subjectActor) return;
  const entity = getActiveEntityActor();
  if (!entity) return;
  const isHunter = subjectActor.type === "hunter";
  const isEntity = subjectActor.type === "entity" && subjectActor.id === entity.id;
  if (!isHunter && !isEntity) return;
  const thresholdEvent = isHunter ? "hunterCurseThreshold" : "entityCurseThreshold";
  const currentValue = Number(subjectActor.system?.curse?.value ?? 0);
  const state = foundry.utils.deepClone(entity.getFlag("hollows", "specialThresholdState") || {});
  let changed = false;
  for (const ability of getEntityEngineAbilities(entity, ["special", "doom"])) {
    if (!isEntityEngineAbilityActive(entity, ability)) continue;
    const sys = ability.system || {};
    if (String(sys.special?.type || "textOnly") !== "triggeredEffect") continue;
    if (String(sys.special?.trigger?.event || "") !== thresholdEvent) continue;
    const threshold = Math.max(1, Number(sys.special?.trigger?.thresholdValue ?? 3) || 3);
    const key = `${thresholdEvent}:${subjectActor.id}:${ability.id}`;
    const wasTriggered = !!state[key];
    const nowTriggered = currentValue >= threshold;
    if (!wasTriggered && nowTriggered) {
      await applyEntityTriggeredAbilityEffects(ability, entity, {
        targetActor: isHunter ? subjectActor : null,
        targetZone: isHunter ? getActorZone(subjectActor) : ""
      });
    }
    if (wasTriggered !== nowTriggered) { state[key] = nowTriggered; changed = true; }
  }
  if (changed) await entity.setFlag("hollows", "specialThresholdState", state);
}

async function applyEntityBleedingDamageAndCoin(entity) {
  if (!entity || entity.type !== "entity") return;
  if (!hasCondition(entity, "bleeding")) return;
  const resolveValue = Number(entity.system?.health?.resolve?.value ?? 0);
  const broken = resolveValue <= 0;
  let damageType = "Resolve", damageAmount = 2;
  if (broken) { damageType = "Wounds"; damageAmount = 1; }
  if (damageType === "Resolve") {
    await adjustEntityResource(entity, { resolve: -damageAmount });
  } else {
    await adjustEntityResource(entity, { wounds: -damageAmount });
  }
  const coin = await new Roll("1d2").evaluate();
  const coinValue = coin.terms[0].results[0]?.result ?? 1;
  const keepsBleeding = Number(coinValue) === 1;
  if (!keepsBleeding) await removeCondition(entity, "bleeding");
  const coinLabel = keepsBleeding ? "Bleeding" : "Whole";
  const outcomeText = keepsBleeding ? "continues to bleed" : "stops bleeding";
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: entity }),
    flavor: "Bleeding",
    content: `
      <div class="hollows-chat">
        <strong>${entity.name}</strong> bleeds for <strong>${damageAmount}</strong> ${damageType}.
        <div>Bleeding coin: <strong>${coinLabel}</strong> (${coinValue}) - ${outcomeText}.</div>
      </div>
    `,
    rolls: [coin]
  });
}

export async function applyEntityBleedingStartOfTurn(entity) {
  if (!entity || entity.type !== "entity") return;
  if (!hasCondition(entity, "bleeding")) return;
  if (!game.user?.isGM) return;
  const turnKey = getCombatTurnKey(game.combat);
  const pending = entity.getFlag("hollows", "bleedingStartChecked");
  if (turnKey && pending && isSameCombatRound(pending, turnKey)) return;
  if (turnKey) await entity.setFlag("hollows", "bleedingStartChecked", turnKey);
  const { runEntityBleedingStartCheck } = await import("../../../helpers/weapon-abilities/dispatchers.js");
  if (await runEntityBleedingStartCheck(entity)) return;
  await applyEntityBleedingDamageAndCoin(entity);
}
