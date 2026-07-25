import {
  addSceneCombatantsToCombat,
  applyAdvanceTurnGM,
  applyHollowsCombatTrackerEntryContext,
  applyPassInitiativeGM,
  createSetupRollMessage,
  getCombatantBracket,
  getCombatantsInBracket,
  promptSceneCombatantAdditions
} from "../../helpers/combat-runtime.js";
import { dispatchToGM } from "../../helpers/queries.js";
import { getActiveEntityActor } from "../../canvas/zone.js";
import { getEffectiveEntityStat } from "../../documents/entity/entity-stats.js";
import {
  beginFirstPick,
  ensureFirstPickDialog,
  finishEntityTurnAndBeginFirstPick,
  openFirstPickDialog,
  shouldCurrentUserHandleFirstPick
} from "../../helpers/combat-first-pick.js";
import { processEndOfTurn } from "../../helpers/combat-lifecycle.js";


function makeEl(htmlStr) {
  const div = document.createElement("div");
  div.innerHTML = htmlStr.trim();
  return div.firstElementChild;
}

export function onRenderCombatTracker(app, html) {
  const el = html;
  const combat = game.combat;
  const awaitingFirstPick = combat?.getFlag("hollows", "awaitingFirstPick") || null;
  if (awaitingFirstPick && shouldCurrentUserHandleFirstPick(awaitingFirstPick)) {
    window.setTimeout(() => ensureFirstPickDialog(combat), 0);
  }
  el.querySelectorAll("[data-control]").forEach(e => {
    const control = (e.dataset.control || "").toLowerCase();
    if (control.includes("turn") && !e.classList.contains("hollows-setup-init")) {
      e.remove();
    }
  });
  const controls = el.querySelector(".combat-controls");
  if (controls) {
    controls.querySelectorAll(".combat-control").forEach(e => {
      const control = (e.dataset.control || "").toLowerCase();
      const isEndCombat = control === "endcombat";
      const isHollows = e.classList.contains("hollows-setup-init") || e.classList.contains("hollows-pass-init");
      if (isEndCombat || isHollows) return;
      e.remove();
    });
    controls.querySelectorAll('[data-control="endTurn"],[data-control*="endTurn"],[data-control*="nextTurn"],[data-control*="previousTurn"],.combat-control.endturn,.combat-control.endTurn,.combat-control.end-turn,.combat-control.roll').forEach(e => e.remove());
  }
  el.querySelectorAll("[data-control]").forEach(e => {
    const control = e.dataset.control || "";
    if (control.toLowerCase().includes("roll") && !e.classList.contains("hollows-setup-init")) {
      e.remove();
    }
  });
  el.querySelectorAll(".combatant-control").forEach(e => {
    const control = e.dataset.control || "";
    const title = (e.getAttribute("title") || e.getAttribute("aria-label") || "").toLowerCase();
    const lower = control.toLowerCase();
    if (lower.includes("roll") ||
      lower.includes("endturn") ||
      lower.includes("nextturn") ||
      lower.includes("previousturn") ||
      title.includes("roll") ||
      title.includes("initiative") ||
      title.includes("end turn") ||
      title.includes("next turn") ||
      title.includes("previous turn")) {
      e.remove();
    }
  });
  if (controls) {
    const started = combat && (combat.started || (combat.round ?? 0) > 0);
    if (game.user?.isGM) {
      controls.querySelectorAll(".hollows-end-combat").forEach(e => e.remove());
      const endBtn = makeEl(`<button type="button" class="hollows-end-combat"><i class="fas fa-flag-checkered"></i> End Encounter</button>`);
      endBtn.addEventListener("click", async (event) => {
        event.preventDefault();
        if (!game.combat) return;
        await game.combat.endCombat();
      });
      controls.append(endBtn);
      controls.querySelectorAll(".hollows-add-combatant").forEach(e => e.remove());
      const addCombatantBtn = makeEl(`<button type="button" class="hollows-add-combatant"><i class="fas fa-user-plus"></i> Add Combatant</button>`);
      addCombatantBtn.addEventListener("click", async (event) => {
        event.preventDefault();
        const combat = game.combat;
        const scene = canvas?.scene;
        if (!combat) {
          ui.notifications.warn("No active combat.");
          return;
        }
        if (!scene) {
          ui.notifications.warn("No active scene.");
          return;
        }
        const combatSceneId = String(combat.scene?.id || combat.sceneId || "");
        if (combatSceneId && combatSceneId !== String(scene.id || "")) {
          ui.notifications.warn("Open the combat tracker for the active scene before adding combatants.");
          return;
        }
        const selections = await promptSceneCombatantAdditions(combat, scene);
        if (!selections.length) return;
        await addSceneCombatantsToCombat(combat, selections, scene);
        ui.combat?.render();
      });
      controls.append(addCombatantBtn);
      if (started) {
        controls.querySelectorAll(".hollows-setup-init").forEach(e => e.remove());
      } else if (!controls.querySelector(".hollows-setup-init")) {
        const btn = makeEl(`<button type="button" class="hollows-setup-init"><i class="fas fa-dice-d20"></i> Setup Rolls</button>`);
        btn.addEventListener("click", async (event) => {
          event.preventDefault();
          const combat = game.combat;
          if (!combat) {
            ui.notifications.warn("No active combat.");
            return;
          }
          if (combat.started || (combat.round ?? 0) > 0) {
            ui.notifications.warn("Combat already started.");
            return;
          }
          const entity = getActiveEntityActor();
          if (!entity) {
            ui.notifications.warn("No Entity actor found for setup roll.");
            return;
          }
          const tn = getEffectiveEntityStat(entity, "ranged");
          const hunters = combat.combatants.filter((c) => c.actor?.type === "hunter");
          if (!hunters.length) {
            ui.notifications.warn("No Hunter combatants to roll setup.");
            return;
          }
          await combat.startCombat();
          const entityCombatant = combat.combatants.find((c) => c.actor?.type === "entity");
          if (entityCombatant) {
            await entityCombatant.update({ initiative: 1 });
          }
          for (const combatant of hunters) {
            await createSetupRollMessage(combatant, tn);
          }
          ui.combat?.render();
        });
        controls.append(btn);
      }
    }
    controls.querySelectorAll(".hollows-pass-init").forEach(e => e.remove());
    const combatant = combat?.combatant;
    const isHunterOwner = combatant?.actor?.type === "hunter" &&
      combatant.actor?.testUserPermission(game.user, "OWNER");
    const canPass = !!combatant && (game.user?.isGM || isHunterOwner);
    if (canPass) {
      const passBtn = makeEl(`<button type="button" class="hollows-pass-init"><i class="fas fa-share"></i> End Turn / Pass Initiative</button>`);
      passBtn.addEventListener("click", async () => {
        const combat = game.combat;
        if (!combat?.started) {
          ui.notifications.warn("Combat has not started.");
          return;
        }
        const awaiting = combat.getFlag("hollows", "awaitingFirstPick");
        if (awaiting?.reason === "setup") {
          ui.notifications.warn("Waiting for GM to choose the first Hunter.");
          return;
        }
        const current = combat.combatant;
        if (!current) {
          ui.notifications.warn("No active combatant.");
          return;
        }
        if (current.actor?.type === "entity") {
          if (!game.user?.isGM) return;
          await finishEntityTurnAndBeginFirstPick(combat, current);
          ui.combat?.render();
          return;
        }
        const bracket = getCombatantBracket(current);
        if (!bracket) {
          ui.notifications.warn("Current combatant is not in a bracket.");
          return;
        }
        const options = getCombatantsInBracket(combat, bracket)
          .filter((c) => c.id !== current.id && !c.getFlag("hollows", "acted"));
        if (options.length === 1) {
          const targetId = options[0].id;
          if (game.user?.isGM) {
            await applyPassInitiativeGM(combat, current.id, targetId);
          } else {
            await dispatchToGM("passInitiative", {
              combatId: combat.id,
              fromCombatantId: current.id,
              toCombatantId: targetId,
              userId: game.user?.id
            });
          }
          return;
        }
        if (!options.length) {
          const mode = bracket === "before" ? "before-to-entity" : "after-to-before";
          if (game.user?.isGM) {
            if (mode === "after-to-before") {
              const beforeList = getCombatantsInBracket(combat, "before");
              if (!beforeList.length) {
                await applyAdvanceTurnGM(combat, current.id, "after-to-entity");
                return;
              }
              await current.setFlag("hollows", "acted", true);
              await processEndOfTurn(combat, current);
              await beginFirstPick(combat, "before", current.id, "round-start", null, true, true);
              ui.combat?.render();
              return;
            }
            const turns = combat.turns || [];
            let targetId = "";
            if (mode === "before-to-entity") {
              const entityCombatant = combat.combatants.find((c) => c.actor?.type === "entity");
              if (!entityCombatant) return;
              targetId = entityCombatant.id;
            } else {
              const beforeList = getCombatantsInBracket(combat, "before");
              if (!beforeList.length) return;
              targetId = beforeList[0].id;
            }
            const index = turns.findIndex((t) => t.id === targetId);
            if (index === -1) return;
            await current.setFlag("hollows", "acted", true);
            await combat.update({ turn: index }, { hollowsPassInitiative: true });
            ui.combat?.render();
          } else {
            if (mode === "after-to-before") {
              const beforeList = getCombatantsInBracket(combat, "before");
              if (!beforeList.length) {
                await dispatchToGM("advanceTurn", {
                  combatId: combat.id,
                  fromCombatantId: current.id,
                  mode: "after-to-entity",
                  userId: game.user?.id
                });
                return;
              }
              if (beforeList.length === 1) {
                await dispatchToGM("advanceTurn", {
                  combatId: combat.id,
                  fromCombatantId: current.id,
                  mode: "after-to-before",
                  userId: game.user?.id
                });
                return;
              }
              await openFirstPickDialog(combat, "before", "", {
                prevCombatantId: current.id,
                reason: "round-start"
              });
              return;
            }
            await dispatchToGM("advanceTurn", {
              combatId: combat.id,
              fromCombatantId: current.id,
              mode,
              userId: game.user?.id
            });
          }
          return;
        }
        const select = options.map((c) => `<option value="${c.id}">${c.name}</option>`).join("");
        const content = `
          <form class="hollows-roll-dialog">
            <p>Current Hunter may pass initiative to another Hunter in the same bracket.</p>
            <div class="form-group">
              <label>Pass to</label>
              <select name="combatantId">${select}</select>
            </div>
          </form>
        `;
        foundry.applications.api.DialogV2.wait({
          window: { title: "Pass Initiative" },
          content,
          buttons: [
            { action: "pass", label: "Pass", default: true, callback: async (_e, _b, dialog) => {
              const id = String(dialog.element.querySelector("[name=combatantId]")?.value || "");
              if (!id) return;
              if (game.user?.isGM) {
                await applyPassInitiativeGM(combat, current.id, id);
              } else {
                await dispatchToGM("passInitiative", {
                  combatId: combat.id,
                  fromCombatantId: current.id,
                  toCombatantId: id,
                  userId: game.user?.id
                });
              }
            }},
            { action: "skip", label: "Skip", callback: () => null }
          ],
          rejectClose: false
        });
      });
      controls.append(passBtn);
    }
  }

  el.querySelectorAll(".combatant").forEach(li => {
    const combatantId = li.dataset.combatantId;
    const combatant = game.combat?.combatants?.get(combatantId);
    if (!combatant) return;
    if (combatant.getFlag("hollows", "acted")) {
      li.classList.add("hollows-acted");
    } else {
      li.classList.remove("hollows-acted");
    }
    const setup = combatant.getFlag("hollows", "setup") || {};
    const bracket = setup.bracket || "";
    if (!bracket) return;
    const label = bracket === "before" ? "Before" : "After";
    const badge = makeEl(`<span class="hollows-bracket-tag ${bracket}">${label}</span>`);
    const name = li.querySelector(".token-name, .combatant-name");
    if (name && !name.querySelector(".hollows-bracket-tag")) {
      name.append(badge);
    }
  });
}

export function onGetCombatTrackerEntryContext(_html, options) {
  applyHollowsCombatTrackerEntryContext(options);
}
