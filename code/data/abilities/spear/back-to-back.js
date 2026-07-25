import { EndOfTurnAction } from "../../mechanics/EndOfTurnAction.js";
import { getActorZone, getHuntersInZone } from "../../../canvas/zone.js";
import { adjustHunterResource } from "../../../documents/actor/resources.js";

export const BACK_TO_BACK = new EndOfTurnAction({
  key: "spear.t1.back-to-back",
  weapon: "Spear", tier: 1,
  name: "Back-To-Back",
  text: "When your turn ends, restore Resolve equal to the number of allies in your area; each ally restores 1 Resolve."
});

BACK_TO_BACK.run = async (actor) => {
  const zone = getActorZone(actor);
  if (!zone) return false;
  const allies = getHuntersInZone(zone).filter((h) => h.id !== actor.id);
  if (!allies.length) return false;
  await adjustHunterResource(actor, { resolve: allies.length });
  for (const ally of allies) await adjustHunterResource(ally, { resolve: 1 });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="hollows-chat"><strong>${actor.name}</strong> restores <strong>${allies.length} Resolve</strong>; each ally restores <strong>1 Resolve</strong> (Back-To-Back).</div>`
  });
  return true;
};
