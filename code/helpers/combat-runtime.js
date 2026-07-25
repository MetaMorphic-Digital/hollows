import { hasCondition } from "../documents/actor/conditions.js";
import { getTotalStatForActor } from "../documents/actor/hunter-combat.js";

export function getCombatTurnKey(combat) {
  if (!combat?.started) return null;
  return {
    combatId: combat.id,
    round: Number(combat.round ?? 0),
    turn: Number(combat.turn ?? 0),
    combatantId: String(combat.combatant?.id || "")
  };
}

export function isSameCombatRound(a, b) {
  if (!a || !b) return false;
  return a.combatId === b.combatId &&
    Number(a.round ?? -1) === Number(b.round ?? -2);
}

export function isSameCombatTurn(a, b) {
  if (!a || !b) return false;
  const aId = String(a.combatantId || "");
  const bId = String(b.combatantId || "");
  if (aId && bId) {
    return a.combatId === b.combatId &&
      aId === bId &&
      Number(a.round ?? -1) === Number(b.round ?? -2);
  }
  return a.combatId === b.combatId &&
    Number(a.round ?? -1) === Number(b.round ?? -2) &&
    Number(a.turn ?? -1) === Number(b.turn ?? -2);
}
import { buildStandardRollCardHtml } from "../applications/ui/roll-card.js";

export const HOLLOWS_PREV_COMBATANT_BY_COMBAT_ID = new Map();
export const HOLLOWS_LAST_COMBATANT_BY_COMBAT_ID = new Map();

export function getCombatantOwners(actor) {
  if (!actor) return [];
  return game.users.filter((user) => actor.testUserPermission(user, "OWNER"));
}

export function setupOutcomeData(outcomeLabel) {
  const isSuccess = outcomeLabel === "Success" || outcomeLabel === "Superior Success" || outcomeLabel === "Critical Success";
  const isSuperior = outcomeLabel === "Superior Success" || outcomeLabel === "Critical Success";
  const isCritical = outcomeLabel === "Critical Success";
  return {
    canActBefore: isSuccess,
    freeDeployGranted: isSuperior,
    extraManeuver: isCritical
  };
}

export function setupResultHtml(data) {
  const perks = [
    data.freeDeployGranted ? "Free Deploy" : null,
    data.extraManeuver ? "Extra Manoeuvre (first turn)" : null
  ].filter(Boolean);
  const perkText = perks.length ? `<div>Perks: ${perks.join(", ")}</div>` : "";
  const buttons = data.choiceButtons || "";
  return buildStandardRollCardHtml({
    actorName: data.actorName,
    title: "rolls Setup",
    statLabel: "Sharp",
    statValue: data.statValue,
    tn: data.tn,
    results: data.rolls || [],
    mode: data.mode || "normal",
    chosen: { value: data.chosen, outcome: { label: data.outcomeLabel } },
    footerHtml: `
      ${perkText}
      ${buttons}
    `
  }).replace("hollows-roll", "hollows-roll hollows-setup-card");
}

export function setupChoiceButtons(data) {
  if (!data.canActBefore) return "";
  if (data.outcomeLabel === "Success") {
    return `
      <div class="hollows-setup-choices">
        <button type="button" class="hollows-setup-choice" data-choice="before">Act Before Entity</button>
        <button type="button" class="hollows-setup-choice" data-choice="deploy">Free Deploy (Act After)</button>
      </div>
    `;
  }
  return `
    <div class="hollows-setup-choices">
      <button type="button" class="hollows-setup-choice" data-choice="before">Act Before Entity</button>
      <button type="button" class="hollows-setup-choice" data-choice="after">Act After Entity</button>
    </div>
  `;
}

export async function createSetupRollMessage(combatant, tn) {
  const actor = combatant?.actor;
  if (!actor) return;
  const statValue = getTotalStatForActor(actor, "sharp");
  const content = `
    <div class="hollows-chat hollows-setup-card">
      <div><strong>${actor.name}</strong> rolls Setup (Sharp)</div>
      <div>TN: ${tn}</div>
      <div>Sharp: ${statValue}</div>
      <button type="button" class="hollows-setup-roll">Roll Setup</button>
    </div>
  `;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    flags: {
      hollows: {
        setupRoll: {
          combatantId: combatant.id,
          actorId: actor.id,
          tn
        }
      }
    }
  });
}

export function getCombatantBracket(combatant) {
  const setup = combatant?.getFlag("hollows", "setup") || {};
  return setup.bracket || "";
}

export function getCombatantsInBracket(combat, bracket) {
  if (!combat || !bracket) return [];
  return combat.combatants.filter((combatant) => {
    if (!combatant || getCombatantBracket(combatant) !== bracket) return false;
    const actor = combatant.actor || null;
    if (!actor || actor.type !== "hunter") return false;
    if (combatant.defeated) return false;
    if (hasCondition(actor, "dead")) return false;
    return true;
  });
}

export async function setCombatantBracket(combatant, bracket) {
  if (!combatant?.combat || combatant.actor?.type !== "hunter") return false;
  const normalized = String(bracket || "").trim().toLowerCase();
  if (!["before", "after"].includes(normalized)) return false;
  const setup = foundry.utils.deepClone(combatant.getFlag("hollows", "setup") || {});
  setup.bracket = normalized;
  const initiative = normalized === "before" ? 2 : 0;
  await combatant.update({ initiative });
  await combatant.setFlag("hollows", "setup", setup);
  return true;
}

export async function promptCombatantBracketChange(combatant) {
  if (!combatant?.combat || combatant.actor?.type !== "hunter") return false;
  const current = getCombatantBracket(combatant) || "before";
  const content = `
    <form class="hollows-roll-dialog">
      <div class="form-group">
        <label>Bracket</label>
        <select name="bracket">
          <option value="before" ${current === "before" ? "selected" : ""}>Before</option>
          <option value="after" ${current === "after" ? "selected" : ""}>After</option>
        </select>
      </div>
    </form>
  `;
  return await foundry.applications.api.DialogV2.wait({
    window: { title: `Change Bracket: ${combatant.name || "Hunter"}` },
    content,
    buttons: [
      { action: "apply", label: "Apply", default: true, callback: async (_e, _b, dialog) => {
        const bracket = String(dialog.element.querySelector("[name=bracket]")?.value || current);
        await setCombatantBracket(combatant, bracket);
        return true;
      }},
      { action: "cancel", label: "Cancel", callback: () => null }
    ],
    rejectClose: false
  }) ?? false;
}

export function getCombatantFromTrackerElement(li) {
  const combatantId = String(li?.dataset?.combatantId || "");
  return game.combat?.combatants?.get(combatantId) || null;
}

export function applyHollowsCombatTrackerEntryContext(options) {
  if (!Array.isArray(options)) return options;
  if (options.some((entry) => entry?.name === "Toggle Active State")) return options;

  const isHunterEntry = (li) => {
    const combatant = getCombatantFromTrackerElement(li);
    return combatant?.actor?.type === "hunter";
  };

  const canManageHunterEntry = (li) => {
    const combatant = getCombatantFromTrackerElement(li);
    if (!combatant || combatant.actor?.type !== "hunter") return false;
    return !!game.user?.isGM;
  };

  const canMakeActiveEntry = (li) => {
    const combatant = getCombatantFromTrackerElement(li);
    if (!combatant || !["hunter", "entity"].includes(String(combatant.actor?.type || ""))) return false;
    return !!game.user?.isGM && !!game.combat?.started;
  };

  for (let i = options.length - 1; i >= 0; i -= 1) {
    const name = String(options[i]?.name || "");
    if (name.includes("CombatantClear") || name.includes("CombatantReroll") || name === "Clear Initiative" || name === "Re-roll Initiative" || name === "Reroll Initiative") {
      const existingCondition = options[i].condition;
      options[i].condition = (li) => {
        if (isHunterEntry(li)) return false;
        return typeof existingCondition === "function" ? existingCondition(li) : true;
      };
    }
  }

  options.push(
    {
      name: "Toggle Active State",
      icon: '<i class="fas fa-toggle-on"></i>',
      condition: canManageHunterEntry,
      callback: async (li) => {
        const combatant = getCombatantFromTrackerElement(li);
        if (!combatant) return;
        const acted = !!combatant.getFlag("hollows", "acted");
        await combatant.setFlag("hollows", "acted", !acted);
        ui.combat?.render();
      }
    },
    {
      name: "Change Bracket",
      icon: '<i class="fas fa-arrows-up-down"></i>',
      condition: canManageHunterEntry,
      callback: async (li) => {
        const combatant = getCombatantFromTrackerElement(li);
        if (!combatant) return;
        await promptCombatantBracketChange(combatant);
        ui.combat?.render();
      }
    },
    {
      name: "Make Active",
      icon: '<i class="fas fa-bolt"></i>',
      condition: canMakeActiveEntry,
      callback: async (li) => {
        const combatant = getCombatantFromTrackerElement(li);
        const combat = game.combat;
        if (!combatant || !combat) return;
        const turn = combat.turns.findIndex((entry) => entry.id === combatant.id);
        if (turn < 0) return;
        await combat.update({ turn }, { hollowsPassInitiative: true, hollowsManualMakeActive: true });
        ui.combat?.render();
      }
    }
  );

  return options;
}

export function getSceneCombatantAddChoices(combat, scene = canvas?.scene) {
  if (!combat || !scene) return [];
  const existingTokenIds = new Set(
    combat.combatants
      .map((combatant) => String(combatant.tokenId || combatant.token?.id || ""))
      .filter(Boolean)
  );
  return (scene.tokens?.contents || [])
    .filter((tokenDoc) => tokenDoc?.actor)
    .filter((tokenDoc) => ["hunter", "entity"].includes(String(tokenDoc.actor?.type || "")))
    .filter((tokenDoc) => !existingTokenIds.has(String(tokenDoc.id || "")))
    .map((tokenDoc) => ({
      tokenId: String(tokenDoc.id || ""),
      actorId: String(tokenDoc.actor?.id || ""),
      actorType: String(tokenDoc.actor?.type || ""),
      name: String(tokenDoc.name || tokenDoc.actor?.name || "Combatant")
    }))
    .sort((a, b) => {
      if (a.actorType !== b.actorType) return a.actorType === "entity" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

export async function promptSceneCombatantAdditions(combat, scene = canvas?.scene) {
  if (!combat || !scene) return [];
  const started = !!combat.started;
  const choices = getSceneCombatantAddChoices(combat, scene);
  if (!choices.length) {
    ui.notifications.warn("No eligible Hunter or Entity tokens found on the active scene.");
    return [];
  }
  const rows = choices.map((choice) => {
    const isHunter = choice.actorType === "hunter";
    const bracketControl = started && isHunter
      ? `
        <label class="hollows-add-combatant-bracket">
          <span>Bracket</span>
          <select name="bracket-${choice.tokenId}">
            <option value="before" selected>Before</option>
            <option value="after">After</option>
          </select>
        </label>
      `
      : started
        ? `<span class="hollows-add-combatant-note">Initiative 1</span>`
        : `<span class="hollows-add-combatant-note">Setup later</span>`;
    return `
      <label class="hollows-add-combatant-row">
        <span class="checkbox">
          <input type="checkbox" data-add-combatant value="${choice.tokenId}">
          <strong>${foundry.utils.escapeHTML(choice.name)}</strong>
        </span>
        <span class="hollows-add-combatant-meta">${choice.actorType === "entity" ? "Entity" : "Hunter"}</span>
        ${bracketControl}
      </label>
    `;
  }).join("");
  const content = `
    <form class="hollows-roll-dialog hollows-add-combatant-dialog">
      <div class="hollows-add-combatant-list">
        ${rows}
      </div>
    </form>
  `;
  return await foundry.applications.api.DialogV2.wait({
    window: { title: "Add Combatants" },
    content,
    buttons: [
      { action: "add", label: "Add", default: true, callback: (_e, _b, dialog) => {
        const el = dialog.element;
        const selected = [];
        for (const input of el.querySelectorAll("[data-add-combatant]:checked")) {
          const tokenId = String(input.value || "");
          const choice = choices.find((entry) => entry.tokenId === tokenId);
          if (!choice) continue;
          const bracket = started && choice.actorType === "hunter"
            ? String(el.querySelector(`[name="bracket-${tokenId}"]`)?.value || "before")
            : "";
          selected.push({ ...choice, bracket });
        }
        return selected;
      }},
      { action: "cancel", label: "Cancel", callback: () => null }
    ],
    rejectClose: false
  }) ?? [];
}

export async function addSceneCombatantsToCombat(combat, selections, scene = canvas?.scene) {
  if (!combat || !scene) return [];
  const list = Array.isArray(selections) ? selections.filter((entry) => entry?.tokenId) : [];
  if (!list.length) return [];
  const created = await combat.createEmbeddedDocuments("Combatant", list.map((entry) => ({
    tokenId: entry.tokenId,
    actorId: entry.actorId,
    sceneId: scene.id
  })));
  if (!combat.started) return created;
  const selectionMap = new Map(list.map((entry) => [String(entry.tokenId || ""), entry]));
  for (const combatant of created) {
    const selection = selectionMap.get(String(combatant.tokenId || ""));
    if (!selection) continue;
    if (selection.actorType === "entity") {
      await combatant.update({ initiative: 1 });
      continue;
    }
    await setCombatantBracket(combatant, selection.bracket || "before");
  }
  return created;
}

export async function applyPassInitiativeGM(combat, fromCombatantId, toCombatantId) {
  if (!combat?.started) return;
  const fromId = String(fromCombatantId || "");
  const toId = String(toCombatantId || "");
  if (!fromId || !toId) return;
  const current = combat.combatant;
  if (!current || current.id !== fromId) return;
  const turns = combat.turns || [];
  const index = turns.findIndex((turn) => turn.id === toId);
  if (index === -1) return;
  await current.setFlag("hollows", "acted", true);
  await combat.update({ turn: index }, { hollowsPassInitiative: true });
  ui.combat?.render();
}

export async function applyAdvanceTurnGM(combat, fromCombatantId, mode) {
  if (!combat?.started) return;
  const fromId = String(fromCombatantId || "");
  const move = String(mode || "");
  if (!fromId || !move) return;
  const current = combat.combatant;
  if (!current || current.id !== fromId) return;
  const turns = combat.turns || [];
  let targetId = "";
  if (move === "before-to-entity" || move === "after-to-entity") {
    const entityCombatant = combat.combatants.find((c) => c.actor?.type === "entity");
    if (!entityCombatant) return;
    targetId = entityCombatant.id;
  } else if (move === "after-to-before") {
    const beforeList = getCombatantsInBracket(combat, "before");
    if (!beforeList.length) return;
    targetId = beforeList[0].id;
  } else {
    return;
  }
  const index = turns.findIndex((turn) => turn.id === targetId);
  if (index === -1) return;
  await current.setFlag("hollows", "acted", true);
  
  if (move === "after-to-entity") {
    const nextRound = (combat.round || 0) + 1;
    await combat.update({ round: nextRound, turn: index }, { hollowsPassInitiative: true });
  } else {
    await combat.update({ turn: index }, { hollowsPassInitiative: true });
  }
  
  ui.combat?.render();
}
