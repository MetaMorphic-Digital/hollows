/** Rally — Sword T1. On the `guard` event, prompt an ally in the area to Focus. */
import { Reaction } from "../../mechanics/Reaction.js";
import { getActorZone, getHuntersInZone } from "../../../canvas/zone.js";

export const RALLY = new Reaction("sword.t1.rally", {
  weapon: "Sword", tier: 1, name: "Rally",
  event: { type: "guard" },
  promptOnPlayer: async ({ actorId }) => {
    const actor = game.actors.get(actorId);

    const zone = getActorZone(actor);
    if (!zone) return null;
    const allies = getHuntersInZone(zone).filter((h) => h.id !== actor.id);
    if (!allies.length) return null;

    const options = allies.map((a) => `<option value="${a.id}">${foundry.utils.escapeHTML(a.name)}</option>`).join("");
    const targetId = await foundry.applications.api.DialogV2.wait({
      window: { title: "Rally" },
      content: `
        <form class="hollows-roll-dialog">
          <div class="form-group">
            <label>Rally</label>
            <select name="targetId">${options}</select>
          </div>
        </form>
      `,
      rejectClose: false,
      buttons: [
        { action: "apply", label: "Focus Ally", default: true, callback: (_e, _b, dialog) => String(dialog.element.querySelector("[name=targetId]")?.value || "") },
        { action: "cancel", label: "Skip", callback: () => "" }
      ]
    }) ?? "";
    if (!targetId) return null;

    const target = game.actors.get(targetId);
    if (target.testUserPermission(game.user, "OWNER")) {
      const { runManoeuvre } = await import("../../actions/index.js");
      await runManoeuvre("focus", target);
      return { used: true };
    }

    const { GRANT_MANOEUVRE, primaryOwnerOf } = await import("../../../helpers/reactions.js");
    const owner = primaryOwnerOf(target) || game.user;
    await GRANT_MANOEUVRE.offer(owner, { targetId: target.id, manoeuvre: "focus" });
    return { used: true };
  }
});
