/**
 * Masochist — Armour T1. When the Entity targets you with any attack, you may
 * expend Ready as an immediate action to heal 1 Wound.
 *
 * Event-driven Reaction on the `entityAttack` event (dispatched by
 * runOnEntityAttack when the Entity declares an attack). The dispatcher offers
 * it to every Masochist carrier; the prompt self-gates on being a target of the
 * attack and holding Ready. The carrier heals itself, so the mutation runs in
 * promptOnPlayer (owner has OWNER rights on their own actor) — no applyOnGM.
 */
import { Reaction } from "../../mechanics/Reaction.js";
import { hasCondition, removeCondition } from "../../../documents/actor/conditions.js";
import { adjustHunterResource } from "../../../documents/actor/resources.js";

export const MASOCHIST = new Reaction("armour.t1.masochist", {
  weapon: "Armour", tier: 1, name: "Masochist",
  event: { type: "entityAttack" },
  promptOnPlayer: async ({ actorId, targetActorIds }) => {
    const actor = game.actors.get(actorId);
    if (!targetActorIds.includes(actor.id)) return null;
    if (!hasCondition(actor, "ready")) return null;
    const confirm = await foundry.applications.api.DialogV2.wait({
      window: { title: "Masochist" },
      content: `<div class="hollows-roll-dialog"><div>Expend <strong>Ready</strong> to heal <strong>1 Wound</strong>?</div></div>`,
      rejectClose: false,
      buttons: [
        { action: "yes", label: "Expend Ready", default: true, callback: () => true },
        { action: "no", label: "Skip", callback: () => false }
      ]
    });
    if (confirm !== true) return null;
    await removeCondition(actor, "ready");
    await adjustHunterResource(actor, { wounds: 1 });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="hollows-chat"><strong>${actor.name}</strong> heals <strong>1 Wound</strong> (Masochist).</div>`
    });
    return { used: true };
  }
});
