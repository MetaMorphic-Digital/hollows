// Helper facade for GM-authored scripts, handed to them as `H`. The only
// supported surface: these names stay put while the modules behind them move.
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
  hasCondition,
  setConditionSafe,
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

// Dynamic on purpose: a static import would close the cycle
// api -> hunter-combat -> script-compiler -> api. Also why the sync facade has
// no stat helper — a statModifier script would be summing its own contribution.
async function statTotal(actor, statKey) {
  const { getTotalStatForActor } = await import("./documents/actor/hunter-combat.js");
  return getTotalStatForActor(actor, statKey);
}

// Escapes by default; postHtml is the opt-in for markup.
async function post(message, actor = null) {
  return postHtml(foundry.utils.escapeHTML(String(message ?? "")), actor);
}

async function postHtml(html, actor = null) {
  if (!html) return null;
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker(actor ? { actor } : {}),
    content: `<div class="hollows-chat">${html}</div>`,
  });
}

export const HOLLOWS_API = Object.freeze({
  // Where things are on the grid.
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

  // Who is in play.
  actors: Object.freeze({
    hunters: getActiveSceneHunters,
    entity: getActiveEntityActor,
    hollow: getActiveHollowActor,
  }),

  // Resolve / Wounds / Focus.
  resource: Object.freeze({
    adjust: adjustHunterResource,
    adjustEntity: adjustEntityResource,
    spendResolve,
    focusCount: getFocusCount,
    setFocus: setFocusCount,
  }),

  // Raw addCondition/removeCondition are not exposed: they throw on a
  // non-owner client. set() routes through the GM instead.
  condition: Object.freeze({
    has: hasCondition,
    set: setConditionSafe,
  }),

  threat: Object.freeze({
    place: placeThreatFromHunter,
    remove: removeThreatViaDialog,
    shift: shiftThreatViaDialog,
  }),

  // Player-facing prompts. All async.
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

  // Async — see statTotal above.
  stat: Object.freeze({
    total: statTotal,
  }),

  // Run declarative DSL effects from a script when that is simpler than code.
  effects: Object.freeze({ apply: applyEffects }),

  chat: Object.freeze({ post, postHtml }),
});

// Shown in the editor glossary.
//   read   — safe on any client
//   routed — mutates, falls back to a GM query when the caller lacks rights
//   direct — mutates directly; GM or document owner only
export const HOLLOWS_API_LEVELS = Object.freeze({
  zone: "read",
  actors: "read",
  weapon: "read",
  stat: "read",
  resource: "routed",
  condition: "routed",
  threat: "direct",
  ask: "read",
  effects: "direct",
  chat: "direct",
});

// For sync hooks: an async helper here would resolve too late to be used.

export const HOLLOWS_SYNC_API = Object.freeze({
  zone: HOLLOWS_API.zone,
  actors: HOLLOWS_API.actors,
  weapon: HOLLOWS_API.weapon,
  resource: Object.freeze({ focusCount: getFocusCount }),
  condition: Object.freeze({ has: hasCondition }),
});

export const HOLLOWS_SYNC_API_LEVELS = Object.freeze({
  zone: "read", actors: "read", weapon: "read",
  resource: "read", condition: "read",
});
