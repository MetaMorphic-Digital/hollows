/**
 * Drink Deep — Knife T1. When the active Entity starts its turn Bleeding, the
 * carrier's owner may remove the Bleeding (granting Focus to Hunters in their
 * area) instead of letting the Entity take the normal bleeding damage.
 *
 * Event-driven on `entityBleedingStart`.
 */
import { Reaction } from "../../mechanics/Reaction.js";
import { getActorZone, getHuntersInZone } from "../../../canvas/zone.js";
import { applyFocusToActor } from "../../actions/focus.js";
import { setConditionSafe } from "../../../documents/actor/conditions.js";

export const DRINK_DEEP = new Reaction("knife.t1.drink-deep", {
  weapon: "Knife", tier: 1, name: "Drink Deep",
  event: { type: "entityBleedingStart" },
  promptOnPlayer: async () => {
    const confirm = await foundry.applications.api.DialogV2.wait({
      window: { title: "Drink Deep" },
      content: `<div class="hollows-roll-dialog"><strong>Drink Deep</strong><br>Remove Bleeding from the Entity to grant Focus to all Hunters in your area?</div>`,
      rejectClose: false,
      buttons: [
        { action: "yes", label: "Apply", default: true, callback: () => true },
        { action: "no", label: "Skip", callback: () => false }
      ]
    });
    return confirm ? { applied: true } : null;
  },
  applyOnGM: async ({ entityId, carrierId }) => {
    const entity = game.actors.get(entityId);
    const carrier = game.actors.get(carrierId);
    const zone = getActorZone(carrier);
    await setConditionSafe(entity, "bleeding", false);
    const hunters = zone ? getHuntersInZone(zone) : [];
    for (const h of hunters) await applyFocusToActor(h, carrier);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: carrier }),
      content: `<div class="hollows-chat"><strong>${carrier.name}</strong> uses <strong>Drink Deep</strong>. Bleeding ends; all Hunters in ${zone || "their area"} may Focus.</div>`
    });
  }
});
