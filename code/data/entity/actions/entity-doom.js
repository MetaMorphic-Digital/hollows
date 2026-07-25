import { getActiveEntityActor, getActiveHollowActor } from "../../../canvas/zone.js";
import { getSceneDoomValue } from "../../../documents/entity/entity-stats.js";

export function refreshActiveEntityFromDoomChange() {
  const entity = getActiveEntityActor();
  if (!entity || entity.type !== "entity") return;
  try { entity.prepareData(); } catch (err) {}
  try { entity.sheet?.render(false); } catch (err) {}
  try {
    if (game.combat?.combatant?.actor?.id === entity.id) ui.combat?.render();
  } catch (err) {}
  try {
    for (const app of Object.values(entity.apps || {})) app?.render?.(false);
  } catch (err) {}
}

async function adjustSceneDoom(delta) {
  if (!Number.isFinite(delta) || delta === 0) return null;
  const hollow = getActiveHollowActor();
  if (hollow) {
    const current = Number(hollow.system?.doom?.current ?? 0);
    const cap = Number(hollow.system?.doom?.cap ?? 0);
    let next = Math.max(0, current + delta);
    if (cap > 0) next = Math.min(cap, next);
    await hollow.update({ "system.doom.current": next });
    return { current, next };
  }
  const scene = canvas?.scene;
  if (!scene) return null;
  const current = getSceneDoomValue(scene);
  const next = Math.max(0, current + delta);
  await scene.setFlag("hollows", "doom", next);
  return { current, next };
}

export async function requestDoomAdjust(delta) {
  if (!Number.isFinite(delta) || delta === 0) return null;
  if (game.user?.isGM) return adjustSceneDoom(delta);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker(),
    content: `<div class="hollows-hidden">doom adjust</div>`,
    whisper: ChatMessage.getWhisperRecipients("GM"),
    flags: { hollows: { hidden: true, doomAdjust: { delta: Number(delta) } } }
  });
  return null;
}
