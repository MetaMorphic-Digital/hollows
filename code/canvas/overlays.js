import {
  getActiveEntityActor,
  getActiveHollowActor,
  getRegionThreatData,
  getRegionCurseData,
  getThreatInZone,
  getZoneCurseValue,
  getZoneList,
  getAdjacentZones,
  isCloseZone,
  isRangedZone,
  isThreatZone,
} from "./zone.js";
import { HOLLOWS_LAIR_LABEL_OFFSETS } from "../data/_module.mjs";

// ─── Math helpers ──────────────────────────────────────────────────────

export function clampThreat(value, max) {
  if (Number.isNaN(value)) return 0;
  if (max > 0) return Math.max(0, Math.min(max, value));
  return Math.max(0, value);
}

// ─── Curse config ──────────────────────────────────────────────────────

export function getActiveCurseConfig() {
  const entity = getActiveEntityActor();
  const curse = entity?.system?.curse || {};
  return {
    entity,
    enabled: !!curse.enabled,
    targets: {
      hunter: !!curse?.targets?.hunter,
      entity: !!curse?.targets?.entity,
      zone: !!curse?.targets?.zone,
    },
  };
}

// ─── Region center helper ──────────────────────────────────────────────

function getRegionCenter(regionObj) {
  if (!regionObj) return null;
  if (regionObj.center) return regionObj.center;
  if (regionObj.bounds) {
    return {
      x: regionObj.bounds.x + regionObj.bounds.width / 2,
      y: regionObj.bounds.y + regionObj.bounds.height / 2,
    };
  }
  if (regionObj.shape?.getBounds) {
    const b = regionObj.shape.getBounds();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }
  if (regionObj.document?.x !== undefined && regionObj.document?.y !== undefined) {
    return { x: regionObj.document.x, y: regionObj.document.y };
  }
  return null;
}

// ─── Threat mutations ──────────────────────────────────────────────────

async function updateRegionThreat(regionDoc, next) {
  const data = getRegionThreatData(regionDoc);
  if (!isThreatZone(data.zoneId)) return;
  const current = clampThreat(next, data.max);
  await regionDoc.setFlag("hollows", "threat", {
    current,
    max: data.max,
  });
}

export async function addThreatToZone(zoneId, amount = 1, opts = {}) {
  if (!zoneId || !canvas?.scene) return false;
  const regionObj = (canvas.regions?.placeables || []).find((r) => {
    const doc = r.document || r;
    if (!doc.getFlag("hollows", "lairRegion")) return false;
    const rid = doc.getFlag("hollows", "zoneId") || doc.name;
    return rid === zoneId;
  });
  const region = regionObj?.document || regionObj;
  if (!region) return false;

  const data = getRegionThreatData(region);
  if (!isThreatZone(data.zoneId)) return false;
  const delta = Number(amount ?? 0);
  if (delta > 0 && !opts.skipLockCheck) {
    const { getThreatLockedZones } = await import("../helpers/weapon-abilities/dispatchers.js");
    if (getThreatLockedZones("placement").has(data.zoneId)) {
      ui.notifications?.info?.(`Threat discarded — ${data.zoneId} is locked.`);
      return false;
    }
  }
  const next = clampThreat(data.current + (Number.isNaN(delta) ? 0 : delta), data.max);

  try {
    await region.update({
      "flags.hollows.threat.current": next,
      "flags.hollows.threat.max": data.max,
    });
  } catch (err) {
    console.warn("Hollows | Region update failed, falling back to setFlag", err);
    await region.setFlag("hollows", "threat", {
      current: next,
      max: data.max,
    });
  }

  refreshThreatOverlays();
  if (delta > 0 && game.user?.isGM && !opts.skipReactionDispatch) {
    try {
      const { runOnThreatPlaced } = await import("../helpers/weapon-abilities/dispatchers.js");
      await runOnThreatPlaced(zoneId, delta);
    } catch (err) {
      console.warn("Hollows | runOnThreatPlaced failed", err);
    }
  }
  return true;
}

export async function addThreatToZoneSafe(zoneId, amount = 1, opts = {}) {
  if (!zoneId) return false;
  if (game.user?.isGM) {
    return addThreatToZone(zoneId, amount, opts);
  }
  const { runGMQuery } = await import("../helpers/queries.js");
  return await runGMQuery("hollows.threatAdjust", {
    zoneId,
    amount: Number(amount || 0),
    opts,
  });
}

export async function spendThreatFromZones(zoneIds, cost, context = {}) {
  let unique = Array.from(new Set((zoneIds || []).filter((z) => !!z)));
  const required = Math.max(0, Number(cost ?? 0) || 0);
  if (!required) return true;
  const { getThreatLockedZones } = await import("../helpers/weapon-abilities/dispatchers.js");
  const lockedForSpend = getThreatLockedZones("spend");
  if (lockedForSpend.size) unique = unique.filter((z) => !lockedForSpend.has(z));
  const zoneThreat = unique.map((zoneId) => ({ zoneId, current: getThreatInZone(zoneId) }));
  const available = zoneThreat.reduce((sum, z) => sum + z.current, 0);
  if (available < required) return false;

  let remaining = required;
  zoneThreat.sort((a, b) => b.current - a.current);
  for (const z of zoneThreat) {
    if (remaining <= 0) break;
    const use = Math.min(z.current, remaining);
    if (use > 0) {
      await addThreatToZone(z.zoneId, -use);
      if (game.user?.isGM && !context?.skipReactionDispatch) {
        try {
          const { runOnThreatSpent } = await import("../helpers/weapon-abilities/dispatchers.js");
          await runOnThreatSpent(z.zoneId, use, context);
        } catch (err) {
          console.warn("Hollows | runOnThreatSpent failed", err);
        }
      }
      remaining -= use;
    }
  }
  return remaining <= 0;
}

// ─── Curse mutations ───────────────────────────────────────────────────

export async function addCurseToZone(zoneId, amount = 1) {
  if (!zoneId || !canvas?.scene) return false;
  const regionObj = canvas.regions.placeables.find((r) => {
    const doc = r.document;
    if (!doc.getFlag("hollows", "lairRegion")) return false;
    const rid = doc.getFlag("hollows", "zoneId") || doc.name;
    return rid === zoneId;
  });
  const region = regionObj?.document;
  if (!region) return false;

  await region.updateRegionCurse(amount, true);
  refreshThreatOverlays();
  return true;
}

// ─── Curse / Threat shift (entity grid manoeuvres) ─────────────────────

function nextHopTowardZone(start, goal) {
  if (!start || !goal || start === goal) return null;
  const dist = { [goal]: 0 };
  const queue = [goal];
  while (queue.length) {
    const z = queue.shift();
    for (const nb of getAdjacentZones(z)) {
      if (nb === "Support") continue;
      if (dist[nb] === undefined) { dist[nb] = dist[z] + 1; queue.push(nb); }
    }
  }
  let best = null;
  let bestDist = Infinity;
  for (const nb of getAdjacentZones(start)) {
    if (nb === "Support") continue;
    if (dist[nb] !== undefined && dist[nb] < bestDist) { bestDist = dist[nb]; best = nb; }
  }
  return best;
}

/**
 * Shift Curse or Threat across the grid (entity manoeuvres / triggers), GM-side.
 * Snapshots current values, builds a from→to move list per `direction`, then
 * applies it — so swaps like Ebb & Flow resolve simultaneously. `amount` 0 = all.
 * Grid-global directions ignore `targetZone`; into/outFromTargetZone use it.
 */
export async function shiftGridResource({ resource = "threat", direction = "towardEntity", amount = 0, zone = "", targetZone = "" } = {}) {
  if (!game.user?.isGM) return;
  const has = (z) => (resource === "curse" ? getZoneCurseValue(z) : getThreatInZone(z));
  const cap = (n) => (amount > 0 ? Math.min(amount, n) : n);
  const moves = [];

  if (direction === "towardEntity" || direction === "awayFromEntity") {
    const wantClose = direction === "towardEntity";
    const sources = getZoneList().filter((z) => (wantClose ? isRangedZone(z) : isCloseZone(z)));
    for (const src of sources) {
      const n = cap(has(src));
      if (n <= 0) continue;
      const dest = getAdjacentZones(src).find((z) => (wantClose ? isCloseZone(z) : isRangedZone(z)));
      if (dest) moves.push({ from: src, to: dest, n });
    }
  } else if (direction === "towardZone") {
    if (zone) for (const src of getZoneList()) {
      if (src === zone || src === "Support") continue;
      const n = cap(has(src));
      if (n <= 0) continue;
      const dest = nextHopTowardZone(src, zone);
      if (dest) moves.push({ from: src, to: dest, n });
    }
  } else if (direction === "intoTargetZone") {
    if (targetZone) for (const src of getAdjacentZones(targetZone)) {
      if (src === "Support") continue;
      const n = cap(has(src));
      if (n > 0) moves.push({ from: src, to: targetZone, n });
    }
  } else if (direction === "outFromTargetZone") {
    if (targetZone) {
      const nbrs = getAdjacentZones(targetZone).filter((z) => z !== "Support");
      const ordered = [...nbrs.filter((z) => has(z) <= 0), ...nbrs.filter((z) => has(z) > 0)];
      let remaining = cap(has(targetZone));
      for (const dest of ordered) {
        if (remaining <= 0) break;
        moves.push({ from: targetZone, to: dest, n: 1 });
        remaining -= 1;
      }
    }
  } else if (direction === "intoAdjacentZone") {
    if (targetZone) {
      const n = cap(has(targetZone));
      const dests = getAdjacentZones(targetZone).filter((z) => z !== "Support");
      if (n > 0 && dests.length) {
        const { localShiftDialog } = await import("./threat-ops.js");
        const pick = await localShiftDialog(getActiveEntityActor(), {
          sources: [{ zone: targetZone, count: n }],
          destPerSource: { [targetZone]: dests },
          title: "Shift", amount: n, reason: "Shift",
          resource: resource === "curse" ? "Curse" : "Threat",
        });
        if (pick?.to && pick.to !== targetZone) moves.push({ from: targetZone, to: pick.to, n });
      }
    }
  }

  for (const m of moves) {
    if (resource === "curse") { await addCurseToZone(m.from, -m.n); await addCurseToZone(m.to, m.n); }
    else { await addThreatToZone(m.from, -m.n); await addThreatToZone(m.to, m.n); }
  }
}

// ─── Canvas overlays ───────────────────────────────────────────────────

export function refreshThreatOverlays() {
  if (!canvas?.ready || !canvas?.regions) return;
  if (canvas.controls?.hollowsThreat) {
    canvas.controls.hollowsThreat.destroy({ children: true });
    delete canvas.controls.hollowsThreat;
  }
  const layer = new PIXI.Container();
  layer.name = "hollowsThreat";
  layer.eventMode = "static";
  layer.interactiveChildren = true;
  canvas.controls?.addChild?.(layer);
  canvas.controls.hollowsThreat = layer;

  const regions = canvas.regions.placeables || [];
  const curseCfg = getActiveCurseConfig();
  const zoneCurseEnabled = curseCfg.enabled && curseCfg.targets.zone;
  for (const regionObj of regions) {
    const regionDoc = regionObj.document || regionObj;
    if (!regionDoc.getFlag("hollows", "lairRegion")) continue;
    const center = getRegionCenter(regionObj);
    if (!center) continue;
    const { current, max, zoneId } = getRegionThreatData(regionDoc);
    if (!isThreatZone(zoneId)) continue;
    const curse = zoneCurseEnabled ? getRegionCurseData(regionDoc).current : 0;
    const offset = HOLLOWS_LAIR_LABEL_OFFSETS[zoneId] || { x: 0, y: 0 };
    const threatValue = max > 0 ? `${current}/${max}` : `${current}`;
    const label = zoneCurseEnabled
      ? `${zoneId}\nThreat: ${threatValue}\nCurse: ${curse}`
      : `${zoneId}\nThreat: ${threatValue}`;

    const text = new PIXI.Text(label, {
      fontFamily: "Eczar, serif",
      fontSize: 14,
      fill: 0xf3e7d6,
      fontWeight: "700",
      align: "center",
    });
    text.anchor.set(0.5, 0.5);

    const paddingX = 8;
    const paddingY = 5;
    const bg = new PIXI.Graphics();
    bg.beginFill(0x120f12, 0.75);
    bg.lineStyle(1, 0x7b6a5a, 0.9);
    bg.drawRoundedRect(
      -text.width / 2 - paddingX,
      -text.height / 2 - paddingY,
      text.width + paddingX * 2,
      text.height + paddingY * 2,
      6,
    );
    bg.endFill();

    const container = new PIXI.Container();
    container.position.set(center.x + offset.x, center.y + offset.y);
    container.addChild(bg);
    container.addChild(text);

    if (game.user?.isGM) {
      container.eventMode = "static";
      container.interactiveChildren = false;
      container.hitArea = new PIXI.Rectangle(
        -text.width / 2 - paddingX,
        -text.height / 2 - paddingY,
        text.width + paddingX * 2,
        text.height + paddingY * 2,
      );
      container.cursor = "pointer";
      container.on("pointerdown", async (ev) => {
        const isShift = !!ev?.data?.originalEvent?.shiftKey;
        if (isShift && zoneCurseEnabled) {
          const cData = getRegionCurseData(regionDoc);
          if (ev?.data?.button === 2) {
            await regionDoc.updateRegionCurse(cData.current - 1);
          } else {
            await regionDoc.updateRegionCurse(cData.current + 1);
          }
        } else {
          const data = getRegionThreatData(regionDoc);
          if (ev?.data?.button === 2) {
            await updateRegionThreat(regionDoc, data.current - 1);
          } else {
            await updateRegionThreat(regionDoc, data.current + 1);
          }
        }
        refreshThreatOverlays();
      });
    }

    layer.addChild(container);
  }
  refreshHunterCurseBadges();
}

export function refreshTerrainPoolOverlay() {
  const elId = "hollows-terrain-pool-overlay";
  const existing = document.getElementById(elId);
  const entityToken = canvas?.scene?.tokens?.contents?.find(t => t.actor?.type === "entity") || null;
  const entity = entityToken?.actor || null;
  const hollow = getActiveHollowActor();
  const showDoom = !!hollow?.system?.doom?.show;
  if (!canvas?.ready || (!entity && !showDoom)) {
    if (existing) existing.remove();
    return;
  }
  const parts = [];
  if (entity) {
    const pool = entity.system?.terrainPool || {};
    const elevated = Number(pool.elevated ?? 0);
    const sheltered = Number(pool.sheltered ?? 0);
    parts.push(`Terrain Pool: E ${elevated} / S ${sheltered}`);
  }
  if (showDoom) {
    const current = Number(hollow.system?.doom?.current ?? 0);
    const cap = Number(hollow.system?.doom?.cap ?? 0);
    parts.push(`Doom: ${current}/${cap}`);
  }

  const container = existing || document.createElement("div");
  container.id = elId;
  container.className = "hollows-terrain-pool-overlay";
  container.textContent = parts.join(" | ");
  if (!existing) {
    const host = document.getElementById("ui-top") || document.getElementById("board") || document.body;
    host.appendChild(container);
  }
}

export function refreshHunterCurseBadges() {
  if (!canvas?.ready) return;
  if (canvas.controls?.hollowsCurse) {
    canvas.controls.hollowsCurse.destroy({ children: true });
    delete canvas.controls.hollowsCurse;
  }

  const cfg = getActiveCurseConfig();
  if (!cfg.enabled || (!cfg.targets.hunter && !cfg.targets.entity)) return;

  const layer = new PIXI.Container();
  layer.name = "hollowsCurse";
  canvas.controls?.addChild(layer);
  canvas.controls.hollowsCurse = layer;

  if (cfg.targets.hunter) {
    const hunters = canvas.tokens?.placeables.filter((t) => t.actor?.type === "hunter") || [];
    for (const token of hunters) {
      const actor = token.actor;
      const value = actor.system.curse.value;
      const label = `C${value}`;

      const text = new PIXI.Text(label, {
        fontFamily: "Eczar, serif",
        fontSize: 13,
        fill: 0xf2e8cf,
        fontWeight: "700",
        align: "center",
      });
      text.anchor.set(0.5, 0.5);

      const paddingX = 7;
      const paddingY = 4;
      const bg = new PIXI.Graphics();
      bg.beginFill(0x2a2f1d, value > 0 ? 0.85 : 0.55);
      bg.lineStyle(1, 0x8c7a4a, 0.95);
      bg.drawRoundedRect(
        -text.width / 2 - paddingX,
        -text.height / 2 - paddingY,
        text.width + paddingX * 2,
        text.height + paddingY * 2,
        6,
      );
      bg.endFill();

      const badge = new PIXI.Container();
      badge.position.set(token.x + token.w - 14, token.y + 14);
      badge.addChild(bg);
      badge.addChild(text);

      if (game.user.isGM) {
        badge.interactive = true;
        badge.cursor = "pointer";
        badge.on("pointerdown", async (ev) => {
          const oe = ev?.data?.originalEvent;
          const isShift = !!oe?.shiftKey;
          if (!isShift) return;
          oe?.preventDefault?.();
          oe?.stopPropagation?.();
          const delta = ev?.data?.button === 2 ? -1 : 1;
          await actor.update({ "system.curse.value": value + delta });
          refreshHunterCurseBadges();
        });
      }

      layer.addChild(badge);
    }
  }

  if (cfg.targets.entity) {
    const entityTokens = canvas.tokens?.placeables.filter((t) => t.actor?.type === "entity") || [];
    for (const token of entityTokens) {
      const actor = token.actor;
      const value = actor.system.curse.value;
      const label = `C${value}`;

      const text = new PIXI.Text(label, {
        fontFamily: "Eczar, serif",
        fontSize: 14,
        fill: 0xf2e8cf,
        fontWeight: "700",
        align: "center",
      });
      text.anchor.set(0.5, 0.5);

      const paddingX = 8;
      const paddingY = 5;
      const bg = new PIXI.Graphics();
      bg.beginFill(0x3a1f1f, value > 0 ? 0.88 : 0.55);
      bg.lineStyle(1, 0xb36d5b, 0.95);
      bg.drawRoundedRect(
        -text.width / 2 - paddingX,
        -text.height / 2 - paddingY,
        text.width + paddingX * 2,
        text.height + paddingY * 2,
        7,
      );
      bg.endFill();

      const badge = new PIXI.Container();
      badge.position.set(token.x + 16, token.y + 14);
      badge.addChild(bg);
      badge.addChild(text);

      if (game.user?.isGM) {
        badge.interactive = true;
        badge.cursor = "pointer";
        badge.on("pointerdown", async (ev) => {
          const oe = ev?.data?.originalEvent;
          const isShift = !!oe?.shiftKey;
          if (!isShift) return;
          oe?.preventDefault?.();
          oe?.stopPropagation?.();
          const delta = ev?.data?.button === 2 ? -1 : 1;
          await actor.update({ "system.curse.value": value + delta });
          refreshHunterCurseBadges();
        });
      }

      layer.addChild(badge);
    }
  }
}
