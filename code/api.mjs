import {
  getActorZone,
  getActorTokenOnScene,
  getTokenZone,
  getZoneList,
  getAdjacentZones,
  getHuntersInZone,
  getThreatInZone,
  getZoneCurseValue,
  isCloseZone,
  isRangedZone,
  isThreatZone,
  getActiveSceneHunters,
  getActiveEntityActor,
  getActiveHollowActor,
} from "./canvas/zone.js";
import {
  placeThreatFromHunter,
  removeThreatViaDialog,
  shiftThreatViaDialog,
  pickThreatRemovalsFromZones,
  removeThreatFromZones,
} from "./canvas/threat-ops.js";
import { getTerrainPoolValue, spendTerrainPoolTag } from "./canvas/terrain-pool.js";
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
  destroyTerrainCondition,
  destroyGridTerrain,
  requestTerrainConditionApply,
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
import { hasWeaponEquipped, hasWeaponAbility, isWeaponOfType, getShotgunWeapons, isShotgunLoaded } from "./helpers/weapon-utils.js";
import { getEffectiveWeaponDamage, getSelectedWeaponForm, getAvailableWeaponForms } from "./data/weapons/index.js";
import { buildMoveOutcomeCardHtml } from "./applications/ui/move-card.js";
import { Mechanic } from "./data/mechanics/Mechanic.js";

/** Operations exposed to mechanic scripts. */
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

  /** Resolve the actor's primary player owner. */
  static async owner(actor) {
    const { primaryOwnerOf } = await import("./helpers/reactions.js");
    return primaryOwnerOf(actor);
  }

  /** Update an actor through the GM when the caller lacks ownership. */
  static async updateActor(actor, changes) {
    const { default: HollowsActor } = await import("./documents/actor.mjs");
    return HollowsActor.updateSafe(actor, changes);
  }

  /** Apply a signed Threat delta, preserving placement locks and event options. */
  static async adjustThreat(zone, amount, options) {
    const { addThreatToZoneSafe } = await import("./canvas/overlays.js");
    return addThreatToZoneSafe(zone, amount, options);
  }

  /** Read the combat, round and combatant identifying a turn. */
  static async turnKey(combat = game.combat) {
    const { getCombatTurnKey } = await import("./helpers/combat-runtime.js");
    return getCombatTurnKey(combat);
  }

  /** Check a script's usage against the shared combat limiter. */
  static isUsed(actor, key, rateLimit) {
    return Mechanic.isRateLimited(actor, { key, rateLimit });
  }

  /** Record a script's use in the current combat turn. */
  static markUsed(actor, key) {
    return Mechanic.markRateLimit(actor, { key });
  }

  /** Set a terrain tag, optionally identifying its token for the GM query. */
  static setTerrain(actor, key, active = true, { tokenUuid = "", ...opts } = {}) {
    return requestTerrainConditionApply(actor, key, tokenUuid, active, opts);
  }

  /** Prepare an Interrupt item for a free use or a specified target. */
  static #interruptConfig(item, { free = false, target = null } = {}) {
    const config = foundry.utils.deepClone(item.toObject().system);
    if (target) {
      const zone = getActorZone(target);
      const allowed = config.profile.allowedZones;
      if (!isThreatZone(zone) || (allowed.length && !allowed.includes(zone))) return null;
      config.profile.allowedZones = [zone];
    }
    if (free) config.cost = { ...config.cost, enabled: false, amount: 0 };
    return config;
  }

  /** Check an Interrupt item's costs and targets with the requested overrides. */
  static async canInterrupt(entity, item, options = {}) {
    const { isInterruptFeasible } = await import("./data/entity/action-rules.js");
    const config = HollowsScriptAPI.#interruptConfig(item, options);
    return !!config && isInterruptFeasible(config, entity);
  }

  /** Run an Interrupt item, optionally waiving its cost and fixing its target. */
  static async interrupt(entity, item, { free = false, target = null } = {}) {
    const { triggerEntityInterrupt } = await import("./data/entity/actions/entity-interrupt.js");
    const config = HollowsScriptAPI.#interruptConfig(item, { free, target });
    if (!config) return false;
    return triggerEntityInterrupt(entity, config, item, {
      freeCost: free,
      forcedTargets: target ? [getActorTokenOnScene(target)] : [],
    });
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

  /** Run a manoeuvre on the caller's client, prompting when no name is supplied. */
  static async manoeuvre(actor, name, options) {
    const { runManoeuvre } = await import("./data/actions/index.js");
    return runManoeuvre(name, actor, options);
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

  /** Dispatch a Reload phase for actions that replace the normal Reload effect. */
  static async reloadEvent(actor, context) {
    const { runOnReload } = await import("./helpers/weapon-abilities/dispatchers.js");
    return runOnReload(actor, context);
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
    list: getZoneList,
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
    token: getActorTokenOnScene,
    owner: HollowsScriptAPI.owner,
    update: HollowsScriptAPI.updateActor,
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
    destroy: destroyTerrainCondition, destroyGrid: destroyGridTerrain, set: HollowsScriptAPI.setTerrain,
    pool: getTerrainPoolValue, spendPool: spendTerrainPoolTag,
  }),

  threat: Object.freeze({
    place: placeThreatFromHunter,
    remove: removeThreatViaDialog,
    shift: shiftThreatViaDialog,
    adjust: HollowsScriptAPI.adjustThreat,
    pickRemovals: pickThreatRemovalsFromZones,
    removeFromZones: removeThreatFromZones,
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
    forms: getAvailableWeaponForms,
    shotguns: getShotgunWeapons,
    isLoaded: isShotgunLoaded,
  }),

  stat: Object.freeze({
    total: HollowsScriptAPI.statTotal,
    roll: HollowsScriptAPI.statRoll,
  }),

  actions: Object.freeze({
    takeCover: HollowsScriptAPI.takeCover,
    grantManoeuvre: HollowsScriptAPI.grantManoeuvre,
    manoeuvre: HollowsScriptAPI.manoeuvre,
    focus: HollowsScriptAPI.focus,
    attack: HollowsScriptAPI.attack,
    reload: HollowsScriptAPI.reload,
    guard: HollowsScriptAPI.guard,
  }),

  events: Object.freeze({ swordFeint: HollowsScriptAPI.swordFeint, reload: HollowsScriptAPI.reloadEvent }),

  combat: Object.freeze({ turnKey: HollowsScriptAPI.turnKey, isUsed: HollowsScriptAPI.isUsed, markUsed: HollowsScriptAPI.markUsed }),

  entity: Object.freeze({ canInterrupt: HollowsScriptAPI.canInterrupt, interrupt: HollowsScriptAPI.interrupt }),

  effects: Object.freeze({ apply: applyEffects }),

  chat: Object.freeze({ post: HollowsScriptAPI.post, postHtml: HollowsScriptAPI.postHtml, moveCardHtml: buildMoveOutcomeCardHtml }),
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
  actors: Object.freeze({
    hunters: getActiveSceneHunters, entity: getActiveEntityActor, hollow: getActiveHollowActor, token: getActorTokenOnScene,
  }),
  weapon: Object.freeze({
    equipped: hasWeaponEquipped, isType: isWeaponOfType, hasAbility: hasWeaponAbility,
    damage: getEffectiveWeaponDamage, form: getSelectedWeaponForm, shotguns: getShotgunWeapons, isLoaded: isShotgunLoaded,
  }),
  resource: Object.freeze({ focusCount: getFocusCount }),
  combat: Object.freeze({ isUsed: HollowsScriptAPI.isUsed }),
  condition: Object.freeze({ has: HOLLOWS_API.condition.has }),
  terrain: Object.freeze({ tags: getActorTerrainTags, entityCounts: getEntityTerrainCounts, pool: getTerrainPoolValue }),
});
