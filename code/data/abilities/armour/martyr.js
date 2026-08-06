import { Reaction } from "../../mechanics/Reaction.js";
import { OnDefenceResultAction } from "../../mechanics/OnDefenceResultAction.js";
import { removeCondition } from "../../../documents/actor/conditions.js";
import { adjustHunterResource } from "../../../documents/actor/resources.js";

export const MARTYR = new Reaction("martyr", {
  weapon: "Armour", tier: 1, name: "Martyr",
  promptOnPlayer: async ({ targetId, candidateIds, damageValue }) => {
    const candidates = candidateIds.map((id) => game.actors.get(id));
    const target = game.actors.get(targetId);
    const targetLabel = `<strong>${foundry.utils.escapeHTML(target.name)}</strong>`;
    const amount = Math.max(0, Number(damageValue ?? 0));
    const incoming = Math.max(0, amount - 1);
    const intro = `<div>${targetLabel} is about to take <strong>${amount}</strong> Wound${amount === 1 ? "" : "s"}.</div>
      <div>A martyr can take <strong>${incoming}</strong> Wound${incoming === 1 ? "" : "s"} instead (expends Ready).</div>`;
    if (candidates.length === 1) {
      const martyr = candidates[0];
      const confirm = await foundry.applications.api.DialogV2.wait({
        window: { title: "Martyr" },
        content: `<div class="hollows-roll-dialog">${intro}<div>Have <strong>${foundry.utils.escapeHTML(martyr.name)}</strong> take the hit?</div></div>`,
        rejectClose: false,
        buttons: [
          { action: "yes", label: "Take the hit", default: true, callback: () => true },
          { action: "no", label: "Skip", callback: () => false }
        ]
      });
      return confirm === true ? { martyrId: martyr.id } : null;
    }
    const options = candidates.map((a) => `<option value="${a.id}">${foundry.utils.escapeHTML(a.name)}</option>`).join("");
    const pick = await foundry.applications.api.DialogV2.wait({
      window: { title: "Martyr" },
      content: `<form class="hollows-roll-dialog">${intro}<div class="form-group"><label>Martyr (takes the hit)</label><select name="martyrId">${options}</select></div></form>`,
      rejectClose: false,
      buttons: [
        { action: "apply", label: "Take the hit", default: true, callback: (_e, _b, dialog) => String(dialog.element.querySelector("[name=martyrId]")?.value || "") },
        { action: "cancel", label: "Skip", callback: () => false }
      ]
    });
    return pick ? { martyrId: pick } : null;
  },
  applyOnGM: async ({ targetId, damageValue }, choice) => {
    const martyr = game.actors.get(choice.martyrId);
    const target = game.actors.get(targetId);
    await removeCondition(martyr, "ready");
    const incoming = Math.max(0, Number(damageValue ?? 0) - 1);
    await adjustHunterResource(martyr, { wounds: -incoming });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: martyr }),
      content: `<div class="hollows-chat"><strong>${martyr.name}</strong> uses <strong>Martyr</strong> to protect <strong>${target.name}</strong>, suffering <strong>${incoming}</strong> Wound damage.</div>`
    });
  }
});

export const MARTYR_TRIGGER = new OnDefenceResultAction({
  key: "armour.t1.martyr",
  weapon: "Armour", tier: 1,
  name: "Martyr",
  text: "When an ally in your area would suffer Wound damage, you may expend Ready as an immediate action; they take no damage, and you take the inflicted Wound damage -1 instead.",
  result: "damaged",
  damageType: "Wounds",
  scope: "zoneMate",
  when: ({ actor }) => actor.statuses.has("ready"),
  reaction: "martyr",
  redirectsDamage: true
});
