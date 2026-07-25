/**
 * Entity Edges runtime state.
 *
 * Edges store only which edge entries are active. Stat penalties are resolved
 * at read time through EntitySelfStatModifier instances.
 */
import {
  buildActiveEdgeDisplay,
  getActiveEntityEdges,
  getEdgeDef
} from "../../data/entity/resolvers.js";

export { buildActiveEdgeDisplay, getEdgeDef };

async function setEntityEdges(entity, edges) {
  if (!entity) return false;
  const cleaned = (Array.isArray(edges) ? edges : [])
    .map((edge) => ({
      id: String(edge?.id || ""),
      extra: Math.max(0, Number(edge?.extra ?? 0) || 0)
    }))
    .filter((edge) => !!getEdgeDef(edge.id));
  await entity.setFlag("hollows", "edgeState", { edges: cleaned });
  return true;
}

export async function applyEdgeState(entity, edges) {
  return setEntityEdges(entity, edges);
}

export async function removeEntityEdge(entity, index) {
  if (!entity) return false;
  const current = getActiveEntityEdges(entity);
  const idx = Number(index);
  if (!Number.isInteger(idx) || idx < 0 || idx >= current.length) return false;
  return setEntityEdges(entity, current.filter((_, i) => i !== idx));
}
