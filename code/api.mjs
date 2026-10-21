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
  discardTerrainCondition,
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
import { hasWeaponEquipped, hasWeaponAbility, isWeaponOfType } from "./helpers/weapon-utils.js";
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

  /** Other hunters sharing the actor's zone. */
  static allies(actor) {
    const zone = getActorZone(actor);
    return zone ? getHuntersInZone(zone).filter(hunter => hunter.id !== actor.id) : [];
  }

  /** Open Take Cover with the same targeting and roll options as the action. */
  static async takeCover(actor, options) {
    const { openTakeCoverForActor } = await import("./data/actions/take-cover.js");
    return openTakeCoverForActor(actor, options);
  }

  /** Roll a hunter stat with the action's dialog and Focus options. */
  static async statRoll(actor, options, rollOptions) {
    const { HunterStatRollFlow } = await import("./dice/flow.js");
    return new HunterStatRollFlow(actor, options).roll(rollOptions);
  }

  /** Run a granted manoeuvre on the recipient's client. */
  static async grantManoeuvre(actor, manoeuvre, options) {
    const { grantManoeuvre } = await import("./data/actions/index.js");
    return grantManoeuvre(actor, manoeuvre, options);
  }

  /** Perform Focus, attributing the chat message to its source. */
  static async focus(actor, sourceActor) {
    const { applyFocusToActor } = await import("./data/actions/focus.js");
    return applyFocusToActor(actor, sourceActor);
  }

  /** Open an attack, including weaponless attacks and damage overrides. */
  static async attack(actor, options) {
    const { openAttackDialog } = await import("./data/actions/attack.js");
    return openAttackDialog(actor, options);
  }

  /** Open the Reload action and dispatch its weapon events. */
  static async reload(actor) {
    const { openReloadForActor } = await import("./data/actions/reload.js");
    return openReloadForActor(actor);
  }

  /** Open the Guard action and dispatch its events. */
  static async guard(actor) {
    const { openGuardDialogForActor } = await import("./data/actions/guard.js");
    return openGuardDialogForActor(actor);
  }

  /** Notify abilities that react to the actor's Feint. */
  static async swordFeint(actor) {
    const { runOnSwordFeint } = await import("./helpers/weapon-abilities/dispatchers.js");
    return runOnSwordFeint(actor);
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
    allies: HollowsScriptAPI.allies,
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

  terrain: Object.freeze({
    tags: getActorTerrainTags, entityCounts: getEntityTerrainCounts, discard: discardTerrainCondition,
  }),

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
    isType: isWeaponOfType,
    hasAbility: hasWeaponAbility,
    damage: getEffectiveWeaponDamage,
    form: getSelectedWeaponForm,
  }),

  stat: Object.freeze({
    total: HollowsScriptAPI.statTotal,
    roll: HollowsScriptAPI.statRoll,
  }),

  actions: Object.freeze({
    takeCover: HollowsScriptAPI.takeCover,
    grantManoeuvre: HollowsScriptAPI.grantManoeuvre,
    focus: HollowsScriptAPI.focus,
    attack: HollowsScriptAPI.attack,
    reload: HollowsScriptAPI.reload,
    guard: HollowsScriptAPI.guard,
  }),

  events: Object.freeze({ swordFeint: HollowsScriptAPI.swordFeint }),

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
  terrain: Object.freeze({ tags: getActorTerrainTags, entityCounts: getEntityTerrainCounts }),
});
