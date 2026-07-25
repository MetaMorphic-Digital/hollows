import { ActivatedAbility } from "../../mechanics/ActivatedAbility.js";
import { placeThreatFromHunter } from "../../../canvas/threat-ops.js";
import { getActorZone } from "../../../canvas/zone.js";
import { runOnSwordFeint } from "../../../helpers/weapon-abilities/dispatchers.js";

export const FEINT = new ActivatedAbility({
  key: "sword.core.feint",
  weapon: "Sword", tier: 0,
  name: "Feint",
  text: "Place 2 Threat on your area to Feint as an immediate action.",
  buttonAction: "sword-feint",
  buttonLabel: "Feint",
  rateLimit: "oncePerTurn",
  run: async (actor, ctx) => {
    if (!(await applySwordFeint(actor))) ctx._cancelled = true;
  }
});

async function applySwordFeint(actor) {
  const sword = actor.items.find((i) => i.type === "weapon" && i.system?.weaponType === "Sword");
  const zone = getActorZone(actor);
  if (!zone) {
    ui.notifications.warn("Your token is not inside a zone region.");
    return false;
  }
  const ok = await placeThreatFromHunter(actor, zone, 2, {
    source: "ability",
    reason: "Feint"
  });
  if (!ok) {
    ui.notifications.warn("Unable to place Threat in this zone.");
    return false;
  }
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `
      <div class="hollows-chat">
        <strong>${actor.name}</strong> Feints with <strong>${sword.name}</strong> in <strong>${zone}</strong>.
        <div>Threat: +2 in ${zone}.</div>
      </div>
    `
  });
  await runOnSwordFeint(actor);
  return true;
}
