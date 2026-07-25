import { ZONE_ADJACENCY, ZONE_GROUPS } from "../data/gameplay-constants.js";

export function isThreatZone(zoneId) {
  return !!zoneId && zoneId !== "Support";
}

export function getRegionThreatData(regionDoc) {
  const flags = regionDoc.getFlag("hollows", "threat") || {};
  const current = Number(flags.current ?? 0);
  const max = Number(flags.max ?? 0);
  const zoneId = regionDoc.getFlag("hollows", "zoneId") || regionDoc.name || "Zone";
  return { current, max, zoneId };
}

export function getRegionCurseData(regionDoc) {
  const flags = regionDoc.getFlag("hollows", "curse") || {};
  const current = Number(flags.current ?? 0);
  const zoneId = regionDoc.getFlag("hollows", "zoneId") || regionDoc.name || "Zone";
  return { current, zoneId };
}

export function getZoneByPoint(x, y, elevation = 0) {
  if (Number.isNaN(Number(x)) || Number.isNaN(Number(y))) return null;
  const regions = canvas?.scene?.regions?.contents || [];
  for (const region of regions) {
    if (!region.getFlag("hollows", "lairRegion")) continue;
    try {
      if (region.testPoint({ x: Number(x), y: Number(y), elevation })) {
        return region.getFlag("hollows", "zoneId") || region.name || null;
      }
    } catch (err) {
      console.warn("Hollows | Region testPoint failed", err);
    }
  }
  return null;
}

function getTokenZoneFromRegionMembership(tokenLike) {
  const doc = tokenLike?.document || tokenLike;
  const scene = doc?.parent || canvas?.scene;
  if (!scene) return null;
  const regionIndex = scene.regions?.contents || [];

  const normalizeRegion = (entry) => {
    if (!entry) return null;
    if (typeof entry === "string") {
      return regionIndex.find((r) => r.id === entry) || null;
    }
    if (entry.document) return entry.document;
    if (entry.id) {
      return regionIndex.find((r) => r.id === entry.id) || entry;
    }
    return null;
  };

  const buckets = [
    doc?.regions,
    doc?.object?.regions,
    tokenLike?.regions,
    tokenLike?.object?.regions
  ];

  const regions = [];
  for (const bucket of buckets) {
    if (!bucket) continue;
    const arr = Array.isArray(bucket) ? bucket : Array.from(bucket || []);
    for (const entry of arr) {
      const region = normalizeRegion(entry);
      if (!region) continue;
      if (!regions.some((r) => r.id === region.id)) regions.push(region);
    }
  }

  const lair = regions.filter((r) => r.getFlag?.("hollows", "lairRegion"));
  if (!lair.length) return null;
  const first = lair[0];
  return first.getFlag("hollows", "zoneId") || first.name || null;
}

export function getTokenZone(token) {
  if (!token) return null;
  const byMembership = getTokenZoneFromRegionMembership(token);
  if (byMembership) return byMembership;

  let center = token.center ?? token.getCenterPoint?.() ?? token.object?.center;
  if (!center) {
    const doc = token.document || token;
    const x = Number(doc?.x);
    const y = Number(doc?.y);
    const w = Number(doc?.width ?? 1);
    const h = Number(doc?.height ?? 1);
    const scene = doc?.parent || canvas?.scene;
    const gridSize = Number(scene?.grid?.size ?? canvas?.grid?.size ?? 100);
    if (!Number.isNaN(x) && !Number.isNaN(y) && !Number.isNaN(w) && !Number.isNaN(h)) {
      center = {
        x: x + (w * gridSize) / 2,
        y: y + (h * gridSize) / 2
      };
    }
  }
  if (!center) return null;
  const elevation = token.document?.elevation ?? token.elevation ?? 0;
  return getZoneByPoint(center.x, center.y, elevation);
}

export function getActorTokenOnScene(actor) {
  if (!actor) return null;
  const controlled = canvas?.tokens?.controlled || [];
  const controlledToken = controlled.find((t) => t.actor?.id === actor.id);
  if (controlledToken) return controlledToken;
  return canvas?.tokens?.placeables?.find((t) => t.actor?.id === actor.id) || null;
}

export function getActorZone(actor) {
  const token = getActorTokenOnScene(actor);
  if (!token) return null;
  return getTokenZone(token);
}

export function isCloseZone(zone) {
  return ["Front", "Rear", "Flank Left", "Flank Right"].includes(zone);
}

export function isRangedZone(zone) {
  const z = String(zone || "");
  if (!z) return false;
  if (["Ranged Left", "Ranged Front", "Ranged Right"].includes(z)) return true;
  return z.includes("Ranged");
}

export function getZoneList() {
  const regions = canvas?.scene?.regions?.contents || [];
  const zones = [];
  for (const region of regions) {
    if (!region.getFlag("hollows", "lairRegion")) continue;
    const zoneId = region.getFlag("hollows", "zoneId") || region.name;
    if (zoneId && !zones.includes(zoneId)) zones.push(zoneId);
  }
  return zones;
}

export function getZoneRegionDoc(zoneId, scene = canvas?.scene) {
  if (!zoneId) return null;
  const regions = scene?.regions?.contents || [];
  return regions.find((r) => {
    if (!r.getFlag("hollows", "lairRegion")) return false;
    const rid = r.getFlag("hollows", "zoneId") || r.name || "";
    return rid === zoneId;
  }) || null;
}

export function getThreatRegionDocs(scene = canvas?.scene) {
  const regions = scene?.regions?.contents || [];
  return regions.filter((r) => {
    if (!r.getFlag("hollows", "lairRegion")) return false;
    const zoneId = r.getFlag("hollows", "zoneId") || r.name || "";
    return isThreatZone(zoneId);
  });
}

export function getThreatInZone(zoneId, scene = canvas?.scene) {
  if (!zoneId || !scene) return 0;
  const region = (scene.regions?.contents || []).find((r) => {
    if (!r.getFlag("hollows", "lairRegion")) return false;
    const rid = r.getFlag("hollows", "zoneId") || r.name || "";
    return rid === zoneId;
  });
  if (!region) return 0;
  const data = getRegionThreatData(region);
  return Math.max(0, Number(data.current) || 0);
}

export function getZoneCurseValue(zoneId) {
  const region = getZoneRegionDoc(zoneId);
  if (!region) return 0;
  const data = getRegionCurseData(region);
  return Math.max(0, Number(data?.current ?? 0));
}

// Curse / threat aggregations over a zone list. Callers pass an explicit list
// (empty = none); "all zones" callers pass getZoneList(). Shared by restoreResolve
// (action-flow) and passive Modify-By-X (entity-stats).
export function sumCurseInZones(zones) {
  return (zones || []).reduce((sum, z) => sum + Math.max(0, Number(getZoneCurseValue(z)) || 0), 0);
}

export function sumThreatInZones(zones) {
  return (zones || []).reduce((sum, z) => sum + Math.max(0, Number(getThreatInZone(z)) || 0), 0);
}

export function sumCurseOnHunters(zones) {
  const set = new Set(zones || []);
  return (canvas?.tokens?.placeables || [])
    .filter((t) => t.actor?.type === "hunter" && set.has(getTokenZone(t)))
    .reduce((sum, t) => sum + Math.max(0, Number(t.actor?.system?.curse?.value ?? 0) || 0), 0);
}

export function getAdjacentZones(zone) {
  return ZONE_ADJACENCY[zone] ? Array.from(ZONE_ADJACENCY[zone]) : [];
}

export function filterZonesByGroup(zones, group) {
  const list = ZONE_GROUPS[group] || [];
  return zones.filter((z) => list.includes(z));
}

// ─── Actor / Scene Queries ─────────────────────────────────────────────

export function getActiveEntityActor() {
  const scene = canvas?.scene;
  if (scene?.tokens?.size) {
    const tokenDoc = scene.tokens.contents.find(t => t.actor?.type === "entity");
    if (tokenDoc?.actor) return tokenDoc.actor;
  }
  return game.actors.find(a => a.type === "entity") || null;
}

export function getActiveSceneHunters(scene = canvas?.scene) {
  const sourceScene = scene || game.scenes?.active || null;
  if (canvas?.scene && sourceScene && canvas.scene.id === sourceScene.id) {
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

export function getActiveSceneHunterCount(scene = canvas?.scene) {
  const unique = new Map();
  for (const actor of getActiveSceneHunters(scene)) unique.set(actor.id, actor);
  return unique.size;
}

export function getHuntersInZone(zone) {
  if (!zone) return [];
  const tokens = canvas?.tokens?.placeables || [];
  const hunters = tokens
    .filter(t => t.actor?.type === "hunter")
    .filter(t => getTokenZone(t) === zone)
    .map(t => t.actor)
    .filter(Boolean);
  const unique = new Map();
  for (const hunter of hunters) unique.set(hunter.id, hunter);
  return Array.from(unique.values()).sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}

export function getHunterTokensInZone(zone) {
  if (!zone) return [];
  const tokens = canvas?.tokens?.placeables || [];
  return tokens
    .filter(t => t.actor?.type === "hunter")
    .filter(t => getTokenZone(t) === zone)
    .sort((a, b) => String(a.name || a.actor?.name || "").localeCompare(String(b.name || b.actor?.name || "")));
}

export function sceneHunterTokens() {
  return canvas?.tokens?.placeables?.filter((t) => t.actor?.type === "hunter") || [];
}

export function getActiveHollowActor() {
  return game.actors.find(a => a.type === "hollow" && String(a.system?.status || "") === "active") || null;
}

export function getActiveHunterForUser() {
  const controlled = canvas?.tokens?.controlled || [];
  const token = controlled.find(t => t.actor?.type === "hunter");
  if (token?.actor) return token.actor;
  const character = game.user?.character;
  if (character?.type === "hunter") return character;
  return null;
}

export function getAllHuntersSorted() {
  return game.actors.contents
    .filter(a => a?.type === "hunter")
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}
