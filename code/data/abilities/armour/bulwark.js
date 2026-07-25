/**
 * Bulwark — Armour T1. While Ready, allies in your area restore +1 Resolve
 * when they Guard. Expend Ready to grant an ally an immediate Guard manoeuvre.
 *
 *   GUARD                — the reaction that opens the Guard dialog on the chosen ally.
 *   BULWARK              — the ApplyToZone activation surfaced in the Expend Ready dialog.
 *   BULWARK_GUARD_BONUS  — passive +1 Resolve to a guarding ally; an auto
 *                          event-Reaction on `guard`, zoneMate-scoped (the
 *                          carrier is the Ready ally, the bonus goes to the guarder).
 */
import { Reaction } from "../../mechanics/Reaction.js";
import { ApplyToZone } from "../../mechanics/ApplyToZone.js";
import { openGuardDialogForActor } from "../../actions/guard.js";
import { hasCondition } from "../../../documents/actor/conditions.js";
import { adjustHunterResource } from "../../../documents/actor/resources.js";

export const GUARD = new Reaction("guard", {
  weapon: "Armour", tier: 1, name: "Bulwark (Guard)",
  promptOnPlayer: async ({ targetId }) => {
    const target = game.actors.get(targetId);
    await openGuardDialogForActor(target);
    return { used: true };
  }
});

export const BULWARK = new ApplyToZone({
  key: "armour.t1.bulwark",
  weapon: "Armour", tier: 1,
  name: "Bulwark",
  label: "Bulwark: Grant Guard",
  text: "Expend Ready to grant an immediate Guard manoeuvre to an ally in your area.",
  cost: { condition: "ready" },
  targetSelection: { scope: "ally", zoneScope: "sameZone", count: 1 },
  effects: [
    { type: "chatNotice", message: "<strong>{actor}</strong> expends <strong>Ready</strong> to grant <strong>{target}</strong> an immediate <strong>Guard</strong> (Bulwark)." },
    { type: "grantReaction", reaction: "guard" }
  ]
});

export const BULWARK_GUARD_BONUS = new Reaction("armour.t1.bulwark", {
  weapon: "Armour", tier: 1, name: "Bulwark",
  event: { type: "guard", scope: "zoneMate" },
  // carrier (the Ready Bulwark ally) must be Ready; the dispatcher already
  // confirmed zone + carriership. Auto-applies (no prompt) — the guarder gets +1.
  promptOnPlayer: async ({ carrierId }) => {
    const carrier = game.actors.get(carrierId);
    if (!hasCondition(carrier, "ready")) return null;
    return { apply: true };
  },
  applyOnGM: async ({ actorId }) => {
    const guarder = game.actors.get(actorId);
    const result = await adjustHunterResource(guarder, { resolve: 1 });
    if (!result.resolve.changed) return;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: guarder }),
      content: `<div class="hollows-chat"><strong>${guarder.name}</strong> gains <strong>+1 Resolve</strong> from <strong>Bulwark</strong>.</div>`
    });
  }
});
