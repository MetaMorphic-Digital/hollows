/**
 * Attack action orchestration. Single source of truth for the Hunter attack
 * dialog — opens the weapon/profile/mode picker, performs the standardized
 * stat roll (dice/hunter-rolls.js), resolves damage and weapon-ability
 * effects, posts the attack chat card.
 *
 * Mirrors the _tmp_ryuutama layout: action orchestration lives in `data/`,
 * the Roll primitive in `dice/`, the Document subclass stays thin.
 *
 * Consumers:
 *   - HollowsHunterSheet#_onAttackEntity (the Attack action button)
 *   - Counterattack reaction (Armour T2 immediate attack).
 *
 * `openAttackDialog(actor, { title })` resolves to `{ dealtWounds }` so
 * callers that branch on the outcome (Counterattack regaining Ready) can.
 */
import { STAT_LABELS } from "../_module.mjs";
import {
  getAttackOptions, renderAttackOptionHtml, prepareAttackOptions,
  applyAttackOptionBeforeRoll, applyAttackOptionDamageBonuses,
  applyAttackOptionAfterDamage,
} from "./attack-options.js";
import { getActorZone, isCloseZone } from "../../canvas/zone.js";
import { addThreatToZone } from "../../canvas/overlays.js";
import { placeThreatFromHunter } from "../../canvas/threat-ops.js";
import { getTotalStatForActor } from "../../documents/actor/hunter-combat.js";
import { getFocusCount, adjustHunterResource, StandardDamage } from "../../documents/actor/resources.js";
import { hasCondition, getEntityTerrainTotal } from "../../documents/actor/conditions.js";
import { adjustEntityTerrain } from "../../canvas/terrain-pool.js";
import { getEchoDamageBonus } from "../echo/index.js";
import {
  getEffectiveEntityStat, isEntityColossal, entityAllowsTerrainShield,
} from "../../documents/entity/entity-stats.js";
import { triggerEntityTriggeredAbilities } from "../entity/actions/entity-special.js";
import { getEntityPassiveSpecialDamageReduction } from "../entity/action-rules.js";
import { maybeTriggerEntitySuffersWoundEnhancements } from "../../documents/entity/entity-enhancements.js";
import { resolveEntityKillRewardsFromMessage } from "../../documents/entity/baptism.js";
import { isShotgunWeapon, isShotgunLoaded, bindSuggestedRollMode } from "../../helpers/weapon-utils.js";
import {
  getStatOverrides, getAttackRollMode, applyAttackDamageChanges,
  tryActivateStatOverride, evaluateStatOverrideSuccess, runOnAttackResult,
} from "../../helpers/weapon-abilities/dispatchers.js";
import { normalizeRange, normalizeRollModeValue } from "../../dice/roll-helpers.js";
import { HunterStatRollFlow } from "../../dice/flow.js";
import { outcomeClassFromLabel } from "../../dice/roll-outcome.js";
import { applyEffects } from "../mechanics/dsl/effects.js";
import {
  getEffectiveWeaponAttackProfiles,
  getEffectiveWeaponCapacity,
  getEffectiveWeaponDamage,
} from "../weapons/index.js";

function getCenteredDialogPosition(width = 420, height = 420) {
  const viewportWidth = Number(window.innerWidth || 0) || width;
  const viewportHeight = Number(window.innerHeight || 0) || height;
  return {
    width,
    left: Math.max(16, Math.round((viewportWidth - width) / 2)),
    top: Math.max(16, Math.round((viewportHeight - height) / 2)),
  };
}

function attackProfileMatchesRange(profile, allowedRange) {
  if (!allowedRange) return true;
  const rawRange = String(profile?.range || "").trim().toLowerCase();
  if (rawRange === "anywhere") return true;
  return normalizeRange(profile?.range) === allowedRange;
}

function getEntityActor() {
  const scene = canvas?.scene;
  if (scene?.tokens?.size) {
    const tokenDoc = scene.tokens.contents.find((t) => t.actor?.type === "entity");
    return tokenDoc?.actor || null;
  }
  return game.actors.find((a) => a.type === "entity") || null;
}

function getThrallActorsInScene() {
  const scene = canvas?.scene;
  if (!scene?.tokens?.size) return [];
  const seen = new Set();
  const thralls = [];
  for (const tokenDoc of scene.tokens.contents) {
    const actor = tokenDoc?.actor;
    if (!actor || actor.type !== "thrall") continue;
    if (seen.has(actor.id)) continue;
    seen.add(actor.id);
    thralls.push(actor);
  }
  return thralls;
}

function resolveAttackWeapon(attacker, weaponId = "") {
  if (!attacker || attacker.type !== "hunter" || !weaponId) return null;
  const weapon = attacker.items?.get?.(String(weaponId));
  return weapon?.type === "weapon" ? weapon : null;
}

function getActorByIdFromScene(id) {
  if (!id) return null;
  const scene = canvas?.scene;
  if (scene?.tokens?.size) {
    const tokenDoc = scene.tokens.contents.find((token) => token.actor?.id === id);
    if (tokenDoc?.actor) return tokenDoc.actor;
  }
  return game.actors.get(id) || null;
}

function resolveAttackDamageTarget({ targetType = "", targetId = "" } = {}) {
  const resolved = getActorByIdFromScene(targetId);
  let entity = null;
  let targetActor = null;
  let isEntityTarget = true;

  if (targetType === "thrall" || resolved?.type === "thrall") {
    isEntityTarget = false;
    targetActor = resolved;
  } else if (targetType === "entity" || resolved?.type === "entity") {
    entity = resolved || getEntityActor();
    targetActor = entity;
  }

  if (isEntityTarget && !entity) {
    entity = getEntityActor();
    targetActor = entity;
  }

  return { entity, targetActor, isEntityTarget };
}

export async function applyHunterAttackDamage(message) {
  if (message?.getFlag("hollows", "applyDamage")?.applied) return false;
  const data = message?.getFlag("hollows", "entityDamage");
  if (!data) return false;

  const damageType = String(data.damageType || "");
  const damageValue = Number(data.damageValue ?? 0);
  if ((damageType !== "Resolve" && damageType !== "Wounds") || damageValue <= 0) return false;

  const attackerId = message?.speaker?.actor || "";
  const attacker = attackerId ? game.actors.get(attackerId) : null;
  const weaponId = String(data.weaponId || "");
  const weapon = resolveAttackWeapon(attacker, weaponId);
  const weaponType = String(weapon?.system?.weaponType || data.weaponType || "");
  const { entity, targetActor, isEntityTarget } = resolveAttackDamageTarget({
    targetType: String(data.targetType || ""),
    targetId: String(data.targetId || ""),
  });

  if (!targetActor) {
    ui.notifications.warn("No valid target found to apply damage.");
    return false;
  }

  let threatZone = String(data.threatZone || "");
  if (!threatZone && isEntityTarget && attacker?.type === "hunter") {
    threatZone = getActorZone(attacker) || "";
  }

  let effectiveDamage = damageValue;
  if (isEntityTarget) {
    const reduction = getEntityPassiveSpecialDamageReduction(entity, damageType);
    effectiveDamage = Math.max(0, effectiveDamage - reduction);
    if (effectiveDamage <= 0 && attacker?.type === "hunter") {
      await triggerEntityTriggeredAbilities(entity, "hunterInflictsNoDamage", {
        targetActor: attacker,
        targetZone: threatZone,
      }, ["special", "doom"]);
    }
  }

  // Improvised Defences: the Entity may destroy one of its terrain tags instead
  // of taking Wound damage (a Hunter action → fires Precious Things via byHunter).
  if (isEntityTarget && damageType === "Wounds" && effectiveDamage > 0 && game.user?.isGM && entityAllowsTerrainShield(entity)) {
    if (getEntityTerrainTotal(entity) > 0) {
      const swap = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Improvised Defences" },
        content: `<p>Destroy a terrain tag on <strong>${entity.name}</strong> instead of inflicting <strong>${effectiveDamage} Wound${effectiveDamage === 1 ? "" : "s"}</strong>?</p>`,
        rejectClose: false,
      });
      if (swap) {
        await adjustEntityTerrain(entity, "any", -1, { byHunter: true, hunterId: attacker?.type === "hunter" ? attacker.id : "" });
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: entity }),
          content: `<div class="hollows-chat"><strong>${entity.name}</strong> destroys a terrain tag instead of taking ${effectiveDamage} Wound${effectiveDamage === 1 ? "" : "s"}.</div>`,
        });
        await message?.setFlag("hollows", "applyDamage", { applied: true });
        return true;
      }
    }
  }

  const resourceKey = damageType === "Wounds" ? "wounds" : "resolve";
  const resourcePath = `system.health.${resourceKey}.value`;
  const current = Number(targetActor.system.health[resourceKey].value ?? 0);
  const next = Math.max(0, current - effectiveDamage);
  await targetActor.update({ [resourcePath]: next }, {
    hollowsSourceHunterId: attacker?.type === "hunter" ? attacker.id : "",
    hollowsDamageType: damageType,
    hollowsDamageValue: effectiveDamage,
  });

  if (damageType === "Resolve") {
    if (isEntityTarget && attacker?.type === "hunter" && effectiveDamage > 0) {
      await runOnAttackResult(attacker, "hit", {
        timing: "afterDamageApplied",
        damageType,
        damageValue: effectiveDamage,
        targetType: "entity",
        targetActor,
        weapon,
        weaponId: weapon?.id || weaponId,
        weaponType,
        previousResolve: current,
        nextResolve: next,
        brokeEntity: current > 0 && next <= 0,
        attackerZone: threatZone,
      });
    }
  } else {
    if (isEntityTarget && attacker?.type === "hunter" && effectiveDamage > 0) {
      await runOnAttackResult(attacker, "hit", {
        timing: "afterDamageApplied",
        damageType,
        damageValue: effectiveDamage,
        targetType: "entity",
        targetActor,
        weapon,
        weaponId: weapon?.id || weaponId,
        weaponType,
        previousWounds: current,
        nextWounds: next,
        attackerZone: threatZone,
      });
      await triggerEntityTriggeredAbilities(entity, "hunterInflictsWoundsDamage", {
        targetActor: attacker,
        targetZone: threatZone,
      }, ["special", "doom"]);
      await maybeTriggerEntitySuffersWoundEnhancements(targetActor);
    }
  }

  if (isEntityTarget && damageType === "Resolve" && effectiveDamage > 0) {
    await triggerEntityTriggeredAbilities(entity, "hunterInflictsResolveDamage", {
      targetActor: attacker,
      targetZone: threatZone,
    }, ["special", "doom"]);
  }

  await message?.setFlag("hollows", "applyDamage", { applied: true });

  if (threatZone && isEntityTarget) {
    if (attacker?.type === "hunter") {
      await placeThreatFromHunter(attacker, threatZone, 1, {
        source: "attack",
        reason: "Attack",
      });
    } else {
      await addThreatToZone(threatZone, 1);
    }
    if (attacker?.type === "hunter" && effectiveDamage > 0) {
      await runOnAttackResult(attacker, "hit", {
        timing: "afterThreatPlacement",
        zone: threatZone,
        weapon,
        weaponId: weapon?.id || weaponId,
        weaponType,
      });
    }
  }

  if (effectiveDamage > 0 && attacker?.type === "hunter") {
    await runOnAttackResult(attacker, "hit", {
      timing: "afterDamage",
      zone: getActorZone(attacker),
    });
  }

  if (isEntityTarget && damageType === "Wounds" && current > 0 && next <= 0) {
    await resolveEntityKillRewardsFromMessage(message);
  }
  return true;
}

/**
 * Open the standard Hunter attack dialog for `actor`.
 * @param {Actor} actor
 * @param {{ title?: string, weaponType?: string, suggestedMode?: string, statBonus?: number }} [options]
 * @returns {Promise<{ dealtWounds: boolean }>}
 */
export async function openAttackDialog(actor, options = {}) {
  const result = { dealtWounds: false, hit: false, rolled: false };
  const rollOnly = !!options.rollOnly;
  if (!actor || actor.type !== "hunter") return result;
  const windowTitle = options.title || "Attack";
  const suggestedMode = options.suggestedMode || "normal";

  // Special-attack options (all default off → zero impact on normal attacks):
  //   weaponless          — no weapon picker; a fixed profile + base damage are
  //                         supplied (Kicking and Screaming, Lashing Branches).
  //   forcedProfile       — { stat, defence } replacing the profile picker.
  //   damageOverride      — { resolve, wounds } replacing the weapon's base damage.
  //   damageBonus         — { resolve, wounds } added after the base (Raze + N).
  //   suppressWeaponItemBonuses — skip refuge/echo weapon-item bonuses.
  //                         General AttackDamageChange modifiers still apply.
  //                         Implied by weaponless.
  //   originZone          — zone the attack is treated as coming from (threat
  //                         placement + card).
  const weaponless = !!options.weaponless;
  const forcedProfile = options.forcedProfile || null;
  const damageOverride = options.damageOverride || null;
  const damageBonus = options.damageBonus || null;
  const suppressItemBonuses = weaponless || !!options.suppressWeaponItemBonuses;

  let weapons = [];
  if (!weaponless) {
    weapons = actor.items.filter((i) => i.type === "weapon");
    if (options.weaponType) {
      weapons = weapons.filter((w) => String(w.system?.weaponType || "") === options.weaponType);
    }
    if (!weapons.length) {
      ui.notifications.warn(options.weaponType
        ? `No ${options.weaponType} weapon on this Hunter.`
        : "No weapons on this Hunter.");
      return result;
    }
  }
  const zone = getActorZone(actor);
  const originZone = options.originZone || zone;
  let allowedRange = null;
  if (!zone) {
    ui.notifications.warn("Your token is not inside a zone region.");
  } else if (zone === "Support") {
    ui.notifications.warn("You cannot attack from Support.");
    return result;
  } else if (["Ranged Left", "Ranged Front", "Ranged Right"].includes(zone)) {
    allowedRange = "Ranged";
  } else if (["Front", "Rear", "Flank Left", "Flank Right"].includes(zone)) {
    allowedRange = "Close";
  }
  const entity = getEntityActor();
  // Colossal Climbing: Elevated Hunter in Close vs a Colossal Entity.
  const isHunterClimbing = () => !!entity && isEntityColossal(entity) && hasCondition(actor, "elevated") && isCloseZone(zone);
  const thralls = getThrallActorsInScene();
  if (!entity && !thralls.length) {
    ui.notifications.warn("No Entity or Thrall found in the scene.");
    return result;
  }

  const weaponFiltered = weaponless ? [] : (allowedRange
    ? weapons.filter((w) => getEffectiveWeaponAttackProfiles(w)
      .some((p) => attackProfileMatchesRange(p, allowedRange)))
    : weapons);
  if (!weaponless && allowedRange && weaponFiltered.length === 0) {
    ui.notifications.warn("No weapons can attack from this zone.");
    return result;
  }
  const weaponOptions = weaponless ? "" : (weaponFiltered.length ? weaponFiltered : weapons)
    .map((w) => `<option value="${w.id}">${w.name}</option>`)
    .join("");

  const initialWeapon = weaponless ? null : (weaponFiltered.length ? weaponFiltered : weapons)[0];
  const profiles = weaponless ? [] : getEffectiveWeaponAttackProfiles(initialWeapon);
  const initialProfiles = allowedRange
    ? profiles.filter((p) => attackProfileMatchesRange(p, allowedRange))
    : profiles;
  const profileOptions = initialProfiles
    .map((p, i) => `<option value="${i}">${p.range} / ${p.stat} vs ${p.defence}</option>`)
    .join("");
  if (!weaponless && allowedRange && initialProfiles.length === 0) {
    ui.notifications.warn("No attack profiles available for this weapon in this zone.");
  }

  const targetOptions = [];
  if (entity) {
    targetOptions.push(`<option value="entity:${entity.id}">${entity.name || "Entity"}</option>`);
  }
  if (thralls.length) {
    targetOptions.push(...thralls.map((t) => `<option value="thrall:${t.id}">${t.name}</option>`));
  }
  const showTargetSelect = targetOptions.length > 1 || (thralls.length && !entity);

  const attackOverrides = getStatOverrides(actor, "attack");
  const attackOptions = getAttackOptions(actor, { zone });

  const content = `
    <form class="hollows-roll-dialog">
      ${zone ? `<div class="form-group"><label>Zone</label><div>${zone}</div></div>` : ""}
      ${showTargetSelect ? `
        <div class="form-group">
          <label>Target</label>
          <select name="targetId">${targetOptions.join("")}</select>
        </div>
      ` : ""}
      ${weaponless ? "" : `
      <div class="form-group">
        <label>Weapon</label>
        <select name="weaponId">${weaponOptions}</select>
      </div>
      <div class="form-group">
        <label>Attack Profile</label>
        <select name="profileIndex">${profileOptions}</select>
      </div>
      `}
      ${weaponless && forcedProfile ? `<div class="form-group"><label>Attack</label><div>${foundry.utils.escapeHTML(`${STAT_LABELS[forcedProfile.stat] || forcedProfile.stat} vs ${STAT_LABELS[forcedProfile.defence] || forcedProfile.defence}`)}</div></div>` : ""}
      <div class="form-group">
        <label>Roll Mode</label>
        <select name="mode">
          <option value="normal" selected>Normal</option>
          <option value="adv">Advantage</option>
          <option value="dis">Disadvantage</option>
        </select>
      </div>
      ${attackOverrides.map((o) => `
        <div class="form-group">
          <label class="checkbox">
            <input type="checkbox" name="statOverride:${o.key}" />
            ${foundry.utils.escapeHTML(o.label)}
          </label>
        </div>
      `).join("")}
      ${hasCondition(actor, "focus") ? `
        <div class="form-group">
          <label class="checkbox">
            <input type="checkbox" name="useFocus" />
            Spend 1 Focus for Advantage
          </label>
        </div>
      ` : ""}
      ${renderAttackOptionHtml(attackOptions, { actor, zone })}
    </form>
  `;

  await foundry.applications.api.DialogV2.wait({
    window: { title: windowTitle },
    position: getCenteredDialogPosition(440, 520),
    content,
    render: (_e, dialog) => {
      const el = dialog.element;
      if (!weaponless && allowedRange && !initialProfiles.length) {
        el.querySelector("[name=profileIndex]").disabled = true;
      }
      const refreshProfiles = () => {
        if (weaponless) return;
        const weaponId = el.querySelector("[name=weaponId]")?.value;
        const weapon = actor.items.get(weaponId);
        const atkProfiles = weapon ? getEffectiveWeaponAttackProfiles(weapon) : [];
        const filtered = allowedRange
          ? atkProfiles.filter((p) => attackProfileMatchesRange(p, allowedRange))
          : atkProfiles;
        const options = filtered
          .map((p, i) => `<option value="${i}">${p.range} / ${p.stat} vs ${p.defence}</option>`)
          .join("");
        const profileSelect = el.querySelector("[name=profileIndex]");
        profileSelect.innerHTML = options;
        profileSelect.disabled = filtered.length === 0;
      };
      el.querySelector("[name=weaponId]")?.addEventListener("change", refreshProfiles);
      const updateSuggestedMode = bindSuggestedRollMode(el, {
        fallback: suggestedMode,
        getAdvantages: (root) => {
          const weaponId = String(root.querySelector("[name=weaponId]")?.value || "");
          const weapon = actor.items.get(weaponId);
          const useFocus = !!root.querySelector("[name=useFocus]")?.checked && getFocusCount(actor) > 0;
          // Colossal: while Climbing the Elevated tag grants no advantage — it is
          // replaced by +1/+2 damage below.
          const elevatedActive = hasCondition(actor, "elevated") && !isHunterClimbing();
          const abilityRollMode = getAttackRollMode(actor, { weapon, zone });
          return [useFocus, elevatedActive, abilityRollMode === "adv"];
        },
        getDisadvantages: (root) => {
          const weaponId = String(root.querySelector("[name=weaponId]")?.value || "");
          const weapon = actor.items.get(weaponId);
          const isCloseZone = ["Front", "Rear", "Flank Left", "Flank Right"].includes(zone || "");
          const abilityRollMode = getAttackRollMode(actor, { weapon, zone });
          return [abilityRollMode === "dis", String(weapon?.system?.weaponType || "") === "Rifle" && isCloseZone];
        },
        watch: ["weaponId", "profileIndex", "useFocus"],
      });
      refreshProfiles();
      prepareAttackOptions(attackOptions, el, {
        actor,
        zone,
        focusCount: getFocusCount(actor),
        updateSuggestedMode,
      });
      updateSuggestedMode();
    },
    buttons: [
      {
        action: "roll",
        label: "Roll",
        default: true,
        callback: async (_e, _b, dialog) => {
          let targetType = "entity";
          let targetActor = entity;
          const targetVal = String(dialog.element.querySelector("[name=targetId]")?.value || "");
          if (targetVal.startsWith("thrall:")) {
            targetType = "thrall";
            const targetId = targetVal.split(":")[1];
            targetActor = thralls.find((t) => t.id === targetId) || game.actors.get(targetId) || null;
          } else if (targetVal.startsWith("entity:")) {
            targetType = "entity";
            targetActor = entity;
          } else if (!entity && thralls.length === 1) {
            targetType = "thrall";
            targetActor = thralls[0];
          }
          if (!targetActor) {
            ui.notifications.warn("No valid target selected.");
            return;
          }
          const weaponId = dialog.element.querySelector("[name=weaponId]")?.value;
          const profileIndex = Number(dialog.element.querySelector("[name=profileIndex]")?.value ?? 0);
          const selectedMode = dialog.element.querySelector("[name=mode]")?.value || "normal";
          const useFocus = !!dialog.element.querySelector("[name=useFocus]")?.checked;
          const requestedAttackOverrides = attackOverrides.filter(
            (o) => !!dialog.element.querySelector(`[name="statOverride:${o.key}"]`)?.checked,
          );
          const focusCount = getFocusCount(actor);
          let useFocusAdv = useFocus && focusCount > 0;
          const elevatedActive = hasCondition(actor, "elevated");
          const mode = normalizeRollModeValue(selectedMode);
          const weapon = weaponless ? null : actor.items.get(weaponId);
          let profile;
          if (weaponless) {
            profile = forcedProfile
              ? { range: allowedRange || "Close", stat: forcedProfile.stat, defence: forcedProfile.defence }
              : { range: allowedRange || "Close", stat: "hard", defence: "close" };
          } else {
            const atkProfiles = weapon ? getEffectiveWeaponAttackProfiles(weapon) : [];
            const filtered = allowedRange
              ? atkProfiles.filter((p) => attackProfileMatchesRange(p, allowedRange))
              : atkProfiles;
            profile = forcedProfile
              ? { range: allowedRange || "Close", stat: forcedProfile.stat, defence: forcedProfile.defence }
              : (filtered[profileIndex] || filtered[0]);
          }
          if (!profile) {
            ui.notifications.warn("No attack profile available for this zone.");
            return;
          }

          if (!weaponless) {
            const isShotgun = isShotgunWeapon(weapon);
            if (isShotgun && !isShotgunLoaded(weapon)) {
              ui.notifications.warn("Shotgun is Empty. Reload first.");
              return;
            }

            if (getEffectiveWeaponCapacity(weapon).max > 0 && Number(weapon.system.capacity.value ?? 0) <= 0) {
              ui.notifications.warn("Out of ammo. Reload first.");
              return;
            }
          }

          const activeAttackOverrides = [];
          for (const override of requestedAttackOverrides) {
            if (await tryActivateStatOverride(actor, override)) {
              activeAttackOverrides.push(override);
            }
          }
          let statKey = (profile.stat || "").toLowerCase();
          if (activeAttackOverrides.length) {
            statKey = String(activeAttackOverrides[0].newStat || statKey).toLowerCase();
          }
          const tnKey = (profile.defence || "").toLowerCase();
          const tn = targetType === "thrall"
            ? Number(targetActor.system?.tn ?? 10)
            : getEffectiveEntityStat(targetActor, tnKey, { targetActor: actor, target: actor, actionKind: "hunterAttack" });

          const attackState = {
            useFocusAdv,
            focusCount,
            focusSpend: useFocusAdv ? 1 : 0,
            statBonus: 0,
            damageResolve: 0,
            damageWounds: 0,
            cardLines: [],
          };
          await applyAttackOptionBeforeRoll(attackOptions, dialog.element, actor, attackState, {
            zone,
            weapon,
            profile,
            targetActor,
            targetType,
            statKey,
          });
          if (attackState.cancelled) return;
          const statValue = getTotalStatForActor(actor, statKey)
            + Number(options.statBonus || 0)
            + Number(attackState.statBonus || 0);

          const { roll, results, chosen } = await new HunterStatRollFlow(actor, {
            title: `${weapon?.name || windowTitle} Attack`,
            statLabel: STAT_LABELS[statKey] || statKey,
            statValue,
            tn,
          }).roll({
            mode: attackState.rollMode ? normalizeRollModeValue(attackState.rollMode) : mode,
            useFocus: false,
          });
          const r = chosen.value;
          const outcome = chosen.outcome;
          const outcomeLabel = outcome.label;
          const isMiss = Number(outcome.rank ?? 0) <= 1;
          const isCrit = Number(outcome.rank ?? 0) === 4;
          const attackResult = isMiss ? "miss" : (isCrit ? "crit" : "hit");

          let damageType = null;
          let damageValue = 0;
          // Base damage: weapon's effective damage, or a caller override (Lashing
          // 2/1, Raze 3/3), plus an optional flat bonus (Raze +N/+N).
          const baseDamage = damageOverride || getEffectiveWeaponDamage(weapon);
          let damageResolve = Number(baseDamage.resolve ?? profile?.damage?.resolve ?? 0) + Number(damageBonus?.resolve || 0);
          let damageWounds = Number(baseDamage.wounds ?? profile?.damage?.wounds ?? 0) + Number(damageBonus?.wounds || 0);
          {
            // General damage modifiers (Backstab, Seeing Red) always apply.
            const changed = applyAttackDamageChanges(actor, { resolve: damageResolve, wounds: damageWounds }, {
              attackerZone: zone,
              weapon,
              weaponType: weapon?.system?.weaponType || "",
              suppressItemBonuses,
            });
            damageResolve = changed.resolve;
            damageWounds = changed.wounds;
          }
          // Echo weapon-item bonus — skipped for weaponless / suppressed attacks.
          // (Refuge weapon bonus is an aura AttackDamageChange, applied above.)
          const echoBonus = suppressItemBonuses ? { resolve: 0, wounds: 0, sources: [] } : getEchoDamageBonus(actor, weapon);
          if (!suppressItemBonuses) {
            damageResolve += echoBonus.resolve;
            damageWounds += echoBonus.wounds;
          }
          // Colossal: Climbing Hunters inflict +1/+2 on all attacks.
          if (isHunterClimbing()) {
            damageResolve += 1;
            damageWounds += 2;
          }
          attackState.damageResolve = damageResolve;
          attackState.damageWounds = damageWounds;
          applyAttackOptionDamageBonuses(attackOptions, dialog.element, actor, attackState, {
            zone,
            weapon,
            profile,
            targetActor,
            targetType,
          });
          useFocusAdv = attackState.useFocusAdv;
          damageResolve = attackState.damageResolve;
          damageWounds = attackState.damageWounds;
          const totalFocusSpend = attackState.focusSpend;
          if (totalFocusSpend > focusCount) {
            ui.notifications.warn("Not enough Focus for this attack.");
            return;
          }

          if (!weaponless && getEffectiveWeaponCapacity(weapon).max > 0) {
            const current = Number(weapon.system.capacity.value ?? 0);
            const next = Math.max(0, current - 1);
            await weapon.update({ "system.capacity.value": next });
          }
          if (!weaponless && isShotgunWeapon(weapon)) {
            await weapon.update({ "system.loaded": false });
          }

          if (totalFocusSpend > 0) {
            await adjustHunterResource(actor, { focus: -totalFocusSpend });
          }

          const resolvedDamage = StandardDamage.resolve(
            { resolve: damageResolve, wounds: damageWounds },
            {
              mode: "attack",
              outcomeLabel,
              targetResolve: StandardDamage.targetResolve(targetActor),
            },
          );
          damageType = resolvedDamage.damageType;
          damageValue = resolvedDamage.damageValue;

          if (rollOnly) {
            // Roll-only attack (Pin Down): resolve hit/miss but deal no
            // damage, so the chat card stays a plain result.
            damageType = null;
            damageValue = 0;
          }

          await applyAttackOptionAfterDamage(attackOptions, dialog.element, actor, attackState, {
            damageType,
            damageValue,
            zone,
            weapon,
            profile,
            targetActor,
            targetType,
          });

          for (const override of activeAttackOverrides) {
            if (evaluateStatOverrideSuccess(override, { roll: r, statValue, damageType, damageValue })) {
              await applyEffects(override.onSuccessEffects, { actor });
            }
          }

          {
            const resultChanges = await runOnAttackResult(actor, attackResult, {
              timing: "immediate",
              damageType,
              damageValue,
              weaponId: weapon?.id || "",
              weapon,
              weaponType: weapon?.system?.weaponType || "",
              targetType,
              targetActor,
              attackerZone: zone,
              useFocusAdv,
            });
            if (resultChanges?.damageType) damageType = resultChanges.damageType;
            if (resultChanges?.damageValue != null) damageValue = Number(resultChanges.damageValue || 0);
            if (Array.isArray(resultChanges?.cardLines)) attackState.cardLines.push(...resultChanges.cardLines);
          }

          const dealtDamage = !!damageType && Number(damageValue) > 0;
          const entityDamage = damageType ? {
            damageType,
            damageValue,
            threatZone: originZone && targetType === "entity" ? originZone : "",
            weaponType: String(weapon?.system?.weaponType || ""),
            weaponId: String(weapon?.id || ""),
            targetType,
            targetId: String(targetActor.id || ""),
          } : null;

          const outcomeClass = outcomeClassFromLabel(outcomeLabel);
          const echoItems = actor.activeEchoes.filter((e) => {
            const b = e.system.damageBonus || {};
            return Number(b.resolve ?? 0) || Number(b.wounds ?? 0);
          });
          const attackTitle = weapon?.name ? `${weapon.name} Attack` : windowTitle;
          const cardContent = `
            <div class="hollows-chat hollows-attack-chat ${outcomeClass}">
              <h3>${foundry.utils.escapeHTML(attackTitle)}</h3>
              <div><strong>Profile:</strong> ${profile.range} / ${profile.stat} vs ${profile.defence}</div>
              <div><strong>Roll:</strong> ${r} vs ${statValue} (TN ${tn})</div>
              ${useFocusAdv ? "<div><strong>Focus:</strong> Spent for Advantage.</div>" : ""}
              ${attackState.cardLines.join("")}
              ${activeAttackOverrides.map((o) => `<div><strong>${foundry.utils.escapeHTML(o.name)}:</strong> Attack used ${(STAT_LABELS[o.newStat] || o.newStat)}.</div>`).join("")}
              ${!useFocusAdv && selectedMode === "normal" && mode === "adv" ? "<div><strong>Elevated:</strong> Advantage applied automatically.</div>" : ""}
              ${mode === "normal" ? "" : `<div><strong>Rolls:</strong> ${results.join(", ")} (${mode})</div>`}
              ${(echoBonus.resolve || echoBonus.wounds)
                ? `<div><strong>Echo Bonus:</strong> +${echoBonus.resolve}/+${echoBonus.wounds} (${echoBonus.sources.map((s) => foundry.utils.escapeHTML(s)).join(", ")})</div>`
                : (echoItems.length ? "<div><strong>Echo Bonus:</strong> none (no weapon match)</div>" : "")}
              <div><strong>Outcome:</strong> ${outcomeLabel}</div>
              ${damageType ? `<div><strong>Damage:</strong> ${damageValue} ${damageType}</div>` : ""}
              ${dealtDamage && originZone && targetType === "entity" ? `<div><strong>Threat:</strong> +1 in ${originZone} on Apply Damage</div>` : ""}
              ${damageType ? "<button type=\"button\" class=\"hollows-apply-damage\">Apply Damage</button>" : ""}
            </div>
          `;

          await roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor }),
            flavor: attackTitle,
            content: cardContent,
            flags: {
              hollows: {
                entityDamage,
              },
            },
          });
          if (!dealtDamage && !rollOnly && targetType === "entity" && entity) {
            await triggerEntityTriggeredAbilities(entity, "hunterInflictsNoDamage", {
              targetActor: actor,
              targetZone: zone || "",
            }, ["special", "doom"]);
          }
          result.dealtWounds = damageType === "Wounds" && Number(damageValue) > 0;
          result.rolled = true;
          result.hit = !isMiss;
        },
      },
    ],
    rejectClose: false,
  });

  return result;
}
