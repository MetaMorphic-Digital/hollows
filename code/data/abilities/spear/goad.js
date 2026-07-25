import { Reaction } from "../../mechanics/Reaction.js";
import { getActorZone, getAdjacentZones } from "../../../canvas/zone.js";
import { addThreatToZoneSafe } from "../../../canvas/overlays.js";
import { placeThreatFromHunter } from "../../../canvas/threat-ops.js";
import { getThreatInZone } from "../../../canvas/zone.js";

export const GOAD = new Reaction("spear.t1.goad", {
  weapon: "Spear", tier: 1,
  name: "Goad",
  event: { type: "guard" },
  promptOnPlayer: async ({ actorId }) => {
    const actor = game.actors.get(actorId);

    const zone = getActorZone(actor);
    if (!zone) return null;
    const candidates = Array.from(new Set([zone, ...getAdjacentZones(zone)])).filter(z => z !== "Support");
    if (!candidates.length) return null;

    const action = await foundry.applications.api.DialogV2.wait({
      window: { title: "Goad" },
      content: `<div class="hollows-roll-dialog"><div>Place or Shift 1 Threat in your area or an adjacent area.</div></div>`,
      rejectClose: false,
      buttons: [
        { action: "place", label: "Place", default: true, callback: () => "place" },
        { action: "shift", label: "Shift", callback: () => "shift" },
        { action: "skip", label: "Skip", callback: () => null }
      ]
    }) ?? null;
    if (!action) return null;

    if (action === "place") {
      const options = candidates.map(z => `<option value="${z}">${z}</option>`).join("");
      const pick = await foundry.applications.api.DialogV2.wait({
        window: { title: "Goad: Place" },
        content: `<form class="hollows-roll-dialog"><div class="form-group"><label>Place Threat</label><select name="zoneId">${options}</select></div></form>`,
        rejectClose: false,
        buttons: [
          { action: "apply", label: "Place", default: true, callback: (_e, _b, dialog) => String(dialog.element.querySelector("[name=zoneId]")?.value || "") },
          { action: "cancel", label: "Skip", callback: () => null }
        ]
      }) ?? null;
      if (!pick) return null;
      return { action: "place", zoneId: pick };
    }

    const sources = candidates.filter(z => getThreatInZone(z) > 0);
    if (!sources.length) {
      ui.notifications.warn("No Threat to shift.");
      return null;
    }
    const fromOptions = sources.map(z => `<option value="${z}">${z}</option>`).join("");
    const shiftPick = await foundry.applications.api.DialogV2.wait({
      window: { title: "Goad: Shift" },
      content: `
        <form class="hollows-roll-dialog">
          <div class="form-group"><label>From</label><select name="fromZone">${fromOptions}</select></div>
          <div class="form-group"><label>To</label><select name="toZone"></select></div>
        </form>
      `,
      rejectClose: false,
      render: (_e, dialog) => {
        const el = dialog.element;
        const updateTo = () => {
          const fromZone = String(el.querySelector("[name=fromZone]")?.value || "");
          const toZones = (getAdjacentZones(fromZone) || []).filter(z => z !== "Support");
          const toSelect = el.querySelector("[name=toZone]");
          if (toSelect) toSelect.innerHTML = toZones.map(z => `<option value="${z}">${z}</option>`).join("");
        };
        el.querySelector("[name=fromZone]")?.addEventListener("change", updateTo);
        updateTo();
      },
      buttons: [
        { action: "apply", label: "Shift", default: true, callback: (_e, _b, dialog) => ({
          from: String(dialog.element.querySelector("[name=fromZone]")?.value || ""),
          to: String(dialog.element.querySelector("[name=toZone]")?.value || "")
        }) },
        { action: "cancel", label: "Skip", callback: () => null }
      ]
    }) ?? null;
    if (!shiftPick || !shiftPick.from || !shiftPick.to || shiftPick.from === shiftPick.to) return null;
    return { action: "shift", fromZone: shiftPick.from, toZone: shiftPick.to };
  },

  applyOnGM: async ({ actorId }, choice) => {
    const actor = game.actors.get(actorId);
    const action = String(choice.action || "");
    if (action === "place") {
      const zone = String(choice.zoneId || "");
      if (!zone) return;
      await placeThreatFromHunter(actor, zone, 1, { source: "ability", reason: "Goad" });
    } else if (action === "shift") {
      const fromZone = String(choice.fromZone || "");
      const toZone = String(choice.toZone || "");
      if (!fromZone || !toZone || fromZone === toZone) return;
      await addThreatToZoneSafe(fromZone, -1);
      await addThreatToZoneSafe(toZone, 1);
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="hollows-chat"><strong>${actor.name}</strong> shifts <strong>1 Threat</strong> from <strong>${fromZone}</strong> to <strong>${toZone}</strong> (Goad).</div>`
      });
    }
  }
});
