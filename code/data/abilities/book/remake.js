import { ActivatedAbility } from "../../mechanics/ActivatedAbility.js";
import { getActorZone, getHuntersInZone } from "../../../canvas/zone.js";
import { getTotalStatForActor } from "../../../documents/actor/hunter-combat.js";
import { getFocusCount, adjustHunterResource } from "../../../documents/actor/resources.js";
import { HunterStatRollFlow } from "../../../dice/flow.js";

export const REMAKE = new ActivatedAbility({
  key: "book.t1.remake",
  weapon: "Book", tier: 1,
  name: "Remake",
  run: async (actor, ctx) => {
    const zone = getActorZone(actor);
    if (!zone) { ui.notifications.warn("You must be in a zone to use Remake."); ctx._cancelled = true; return; }
    if (Number(actor.system.health.wounds.value ?? 0) <= 0) { ui.notifications.warn("Not enough Wounds to use Remake."); ctx._cancelled = true; return; }
    const candidates = getHuntersInZone(zone).filter((a) => a.id !== actor.id);
    if (!candidates.length) { ui.notifications.warn("No allies in your area for Remake."); ctx._cancelled = true; return; }

    const esc = (v) => foundry.utils.escapeHTML(String(v ?? ""));
    const options = candidates.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join("");
    const targetId = await foundry.applications.api.DialogV2.wait({
      window: { title: "Remake" },
      content: `<form class="hollows-roll-dialog"><div class="form-group"><label>Target Hunter</label><select name="targetId">${options}</select></div></form>`,
      rejectClose: false,
      buttons: [
        { action: "apply", label: "Apply", default: true, callback: (_e, _b, d) => String(d.element.querySelector("[name=targetId]")?.value || "") },
        { action: "cancel", label: "Cancel", callback: () => "" }
      ]
    }) ?? "";
    if (!targetId) { ctx._cancelled = true; return; }

    const target = game.actors.get(targetId);

    const statValue = getTotalStatForActor(actor, "wise");
    const mode = zone === "Support" ? "adv" : "normal";
    const flow = new HunterStatRollFlow(actor, {
      title: "Remake",
      cardTitle: "Wise",
      statLabel: "Wise",
      statValue,
      focusCount: getFocusCount(actor),
      spendFocus: async () => adjustHunterResource(actor, { focus: -1 })
    });
    const result = await flow.roll({ mode, useFocus: false });
    if (!result) { ctx._cancelled = true; return; }

    const outcomeLabel = result.chosen?.outcome?.label || "Failure";
    const success = ["Success", "Superior Success", "Critical Success"].includes(outcomeLabel);
    const healAmount = success ? 3 : 1;

    await result.roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: "Remake",
      content: `<div class="hollows-chat"><strong>${esc(actor.name)}</strong> uses <strong>Remake</strong> on <strong>${esc(target.name)}</strong>.<div>Wise ${result.chosen?.value}/${statValue} — ${outcomeLabel}.</div><div>Heals <strong>${healAmount}</strong> Wounds.</div></div>`
    });

    await adjustHunterResource(actor, { wounds: -1 });
    await adjustHunterResource(target, { wounds: healAmount });
  }
});
