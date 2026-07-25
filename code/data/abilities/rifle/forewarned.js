import { IncomingDamageModifier } from "../../mechanics/IncomingDamageModifier.js";
import { Reaction } from "../../mechanics/Reaction.js";
import { getFocusCount, adjustHunterResource } from "../../../documents/actor/resources.js";

export const FOREWARNED_PROMPT = new Reaction("forewarned", {
  weapon: "Rifle", tier: 1, name: "Forewarned",
  promptOnPlayer: async ({ targetId, focusCount }) => {
    const target = game.actors.get(targetId);
    const max = Math.max(0, Number(focusCount ?? 0));
    if (max <= 0) return null;
    const content = `
      <form class="hollows-roll-dialog">
        <div class="form-group">
          <label>Forewarned</label>
          <div class="muted">Spend Focus to reduce incoming damage.</div>
        </div>
        <div class="form-group">
          <label>Spend Focus (0-${max})</label>
          <input type="number" name="spend" min="0" max="${max}" value="0" />
        </div>
      </form>
    `;
    const spend = await foundry.applications.api.DialogV2.wait({
      window: { title: "Forewarned" },
      content,
      rejectClose: false,
      buttons: [
        { action: "apply", label: "Apply", default: true, callback: (_e, _b, dialog) => Number(dialog.element.querySelector("[name=spend]")?.value ?? 0) },
        { action: "cancel", label: "Skip", callback: () => false }
      ]
    });
    const spendAmount = Math.max(0, Math.min(max, Number(spend ?? 0)));
    if (spendAmount <= 0) return null;
    return { spend: spendAmount };
  }
});

export const FOREWARNED = new IncomingDamageModifier({
  key: "rifle.t1.forewarned",
  weapon: "Rifle", tier: 1,
  name: "Forewarned",
  text: "Avoiding pain and suffering is simply a matter of not standing in the way of an enemy's attacks. When you would suffer or spend Resolve or Wound damage, you may immediately spend Focus up to the amount you currently hold. Reduce the damage suffered by the amount of Focus spent.",
  scope: "self",
  damageSource: "entity",
  timing: "postMitigation",
  apply: async ({ target, damageType, damageValue } = {}) => {
    if (!target || target.type !== "hunter") return null;
    if (!damageType || damageValue <= 0) return null;
    if (!game.user?.isGM) return null;

    const focusCount = getFocusCount(target);
    if (focusCount <= 0) return null;

    const { primaryOwnerOf } = await import("../../../helpers/reactions.js");
    const promptUser = primaryOwnerOf(target) || game.user;
    const choice = await FOREWARNED_PROMPT.offer(promptUser, {
      targetId: target.id,
      focusCount,
      damageType,
      damageValue: Number(damageValue ?? 0)
    });
    const spend = Math.max(0, Math.min(focusCount, Number(choice?.spend ?? 0)));
    if (spend <= 0) return null;
    await adjustHunterResource(target, { focus: -spend });
    return {
      damageValue: Math.max(0, Number(damageValue || 0) - spend),
      note: `Forewarned: -${spend}`
    };
  }
});
