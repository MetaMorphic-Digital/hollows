/**
 * Focus action orchestration. Performs the Focus manoeuvre: gain 1 Focus
 * (up to the limit) and fire the weapon-ability hooks that react to it.
 *
 * The Focus *resource* (counter `actor.system.focus.value`, its accessors,
 * and the synced `focus` condition) stays in documents/actor — this module
 * is only the *action*. Mirrors attack.js / take-cover.js etc.
 */
import { getFocusLimit, getFocusCount, adjustHunterResource } from "../../documents/actor/resources.js";
import { runOnFocus } from "../../helpers/weapon-abilities/dispatchers.js";
import { triggerUseOnManoeuvre } from "./use.js";

export async function applyFocusToActor(actor, sourceActor = null) {
  if (!actor) return;
  const limit = getFocusLimit(actor);
  const current = getFocusCount(actor);
  if (current >= limit) {
    ui.notifications.warn(`${actor.name} already has maximum Focus.`);
    return;
  }
  await adjustHunterResource(actor, { focus: 1 });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: sourceActor || actor }),
    content: `<div class="hollows-chat"><strong>${actor.name}</strong> gains <strong>Focus</strong>.</div>`
  });
  await runOnFocus(actor);
  await triggerUseOnManoeuvre(actor, "focus");
}
