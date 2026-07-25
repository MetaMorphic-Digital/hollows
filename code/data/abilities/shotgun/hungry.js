/**
 * Hungry — Shotgun T1. While the carrier's Shotgun is Empty, when their turn
 * ends they must spend 1 Resolve or 1 Wound to make an immediate Reload.
 *
 * An event-driven Reaction on the `turnEnd` event (the Barbed pattern): the
 * end-of-turn dispatcher offers it to the carrier's owner, so the spend prompt
 * and the Reload run on that player's client. Logic relocated verbatim from
 * the former handleShotgunHungryPrompt.
 */
import { Reaction } from "../../mechanics/Reaction.js";
import { adjustHunterResource } from "../../../documents/actor/resources.js";
import { getShotgunWeapons, isShotgunLoaded } from "../../../helpers/weapon-utils.js";

export const HUNGRY = new Reaction("shotgun.t1.hungry", {
  weapon: "Shotgun", tier: 1, name: "Hungry",
  event: { type: "turnEnd" },
  promptOnPlayer: async ({ actorId }) => {
    const actor = game.actors.get(actorId);
    const shotguns = getShotgunWeapons(actor);
    if (!shotguns.length || !shotguns.every((w) => !isShotgunLoaded(w))) return null;

    const rCur = Number(actor.system.health.resolve.value ?? 0);
    const wCur = Number(actor.system.health.wounds.value ?? 0);
    if (rCur <= 0 && wCur <= 0) {
      ui.notifications.warn("Hungry: no Resolve or Wounds to spend.");
      return null;
    }
    const spend = await foundry.applications.api.DialogV2.wait({
      window: { title: "Hungry" },
      content: `<div class="hollows-roll-dialog"><div>Shotgun is Empty. Spend <strong>1 Resolve</strong> or <strong>1 Wound</strong> to Reload.</div></div>`,
      buttons: [
        { action: "resolve", label: "Spend Resolve", default: true },
        { action: "wound", label: "Spend Wound" }
      ],
      rejectClose: false
    }) ?? "auto";

    let choice = spend;
    if (choice === "auto") choice = rCur > 0 ? "resolve" : "wound";
    if (choice === "resolve" && rCur <= 0) choice = wCur > 0 ? "wound" : "resolve";
    if (choice === "wound" && wCur <= 0) choice = rCur > 0 ? "resolve" : "wound";

    if (choice === "resolve" && rCur > 0) {
      await adjustHunterResource(actor, { resolve: -1 });
    } else if (choice === "wound" && wCur > 0) {
      await adjustHunterResource(actor, { wounds: -1 });
    } else {
      ui.notifications.warn("Hungry: no Resolve or Wounds to spend.");
      return null;
    }

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="hollows-chat"><strong>${actor.name}</strong> pays the price and reloads (Hungry).</div>`
    });
    const { openReloadForActor } = await import("../../actions/reload.js");
    await openReloadForActor(actor);
    return { used: true };
  }
});
