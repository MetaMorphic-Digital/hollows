import { ZONE_ADJACENCY, ZONE_GROUPS } from "../data/gameplay-constants.js";

/** Return the localized label for a zone, falling back to its id. */
export function localizeZone(zoneId) {
  const id = String(zoneId ?? "");
  const key = `HOLLOWS.ZONE.${id.replace(/\s+/g, "")}`;
  return id && game.i18n.has(key) ? game.i18n.localize(key) : id;
}

/** Check whether a lair zone can hold Threat. */
export function isThreatZone(zoneId) {
  return !!zoneId && zoneId !== "Support";
}

/** Read Threat flags from a lair region. */
export function getRegionThreatData(regionDoc) {
  const flags = regionDoc.getFlag("hollows", "threat") || {};
  const current = Number(flags.current ?? 0);
  const max = Number(flags.max ?? 0);
  const zoneId = regionDoc.getFlag("hollows", "zoneId") || regionDoc.name || "Zone";
  return { current, max, zoneId };
}

/** Read Curse flags from a lair region. */
export function getRegionCurseData(regionDoc) {
  const flags = regionDoc.getFlag("hollows", "curse") || {};
  const current = Number(flags.current ?? 0);
  const zoneId = regionDoc.getFlag("hollows", "zoneId") || regionDoc.name || "Zone";
  return { current, zoneId };
}

/** Find the zone at a canvas point. */
function getZoneByPoint(x, y, elevation = 0, scene = canvas?.scene) {
  const regions = scene?.regions?.contents || [];
  for (const region of regions) {
    if (!region.getFlag("hollows", "lairRegion")) continue;
    try {
      if (region.testPoint({ x, y, elevation })) {
        return region.getFlag("hollows", "zoneId") || region.name || null;
      }
    } catch (err) {
      console.warn("Hollows | Region testPoint failed", err);
    }
  }
  return null;
}

/** Read a token's zone from Region membership. */
function getTokenZoneFromRegionMembership(tokenLike) {
  const doc = tokenLike?.document || tokenLike;
  const scene = doc?.parent || canvas?.scene;
  const regionDocs = scene?.regions?.contents || [];
  const buckets = [doc?.regions, doc?.object?.regions, tokenLike?.regions, tokenLike?.object?.regions];
  const seen = new Set();
  for (const bucket of buckets) {
    if (!bucket) continue;
    for (const entry of Array.from(bucket)) {
      let region = entry;
      if (typeof entry === "string") region = regionDocs.find((r) => r.id === entry);
      else if (entry?.document) region = entry.document;
      else if (entry?.id && !entry.getFlag) region = regionDocs.find((r) => r.id === entry.id) || entry;
      if (!region || seen.has(region.id)) continue;
      seen.add(region.id);
      if (region.getFlag?.("hollows", "lairRegion")) return region.getFlag("hollows", "zoneId") || region.name || null;
    }
  }
  return null;
}

/** Calculate a TokenDocument center when no token object exists. */
function getTokenDocumentCenter(doc) {
  const x = Number(doc?.x);
  const y = Number(doc?.y);
  const width = Number(doc?.width ?? 1);
  const height = Number(doc?.height ?? 1);
  const scene = doc?.parent || canvas?.scene;
  const gridSize = Number(scene?.grid?.size ?? canvas?.grid?.size ?? 100);
  if ([x, y, width, height, gridSize].some(Number.isNaN)) return null;
  return {
    x: x + (width * gridSize) / 2,
    y: y + (height * gridSize) / 2,
  };
}

/** Find the zone occupied by a token. */
export function getTokenZone(token) {
  if (!token) return null;
  const byMembership = getTokenZoneFromRegionMembership(token);
  if (byMembership) return byMembership;

  const center = token.center ?? token.getCenterPoint?.() ?? token.object?.center ?? getTokenDocumentCenter(token.document || token);
  if (!center) return null;
  const elevation = token.document?.elevation ?? token.elevation ?? 0;
  const scene = (token.document || token)?.parent || canvas?.scene;
  return getZoneByPoint(center.x, center.y, elevation, scene);
}

/** Find an actor's token on the current scene. */
export function getActorTokenOnScene(actor) {
  if (!actor) return null;
  const controlled = canvas?.tokens?.controlled || [];
  const controlledToken = controlled.find((t) => t.actor?.id === actor.id);
  if (controlledToken) return controlledToken;
  return canvas?.tokens?.placeables?.find((t) => t.actor?.id === actor.id) || null;
}

/** Find the zone occupied by an actor. */
export function getActorZone(actor) {
  const token = getActorTokenOnScene(actor);
  if (!token) return null;
  return getTokenZone(token);
}

/** Check whether a zone is Close. */
export function isCloseZone(zone) {
  return ZONE_GROUPS.close.includes(zone);
}

/** Check whether a zone is Ranged. */
export function isRangedZone(zone) {
  return ZONE_GROUPS.ranged.includes(zone);
}

/** List lair zones on a scene. */
export function getZoneList(scene = canvas?.scene) {
  const regions = scene?.regions?.contents || [];
  const zones = [];
  for (const region of regions) {
    if (!region.getFlag("hollows", "lairRegion")) continue;
    const zoneId = region.getFlag("hollows", "zoneId") || region.name;
    if (zoneId && !zones.includes(zoneId)) zones.push(zoneId);
  }
  return zones;
}

/** Find the region document for a zone. */
export function getZoneRegionDoc(zoneId, scene = canvas?.scene) {
  if (!zoneId) return null;
  const regions = scene?.regions?.contents || [];
  return regions.find((r) => {
    if (!r.getFlag("hollows", "lairRegion")) return false;
    const rid = r.getFlag("hollows", "zoneId") || r.name || "";
    return rid === zoneId;
  }) || null;
}

/** List lair regions that can hold Threat. */
export function getThreatRegionDocs(scene = canvas?.scene) {
  const regions = scene?.regions?.contents || [];
  return regions.filter((r) => {
    if (!r.getFlag("hollows", "lairRegion")) return false;
    const zoneId = r.getFlag("hollows", "zoneId") || r.name || "";
    return isThreatZone(zoneId);
  });
}

/** Count Threat in a zone. */
export function getThreatInZone(zoneId, scene = canvas?.scene) {
  const region = getZoneRegionDoc(zoneId, scene);
  if (!region) return 0;
  return Math.max(0, Number(getRegionThreatData(region).current) || 0);
}

/** Count Curse in a zone. */
export function getZoneCurseValue(zoneId) {
  const region = getZoneRegionDoc(zoneId);
  if (!region) return 0;
  const data = getRegionCurseData(region);
  return Math.max(0, Number(data?.current ?? 0));
}

// Curse / threat aggregations over a zone list. Callers pass an explicit list
// (empty = none); "all zones" callers pass getZoneList(). Shared by restoreResolve
// (action-flow) and passive Modify-By-X (entity-stats).
/** Sum Curse across zones. */
export function sumCurseInZones(zones) {
  return (zones || []).reduce((sum, z) => sum + Math.max(0, Number(getZoneCurseValue(z)) || 0), 0);
}

/** Sum Threat across zones. */
export function sumThreatInZones(zones) {
  return (zones || []).reduce((sum, z) => sum + Math.max(0, Number(getThreatInZone(z)) || 0), 0);
}

/** Sum Curse carried by hunters in zones. */
export function sumCurseOnHunters(zones) {
  const set = new Set(zones || []);
  return sceneHunterTokens()
    .filter((t) => set.has(getTokenZone(t)))
    .reduce((sum, t) => sum + Math.max(0, Number(t.actor?.system?.curse?.value ?? 0) || 0), 0);
}

/** List zones adjacent to a zone. */
export function getAdjacentZones(zone) {
  return ZONE_ADJACENCY[zone] ? Array.from(ZONE_ADJACENCY[zone]) : [];
}

/** Keep zones from one group. */
export function filterZonesByGroup(zones, group) {
  const list = ZONE_GROUPS[group] || [];
  return zones.filter((z) => list.includes(z));
}

/** Resolve zones allowed by a Threat placement rule. */
export function resolveThreatPlacementZones(rule, scene = canvas?.scene) {
  const zones = getZoneList(scene).filter(isThreatZone);
  const scope = String(rule?.scope || "all");
  switch (scope) {
    case "close":
    case "ranged": return filterZonesByGroup(zones, scope);
    case "withHunters": return zones.filter((z) => getHuntersInZone(z, scene).length > 0);
    case "select": return zones.filter((z) => (rule?.zones || []).includes(z));
    default: return zones;
  }
}

// ─── Actor / Scene Queries ─────────────────────────────────────────────

/** Find the active Entity actor. */
export function getActiveEntityActor() {
  const scene = canvas?.scene;
  if (scene?.tokens?.size) {
    const tokenDoc = scene.tokens.contents.find(t => t.actor?.type === "entity");
    if (tokenDoc?.actor) return tokenDoc.actor;
  }
  return game.actors.find(a => a.type === "entity") || null;
}

/** List hunter actors on a scene. */
export function getActiveSceneHunters(scene = canvas?.scene) {
  const sourceScene = scene || game.scenes?.active || null;
  if (canvas?.scene && sourceScene && (canvas.scene.id === sourceScene.id)) {
    const unique = new Map();
    for (const token of canvas.tokens?.placeables || []) {
      const actor = token?.actor;
      if (actor?.type === "hunter") unique.set(actor.id, actor);
    }
    return Array.from(unique.values());
  }
  return (sourceScene?.tokens?.contents || [])
    .map((tokenDoc) => tokenDoc.actor)
    .filter((actor) => actor?.type === "hunter");
}

/** Count hunter actors on a scene. */
export function getActiveSceneHunterCount(scene = canvas?.scene) {
  const unique = new Map();
  for (const actor of getActiveSceneHunters(scene)) unique.set(actor.id, actor);
  return unique.size;
}

/** List hunter actors in a zone. */
export function getHuntersInZone(zone, scene = canvas?.scene) {
  const unique = new Map();
  for (const token of getHunterTokensInZone(zone, scene)) {
    if (token.actor) unique.set(token.actor.id, token.actor);
  }
  return Array.from(unique.values()).sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}

/** List hunter tokens in a zone. */
export function getHunterTokensInZone(zone, scene = canvas?.scene) {
  if (!zone) return [];
  const tokens = canvas?.scene?.id === scene?.id
    ? sceneHunterTokens()
    : (scene?.tokens?.contents || []).filter((tokenDoc) => tokenDoc.actor?.type === "hunter");
  return tokens
    .filter(t => getTokenZone(t) === zone)
    .sort((a, b) => String(a.name || a.actor?.name || "").localeCompare(String(b.name || b.actor?.name || "")));
}

/** List hunter tokens on the canvas. */
export function sceneHunterTokens() {
  return canvas?.tokens?.placeables?.filter((t) => t.actor?.type === "hunter") || [];
}

/** Find the active Hollow actor. */
export function getActiveHollowActor() {
  return game.actors.find(a => a.type === "hollow" && String(a.system?.status || "") === "active") || null;
}

/** Find the current user's hunter. */
export function getActiveHunterForUser() {
  const controlled = canvas?.tokens?.controlled || [];
  const token = controlled.find(t => t.actor?.type === "hunter");
  if (token?.actor) return token.actor;
  const character = game.user?.character;
  if (character?.type === "hunter") return character;
  return null;
}

/** List all hunter actors by name. */
export function getAllHuntersSorted() {
  return game.actors.contents
    .filter(a => a?.type === "hunter")
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}
