import { HOLLOWS_CONDITIONS } from "../../data/_module.mjs";
import {
  getZoneRegionDoc,
  getActorTokenOnScene,
  getActiveEntityActor,
  getRegionCurseData,
  isCloseZone,
} from "../../canvas/zone.js";
import { adjustEntityTerrain, getAvailableTerrainTags } from "../../canvas/terrain-pool.js";
import { isEntityColossal } from "./entity-stats.js";
import { addThreatToZoneSafe, clampCurse, shiftGridResource, updateRegionCurse } from "../../canvas/overlays.js";
import { dispatchToGM } from "../../helpers/queries.js";
import { setShotgunsLoaded } from "../../helpers/weapon-utils.js";
import { getEffectiveWeaponCapacity } from "../../data/weapons/index.js";
import { resolveTerrainDiscardOptions } from "../../data/actions/terrain-discard-options.js";
import { shouldApplyAfterAttackEffects, shouldApplyBeforeAttackEffects } from "../../data/entity/action-rules.js";
import {
  addCondition,
  removeCondition,
  discardTerrainCondition,
  applySpecialConditionSlot,
  getTerrainTagKeys,
} from "../actor/conditions.js";
import {
  adjustHunterResource,
  adjustEntityResource,
  getFocusCount,
  setFocusCount,
} from "../actor/resources.js";
import { pickOne } from "../../applications/apps/selection-dialogs.mjs";

/**
 * Entity attack after-effects.
 *
 * This is the side-effectful tail of entity attacks, manoeuvres, interrupts and
 * generated specials. It is intentionally separate from the entity action stage
 * orchestration: action modules decide when an effect group resolves, this file
 * mutates Hunters, Entities, zones and terrain.
 */

export async function applyEntitySelfDamage(entity, selfDamage) {
  if (!entity || !selfDamage) return;
  const sResolve = Number(selfDamage.resolve ?? 0);
  const sWounds = Number(selfDamage.wounds ?? 0);
  if (!((sResolve > 0) || (sWounds > 0))) return;
  await adjustEntityResource(entity, {
    resolve: sResolve > 0 ? -sResolve : 0,
    wounds: sWounds > 0 ? -sWounds : 0,
  });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: entity }),
    content: `<div class="hollows-chat"><strong>${entity.name}</strong> suffers <strong>${sResolve}/${sWounds}</strong> (Resolve/Wounds).</div>`,
  });
  try { entity.sheet?.render(false); } catch (err) {}
}

/**
 * Colossal: a Climbing Hunter (Elevated, in Close) who is forced to lose that
 * Elevated tag by an Entity action suffers 1 Wound as they are thrown free.
 */
async function applyColossalThrowFree(target, targetZone, entityActor) {
  if (!target || target.type !== "hunter") return;
  if (!isCloseZone(targetZone)) return;
  if (!isEntityColossal(entityActor)) return;
  await adjustHunterResource(target, { wounds: -1 });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: target }),
    content: `<div class="hollows-chat"><strong>${target.name}</strong> suffers <strong>1 Wound</strong>, thrown free of the Colossal Entity.</div>`,
  });
}

async function applyAfterAttackShift(group, targetZone) {
  if (!group?.shift?.enabled) return;
  const shift = group.shift;
  await shiftGridResource({
    resource: String(shift.resource || "threat"),
    direction: String(shift.direction || "towardEntity"),
    amount: Number(shift.amount || 0),
    zone: String(shift.zone || ""),
    targetZone: String(targetZone || ""),
  });
}

// "any" terrain tag: let the GM pick a concrete type among those actionable for
// this adjust (pool stock when placing from pool, both when creating new, held
// tags when removing). A single option auto-resolves; dismissing the prompt falls
// back to the engine's automatic "any" handling. Returns "" when nothing applies.
async function resolveAnyTerrainTag(entity, delta, fromPool) {
  const available = getAvailableTerrainTags(entity, delta, fromPool);
  if (!available.length) return "";
  if (available.length === 1) return available[0];
  const picked = await pickOne({
    title: "Entity Terrain",
    label: delta > 0 ? "Place which terrain?" : "Remove which terrain?",
    options: available.map((key) => ({ value: key, label: HOLLOWS_CONDITIONS[key]?.label || key })),
  });
  return picked || "any";
}

async function applyAfterAttackEffectsDirect(target, targetZone, afterAttack, context = {}) {
  const groups = Array.isArray(afterAttack) ? afterAttack : [afterAttack];
  const entityActor = context.entityActor || null;
  const shouldApplyEffects = context.effectTiming === "beforeAttack"
    ? shouldApplyBeforeAttackEffects
    : shouldApplyAfterAttackEffects;
  if (!target && !entityActor) return;

  for (const group of groups) {
    if (!shouldApplyEffects(group, {
      ...context,
      target,
      targetZone,
    })) continue;

    if (target && group.destroyTerrain) {
      const removed = [];
      let lostElevated = false;
      for (const key of getTerrainTagKeys()) {
        if (!target.statuses.has(key)) continue;
        if (await resolveTerrainDiscardOptions(target, key, { source: "entityAttack" })) continue;
        await removeCondition(target, key);
        if (key === "elevated") lostElevated = true;
        removed.push(HOLLOWS_CONDITIONS[key]?.label || key);
      }
      if (removed.length) {
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: target }),
          content: `<div class="hollows-chat"><strong>${target.name}</strong> loses <strong>${removed.join(", ")}</strong> (Destroyed).</div>`,
        });
      }
      if (lostElevated) await applyColossalThrowFree(target, targetZone, entityActor);
    }

    if (target && group.discardTerrain) {
      const hadElevated = target.statuses.has("elevated");
      for (const key of getTerrainTagKeys()) {
        if (target.statuses.has(key)) {
          await discardTerrainCondition(target, key, "", { source: "entityAttack" });
        }
      }
      if (hadElevated && !target.statuses.has("elevated")) await applyColossalThrowFree(target, targetZone, entityActor);
    }

    if (target && group.removeFocus && (getFocusCount(target) > 0)) {
      await setFocusCount(target, 0);
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: target }),
        content: `<div class="hollows-chat"><strong>${target.name}</strong> loses all <strong>Focus</strong>.</div>`,
      });
    }

    if (target && group.removeCapacity) {
      const weapons = target.items?.filter((i) => i.type === "weapon") || [];
      const updates = [];
      for (const weapon of weapons) {
        const max = Number(getEffectiveWeaponCapacity(weapon).max ?? 0);
        if (max > 0) updates.push({ _id: weapon.id, "system.capacity.value": 0 });
      }
      if (updates.length) await target.updateEmbeddedDocuments("Item", updates);
      await setShotgunsLoaded(target, false);
      if (updates.length) {
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: target }),
          content: `<div class="hollows-chat"><strong>${target.name}</strong> loses <strong>Capacity</strong>.</div>`,
        });
      }
    }

    if (target && group.killHunter && (target.type === "hunter") && !target.statuses.has("dead")) {
      if (target.statuses.has("dying")) await removeCondition(target, "dying");
      await addCondition(target, "dead");
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: target }),
        content: `<div class="hollows-chat"><strong>${target.name}</strong> is killed outright.</div>`,
      });
    }

    // Signed curse / threat: positive places, negative removes.
    if (group.curseEntity && entityActor) {
      const cur = clampCurse(Number(entityActor.system?.curse?.value ?? 0));
      await entityActor.update({ "system.curse.value": clampCurse(cur + Number(group.curseEntity || 0)) });
    }

    if (target && group.curseTarget) {
      const cur = clampCurse(Number(target.system?.curse?.value ?? 0));
      await target.update({ "system.curse.value": clampCurse(cur + Number(group.curseTarget || 0)) });
    }

    if (group.curseZone && targetZone) {
      const region = getZoneRegionDoc(targetZone);
      if (region) {
        const cur = clampCurse(getRegionCurseData(region).current);
        await updateRegionCurse(region, clampCurse(cur + Number(group.curseZone || 0)));
      }
    }

    if (group.threat && targetZone) {
      await addThreatToZoneSafe(targetZone, Number(group.threat || 0));
    }

    await applyAfterAttackShift(group, targetZone);

    // Signed resource delta: positive deals damage, negative restores.
    if (target && (group.targetDelta?.resolve || group.targetDelta?.wounds)) {
      await adjustHunterResource(target, {
        resolve: -Number(group.targetDelta.resolve || 0),
        wounds: -Number(group.targetDelta.wounds || 0),
      });
    }

    if ((group.entityDelta?.resolve || group.entityDelta?.wounds) && entityActor) {
      await adjustEntityResource(entityActor, {
        resolve: -Number(group.entityDelta.resolve || 0),
        wounds: -Number(group.entityDelta.wounds || 0),
      });
    }

    // Entity terrain: positive places, negative removes. By default tags are
    // created/destroyed outright ("in addition to the pool"); entityTerrainFromPool
    // instead draws from / returns them to the Entity's pool. A "any" tag prompts
    // the GM to pick a concrete type among those actionable.
    if (group.entityTerrain && entityActor) {
      const delta = Number(group.entityTerrain || 0);
      const fromPool = !!group.entityTerrainFromPool;
      let terrainTag = String(group.entityTerrainTag || "any");
      if (terrainTag === "any") terrainTag = await resolveAnyTerrainTag(entityActor, delta, fromPool);
      const changed = terrainTag ? await adjustEntityTerrain(entityActor, terrainTag, delta, { fromPool }) : 0;
      if (changed > 0) {
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: entityActor }),
          content: `<div class="hollows-chat"><strong>${entityActor.name}</strong> ${delta > 0 ? "gains" : "loses"} <strong>${changed}</strong> terrain tag${changed === 1 ? "" : "s"}.</div>`,
        });
      }
    }

    // Pluck: discard a terrain tag from the Hunter and place it on the Entity.
    if (target && group.transferTerrainToEntity && entityActor) {
      const moved = ["elevated", "sheltered"].find((k) => target.statuses.has(k));
      if (moved) {
        await removeCondition(target, moved, { skipPoolRefund: true });
        await adjustEntityTerrain(entityActor, moved, 1, { fromPool: false });
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: entityActor }),
          content: `<div class="hollows-chat"><strong>${target.name}</strong>'s ${HOLLOWS_CONDITIONS[moved]?.label || moved} tag is moved onto <strong>${entityActor.name}</strong>.</div>`,
        });
      }
    }

    if (target && group.specialCondition?.enabled) {
      await applySpecialConditionSlot(target, group.specialCondition);
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: target }),
        content: `<div class="hollows-chat"><strong>${target.name}</strong> gains a <strong>Special Condition</strong> (${group.specialCondition.slot || "special1"}).</div>`,
      });
    }

    if (group.otherText) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: target || entityActor || null }),
        content: `<div class="hollows-chat"><strong>Effect:</strong> ${foundry.utils.escapeHTML(group.otherText)}</div>`,
      });
    }
  }
}

export async function requestAfterAttackApply(target, targetZone, afterAttack, entityId = "", selfDamage = null, context = {}) {
  const groups = Array.isArray(afterAttack) ? afterAttack : (afterAttack?.groups || []);
  if (!groups.length && !selfDamage) return;

  if (game.user?.isGM) {
    const entityActor = context.entityActor || (entityId ? game.actors.get(entityId) : getActiveEntityActor());
    const entity = entityId ? game.actors.get(entityId) : entityActor;
    await applyAfterAttackEffectsDirect(target, targetZone, groups, {
      ...context,
      entityActor,
      targetZone,
    });
    if (selfDamage) await applyEntitySelfDamage(entity, selfDamage);
    return;
  }

  const targetToken = target ? getActorTokenOnScene(target) : null;
  await dispatchToGM("afterAttackApply", {
    targetId: target?.id || "",
    targetTokenUuid: targetToken?.document?.uuid || targetToken?.uuid || "",
    targetZone: targetZone || "",
    afterAttack,
    entityId,
    selfDamage,
    context,
  });
}

export async function applyAfterAttackPayload(data = {}) {
  const token = data.targetTokenUuid ? await fromUuid(data.targetTokenUuid) : null;
  const actor = token?.actor || (data.targetId ? game.actors.get(data.targetId) : null);
  const targetZone = String(data.targetZone || "");
  const afterAttack = data.afterAttack || {};
  const entityId = String(data.entityId || "");
  const selfDamage = data.selfDamage || null;
  const entityActor = entityId ? game.actors.get(entityId) : getActiveEntityActor();
  if (!actor && !entityActor) return;

  await applyAfterAttackEffectsDirect(actor, targetZone, afterAttack, {
    ...(data.context || {}),
    entityActor,
    targetZone,
  });
  if (selfDamage) await applyEntitySelfDamage(entityActor, selfDamage);
}
