import {
  maybePromptRepetitiveAttack,
  resolveFollowUpFromMessage,
} from "../data/entity/action-followups.js";
import { resolveEntityActorFromAttackContext } from "../data/entity/action-flow.js";
import { requestDoomAdjust } from "../data/entity/actions/entity-doom.js";
import { recordEntityAttackOutcome } from "../documents/entity/entity-enhancements.js";
import { applyEntityAttackDamage } from "../documents/entity/attack-damage.js";
import { requestAfterAttackApply } from "../documents/entity/attack-effects.js";
import { hasEnabledAfterAttackGroups } from "../data/entity/action-rules.js";
import { applyHunterAttackDamage } from "../data/actions/attack.js";
import { STAT_LABELS } from "../data/_module.mjs";
import {
  getTokenZone,
  getActorZone,
} from "../canvas/zone.js";
import {
  hasCondition,
  addCondition,
  removeCondition,
  getSpecialConditionRollMods,
} from "../documents/actor/conditions.js";
import {
  hasGritYourTeethActive,
} from "../documents/actor/hunter-combat.js";
import { adjustHunterResource, getFocusCount, StandardDamage } from "../documents/actor/resources.js";
import {
  setupOutcomeData,
  setupChoiceButtons,
  setupResultHtml,
} from "../helpers/combat-runtime.js";
import {
  evaluateResult,
  resolveSuggestedRollMode,
  HunterStatRollFlow,
} from "../dice/_module.mjs";
import { buildStandardRollCardHtml } from "../applications/ui/roll-card.js";
import { buildMoveOutcomeCardHtml } from "../applications/ui/move-card.js";
import {
  bindSuggestedRollMode,
  hasWeaponEquipped,
} from "../helpers/weapon-utils.js";
import { setMessageFlagSafe } from "../utils/flag-utils.js";
import { getTotalStatForActor } from "../documents/actor/hunter-combat.js";
import { getStatOverrides, tryActivateStatOverride, evaluateStatOverrideSuccess, runOnDefenceResult } from "./weapon-abilities/dispatchers.js";
import {
  applyDefenceOptionBeforeRoll,
  getDefenceOptions,
  renderDefenceOptionHtml,
} from "../data/actions/defence-options.js";
import { applyEffects } from "../data/mechanics/dsl/effects.js";
import { applySetupRollButtonState } from "./setup-roll-state.js";
import { applyInterceptors } from "./extensions.js";
import { promptForm } from "../applications/apps/selection-dialogs.mjs";

export function registerChatMessageHooks() {

  Hooks.on("createChatMessage", async (message) => {
    if (!game.user?.isGM) return;
    const result = message.getFlag("hollows", "defenceResult");
    if (!result) return;
    const hunterDamage = message.getFlag("hollows", "hunterDamage") || null;
    const originMessage = result.originMessageId ? game.messages?.get(result.originMessageId) : null;
    const attackData = originMessage?.getFlag("hollows", "attackData") || {};
    const pendingFinalDamage = hunterDamage && Number(hunterDamage.damageValue ?? 0) > 0;
    await resolveFollowUpFromMessage(result.originMessageId, {
      outcomeLabel: result.outcomeLabel,
      targetTokenUuid: result.targetTokenUuid,
      damageType: hunterDamage?.damageType || "",
      damageValue: Number(hunterDamage?.damageValue ?? 0),
      phase: pendingFinalDamage ? "outcome" : "all",
    });
    const attackGroupId = String(attackData.attackGroupId || "");
    const entityActor = resolveEntityActorFromAttackContext(attackData, originMessage, message);
    if (attackGroupId && entityActor) {
      const hunterDamage = message.getFlag("hollows", "hunterDamage") || null;
      const completesWithoutApply = !hunterDamage || Number(hunterDamage.damageValue ?? 0) <= 0;
      if (completesWithoutApply) await recordEntityAttackOutcome(entityActor, attackGroupId, { woundDamage: false });
    }
  });

  Hooks.on("createChatMessage", async (message) => {
    if (!game.user?.isGM) return;
    const data = message.getFlag("hollows", "guardRevive");
    if (!data) return;
    const sourceToken = data.sourceTokenUuid ? await fromUuid(data.sourceTokenUuid) : null;
    const targetToken = data.targetTokenUuid ? await fromUuid(data.targetTokenUuid) : null;
    const source = sourceToken?.actor;
    const target = targetToken?.actor;
    if (!source || source.type !== "hunter") return;
    if (!target || target.type !== "hunter") return;
    const sourceZone = getTokenZone(sourceToken);
    const targetZone = getTokenZone(targetToken);
    if (!sourceZone || sourceZone !== targetZone) return;
    if (!hasCondition(target, "dying")) return;
    if (hasCondition(target, "dead")) return;
    if (target.getFlag("hollows", "dyingRevivedOnce")) return;

    await removeCondition(target, "dying");
    await adjustHunterResource(target, { resolve: 1, wounds: 1 });
    await target.setFlag("hollows", "dyingRevivedOnce", true);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: source }),
      content: `<div class="hollows-chat"><strong>${source.name}</strong> Guards and revives <strong>${target.name}</strong> (+1 Resolve, +1 Wound).</div>`,
    });
    if (hasWeaponEquipped(source, "Armour")) await addCondition(source, "ready");
    try { await message.delete(); } catch (err) {}
  });

  Hooks.on("renderChatMessageHTML", (message, html) => {
    if (!html) return;
    if (message.getFlag("hollows", "hidden")) {
      html.style.display = "none";
      return;
    }
    if (String(message.content || "").includes("hollows-hidden")) {
      html.style.display = "none";
      return;
    }
    const rollBtn = html.querySelector(".hollows-setup-roll");
    if (rollBtn) {
      if (!game.hollowsSetupRollPending) game.hollowsSetupRollPending = new Set();
      const data = message.getFlag("hollows", "setupRoll") || {};
      const actor = game.actors.get(data.actorId);
      const canClick = actor && (actor.testUserPermission(game.user, "OWNER") || game.user?.isGM);

      if (data.rolled) {
        game.hollowsSetupRollPending.delete(message.id);
        rollBtn.textContent = "Rolled";
        rollBtn.disabled = true;
      } else if (game.hollowsSetupRollPending.has(message.id)) {
        rollBtn.textContent = "Rolled";
        rollBtn.disabled = true;
      } else if (data.rolling) {
        rollBtn.textContent = "Rolling...";
        rollBtn.disabled = true;
      } else if (!canClick) {
        rollBtn.disabled = true;
        rollBtn.classList.add("disabled");
      } else {
        rollBtn.addEventListener("click", async (event) => {
          event.preventDefault();
          const current = message.getFlag("hollows", "setupRoll") || {};
          if (current.rolled) {
            game.hollowsSetupRollPending.delete(message.id);
            rollBtn.textContent = "Rolled";
            rollBtn.disabled = true;
            return;
          }
          if (current.rolling || game.hollowsSetupRollPending.has(message.id)) return;
          game.hollowsSetupRollPending.add(message.id);
          rollBtn.textContent = "Rolled";
          rollBtn.disabled = true;
          setMessageFlagSafe(message, "setupRoll", { ...current, rolling: true });
          const tn = Number(current.tn ?? 0);
          const statValue = getTotalStatForActor(actor, "sharp");
          const flow = new HunterStatRollFlow(actor, {
            title: "Setup Roll",
            cardTitle: "rolls Setup",
            statLabel: "Sharp",
            statValue,
            tn,
          });
          const rollOutcome = await flow.roll();
          const dialogResult = rollOutcome ? await (async () => {
            const { roll, results, chosen } = rollOutcome;
            const outcome = chosen.outcome;
            const outcomeData = setupOutcomeData(outcome.label);
            let choiceButtons = setupChoiceButtons({
              outcomeLabel: outcome.label,
              canActBefore: outcomeData.canActBefore,
            });
            let applied = false;
            let bracket = "";
            if (!outcomeData.canActBefore) {
              const combatant = game.combat?.combatants?.get(current.combatantId);
              if (combatant) {
                const setup = {
                  bracket: "after",
                  freeDeploy: false,
                  extraManeuver: false,
                  outcomeLabel: outcome.label,
                };
                await combatant.update({ initiative: 0 });
                await combatant.setFlag("hollows", "setup", setup);
                applied = true;
                bracket = "after";
              }
            }
            const content = setupResultHtml({
              actorName: actor.name,
              tn,
              rolls: results,
              chosen: chosen.value,
              outcomeLabel: outcome.label,
              freeDeployGranted: outcomeData.freeDeployGranted,
              extraManeuver: outcomeData.extraManeuver,
              choiceButtons,
            });
            await ChatMessage.create({
              speaker: ChatMessage.getSpeaker({ actor }),
              content,
              flags: {
                hollows: {
                  setupResult: {
                    combatantId: current.combatantId,
                    actorId: current.actorId,
                    outcomeLabel: outcome.label,
                    freeDeployGranted: outcomeData.freeDeployGranted,
                    extraManeuver: outcomeData.extraManeuver,
                    canActBefore: outcomeData.canActBefore,
                    applied,
                    bracket,
                  },
                },
              },
              rolls: [roll],
            });
            await setMessageFlagSafe(message, "setupRoll", { ...current, rolled: true, rolling: false });
            return true;
          })() : null;
          if (!dialogResult) {
            game.hollowsSetupRollPending.delete(message.id);
            rollBtn.textContent = "Roll Setup";
            rollBtn.disabled = false;
            setMessageFlagSafe(message, "setupRoll", { ...current, rolling: false });
          }
        });
      }
    }

    const choiceBtnsList = [...html.querySelectorAll(".hollows-setup-choice")];
    if (choiceBtnsList.length) {
      if (!game.hollowsSetupChoicePending) game.hollowsSetupChoicePending = new Set();
      const data = message.getFlag("hollows", "setupResult") || {};
      const actor = game.actors.get(data.actorId);
      const canClick = actor && (actor.testUserPermission(game.user, "OWNER") || game.user?.isGM);
      const disableChoiceButtons = () => {
        choiceBtnsList.forEach(b => { b.disabled = true; b.classList.add("disabled", "muted"); });
      };
      if (!canClick) {
        choiceBtnsList.forEach(b => b.remove());
        return;
      }
      if (data.applied) {
        game.hollowsSetupChoicePending.delete(message.id);
        disableChoiceButtons();
        return;
      }
      if (game.hollowsSetupChoicePending.has(message.id)) {
        disableChoiceButtons();
        return;
      }
      choiceBtnsList.forEach(b => b.addEventListener("click", async (event) => {
        event.preventDefault();
        const current = message.getFlag("hollows", "setupResult") || {};
        if (current.applied || game.hollowsSetupChoicePending.has(message.id)) return;
        game.hollowsSetupChoicePending.add(message.id);
        disableChoiceButtons();
        const choice = String(event.currentTarget.dataset.choice || "");
        const combatant = game.combat?.combatants?.get(current.combatantId);
        if (!combatant) {
          choiceBtnsList.forEach(b2 => { b2.disabled = false; b2.classList.remove("disabled", "muted"); });
          return;
        }
        const existing = combatant.getFlag("hollows", "setup");
        if (existing && existing.bracket) {
          await setMessageFlagSafe(message, "setupResult", { ...current, applied: true, bracket: existing.bracket, freeDeploy: existing.freeDeploy });
          disableChoiceButtons();
          return;
        }
        const bracket = choice === "before" ? "before" : "after";
        const freeDeploy = (choice === "deploy") ? true : !!current.freeDeployGranted;
        const setup = {
          bracket,
          freeDeploy,
          extraManeuver: !!current.extraManeuver,
          outcomeLabel: current.outcomeLabel,
        };
        const initiative = bracket === "before" ? 2 : 0;
        await combatant.update({ initiative });
        await combatant.setFlag("hollows", "setup", setup);
        await setMessageFlagSafe(message, "setupResult", { ...current, applied: true, bracket, freeDeploy });
        disableChoiceButtons();
        ui.combat?.render();
        ui.chat?.render();
      }));
    }
  });

  // (removed) combat turn gating and acted tracking

  // Capture-phase guard: blocks clicks on setup-roll buttons whose flag says
  // rolled/rolling/pending, regardless of any stale DOM state. Needed because
  // the GM side suffers from a DOM-replace after setFlag that can re-enable
  // a button visually before applySetupRollButtonState reasserts the state.
  if (!globalThis._hollowsSetupRollGuardInstalled) {
    globalThis._hollowsSetupRollGuardInstalled = true;
    document.addEventListener("click", (event) => {
      const btn = event.target?.closest?.(".hollows-setup-roll");
      if (!btn) return;
      const li = btn.closest("[data-message-id]");
      const messageId = li?.dataset?.messageId;
      if (!messageId) return;
      const message = game.messages?.get(messageId);
      if (!message) return;
      const sr = message.getFlag("hollows", "setupRoll") || {};
      const isPending = game.hollowsSetupRollPending?.has(messageId);
      if (sr.rolled || sr.rolling || isPending) {
        event.stopPropagation();
        event.preventDefault();
        applySetupRollButtonState(messageId, sr);
      }
    }, true);
  }

  Hooks.on("updateChatMessage", (message, changes) => {
    const sr = message.getFlag("hollows", "setupRoll");
    if (!sr) return;
    if (sr.rolled) game.hollowsSetupRollPending?.delete(message.id);
    applySetupRollButtonState(message.id, sr);
    window.setTimeout(() => applySetupRollButtonState(message.id, sr), 100);
    window.setTimeout(() => applySetupRollButtonState(message.id, sr), 500);
  });

  Hooks.on("renderChatMessageHTML", (message, html) => {
    if (!html) return;
    const button = html.querySelector(".hollows-apply-damage");
    if (!button) return;
    const applied = message.getFlag("hollows", "applyDamage")?.applied;
    if (applied) {
      button.textContent = "Applied";
      button.disabled = true;
    }
    if (!game.user?.isGM) {
      button.remove();
      return;
    }
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      const btn = event.currentTarget;
      if (message.getFlag("hollows", "applyDamage")?.applied) return;
      const appliedNow = await applyHunterAttackDamage(message);
      if (!appliedNow) return;
      btn.textContent = "Applied";
      btn.setAttribute("disabled", "disabled");
    });
  });

  Hooks.on("renderChatMessageHTML", async (message, html) => {
    if (!html) return;
    const defend = html.querySelector(".hollows-defend");
    if (!defend) return;
    if (!game.hollowsDefendDialogsOpen) game.hollowsDefendDialogsOpen = new Set();
    const flagData = message.getFlag("hollows", "attackData") || {};
    const targetId = String(flagData.targetId || "");
    const targetTokenUuid = String(flagData.targetTokenUuid || "");
    let target = game.actors.get(targetId);
    if (!target && targetTokenUuid) {
      const tokenDoc = await fromUuid(targetTokenUuid);
      if (tokenDoc?.actor) target = tokenDoc.actor;
    }
    const canDefend = target && target.testUserPermission(game.user, "OWNER") && !game.user?.isGM;
    if (!canDefend) {
      defend.remove();
      return;
    }
    const skipPopup = !!flagData.skipDefencePrompt;
    const getDefendState = () => message.getFlag("hollows", "defend") || {};
    let defended = !!getDefendState().applied;
    const updateDefendButton = () => {
      const chatRoot = ui?.chat?.element || null;
      const msgElem = chatRoot?.querySelector?.(`.message[data-message-id="${message.id}"]`);
      const btn = msgElem?.querySelector?.(".hollows-defend") || defend;
      if (!btn) {
        ui.chat?.render?.();
        return;
      }
      btn.textContent = "Defended";
      btn.disabled = true;
    };
    if (defended) {
      updateDefendButton();
      return;
    }

    const executeDefence = async (mode = "normal", useFocus = false, activeOverrides = [], defenceOptions = [], root = null) => {
      if (defended || getDefendState().applied) return;
      defended = true;
      updateDefendButton();
      await setMessageFlagSafe(message, "defend", { ...getDefendState(), applied: true });
      ui.chat?.render?.();
      setTimeout(() => updateDefendButton(), 0);

      const attackName = flagData.attackName || "Attack";
      let defenceStat = String(flagData.defenceStat || "");
      let tn = Number(flagData.tn ?? 0);
      const entityId = flagData.entityId || "";
      const damageResolve = Number(flagData.damageResolve ?? 0);
      const damageWounds = Number(flagData.damageWounds ?? 0);
      const rollMod = Number(flagData.rollMod ?? 0);
      const threatSpent = Number(flagData.threatSpent ?? 0);
      const targetZone = String(flagData.targetZone || "");
      if (activeOverrides.length) {
        defenceStat = String(activeOverrides[0].newStat || defenceStat).toLowerCase();
      }
      const statLabel = STAT_LABELS[defenceStat] || defenceStat;
      const statValue = getTotalStatForActor(target, defenceStat);
      const defenceState = {
        optionData: {},
        cardLines: [],
      };
      await applyDefenceOptionBeforeRoll(defenceOptions, root, target, defenceState, {
        attackName,
        defenceStat,
        tn,
        targetZone,
        threatSpent,
      });
      const gritActive = hasGritYourTeethActive(target);
      const flow = new HunterStatRollFlow(target, {
        title: `Defend (${attackName})`,
        cardTitle: "defends",
        statLabel,
        statValue,
        tn,
        fallbackMode: mode,
        focusCount: getFocusCount(target),
        spendFocus: async () => adjustHunterResource(target, { focus: -1 }),
      });
      const rollOutcome = await flow.roll({ mode, useFocus });
      if (!rollOutcome) return;
      const { roll, chosen } = rollOutcome;
      const baseRoll = chosen.value;
      const r = baseRoll + (Number.isNaN(rollMod) ? 0 : rollMod);
      const outcome = evaluateResult(r, statValue, tn);
      const resolvedDamage = StandardDamage.resolve(
        { resolve: damageResolve, wounds: damageWounds },
        {
          mode: "defence",
          outcomeLabel: outcome.label,
          targetResolve: StandardDamage.targetResolve(target),
        },
      );
      let damageType = resolvedDamage.damageType;
      let damageValue = resolvedDamage.damageValue;
      let defenceMitigationNote = resolvedDamage.convertedFromResolve
        ? "Resolve is 0: Wound damage applied instead"
        : "";
      // On-defence-result mechanics for great defences (Superior/Critical
      // Success, or a card with no damage). The damaged-path mechanics are
      // dispatched later from applyEntityAttackDamage with the final values.
      if (!damageType || damageValue <= 0) {
        await runOnDefenceResult(target, { avoided: true, damageType, damageValue, threatSpent });
      }
      const msg = buildStandardRollCardHtml({
        ...rollOutcome.card,
        chosen: { value: r, outcome },
        extraLines: [
          gritActive ? "Grit Your Teeth: Advantage on defence" : "",
          rollMod ? `Threat Pressure: +${rollMod} to roll (base ${baseRoll})` : "",
          defenceMitigationNote,
        ],
        footerHtml: damageType && damageValue > 0 ? `<button type="button" class="hollows-apply-hunter-damage">
        Apply Damage
      </button>` : "",
      });
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: target }),
        flavor: `Defend (${attackName})`,
        content: msg,
        flags: {
          hollows: {
            defenceResult: {
              originMessageId: message.id,
              outcomeLabel: outcome.label,
              targetTokenUuid,
            },
            hunterDamage: damageType && damageValue > 0 ? {
              targetId: target.id,
              targetTokenUuid: targetTokenUuid ?? "",
              damageType,
              damageValue,
              altWoundsValue: damageWounds,
              defenceOptions: defenceState.optionData || {},
              targetZone: getActorZone(target) || "",
            } : null,
          },
        },
      });

      await applyInterceptors("defence-resolved", { target, targetTokenUuid }, null);

      for (const override of activeOverrides) {
        if (evaluateStatOverrideSuccess(override, { roll: r, statValue, damageType, damageValue })) {
          await applyEffects(override.onSuccessEffects, { actor: target });
        }
      }

      if (!(damageType && damageValue > 0) && hasEnabledAfterAttackGroups(flagData.afterAttack || {})) {
        await requestAfterAttackApply(
          target,
          targetZone,
          flagData.afterAttack || {},
          entityId,
          flagData.modifySelfDamage || null,
          {
            outcomeLabel: outcome.label,
            damageType,
            damageValue,
            entityActor: entityId ? game.actors.get(entityId) : null,
            targetZone,
            snapshot: flagData.targetSnapshot || {},
          },
        );
      }
      if (!(damageType && damageValue > 0)) {
        await maybePromptRepetitiveAttack(flagData, {
          outcomeLabel: outcome.label,
          damageType,
          damageValue,
          entityActor: entityId ? game.actors.get(entityId) : null,
          target,
          targetZone,
          snapshot: flagData.targetSnapshot || {},
        });
      }
    };

    const openDefendDialog = async () => {
      if (defended) return;
      if (game.hollowsDefendDialogsOpen.has(message.id)) return;
      const attackName = flagData.attackName || "Attack";
      const safeAttackName = foundry.utils.escapeHTML(String(attackName));
      const safeTargetName = foundry.utils.escapeHTML(String(target.name || ""));
      const defenceStat = String(flagData.defenceStat || "");
      const tn = Number(flagData.tn ?? 0);
      const forceAdvantage = !!flagData.forceAdvantage;
      const basicDefenceMode = String(flagData.basicDefenceMode || "normal");
      const gritActive = hasGritYourTeethActive(target);
      const selectedMode = resolveSuggestedRollMode({
        advantages: [forceAdvantage, gritActive],
        fallback: basicDefenceMode,
      });
      const statLabel = STAT_LABELS[defenceStat] || defenceStat;
      const statValue = getTotalStatForActor(target, defenceStat);
      const defenceOverrides = getStatOverrides(target, "defence");
      const defenceOptions = getDefenceOptions(target, {
        attackName,
        defenceStat,
        tn,
      });
      const fields = [
        {
          type: "select",
          name: "mode",
          label: "Roll Mode",
          options: [
            { value: "normal", label: "Normal" },
            { value: "adv", label: "Advantage" },
            { value: "dis", label: "Disadvantage" },
          ].map((option) => ({ ...option, selected: option.value === selectedMode })),
        },
        ...(hasCondition(target, "focus")
          ? [{ type: "checkbox", name: "useFocus", label: "Spend Focus for Advantage" }]
          : []),
        ...defenceOverrides.map((o) => ({
          type: "checkbox",
          name: `statOverride:${o.key}`,
          label: o.label,
        })),
      ];
      game.hollowsDefendDialogsOpen.add(message.id);
      promptForm({
        title: "Defend",
        applyLabel: "Roll",
        bodyHtml: `
        <div><strong>${safeTargetName}</strong> defends vs <strong>${safeAttackName}</strong></div>
        <div>Stat: ${foundry.utils.escapeHTML(statLabel)} (${statValue})</div>
        <div>TN: ${tn}</div>
      `,
        fields,
        footerHtml: renderDefenceOptionHtml(defenceOptions, { attackName, defenceStat, tn }),
        render: (_e, dialog) => {
          bindSuggestedRollMode(dialog.element, {
            fallback: basicDefenceMode,
            getAdvantages: (root) => [
              forceAdvantage,
              gritActive,
              !!root.querySelector("[name=useFocus]")?.checked && getFocusCount(target) > 0,
            ],
            getDisadvantages: () => [getSpecialConditionRollMods(target).disadvDefence],
            watch: ["useFocus"],
          });
        },
        submit: async (values, dialog) => {
          if (defended || getDefendState().applied) {
            updateDefendButton();
            return null;
          }
          const mode = values.mode || "normal";
          const useFocus = !!values.useFocus;
          const requestedOverrides = defenceOverrides.filter((o) => !!values[`statOverride:${o.key}`]);
          const activeOverrides = [];
          for (const override of requestedOverrides) {
            if (await tryActivateStatOverride(target, override)) activeOverrides.push(override);
          }
          await executeDefence(mode, useFocus, activeOverrides, defenceOptions, dialog.element);
          return true;
        },
      }).finally(() => {
        game.hollowsDefendDialogsOpen.delete(message.id);
      });
    };

    defend.addEventListener("click", (event) => {
      event.preventDefault();
      if (getDefendState().applied) {
        updateDefendButton();
        return;
      }
      game.hollowsDefendDialogsOpen.delete(message.id);
      openDefendDialog();
    });

    if (!getDefendState().prompted && !skipPopup) {
      await setMessageFlagSafe(message, "defend", { ...getDefendState(), prompted: true });
      window.setTimeout(() => {
        game.hollowsDefendDialogsOpen.delete(message.id);
        openDefendDialog();
      }, 0);
    }
  });

  Hooks.on("renderChatMessageHTML", async (message, html) => {
    if (!html) return;
    const button = html.querySelector(".hollows-entity-test");
    if (!button) return;
    if (!game.hollowsEntityTestDialogsOpen) game.hollowsEntityTestDialogsOpen = new Set();

    const testData = message.getFlag("hollows", "entityTestData") || {};
    const targetId = String(testData.targetId || "");
    const targetTokenUuid = String(testData.targetTokenUuid || "");
    let target = game.actors.get(targetId);
    if (!target && targetTokenUuid) {
      const tokenDoc = await fromUuid(targetTokenUuid);
      if (tokenDoc?.actor) target = tokenDoc.actor;
    }
    const allowGM = !!testData.allowGM;
    const canRoll = target && (
      (target.testUserPermission(game.user, "OWNER") && !game.user?.isGM) ||
    (allowGM && game.user?.isGM)
    );
    if (!canRoll) {
      button.remove();
      return;
    }

    const getEntityTestState = () => message.getFlag("hollows", "entityTest") || {};
    if (getEntityTestState().rolled) {
      button.textContent = "Rolled";
      button.disabled = true;
      return;
    }

    const openEntityTestDialog = () => {
      if (game.hollowsEntityTestDialogsOpen.has(message.id)) return;
      if (!button || getEntityTestState().rolled) return;
      const testName = String(testData.testName || "Entity Test");
      const stat = String(testData.stat || "hard");
      const defaultMode = ["normal", "adv", "dis"].includes(String(testData.basicRollMode || ""))
        ? String(testData.basicRollMode)
        : "normal";
      const tnRaw = testData.tn;
      let tn = tnRaw === "" || tnRaw === undefined || tnRaw === null ? null : Number(tnRaw);
      if (Number.isNaN(tn)) tn = null;
      const effectText = String(testData.effectText || "");
      const statValue = getTotalStatForActor(target, stat);

      game.hollowsEntityTestDialogsOpen.add(message.id);
      (async () => {
        const flow = new HunterStatRollFlow(target, {
          title: testName,
          cardTitle: "resolves",
          statLabel: foundry.utils.escapeHTML(testName),
          statValue,
          tn,
          fallbackMode: defaultMode,
          focusCount: getFocusCount(target),
          spendFocus: async () => adjustHunterResource(target, { focus: -1 }),
        });
        const rollOutcome = await flow.roll();
        if (!rollOutcome) return;
        const { roll, chosen, success } = rollOutcome;
        const afterAttack = testData.afterAttack || null;
        const selfDamage = testData.modifySelfDamage || null;
        const snapshot = testData.targetSnapshot || {};
        const targetZone = String(testData.targetZone || "");
        const entityId = String(testData.entityId || "");
        const entityActor = entityId ? game.actors.get(entityId) : null;
        if (hasEnabledAfterAttackGroups(afterAttack)) {
          await requestAfterAttackApply(target, targetZone, afterAttack, entityId, selfDamage, {
            outcomeLabel: chosen.outcome.label,
            damageType: "",
            damageValue: 0,
            entityActor,
            targetZone,
            snapshot,
          });
        }
        await resolveFollowUpFromMessage(message.id, {
          outcomeLabel: chosen.outcome.label,
          targetTokenUuid: testData.targetTokenUuid || "",
          damageType: "",
          damageValue: 0,
          phase: "all",
        });
        const content = buildStandardRollCardHtml({
          ...rollOutcome.card,
          subtitleHtml: `<div><strong>Check outcome:</strong> ${success ? "Passed" : "Failed"}</div>`,
          footerHtml: effectText ? `<div><strong>Effect:</strong> ${foundry.utils.escapeHTML(effectText)}</div>` : "",
        });
        await roll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor: target }),
          flavor: testName,
          content,
        });
        const move = testData.move || {};
        const moveKind = String(move.kind || "");
        const moveOn = String(move.on || "failure");
        const shouldShowMove =
          moveKind && (moveOn === "always" || (moveOn === "success" && success) || (moveOn !== "success" && !success));
        if (shouldShowMove) {
          const moveContent = buildMoveOutcomeCardHtml({
            moveType: String(move.type || "Reposition"),
            reason: String(move.reason || testName || ""),
            moves: [{
              subjectName: String(move.subjectName || target.name),
              sourceZone: String(move.sourceZone || ""),
              destinationZone: String(move.destinationZone || ""),
            }],
          });
          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: target }),
            content: moveContent,
          });
        }
        await setMessageFlagSafe(message, "entityTest", { ...getEntityTestState(), rolled: true });
        button.textContent = "Rolled";
        button.setAttribute("disabled", "disabled");
      })().finally(() => {
        game.hollowsEntityTestDialogsOpen.delete(message.id);
      });
    };

    button.addEventListener("click", (event) => {
      event.preventDefault();
      game.hollowsEntityTestDialogsOpen.delete(message.id);
      openEntityTestDialog();
    });

    if (!getEntityTestState().prompted) {
      await setMessageFlagSafe(message, "entityTest", { ...getEntityTestState(), prompted: true });
      window.setTimeout(() => {
        game.hollowsEntityTestDialogsOpen.delete(message.id);
        openEntityTestDialog();
      }, 0);
    }
  });

  Hooks.on("renderChatMessageHTML", (message, html) => {
    if (!html) return;
    const button = html.querySelector(".hollows-apply-hunter-damage");
    if (!button) return;
    const applyState = message.getFlag("hollows", "applyDamage") || {};
    const applied = applyState.applied;
    const pending = applyState.pending;
    if (applied) {
      button.textContent = "Applied";
      button.disabled = true;
    } else if (pending) {
      button.textContent = "Pending";
      button.disabled = true;
    }
    if (!game.user?.isGM) {
      button.remove();
      return;
    }
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      const btn = event.currentTarget;
      const state = message.getFlag("hollows", "applyDamage") || {};
      if (state.applied || state.pending) return;
      const appliedNow = await applyEntityAttackDamage(message);
      if (!appliedNow) return;
      btn.textContent = "Applied";
      btn.setAttribute("disabled", "disabled");
    });
  });

  Hooks.on("renderChatMessageHTML", async (message, html) => {
    if (!html) return;
    const doomAdjust = message.getFlag("hollows", "doomAdjust");
    if (doomAdjust && game.user?.isGM) {
      if (!message.getFlag("hollows", "doomAdjustApplied")) {
        const delta = Number(doomAdjust.delta ?? 0);
        if (Number.isFinite(delta) && delta !== 0) {
          await requestDoomAdjust(delta);
        }
        await setMessageFlagSafe(message, "doomAdjustApplied", true);
      }
      html.style.display = "none";
    }
  });
}
