import {
  getActorZone,
  getTokenZone,
  getAdjacentZones,
  getHuntersInZone,
  getThreatInZone,
  getZoneCurseValue,
  isCloseZone,
  isRangedZone,
  getActiveSceneHunters,
  getActiveEntityActor,
  getActiveHollowActor,
} from "./canvas/zone.js";
import {
  placeThreatFromHunter,
  removeThreatViaDialog,
  shiftThreatViaDialog,
} from "./canvas/threat-ops.js";
import {
  adjustHunterResource,
  adjustEntityResource,
  spendResolve,
  getFocusCount,
  setFocusCount,
} from "./documents/actor/resources.js";
import {
  setConditionSafe,
  getActorTerrainTags,
  getEntityTerrainCounts,
} from "./documents/actor/conditions.js";
import {
  pickOne,
  pickMany,
  confirmDialog,
  promptForm,
  chooseHunterInZone,
  chooseOneZone,
  chooseOneTarget,
} from "./applications/apps/selection-dialogs.mjs";
import { applyEffects } from "./data/mechanics/dsl/effects.js";
import { hasWeaponEquipped, hasWeaponAbility } from "./helpers/weapon-utils.js";
import { getEffectiveWeaponDamage, getSelectedWeaponForm } from "./data/weapons/index.js";

/** Chat and stat helpers for mechanic scripts. */
export class HollowsScriptAPI {
  /**
   * Load combat helpers on demand to avoid an import cycle.
   * @param {Actor} actor
   * @param {string} statKey
   * @returns {Promise<number>}
   */
  static async statTotal(actor, statKey) {
    const { getTotalStatForActor } = await import("./documents/actor/hunter-combat.js");
    return getTotalStatForActor(actor, statKey);
  }

  /**
   * Post escaped plain text to chat.
   * @param {string} message
   * @param {Actor|null} [actor] Speaker actor.
   * @returns {Promise<ChatMessage|null>} Null for an empty message.
   */
  static async post(message, actor = null) {
    return HollowsScriptAPI.postHtml(foundry.utils.escapeHTML(String(message ?? "")), actor);
  }

  /**
   * Post HTML without escaping it.
   * @param {string} html
   * @param {Actor|null} [actor] Speaker actor.
   * @returns {Promise<ChatMessage|null>} Null for an empty message.
   */
  static async postHtml(html, actor = null) {
    if (!html) return null;
    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker(actor ? { actor } : {}),
      content: `<div class="hollows-chat">${html}</div>`,
    });
  }
}

/** Passed to asynchronous scripts as H. */
export const HOLLOWS_API = Object.freeze({
  zone: Object.freeze({
    of: getActorZone,
    ofToken: getTokenZone,
    adjacent: getAdjacentZones,
    huntersIn: getHuntersInZone,
    threatIn: getThreatInZone,
    curseIn: getZoneCurseValue,
    isClose: isCloseZone,
    isRanged: isRangedZone,
  }),

  actors: Object.freeze({
    hunters: getActiveSceneHunters,
    entity: getActiveEntityActor,
    hollow: getActiveHollowActor,
  }),

  resource: Object.freeze({
    adjust: adjustHunterResource,
    adjustEntity: adjustEntityResource,
    spendResolve,
    focusCount: getFocusCount,
    setFocus: setFocusCount,
  }),

  condition: Object.freeze({
    has: (actor, key) => actor?.statuses.has(key) ?? false,
    set: setConditionSafe,
  }),

  terrain: Object.freeze({ tags: getActorTerrainTags, entityCounts: getEntityTerrainCounts }),

  threat: Object.freeze({
    place: placeThreatFromHunter,
    remove: removeThreatViaDialog,
    shift: shiftThreatViaDialog,
  }),

  ask: Object.freeze({
    confirm: confirmDialog,
    one: pickOne,
    many: pickMany,
    form: promptForm,
    hunterInZone: chooseHunterInZone,
    zone: chooseOneZone,
    target: chooseOneTarget,
  }),

  weapon: Object.freeze({
    equipped: hasWeaponEquipped,
    hasAbility: hasWeaponAbility,
    damage: getEffectiveWeaponDamage,
    form: getSelectedWeaponForm,
  }),

  stat: Object.freeze({
    total: HollowsScriptAPI.statTotal,
  }),

  effects: Object.freeze({ apply: applyEffects }),

  chat: Object.freeze({ post: HollowsScriptAPI.post, postHtml: HollowsScriptAPI.postHtml }),
});

/** Permission and prompt notes shown in the editor. */
export const HOLLOWS_API_NOTES = Object.freeze({
  stat: "HOLLOWS.SCRIPT.apiNotes.stat",
  resource: "HOLLOWS.SCRIPT.apiNotes.resource",
  condition: "HOLLOWS.SCRIPT.apiNotes.condition",
  threat: "HOLLOWS.SCRIPT.apiNotes.threat",
  ask: "HOLLOWS.SCRIPT.apiNotes.ask",
  effects: "HOLLOWS.SCRIPT.apiNotes.effects",
  chat: "HOLLOWS.SCRIPT.apiNotes.chat",
});

/** Synchronous hooks can only read state; async results would arrive too late. */
export const HOLLOWS_SYNC_API = Object.freeze({
  zone: HOLLOWS_API.zone,
  actors: HOLLOWS_API.actors,
  weapon: HOLLOWS_API.weapon,
  resource: Object.freeze({ focusCount: getFocusCount }),
  condition: Object.freeze({ has: HOLLOWS_API.condition.has }),
  terrain: HOLLOWS_API.terrain,
});
