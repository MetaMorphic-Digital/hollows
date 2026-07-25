// Entity reads — side-effect-free resolvers over an entity actor's items.
// Leaf module (no document/application imports) shared by the entity runtime
// and the combat UI.
import { EDGE_DEFS } from "./edges.js";

export function getEntityEnhancementItems(entityActor) {
  if (!entityActor || entityActor.type !== "entity") return [];
  return entityActor.items.filter((item) => item.type === "entity-enhancement");
}

// Entity "engine" abilities (special/doom/etc.) — entity-ability items by kind.
export function getEntityEngineAbilities(entityActor, kinds = ["special", "doom"]) {
  if (!entityActor || entityActor.type !== "entity") return [];
  const kindSet = new Set((Array.isArray(kinds) ? kinds : [kinds]).map((value) => String(value || "")));
  return entityActor.items.filter((item) =>
    item.type === "entity-ability" && kindSet.has(String(item.system?.kind || ""))
  );
}

export function getEdgeDef(edgeId) {
  return EDGE_DEFS.find(e => e.id === edgeId) || null;
}

export function getActiveEntityEdges(entity) {
  const raw = entity?.getFlag?.("hollows", "edgeState")?.edges;
  return Array.isArray(raw) ? raw : [];
}

export function getActiveEntityEdge(entity, edgeId) {
  const id = String(edgeId || "");
  return getActiveEntityEdges(entity).find((edge) => String(edge?.id || "") === id) || null;
}

function buildEdgeDescription(edgeId, extra = 0) {
  const def = getEdgeDef(edgeId);
  if (!def) return "";
  const bonus = Math.max(0, Number(extra ?? 0) || 0);
  const labels = {
    threatCap: "Threat Cap",
    threatPerRound: "Threat per Round",
    defendTN: "Defend TN vs Entity attacks",
    resolveMax: "Entity max Resolve",
    close: "Close Defence",
    ranged: "Ranged Defence",
    wyrd: "Wyrd Defence"
  };
  return Object.entries(def.effects || {})
    .map(([stat, delta]) => {
      const value = Number(delta || 0);
      const signed = value < 0 ? value - bonus : value + bonus;
      const label = labels[stat] || stat;
      return `${label} ${signed > 0 ? "+" : ""}${signed}`;
    })
    .join(", ");
}

export function buildActiveEdgeDisplay(entity) {
  return getActiveEntityEdges(entity).map((edge, index) => {
    const def = getEdgeDef(edge.id);
    const extra = Math.max(0, Number(edge?.extra ?? 0) || 0);
    return {
      index,
      id: edge.id,
      name: def?.name || edge.id,
      description: buildEdgeDescription(edge.id, extra),
      effectsText: "",
      extra
    };
  });
}
