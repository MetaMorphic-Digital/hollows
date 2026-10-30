import { EntitySelfStatModifier } from "../mechanics/EntitySelfStatModifier.js";
import {
  getActiveEntityEdge
} from "./resolvers.js";

function hasEdge(edgeId) {
  return (entity) => !!getActiveEntityEdge(entity, edgeId);
}

function edgePenalty(edgeId, baseDelta) {
  return (entity) => {
    const edge = getActiveEntityEdge(entity, edgeId);
    if (!edge) return 0;
    const extra = Math.max(0, Number(edge.extra ?? 0) || 0);
    return Number(baseDelta || 0) - extra;
  };
}

export const EDGE_MODIFIERS = [
  new EntitySelfStatModifier({
    key: "edge.cornered.threat-cap",
    name: "Cornered",
    stat: "threatCap",
    active: hasEdge("cornered"),
    delta: edgePenalty("cornered", -2),
  }),

  new EntitySelfStatModifier({
    key: "edge.cornered.threat-per-round",
    name: "Cornered",
    stat: "threatPerRound",
    active: hasEdge("cornered"),
    delta: edgePenalty("cornered", -1),
  }),

  new EntitySelfStatModifier({
    key: "edge.protected.defend-tn",
    name: "Protected",
    stat: "defendTN",
    active: hasEdge("protected"),
    delta: edgePenalty("protected", -1),
  }),

  new EntitySelfStatModifier({
    key: "edge.exhausted.resolve-max",
    name: "Exhausted",
    stat: "resolveMax",
    active: hasEdge("exhausted"),
    delta: edgePenalty("exhausted", -2),
  }),

  new EntitySelfStatModifier({
    key: "edge.hexed.wyrd",
    name: "Hexed",
    stat: "wyrd",
    active: hasEdge("hexed"),
    delta: edgePenalty("hexed", -2),
  }),

  new EntitySelfStatModifier({
    key: "edge.trapped.ranged",
    name: "Trapped",
    stat: "ranged",
    active: hasEdge("trapped"),
    delta: edgePenalty("trapped", -2),
  }),

  new EntitySelfStatModifier({
    key: "edge.undermined.close",
    name: "Undermined",
    stat: "close",
    active: hasEdge("undermined"),
    delta: edgePenalty("undermined", -2),
  }),
];
