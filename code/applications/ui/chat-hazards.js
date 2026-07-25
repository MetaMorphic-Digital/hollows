import { dispatchToGM } from "../../helpers/queries.js";

export function createHazardChatUiHandlers(deps) {
  const {
    applyHazardRoll,
    getActiveHunterForUser
  } = deps;

  function onRenderHazardMessage(message, html) {
    if (!html) return;
    const hazard = message.getFlag("hollows", "hazard");
    if (!hazard) return;
    const button = html.querySelector(".hollows-hazard-roll");
    if (!button) return;

    const actor = getActiveHunterForUser();
    const actorUuid = actor?.uuid || "";
    const progress = hazard.progress || {};
    const participants = Array.isArray(hazard.participants) ? hazard.participants : [];
    const hasAccess = !!actor && (!participants.length || participants.includes(actorUuid));
    const alreadyRolled = !!(actorUuid && progress[actorUuid]);

    if (hazard.completed || alreadyRolled || !hasAccess) {
      button.disabled = true;
      if (hazard.completed) button.textContent = "Resolved";
      return;
    }

    button.addEventListener("click", async (event) => {
      event.preventDefault();
      const current = message.getFlag("hollows", "hazard") || {};
      if (current.completed) return;
      const nowProgress = current.progress || {};
      if (actorUuid && nowProgress[actorUuid]) return;
      if (!actor) {
        ui.notifications.warn("Select or control a Hunter to roll.");
        return;
      }

      const roll = await (new Roll("1d20")).evaluate();
      const rollValue = Number(roll.terms?.[0]?.results?.[0]?.result ?? roll.total ?? 20);
      if (!game.user?.isGM) {
        button.disabled = true;
        button.textContent = "Rolling...";
        await dispatchToGM("hazardRollApply", {
          messageId: message.id,
          actorUuid: actor.uuid,
          rollValue
        });
        return;
      }

      await applyHazardRoll(message, actor, rollValue);
    });
  }

  return {
    onRenderHazardMessage
  };
}
