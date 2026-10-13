import { dispatchToGM } from "../../helpers/queries.js";

/** Create the Hazard card handlers and their local pending state. */
export function createHazardChatUiHandlers(deps) {
  const { getActiveHunterForUser } = deps;
  const pendingRolls = new Set();

  /** Determine roll availability without consulting the rendered button. */
  function getRollState(message) {
    const hazard = message.getFlag("hollows", "hazard");
    const actor = getActiveHunterForUser();
    let label = "Roll";
    if (hazard.completed) label = "Resolved";
    else if (message.hazardProgress.some(result => result.actorUuid === actor?.uuid)) label = "Rolled";
    else if (pendingRolls.has(`${message.id}:${actor?.uuid}`)) label = "Rolling...";
    const hasAccess = actor && (!hazard.participants.length || hazard.participants.includes(actor.uuid));
    return { actor, label, canRoll: (label === "Roll") && !!hasAccess };
  }

  /** Display the computed state of one button. */
  function updateButton(message, button) {
    const state = getRollState(message);
    button.disabled = !state.canRoll;
    button.textContent = state.label;
  }

  /** Refresh one card, or all visible cards after changing the active hunter. */
  function refreshHazardButtons(messageId) {
    const selector = messageId ? `[data-message-id="${messageId}"] .hollows-hazard-roll` : ".hollows-hazard-roll";
    for (const button of document.querySelectorAll(selector)) {
      const messageId = button.closest("[data-message-id]")?.dataset.messageId;
      const message = game.messages?.get(messageId);
      if (message) updateButton(message, button);
    }
  }

  /** Bind the roll action whenever Foundry renders a Hazard message. */
  function onRenderHazardMessage(message, html) {
    if (!html) return;
    const hazard = message.getFlag("hollows", "hazard");
    if (!hazard) return;
    const button = html.querySelector(".hollows-hazard-roll");
    if (!button) return;

    updateButton(message, button);

    button.addEventListener("click", async (event) => {
      event.preventDefault();
      const { actor, canRoll } = getRollState(message);
      if (!canRoll) return;

      const key = `${message.id}:${actor.uuid}`;
      pendingRolls.add(key);
      refreshHazardButtons(message.id);
      try {
        const roll = await (new Roll("1d20")).evaluate();
        const rollValue = Number(roll.terms?.[0]?.results?.[0]?.result ?? roll.total ?? 20);
        if (game.user?.isGM) {
          await message.applyHazardRoll(actor, rollValue);
        } else {
          await dispatchToGM("hazardRollApply", {
            messageId: message.id,
            actorUuid: actor.uuid,
            rollValue,
          });
        }
      } catch (err) {
        console.error("Hollows | Failed to resolve hazard roll", err);
        ui.notifications.error(`Hazard roll failed: ${err.message}`);
      } finally {
        pendingRolls.delete(key);
        refreshHazardButtons(message.id);
      }
    });
  }

  return {
    onRenderHazardMessage,
    refreshHazardButtons,
  };
}
