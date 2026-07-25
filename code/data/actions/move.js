/**
 * Move "action". Move in Hollows is physical token dragging — there is no
 * dialog to orchestrate. This module exists so the manoeuvre registry has a
 * uniform entry: when a Move is *granted* (Control, Pistol Hotfoot, etc.)
 * we post a notice prompting the recipient to drag their token.
 */
export async function grantMoveNotice(actor, reason = "") {
  if (!actor) return;
  const tag = reason ? ` (${reason})` : "";
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="hollows-chat"><strong>${actor.name}</strong> may Move as an immediate action${tag}.</div>`
  });
}
