import { getActiveHollowActor } from "../../canvas/zone.js";

function resolveWorldActorRef(ref) {
  const value = String(ref || "").trim();
  if (!value) return null;
  if (value.startsWith("Actor.")) return game.actors.get(value.slice("Actor.".length)) || null;
  return game.actors.get(value) || null;
}

export function getCurrentHollowEntityChoices(hollowActor = null) {
  const hollow = hollowActor || getActiveHollowActor();
  const ids = new Set();
  if (hollow?.system?.lordId) ids.add(String(hollow.system.lordId));
  for (const id of Array.isArray(hollow?.system?.trackedEntities) ? hollow.system.trackedEntities : []) {
    if (id) ids.add(String(id));
  }
  for (const scene of Array.isArray(hollow?.system?.scenes) ? hollow.system.scenes : []) {
    for (const id of Array.isArray(scene?.entityIds) ? scene.entityIds : []) {
      if (id) ids.add(String(id));
    }
  }
  const choices = [];
  const seen = new Set();
  for (const id of ids) {
    const actor = resolveWorldActorRef(id);
    if (actor?.type !== "entity" || seen.has(actor.id)) continue;
    seen.add(actor.id);
    choices.push(actor);
  }
  return choices;
}
