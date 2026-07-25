import { Reaction } from "../../../mechanics/Reaction.js";
import { makeArmourForm } from "./base.js";

export const ARMOUR_METAL_READY = new Reaction("armour.form.metal.ready", {
  weapon: "Armour",
  name: "Metal",
  event: { type: "incomingEntityWoundDamage" },
  promptOnPlayer: async ({ actorId } = {}) => {
    const actor = actorId ? game.actors.get(String(actorId)) : null;
    if (!actor || actor.type !== "hunter") return null;
    if (!actor.testUserPermission(game.user, "OWNER")) return null;
    const { hasCondition } = await import("../../../../documents/actor/conditions.js");
    if (!hasCondition(actor, "ready")) return null;
    const confirm = await foundry.applications.api.DialogV2.wait({
      window: { title: "Metal Armour" },
      content: `<div class="hollows-roll-dialog"><div><strong>${foundry.utils.escapeHTML(actor.name)}</strong>: expend <strong>Ready</strong> to reduce Wound damage by 1?</div></div>`,
      rejectClose: false,
      buttons: [
        { action: "yes", label: "Expend Ready", default: true, callback: () => true },
        { action: "no", label: "Keep Ready", callback: () => false }
      ]
    }) ?? false;
    if (confirm !== true) return null;
    return { damageReduction: 1 };
  },
  applyOnGM: async ({ actorId } = {}, _choice) => {
    const actor = actorId ? game.actors.get(String(actorId)) : null;
    if (!actor) return;
    const { removeCondition } = await import("../../../../documents/actor/conditions.js");
    await removeCondition(actor, "ready");
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="hollows-chat"><strong>${actor.name}</strong> expends <strong>Ready</strong> (Metal Armour: −1 Wound damage).</div>`
    });
  }
});

export const ARMOUR_METAL_FORM = makeArmourForm({
  key: "Metal",
  name: "Metal",
  label: "Metal",
  text: "When you would suffer Wound damage from an Entity attack, you may expend Ready to reduce the damage suffered by 1.",
  damage: { resolve: 2, wounds: 1 },
  mechanics: [ARMOUR_METAL_READY]
});
