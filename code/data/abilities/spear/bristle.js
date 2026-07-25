import { Reaction } from "../../mechanics/Reaction.js";
import { OnAttackResultAction } from "../../mechanics/OnAttackResultAction.js";
import { getActorZone, getAdjacentZones, getThreatInZone } from "../../../canvas/zone.js";
import { addThreatToZone } from "../../../canvas/overlays.js";
import { isSameCombatRound } from "../../../helpers/combat-runtime.js";

export const BRISTLE_ZONE_PICK = new Reaction("spear.t1.bristle.zone-pick", {
  name: "Bristle",
  promptOnPlayer: async ({ actorId, zones }) => {
    const actor = game.actors.get(actorId);
    const zoneList = zones;
    if (!zoneList.length) return null;
    const options = zoneList.map(z => `<option value="${z}">${z}</option>`).join("");
    const content = `
      <form class="hollows-roll-dialog">
        <div class="form-group">
          <label>Bristle</label>
          <div class="muted">Remove 1 Threat from your area or an adjacent area.</div>
        </div>
        <div class="form-group">
          <label>Zone</label>
          <select name="zoneId">${options}</select>
        </div>
      </form>
    `;
    return await foundry.applications.api.DialogV2.wait({
      window: { title: "Bristle" },
      content,
      rejectClose: false,
      buttons: [
        { action: "apply", label: "Remove Threat", default: true, callback: (_e, _b, dialog) => ({ zoneId: String(dialog.element.querySelector("[name=zoneId]")?.value || "") }) },
        { action: "cancel", label: "Skip", callback: () => null }
      ]
    }) ?? null;
  },
  applyOnGM: async ({ actorId }, choice) => {
    const zoneId = String(choice.zoneId || "");
    if (!zoneId) return;
    await addThreatToZone(zoneId, -1);
    const actor = game.actors.get(actorId);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="hollows-chat"><strong>${actor.name}</strong> removes <strong>1 Threat</strong> from <strong>${zoneId}</strong> (Bristle).</div>`
    });
  }
});

export const BRISTLE = new OnAttackResultAction({
  key: "spear.t1.bristle",
  weapon: "Spear", tier: 1,
  name: "Bristle",
  text: "Once per round, when you miss, remove 1 Threat from your area or an adjacent area.",
  result: "miss"
});

BRISTLE.run = async ({ actor }) => {
  const combat = game.combat;
  const roundKey = combat?.started ? { combatId: combat.id, round: Number(combat.round ?? 0) } : null;
  const used = actor.getFlag("hollows", "spearBristleUsed");
  if (roundKey && used && isSameCombatRound(used, roundKey)) return false;
  const zone = getActorZone(actor);
  if (!zone) return false;
  const zones = Array.from(new Set([zone, ...getAdjacentZones(zone)]));
  const zonesWithThreat = zones.filter(z => getThreatInZone(z) > 0);
  if (!zonesWithThreat.length) return false;
  if (roundKey) await actor.setFlag("hollows", "spearBristleUsed", roundKey);
  const { primaryOwnerOf } = await import("../../../helpers/reactions.js");
  const owner = primaryOwnerOf(actor) || game.user;
  await BRISTLE_ZONE_PICK.offer(owner, { actorId: actor.id, zones: zonesWithThreat });
  return true;
};
