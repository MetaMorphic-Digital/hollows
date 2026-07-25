import { Reaction } from "../../../mechanics/Reaction.js";
import { OnMoveAction } from "../../../mechanics/OnMoveAction.js";
import { makeArmourForm } from "./base.js";

async function applyBecomeReady(actorId) {
  const actor = actorId ? game.actors.get(String(actorId)) : null;
  if (!actor) return;
  const { setConditionSafe } = await import("../../../../documents/actor/conditions.js");
  await setConditionSafe(actor, "ready", true);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="hollows-chat"><strong>${actor.name}</strong> becomes <strong>Ready</strong> (Silk Armour).</div>`
  });
}

export const ARMOUR_SILK_TAKE_COVER = new Reaction("armour.form.silk.take-cover", {
  weapon: "Armour",
  name: "Silk",
  event: { type: "takeCover" },
  promptOnPlayer: async ({ actorId } = {}) => {
    const actor = actorId ? game.actors.get(String(actorId)) : null;
    if (!actor || !actor.testUserPermission(game.user, "OWNER")) return null;
    const { hasCondition } = await import("../../../../documents/actor/conditions.js");
    if (hasCondition(actor, "ready")) return null;
    return { used: true };
  },
  applyOnGM: async ({ actorId } = {}) => { await applyBecomeReady(actorId); }
});

const ARMOUR_SILK_MOVE_CONFIRM = new Reaction("armour.form.silk.move-confirm", {
  weapon: "Armour",
  name: "Silk",
  promptOnPlayer: async ({ actorId } = {}) => {
    const actor = actorId ? game.actors.get(String(actorId)) : null;
    if (!actor || !actor.testUserPermission(game.user, "OWNER")) return null;
    const confirm = await foundry.applications.api.DialogV2.wait({
      window: { title: "Apply Move Triggers?" },
      content: `<div class="hollows-roll-dialog"><p>Apply Move triggers?</p><ul><li><strong>Silk</strong> (become Ready)</li></ul></div>`,
      rejectClose: false,
      buttons: [
        { action: "apply", label: "Apply", default: true, callback: () => true },
        { action: "skip", label: "Skip", callback: () => false }
      ]
    }) ?? false;
    return confirm === true ? { used: true } : null;
  },
  applyOnGM: async ({ actorId } = {}) => { await applyBecomeReady(actorId); }
});

export const ARMOUR_SILK_MOVE = new OnMoveAction({
  key: "armour.form.silk.move",
  weapon: "Armour",
  name: "Silk",
  phase: "after",
  ownerMoveOnly: true
});

ARMOUR_SILK_MOVE.run = async ({ actor, fromZone, toZone, phase, byOwner } = {}) => {
  if (!byOwner || phase !== "after" || !fromZone || !toZone || fromZone === toZone) return;
  const { hasCondition } = await import("../../../../documents/actor/conditions.js");
  if (hasCondition(actor, "ready")) return;
  const { primaryOwnerOf } = await import("../../../../helpers/reactions.js");
  const owner = primaryOwnerOf(actor) || game.user;
  await ARMOUR_SILK_MOVE_CONFIRM.offer(owner, { actorId: actor.id });
};

export const ARMOUR_SILK_FORM = makeArmourForm({
  key: "Silk",
  name: "Silk",
  label: "Silk",
  text: "Attack with Quick or Sharp from Close (choose one when you take this Weapon; you can Reforge it (p. 155) to change to the other option). When you Take Cover or Move, become Ready.",
  damage: { resolve: 1, wounds: 1 },
  attackProfileOverride: [
    { defence: "Close", range: "Close", stat: "Quick" },
    { defence: "Close", range: "Close", stat: "Sharp" }
  ],
  mechanics: [ARMOUR_SILK_TAKE_COVER, ARMOUR_SILK_MOVE_CONFIRM, ARMOUR_SILK_MOVE]
});
