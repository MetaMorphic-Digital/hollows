import { hasCondition } from "../documents/actor/conditions.js";
import { getTotalStatForActor } from "../documents/actor/hunter-combat.js";

export function getCombatTurnKey(combat) {
  if (!combat?.started) return null;
  return {
    combatId: combat.id,
    round: Number(combat.round ?? 0),
    turn: Number(combat.turn ?? 0),
    combatantId: String(combat.combatant?.id || ""),
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
    extraManeuver: isCritical,
  };
}

export function setupResultHtml(data) {
  const perks = [
    data.freeDeployGranted ? "Free Deploy" : null,
    data.extraManeuver ? "Extra Manoeuvre (first turn)" : null,
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
    `,
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
          tn,
        },
      },
    },
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

export function getSceneCombatantAddChoices(combat, scene = canvas?.scene) {
  if (!combat || !scene) return [];
  const existingTokenIds = new Set(
    combat.combatants
      .map((combatant) => String(combatant.tokenId || combatant.token?.id || ""))
      .filter(Boolean),
  );
  return (scene.tokens?.contents || [])
    .filter((tokenDoc) => tokenDoc?.actor)
    .filter((tokenDoc) => ["hunter", "entity"].includes(String(tokenDoc.actor?.type || "")))
    .filter((tokenDoc) => !existingTokenIds.has(String(tokenDoc.id || "")))
    .map((tokenDoc) => ({
      tokenId: String(tokenDoc.id || ""),
      actorId: String(tokenDoc.actor?.id || ""),
      actorType: String(tokenDoc.actor?.type || ""),
      name: String(tokenDoc.name || tokenDoc.actor?.name || "Combatant"),
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
        ? "<span class=\"hollows-add-combatant-note\">Initiative 1</span>"
        : "<span class=\"hollows-add-combatant-note\">Setup later</span>";
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
      } },
      { action: "cancel", label: "Cancel", callback: () => null },
    ],
    rejectClose: false,
  }) ?? [];
}

export async function addSceneCombatantsToCombat(combat, selections, scene = canvas?.scene) {
  if (!combat || !scene) return [];
  const list = Array.isArray(selections) ? selections.filter((entry) => entry?.tokenId) : [];
  if (!list.length) return [];
  const created = await combat.createEmbeddedDocuments("Combatant", list.map((entry) => ({
    tokenId: entry.tokenId,
    actorId: entry.actorId,
    sceneId: scene.id,
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
    await ui.combat.setCombatantBracket(combatant, selection.bracket || "before");
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
    // The round is advanced here, so flag the update as manual to stop the turn machine
    // from advancing it a second time.
    const nextRound = (combat.round || 0) + 1;
    await combat.update({ round: nextRound, turn: index }, {
      hollowsPassInitiative: true,
      hollowsManualMakeActive: true,
    });
  } else {
    await combat.update({ turn: index }, { hollowsPassInitiative: true });
  }

  ui.combat?.render();
}
