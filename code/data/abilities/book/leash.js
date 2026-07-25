import { EntityActionPause } from "../../mechanics/EntityActionPause.js";
import { hasWeaponAbility } from "../../../helpers/weapon-utils.js";
import { getTokenZone, isCloseZone } from "../../../canvas/zone.js";
import { adjustEntityResource } from "../../../documents/actor/resources.js";

// Uses EntityActionPause non-interactively — no player prompt, no cancellation.
// active() restricts to the first Close-zone carrier so the -1 Resolve fires once
// regardless of how many hunters carry Leash.
export const LEASH = new EntityActionPause({
  key: "book.t1.leash",
  weapon: "Book", tier: 1,
  name: "Leash",
  actionType: ["interrupt", "prowl", "turnAround"],
  stage: "beforeResolve",
  active: (actor) => {
    const first = (canvas?.tokens?.placeables || [])
      .find(t => t.actor?.type === "hunter"
        && isCloseZone(getTokenZone(t) || "")
        && hasWeaponAbility(t.actor, { key: "book.t1.leash", name: "Leash", weaponType: "Book", tier: 1 }));
    return first?.actor?.id === actor.id;
  },
  handler: async (actor, context = {}) => {
    const entityActor = context.entityActor;
    if (!entityActor) return {};
    await adjustEntityResource(entityActor, { resolve: -1 });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="hollows-chat"><strong>${entityActor.name}</strong> suffers <strong>1 Resolve</strong> (Leash).</div>`
    });
    return {};
  }
});
