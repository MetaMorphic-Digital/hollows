import {
  applyEntityLair as applyEntityLairCanvas,
  clearEntityLair as clearEntityLairCanvas,
} from "../canvas/lair.js";
import { getActiveHollowActor, getTokenZone } from "../canvas/zone.js";
import { refreshHunterCurseBadges, refreshTerrainPoolOverlay, refreshThreatOverlays } from "../canvas/overlays.js";
import { getFocusCount, setFocusCount } from "../documents/actor/resources.js";
import { hasEchoRestriction } from "../data/echo/index.js";
import { getDefaultHollowsAssetImage, isGenericFoundryImage } from "../utils/asset-utils.js";
import { refreshActiveEntityFromDoomChange } from "../data/entity/actions/entity-doom.js";
import {
  getDefaultHunterTokenConfig,
  shouldConfigureHunterTokenForActor,
  shouldConfigureHunterTokenForNewActor,
} from "../data/actor-models.js";
import { hasWeaponEquipped } from "./weapon-utils.js";
import { runOnMove, runTerrainDiscardOnMove } from "./weapon-abilities/dispatchers.js";
import { triggerUseOnManoeuvre } from "../data/actions/use.js";

function initTokenZoneCache() {
  if (!game.hollowsTokenZoneCache) game.hollowsTokenZoneCache = new Map();
  game.hollowsTokenZoneCache.clear();
  for (const token of canvas?.tokens?.placeables || []) {
    game.hollowsTokenZoneCache.set(token.id, getTokenZone(token) || "");
  }
}

export function registerCanvasHooks() {
  Hooks.on("canvasReady", () => {
    refreshThreatOverlays();
    refreshTerrainPoolOverlay();
    initTokenZoneCache();
  });

  Hooks.on("createRegion", () => refreshThreatOverlays());
  Hooks.on("updateRegion", () => refreshThreatOverlays());
  Hooks.on("deleteRegion", () => refreshThreatOverlays());

  Hooks.on("updateActor", (actor, changes) => {
    if (!actor || actor.type !== "entity") return;
    if (!foundry.utils.hasProperty(changes, "system.terrainPool")) return;
    refreshTerrainPoolOverlay();
  });

  Hooks.on("updateActor", async (actor, changes, options) => {
    if (!actor || actor.type !== "hunter") return;
    if (options?.hollowsAutoConfigure) return;
    if (!foundry.utils.hasProperty(changes, "prototypeToken")) return;
    if (actor.getFlag("hollows", "tokenCustomized")) return;
    await actor.setFlag("hollows", "tokenCustomized", true);
  });

  Hooks.on("preCreateActor", (actor, data) => {
    if (actor && ["thrall", "hazard"].includes(String(actor.type || ""))) {
      const defaultImg = getDefaultHollowsAssetImage(actor.type, actor.name, "");
      const currentImg = String(data?.img || actor.img || "").trim();
      const currentTokenImg = String(data?.prototypeToken?.texture?.src || actor.prototypeToken?.texture?.src || "").trim();
      const update = {};
      if (defaultImg && isGenericFoundryImage(currentImg)) {
        update.img = defaultImg;
      }
      if (defaultImg && isGenericFoundryImage(currentTokenImg)) {
        update.prototypeToken = foundry.utils.mergeObject(data?.prototypeToken || actor.prototypeToken?.toObject?.() || actor.prototypeToken || {}, {
          texture: { src: defaultImg },
        }, { inplace: false, insertKeys: true, insertValues: true, overwrite: true });
      }
      if (Object.keys(update).length) {
        actor.updateSource(update);
      }
    }
    if (!actor || actor.type !== "hunter") return;
    if (data?.flags?.hollows?.tokenCustomized) return;
    if (data?.flags?.hollows?.tokenConfigured) return;
    const defaults = getDefaultHunterTokenConfig();
    const existing = data.prototypeToken || {};
    const merged = foundry.utils.mergeObject(existing, defaults, { inplace: false, insertKeys: true, insertValues: true, overwrite: true });
    const flags = foundry.utils.mergeObject(merged.flags || {}, { hollows: { tokenConfigured: true } }, { inplace: false, insertKeys: true, insertValues: true, overwrite: false });
    data.prototypeToken = { ...merged, flags };
  });

  Hooks.on("createActor", async (actor) => {
    if (!actor || actor.type !== "hunter") return;
    if (!shouldConfigureHunterTokenForNewActor(actor)) return;
    const defaults = getDefaultHunterTokenConfig();
    const existing = actor.prototypeToken?.toObject ? actor.prototypeToken.toObject() : (actor.prototypeToken || {});
    const merged = foundry.utils.mergeObject(existing, defaults, { inplace: false, insertKeys: true, insertValues: true, overwrite: true });
    const flags = foundry.utils.mergeObject(merged.flags || {}, { hollows: { tokenConfigured: true } }, { inplace: false, insertKeys: true, insertValues: true, overwrite: false });
    await actor.update({ prototypeToken: { ...merged, flags } }, { hollowsAutoConfigure: true });
  });

  Hooks.on("preCreateItem", (item, data) => {
    if (!item) return;
    const category = String(data?.system?.category || item.system?.category || "");
    const defaultImg = getDefaultHollowsAssetImage(item.type, item.name, category);
    const currentImg = String(data?.img || item.img || "").trim();
    if (!defaultImg || !isGenericFoundryImage(currentImg)) return;
    item.updateSource({ img: defaultImg });
  });

  Hooks.on("createToken", (tokenDoc) => {
    refreshHunterCurseBadges();
    refreshTerrainPoolOverlay();
    if (!game.hollowsTokenZoneCache) game.hollowsTokenZoneCache = new Map();
    const zone = getTokenZone(tokenDoc.object || tokenDoc) || "";
    game.hollowsTokenZoneCache.set(tokenDoc.id, zone);
    const actor = tokenDoc?.actor;
    if (actor?.type === "hunter" && game.user?.isGM) {
      if (shouldConfigureHunterTokenForActor(actor, tokenDoc)) {
        const defaults = getDefaultHunterTokenConfig();
        tokenDoc.update({
          ...defaults,
          flags: foundry.utils.mergeObject(tokenDoc.flags || {}, { hollows: { tokenConfigured: true } }, { inplace: false, insertKeys: true, insertValues: true, overwrite: false }),
        }, { hollowsAutoConfigure: true });
      }
    }
  });

  Hooks.on("updateToken", (tokenDoc, changed, options) => {
    refreshHunterCurseBadges();
    if (Object.prototype.hasOwnProperty.call(changed || {}, "actorId")) {
      refreshTerrainPoolOverlay();
    }
    if (!options?.hollowsAutoConfigure) {
      const watched = ["disposition", "displayName", "displayBars", "actorLink", "bar1", "bar2"];
      const changedConfig = watched.some((k) => Object.prototype.hasOwnProperty.call(changed || {}, k));
      if (changedConfig && !tokenDoc.getFlag("hollows", "tokenCustomized")) {
        tokenDoc.setFlag("hollows", "tokenCustomized", true);
      }
    }
  });

  Hooks.on("deleteToken", (tokenDoc) => {
    refreshHunterCurseBadges();
    refreshTerrainPoolOverlay();
    if (game.hollowsTokenZoneCache) game.hollowsTokenZoneCache.delete(tokenDoc.id);
    if (game.hollowsSilkPrevZone) game.hollowsSilkPrevZone.delete(tokenDoc.id);
  });

  Hooks.on("preUpdateToken", (tokenDoc, changed, options, userId) => {
    const moved = Object.prototype.hasOwnProperty.call(changed || {}, "x") ||
      Object.prototype.hasOwnProperty.call(changed || {}, "y");
    if (!moved) return;
    if (!game.hollowsSilkPrevZone) game.hollowsSilkPrevZone = new Map();
    const prevZone = getTokenZone(tokenDoc.object || tokenDoc) || "";
    game.hollowsSilkPrevZone.set(tokenDoc.id, prevZone);
  });

  Hooks.on("updateToken", async (tokenDoc, changed, options, userId) => {
    const mover = userId ? game.users.get(userId) : null;
    const moved = Object.prototype.hasOwnProperty.call(changed || {}, "x") ||
      Object.prototype.hasOwnProperty.call(changed || {}, "y");
    if (!moved) return;
    if (!game.hollowsTokenZoneCache) game.hollowsTokenZoneCache = new Map();
    const prevZone = game.hollowsSilkPrevZone?.get(tokenDoc.id) || game.hollowsTokenZoneCache.get(tokenDoc.id) || "";
    const nextZone = getTokenZone(tokenDoc) || "";
    game.hollowsTokenZoneCache.set(tokenDoc.id, nextZone);
    if (game.hollowsSilkPrevZone) game.hollowsSilkPrevZone.delete(tokenDoc.id);
    const actor = tokenDoc?.actor;
    if (!actor || actor.type !== "hunter") return;
    if (prevZone && nextZone && prevZone !== nextZone) {
      if (hasEchoRestriction(actor, "moveFront") && nextZone === "Front") {
        ui.notifications.warn(`${actor.name} is burdened and should not move into Front on their turn.`);
      }
      if (hasEchoRestriction(actor, "moveSupport") && nextZone === "Support") {
        ui.notifications.warn(`${actor.name} is burdened and should not move into Support on their turn.`);
      }
    }
    if (nextZone === "Support" && prevZone !== "Support") {
      if (hasWeaponEquipped(actor, "Rifle") && getFocusCount(actor) > 0) {
        await setFocusCount(actor, 0);
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `<div class="hollows-chat"><strong>${actor.name}</strong> loses all <strong>Focus</strong> (entered Support).</div>`,
        });
      }
    }
    if (prevZone && nextZone && prevZone !== nextZone) {
      const movedByOwner = !!mover && !mover.isGM && !!actor?.testUserPermission?.(mover, "OWNER");
      await runTerrainDiscardOnMove(actor, { fromZone: prevZone, byOwner: movedByOwner });
      await runOnMove(actor, { fromZone: prevZone, toZone: nextZone, phase: "after", byOwner: movedByOwner });
      if (movedByOwner && game.user?.id === mover?.id) await triggerUseOnManoeuvre(actor, "move");
    }
  });

  Hooks.on("renderSceneConfig", (app, html) => {
    if (!game.user?.isGM) return;
    const doc = app.document || app.object || app.scene;
    if (!doc) return;
    const enabled = doc.getFlag("hollows", "entityLair")?.enabled ?? false;
    const gridStyle = doc.getFlag("hollows", "entityLair")?.gridStyle ?? "white";
    const el = html;
    const tabNames = ["basic", "grid", "lighting", "ambience", "ambiance", "scene", "background"];
    let container = null;
    for (const name of tabNames) {
      const tab = el.querySelector(`.tab[data-tab="${name}"]`);
      if (tab) { container = tab; break; }
    }
    if (!container) {
      container = el.querySelector(".tab") || el.querySelector("form") || el;
    }
    const block = `
      <fieldset class="hollows-scene-lair">
        <legend>Entity Lair</legend>
        <div class="form-group">
          <label>Enable Entity Lair</label>
          <input type="checkbox" name="flags.hollows.entityLair.enabled" ${enabled ? "checked" : ""}/>
        </div>
        <div class="form-group">
          <label>Grid Overlay</label>
          <select name="flags.hollows.entityLair.gridStyle">
            <option value="white" ${gridStyle === "white" ? "selected" : ""}>White</option>
            <option value="black" ${gridStyle === "black" ? "selected" : ""}>Black</option>
          </select>
        </div>
      </fieldset>
    `;
    container.insertAdjacentHTML("beforeend", block);
  });

  Hooks.on("updateScene", async (scene, data, options, userId) => {
    if (!game.user?.isGM) return;
    const flags = scene.getFlag("hollows", "entityLair") || {};
    const enabled = flags.enabled;
    if (!enabled) {
      if (data?.flags?.hollows?.entityLair?.enabled === false) {
        await clearEntityLairCanvas(scene, { refreshThreatOverlays });
      }
      return;
    }
    const changed =
      data?.flags?.hollows?.entityLair ||
      data?.background?.src ||
      data?.width ||
      data?.height ||
      data?.dimensions;
    if (changed) {
      await applyEntityLairCanvas(scene, flags.gridStyle || "white", { refreshThreatOverlays });
    }
  });

  Hooks.on("updateScene", (scene, changed) => {
    if (!scene) return;
    if (!foundry.utils.hasProperty(changed, "flags.hollows.doom")) return;
    if (getActiveHollowActor()) return;
    refreshActiveEntityFromDoomChange();
  });

  Hooks.on("updateItem", (item, changed, options) => {
    if (item?.parent?.type === "hunter" || item?.parent?.type === "entity") {
      if (options?.render === false) return;
      item.parent.render(false);
    }
  });

  Hooks.on("updateActor", (actor, changed, options) => {
    if (!actor) return;
    if (actor.type === "hollow") {
      if (
        foundry.utils.hasProperty(changed, "system.doom.current") ||
        foundry.utils.hasProperty(changed, "system.doom.cap") ||
        foundry.utils.hasProperty(changed, "system.doom.show") ||
        foundry.utils.hasProperty(changed, "system.status")
      ) {
        refreshTerrainPoolOverlay();
      }
      if (foundry.utils.hasProperty(changed, "system.doom.current")) refreshActiveEntityFromDoomChange();
      return;
    }
    if (actor.type === "hunter" && changed?.system?.curse) {
      refreshHunterCurseBadges();
      return;
    }
    if (actor.type === "entity" && changed?.system?.curse) {
      refreshThreatOverlays();
      refreshHunterCurseBadges();
      if (options?.render === false) return;
      actor.render(false);
    }
    if (actor.type === "entity" && changed?.system?.health) {
      if (options?.render === false) return;
      actor.render(false);
    }
  });
}
