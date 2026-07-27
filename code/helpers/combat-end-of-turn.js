import { applyEntityAttackDamage } from "../documents/entity/attack-damage.js";
import { addThreatToZone } from "../canvas/overlays.js";
import { getActiveEntityActor } from "../canvas/zone.js";
import { getEffectiveEntityStat } from "../documents/entity/entity-stats.js";
import { triggerEntityTriggeredAbilities } from "../data/entity/actions/entity-special.js";
import { hasCondition } from "../documents/actor/conditions.js";
import { openInterruptPromptForHunterEnd } from "../data/entity/actions/entity-interrupt.js";
import { runEndOfTurnAbilities, runOnTurnEnd } from "./weapon-abilities/dispatchers.js";
import { chooseOneTarget } from "../applications/apps/selection-dialogs.mjs";
import {
  getActorZone,
  getRegionThreatData,
  getThreatRegionDocs,
  getTokenZone,
} from "../canvas/zone.js";


export async function runEndOfTurnEffects(combat, prevCombatant, { triggerEntitySpecialsOnPhase }) {
  if (!combat || !prevCombatant) return;
  const prevIsEntity = prevCombatant?.actor?.type === "entity";
  const prevIsHunter = prevCombatant?.actor?.type === "hunter";
  if (prevIsHunter && hasCondition(prevCombatant.actor, "dead")) return;

  if (prevIsEntity) {
    await triggerEntitySpecialsOnPhase("entityEnd");
    await openEntityThreatPlacementDialog(combat, prevCombatant.actor);
    return;
  }

  if (prevIsHunter) {
    const zone = getActorZone(prevCombatant.actor);
    await runEndOfTurnAbilities(prevCombatant.actor);
    await runOnTurnEnd(prevCombatant.actor);
    const ward = prevCombatant.actor.getFlag("hollows", "wardGranted");
    if (ward?.sourceId) {
      const source = game.actors.get(ward.sourceId);
      if (source) {
        try { await source.unsetFlag("hollows", "wardSuppressed"); } catch (err) {}
      }
      try { await prevCombatant.actor.unsetFlag("hollows", "wardGranted"); } catch (err) {}
    }
    const entityCombatant = combat.combatants.find((combatant) => combatant.actor?.type === "entity");
    const entityActor = entityCombatant?.actor || getActiveEntityActor();
    if (entityActor) {
      await openInterruptPromptForHunterEnd(combat, entityActor);
    }
  }
  if (prevIsHunter) {
    await triggerEntitySpecialsOnPhase("hunterEnd");
  }
}

export async function triggerEntitySpecialsOnPhase(phase) {
  if (!game.user?.isGM) return;
  const entity = getActiveEntityActor();
  if (!entity) return;
  await triggerEntityTriggeredAbilities(entity, phase, {}, ["special", "doom"]);
  const specials = entity.items
    .filter((item) => item.type === "entity-ability" && item.system?.kind === "special");
  if (!specials.length) return;
  const hunters = canvas?.tokens?.placeables
    ?.filter((token) => token.actor?.type === "hunter") || [];
  if (!hunters.length) return;

  for (const special of specials) {
    const sys = special.system || {};
    if (!sys.triggerEnabled) continue;
    if (String(sys.triggerOn || "") !== phase) continue;
    if (String(sys.triggerAction || "") !== "dealDamage") continue;
    const zones = Array.isArray(sys.triggerZones) ? sys.triggerZones : [];
    if (!zones.length) continue;
    const damageType = String(sys.triggerDamageType || "");
    const amount = Math.max(0, Number(sys.triggerDamageAmount ?? 0) || 0);
    if (!damageType || !amount) continue;

    let candidates = hunters.filter((token) => zones.includes(getTokenZone(token)));
    if (!candidates.length) continue;

    let targets = candidates;
    if (String(sys.triggerTargetMode || "single") === "single") {
      const chosen = await chooseOneTarget(candidates);
      targets = chosen ? [chosen] : [];
    }

    for (const token of targets) {
      const target = token.actor;
      if (!target) continue;
      const targetZone = getTokenZone(token) || "";
      const owners = game.users
        .filter((user) => user.isGM || target.testUserPermission(user, "OWNER"))
        .map((user) => user.id);
      const data = {
        targetId: target.id,
        targetTokenUuid: token.document?.uuid ?? "",
        damageType,
        damageValue: amount,
        altWoundsValue: damageType === "Resolve" ? amount : 0,
        defenceOptions: {},
        targetZone
      };
      const content = `
        <div class="hollows-chat hollows-entity-attack">
          <div class="attack-title">${entity.name} triggers <strong>${special.name || "Special"}</strong> on ${target.name}</div>
          <div><strong>Damage:</strong> ${amount} ${damageType}</div>
          ${targetZone ? `<div><strong>Zone:</strong> ${targetZone}</div>` : ""}
        </div>
      `;
      const msg = await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: entity }),
        content,
        whisper: owners,
        flags: {
          hollows: {
            hunterDamage: data
          }
        }
      });
      if (msg) {
        await applyEntityAttackDamage(msg);
      }
    }
  }
}

async function openEntityThreatPlacementDialog(combat, entityActor) {
  if (!game.user?.isGM) return;
  const scene = combat?.scene || canvas?.scene;
  const threatRegions = getThreatRegionDocs(scene);
  if (!threatRegions.length) return;

  const perRound = getEffectiveEntityStat(entityActor, "threatPerRound");
  const cap = getEffectiveEntityStat(entityActor, "threatCap");
  const zones = threatRegions.map((region) => {
    const data = getRegionThreatData(region);
    return {
      zoneId: data.zoneId,
      current: Math.max(0, Number(data.current) || 0)
    };
  });
  const initialTargets = zones.map((zone) => zone.current);
  const totalNow = zones.reduce((sum, zone) => sum + zone.current, 0);

  const evaluateTargets = (targets) => {
    const totalCurrent = totalNow;
    const totalTarget = targets.reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
    const inc = targets.reduce((sum, value, index) => {
      const diff = (Number(value) || 0) - zones[index].current;
      return sum + Math.max(0, diff);
    }, 0);
    const dec = targets.reduce((sum, value, index) => {
      const diff = zones[index].current - (Number(value) || 0);
      return sum + Math.max(0, diff);
    }, 0);

    const overflow = cap > 0 ? Math.max(0, totalCurrent - cap) : 0;
    const belowCap = cap > 0 ? totalCurrent < cap : true;
    const atCap = cap > 0 ? totalCurrent === cap : false;

    if (belowCap) {
      const placeBudget = cap > 0
        ? Math.max(0, Math.min(perRound, cap - totalCurrent))
        : perRound;
      const valid = dec === 0 && inc <= placeBudget;
      return {
        mode: "place",
        valid,
        totalCurrent,
        totalTarget,
        inc,
        dec,
        placeBudget,
        placeRemaining: Math.max(0, placeBudget - inc),
        shiftRemaining: 0,
        burnRemaining: 0
      };
    }

    if (atCap) {
      const valid = totalTarget === totalCurrent && inc <= perRound;
      return {
        mode: "shift",
        valid,
        totalCurrent,
        totalTarget,
        inc,
        dec,
        placeBudget: 0,
        placeRemaining: 0,
        shiftRemaining: Math.max(0, perRound - inc),
        burnRemaining: 0
      };
    }

    const burnApplied = Math.max(0, dec - inc);
    const burnRemaining = Math.max(0, overflow - burnApplied);
    const valid = totalTarget === cap && burnRemaining === 0 && inc <= perRound;
    return {
      mode: "burn-shift",
      valid,
      totalCurrent,
      totalTarget,
      inc,
      dec,
      placeBudget: 0,
      placeRemaining: 0,
      shiftRemaining: Math.max(0, perRound - inc),
      burnRemaining
    };
  };

  const rows = zones.map((zone, index) => `
    <div class="hollows-threat-row" data-index="${index}">
      <div class="hollows-threat-cell zone">${foundry.utils.escapeHTML(zone.zoneId)}</div>
      <div class="hollows-threat-cell now">${zone.current}</div>
      <div class="hollows-threat-cell target">
        <div class="hollows-threat-controls">
          <button type="button" class="hollows-threat-step" data-action="dec" data-index="${index}">-</button>
          <span class="hollows-threat-value" data-index="${index}">${zone.current}</span>
          <button type="button" class="hollows-threat-step" data-action="inc" data-index="${index}">+</button>
        </div>
      </div>
    </div>
  `).join("");

  const content = `
    <form class="hollows-roll-dialog hollows-threat-planner">
      <p class="hollows-threat-title"><strong>End of Entity Turn:</strong> set target Threat by zone.</p>
      <div class="hollows-threat-summary"></div>
      <div class="hollows-threat-table">
        <div class="hollows-threat-head">
          <div class="hollows-threat-cell zone">Zone</div>
          <div class="hollows-threat-cell now">Now</div>
          <div class="hollows-threat-cell target">Target</div>
        </div>
        ${rows}
      </div>
      <div class="hollows-threat-actions">
        <button type="button" class="hollows-threat-reset">Reset</button>
      </div>
    </form>
  `;

  await foundry.applications.api.DialogV2.wait({
    window: { title: "Threat Placement", width: 720, height: 640 },
    content,
    render: (_e, dialog) => {
      const el = dialog.element;
      let targets = initialTargets.slice();
      const summaryEl = el.querySelector(".hollows-threat-summary");

      const renderState = () => {
        const state = evaluateTargets(targets);
        for (const span of el.querySelectorAll(".hollows-threat-value")) {
          const idx = Number(span.dataset.index ?? 0);
          span.textContent = String(targets[idx] ?? 0);
        }

        let modeLabel = "";
        if (state.mode === "place") modeLabel = "Place Threat";
        else if (state.mode === "shift") modeLabel = "Shift Threat";
        else modeLabel = "Burn then Shift";

        const status = state.valid
          ? `<span class="hollows-threat-status valid"><strong>Valid</strong></span>`
          : `<span class="hollows-threat-status invalid"><strong>Invalid</strong></span>`;

        let details = `
          <p>Mode: <strong>${modeLabel}</strong> | ${status}</p>
          <p>Total now: <strong>${state.totalCurrent}</strong> -> target: <strong>${state.totalTarget}</strong></p>
          <p>Threat Per Round: <strong>${perRound}</strong>, Threat Cap: <strong>${cap}</strong></p>
        `;
        if (state.mode === "place") {
          details += `<p>Place budget: <strong>${state.placeBudget}</strong> (remaining: <strong>${state.placeRemaining}</strong>)</p>`;
        } else if (state.mode === "shift") {
          details += `<p>Shift budget: <strong>${perRound}</strong> (remaining: <strong>${state.shiftRemaining}</strong>)</p>`;
        } else {
          details += `<p>Burn required: <strong>${Math.max(0, state.totalCurrent - cap)}</strong> (remaining: <strong>${state.burnRemaining}</strong>)</p>`;
          details += `<p>Shift budget: <strong>${perRound}</strong> (remaining: <strong>${state.shiftRemaining}</strong>)</p>`;
        }
        summaryEl.innerHTML = details;
        const applyBtn = el.querySelector("[data-action='apply']");
        if (applyBtn) applyBtn.disabled = !state.valid;
      };

      for (const btn of el.querySelectorAll(".hollows-threat-step")) {
        btn.addEventListener("click", (ev) => {
          ev.preventDefault();
          const idx = Number(btn.dataset.index ?? -1);
          const action = String(btn.dataset.action || "");
          if (idx < 0 || idx >= targets.length) return;
          const current = Number(targets[idx] ?? 0);
          if (action === "inc") targets[idx] = current + 1;
          else if (action === "dec") targets[idx] = Math.max(0, current - 1);
          renderState();
        });
      }

      el.querySelector(".hollows-threat-reset")?.addEventListener("click", (ev) => {
        ev.preventDefault();
        targets = initialTargets.slice();
        renderState();
      });

      renderState();
    },
    buttons: [
      { action: "apply", label: "Apply", default: true, callback: async (_e, _b, dialog) => {
        const el = dialog.element;
        const targets = zones.map((zone, index) => {
          const raw = el.querySelector(`.hollows-threat-value[data-index="${index}"]`)?.textContent;
          return Math.max(0, Number(raw ?? zone.current) || 0);
        });
        const state = evaluateTargets(targets);
        if (!state.valid) {
          ui.notifications.warn("Threat allocation is invalid for current Per Round / Cap rules.");
          return false;
        }
        for (let i = 0; i < zones.length; i++) {
          const delta = targets[i] - zones[i].current;
          if (delta !== 0) await addThreatToZone(zones[i].zoneId, delta);
        }
      }},
      { action: "cancel", label: "Cancel", callback: () => null }
    ],
    rejectClose: false
  });
}
