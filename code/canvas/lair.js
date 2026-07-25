import { HOLLOWS_LAIR_TEMPLATE } from "../data/_module.mjs";

function getSceneRect(scene) {
  const d = scene?.dimensions;
  if (d?.sceneRect) {
    return {
      x: d.sceneRect.x ?? 0,
      y: d.sceneRect.y ?? 0,
      width: d.sceneRect.width ?? 0,
      height: d.sceneRect.height ?? 0
    };
  }
  const width = d?.sceneWidth ?? d?.width ?? scene?.width ?? 0;
  const height = d?.sceneHeight ?? d?.height ?? scene?.height ?? 0;
  const x = d?.sceneX ?? d?.rect?.x ?? 0;
  const y = d?.sceneY ?? d?.rect?.y ?? 0;
  return { x, y, width, height };
}

async function ensureGridOverlay(scene, style) {
  if (!scene) return;
  const gridSrc = style === "black"
    ? "systems/hollows/assets/hollows-grid-black.webp"
    : "systems/hollows/assets/hollows-grid-white.webp";
  const existing = scene.tiles?.contents?.find(t => t.getFlag("hollows", "gridOverlay"));
  const rect = getSceneRect(scene);
  const sceneW = rect.width;
  const sceneH = rect.height;
  if (!sceneW || !sceneH) return;

  let texture = null;
  try {
    texture = await foundry.canvas.loadTexture(gridSrc);
  } catch (err) {
    console.warn("Hollows | Failed to load grid texture", err);
  }
  const imgW = texture?.baseTexture?.width ?? sceneW;
  const imgH = texture?.baseTexture?.height ?? sceneH;
  game.hollowsLairImageSize = { width: imgW, height: imgH };
  const scale = Math.min(sceneW / imgW, sceneH / imgH);
  const width = Math.round(imgW * scale);
  const height = Math.round(imgH * scale);
  const centerX = rect.x + sceneW / 2;
  const centerY = rect.y + sceneH / 2;
  const x = Math.round(centerX);
  const y = Math.round(centerY);

  const tileData = {
    texture: { src: gridSrc },
    x,
    y,
    width,
    height,
    alpha: 1,
    rotation: 0,
    hidden: false,
    locked: true,
    overhead: false,
    flags: { hollows: { gridOverlay: true } }
  };

  if (existing) {
    await existing.update(tileData);
  } else {
    await scene.createEmbeddedDocuments("Tile", [tileData]);
  }
}

async function removeGridOverlay(scene) {
  if (!scene) return;
  const existing = scene.tiles?.contents?.filter(t => t.getFlag("hollows", "gridOverlay")) || [];
  if (existing.length) {
    await scene.deleteEmbeddedDocuments("Tile", existing.map(t => t.id));
  }
}

function buildLairRegions(scene) {
  const rect = getSceneRect(scene);
  const sceneW = rect.width;
  const sceneH = rect.height;
  if (!sceneW || !sceneH) return [];
  const tRect = HOLLOWS_LAIR_TEMPLATE.rect;
  const imgW = game.hollowsLairImageSize?.width ?? tRect.width;
  const imgH = game.hollowsLairImageSize?.height ?? tRect.height;

  const templateScale = Math.min(tRect.width / imgW, tRect.height / imgH);
  const templateOffsetX = tRect.x + (tRect.width - imgW * templateScale) / 2;
  const templateOffsetY = tRect.y + (tRect.height - imgH * templateScale) / 2;

  const scale = Math.min(sceneW / imgW, sceneH / imgH);
  const offsetX = rect.x + (sceneW - imgW * scale) / 2;
  const offsetY = rect.y + (sceneH - imgH * scale) / 2;
  const regions = [];
  for (const region of HOLLOWS_LAIR_TEMPLATE.regions) {
    const shapes = region.shapes.map((shape) => {
      if (shape.type === "polygon" && Array.isArray(shape.points)) {
        const points = [];
        for (let i = 0; i < shape.points.length; i += 2) {
          const localX = (shape.points[i] - templateOffsetX) / templateScale;
          const localY = (shape.points[i + 1] - templateOffsetY) / templateScale;
          const x = offsetX + localX * scale;
          const y = offsetY + localY * scale;
          points.push(x, y);
        }
        return { type: "polygon", points, hole: !!shape.hole };
      }
      if (shape.type === "rectangle") {
        return {
          type: "rectangle",
          x: offsetX + ((shape.x - templateOffsetX) / templateScale) * scale,
          y: offsetY + ((shape.y - templateOffsetY) / templateScale) * scale,
          width: shape.width * scale,
          height: shape.height * scale,
          rotation: shape.rotation || 0
        };
      }
      return shape;
    });
    regions.push({
      name: region.name,
      shapes,
      flags: {
        hollows: {
          lairRegion: true,
          zoneId: region.name,
          threat: { current: 0, max: 0 }
        }
      }
    });
  }
  return regions;
}

async function ensureLairRegions(scene) {
  if (!scene) return;
  const existing = scene.regions?.contents?.filter(r => r.getFlag("hollows", "lairRegion")) || [];
  if (existing.length) {
    await scene.deleteEmbeddedDocuments("Region", existing.map(r => r.id));
  }
  const regions = buildLairRegions(scene);
  if (regions.length) {
    await scene.createEmbeddedDocuments("Region", regions);
  }
}

export async function applyEntityLair(scene, style, { refreshThreatOverlays } = {}) {
  if (!scene) return;
  await ensureGridOverlay(scene, style);
  await ensureLairRegions(scene);
  if (typeof refreshThreatOverlays === "function") refreshThreatOverlays();
}

export async function clearEntityLair(scene, { refreshThreatOverlays } = {}) {
  if (!scene) return;
  await removeGridOverlay(scene);
  const existing = scene.regions?.contents?.filter(r => r.getFlag("hollows", "lairRegion")) || [];
  if (existing.length) {
    await scene.deleteEmbeddedDocuments("Region", existing.map(r => r.id));
  }
  if (typeof refreshThreatOverlays === "function") refreshThreatOverlays();
}
