import { ActivatedAbility } from "../../data/mechanics/ActivatedAbility.js";
import { ApplyToZone } from "../../data/mechanics/ApplyToZone.js";
import { StartOfTurnAction } from "../../data/mechanics/StartOfTurnAction.js";
import { EndOfTurnAction } from "../../data/mechanics/EndOfTurnAction.js";
import { OnAttackResultAction } from "../../data/mechanics/OnAttackResultAction.js";
import { OnDefenceResultAction } from "../../data/mechanics/OnDefenceResultAction.js";
import { OnMoveAction } from "../../data/mechanics/OnMoveAction.js";
import { AttackDamageChange } from "../../data/mechanics/AttackDamageChange.js";
import { IncomingDamageModifier } from "../../data/mechanics/IncomingDamageModifier.js";
import { StatModifier } from "../../data/mechanics/StatModifier.js";
import { Mechanic } from "../../data/mechanics/Mechanic.js";
import ScriptField from "../../data/fields/script-field.mjs";
import { HOLLOWS_API as API, HOLLOWS_SYNC_API as SYNC_API } from "../../api.mjs";

/** A script triggered by a system game event. */
export class ScriptedEvent extends Mechanic {
  constructor(config = {}) {
    super(config);
    this.event = config.event;
    this.rateLimit = config.rateLimit;
  }
}

/** Compile item scripts into the existing mechanic classes. */
export default class ScriptCompiler {
  /** @type {WeakMap<Item, Map<string, {stamp: string, mechanics: Mechanic[]}>>} Cached results per script field. */
  static #cache = new WeakMap();

  /** @type {WeakMap<Item, Set<string>>} Errors already shown for each item. */
  static #reported = new WeakMap();

  /** @type {WeakMap<Actor, Set<string>>} Pending limited executions on this client. */
  static #running = new WeakMap();

  /** @type {symbol} Distinguishes a failed script from a successful void return. */
  static #failed = Symbol("script-failed");

  /**
   * Notify once per distinct error; log every occurrence.
   * @param {Item} item
   * @param {string} key
   * @param {*} error
   * @param {"compile"|"runtime"} phase
   */
  static #report(item, key, error, phase) {
    const message = String(error?.message ?? error);
    console.error(`Hollows | Script ${key} ${phase}`, error);
    let seen = this.#reported.get(item);
    if (!seen) this.#reported.set(item, seen = new Set());
    const stamp = JSON.stringify([phase, message]);
    if (seen.has(stamp)) return;
    seen.add(stamp);
    if (game.user.isGM) ui.notifications.error(game.i18n.format("HOLLOWS.SCRIPT.error", {
      key, message, phase: game.i18n.localize(`HOLLOWS.SCRIPT.phases.${phase}`),
    }));
  }

  /**
   * The source is trusted JavaScript and runs in the client's global scope.
   * @param {string} source
   * @param {boolean} sync
   * @returns {Function} Accepts H, actor and ctx.
   */
  static #compileBody(source, sync) {
    const Constructor = sync ? Function : Object.getPrototypeOf(async function() {}).constructor;
    return new Constructor("H", "actor", "ctx", `"use strict";
${source}
`);
  }

  /**
   * Return #failed on exceptions; a void return remains a successful result.
   * @param {Function} fn Compiled function.
   * @param {string} key
   * @param {boolean} sync
   * @param {Item} item
   * @returns {Function}
   */
  static #makeInvoker(fn, key, sync, item) {
    if (sync) return (actor, ctx = {}) => {
      try {
        const result = fn(SYNC_API, actor, { ...ctx, actor, item });
        if (result && (typeof result.then === "function")) {
          Promise.resolve(result).catch(error => this.#report(item, key, error, "runtime"));
          throw new TypeError(game.i18n.localize("HOLLOWS.SCRIPT.syncPromise"));
        }
        return result;
      } catch (error) {
        this.#report(item, key, error, "runtime");
        return this.#failed;
      }
    };
    return async (actor, ctx = {}, choice) => {
      try {
        return await fn(API, actor, { ...ctx, actor, item }, choice);
      } catch (error) {
        this.#report(item, key, error, "runtime");
        return this.#failed;
      }
    };
  }

  /** Send top-level documents by UUID; event payloads already contain serializable data. */
  static #serializeContext(ctx) {
    return Object.fromEntries(Object.entries(ctx).map(([key, value]) => [
      key, value instanceof foundry.abstract.Document ? { $scriptDocument: value.uuid } : value,
    ]));
  }

  /** Resolve document references on the receiving client. */
  static async #resolveContext(ctx) {
    return Object.fromEntries(await Promise.all(
      Object.entries(ctx).map(async ([key, value]) => [
        key, value?.$scriptDocument ? await fromUuid(value.$scriptDocument) : value,
      ]),
    ));
  }

  /**
   * Run the choice on the owner, then apply its result on the GM.
   * @param {Item} item
   * @param {string} key
   * @param {Actor} actor
   * @param {object} ctx
   * @param {boolean} apply Whether the handler has an applyOnGM callback.
   * @returns {Promise<*>} False when the owner declines.
   */
  static async #offerReaction(item, key, actor, ctx, apply) {
    const { primaryOwnerOf } = await import("../../helpers/reactions.js");
    const { runUserQuery, runGMQuery } = await import("../../helpers/queries.js");
    const request = { itemUuid: item.uuid, key, context: this.#serializeContext(ctx) };
    const owner = primaryOwnerOf(actor) || game.user;
    const choice = await runUserQuery(owner, "hollows.scriptReaction", {
      ...request, phase: "promptOnPlayer",
    }, { timeout: 300_000 });
    if ((choice == null) || (choice === false)) return false;
    if (!apply) return choice;
    return runGMQuery("hollows.scriptReaction", {
      ...request, phase: "applyOnGM", choice,
    }, { timeout: 300_000 });
  }

  /**
   * Resolve the current item and handler for either side of a script reaction.
   * @param {object} request Serialized query data.
   * @returns {Promise<*>} Callback result.
   */
  static async runReaction({ itemUuid, key, phase, context, choice }) {
    const item = await fromUuid(itemUuid);
    const mechanic = this.getMechanics(item.parent).find(entry => entry.key === key);
    const callback = mechanic[phase];
    const result = await callback(item.parent, await this.#resolveContext(context), choice);
    return result === this.#failed ? false : result;
  }

  /**
   * Block overlapping calls locally; record completed uses on the actor.
   * @param {Actor} actor Carrier actor.
   * @param {Mechanic} mechanic Compiled mechanic.
   * @param {Function} run Script invocation.
   * @returns {Promise<*>} Script result or the failure sentinel.
   */
  static async #limited(actor, mechanic, run) {
    if (!mechanic.rateLimit) return run();
    let running = this.#running.get(actor);
    if (!running) this.#running.set(actor, running = new Set());
    if (running.has(mechanic.key)) return this.#failed;
    running.add(mechanic.key);
    try {
      const { isRateLimited, markRateLimit } = await import("../../helpers/weapon-abilities/dispatchers.js");
      if (isRateLimited(actor, mechanic)) return this.#failed;
      const result = await run();
      if ((result !== this.#failed) && (result !== false)) await markRateLimit(actor, mechanic);
      return result;
    } finally {
      running.delete(mechanic.key);
    }
  }

  /**
   * Adapt script results to dispatcher contracts.
   * @param {string} hook Hook identifier.
   * @param {object} config Mechanic metadata.
   * @param {Function} invoke Bound script invocation.
   * @returns {Mechanic|null} A mechanic recognized by the existing dispatchers.
   */
  static #buildMechanic(hook, config, invoke) {
    switch (hook) {
      case "activated":
      case "applyToZone": {
        const Ability = hook === "activated" ? ActivatedAbility : ApplyToZone;
        const mechanic = new Ability({
          ...config, buttonAction: `script-${config.key}`, buttonLabel: config.name,
          cost: config.cost || (hook === "applyToZone" ? { condition: "ready" } : null),
        });
        mechanic.run = async (actor, ctx = {}) => {
          const result = await invoke(actor, ctx);
          if (result === this.#failed) return false;
          return result;
        };
        return mechanic;
      }
      case "startOfTurn": {
        const mechanic = new StartOfTurnAction(config);
        mechanic.run = async ({ actor, entity } = {}) =>
          this.#limited(actor, mechanic, () => invoke(actor, { entity }));
        return mechanic;
      }
      case "endOfTurn": {
        const mechanic = new EndOfTurnAction(config);
        mechanic.run = async actor => this.#limited(actor, mechanic, () => invoke(actor));
        return mechanic;
      }
      case "onAttackResult": {
        const mechanic = new OnAttackResultAction(config);
        mechanic.handler = async (actor, ctx) => {
          const result = await invoke(actor, ctx);
          if ((result === this.#failed) || (result === false)) return { cancelled: true };
          if ((result?.damageValue != null) && !Number.isFinite(result.damageValue)) return { cancelled: true };
          if ((result?.damageValueDelta != null) && !Number.isFinite(result.damageValueDelta)) {
            return { cancelled: true };
          }
          return result;
        };
        return mechanic;
      }
      case "onDefenceResult": {
        const mechanic = new OnDefenceResultAction({ ...config, result: "any" });
        mechanic.run = async (ctx = {}) => this.#limited(ctx.actor, mechanic, () => invoke(ctx.actor, ctx));
        return mechanic;
      }
      case "onMove": {
        const mechanic = new OnMoveAction(config);
        mechanic.run = async (ctx = {}) => {
          if (mechanic.ownerMoveOnly && !ctx.byOwner) return;
          return this.#limited(ctx.actor, mechanic, () => invoke(ctx.actor, ctx));
        };
        return mechanic;
      }
      case "onEvent": {
        const mechanic = new ScriptedEvent(config);
        mechanic.run = async (actor, payload = {}) =>
          this.#limited(actor, mechanic, () => invoke(actor, { event: mechanic.event.type, payload }));
        return mechanic;
      }
      case "statModifier": {
        const mechanic = new StatModifier(config);
        mechanic.value = (actor, stat) => {
          const result = invoke(actor, { stat });
          return Number.isFinite(result) ? result : 0;
        };
        return mechanic;
      }
      case "attackDamage": {
        const mechanic = new AttackDamageChange(config);
        mechanic.getDelta = (actor, ctx = {}) => {
          const result = invoke(actor, ctx);
          return {
            resolve: Number.isFinite(result?.resolve) ? result.resolve : 0,
            wounds: Number.isFinite(result?.wounds) ? result.wounds : 0,
          };
        };
        return mechanic;
      }
      case "incomingDamage": {
        const mechanic = new IncomingDamageModifier(config);
        mechanic.apply = async (ctx = {}) => {
          const carrier = ctx.carrier ?? ctx.target;
          const result = await this.#limited(carrier, mechanic, () => invoke(carrier, ctx));
          if (!Number.isFinite(result)) return null;
          return { damageValue: result, note: config.name };
        };
        return mechanic;
      }
      default:
        return null;
    }
  }

  /**
   * Cache per document instance so synthetic actors do not share compiled scripts.
   * @param {Item} item
   * @param {{path: string, text: string}} slot
   * @returns {Mechanic[]} Compiled mechanics; empty for disabled or invalid scripts.
   */
  static #compile(item, { path, text }) {
    const block = foundry.utils.getProperty(item, path);
    const source = String(block?.source ?? "");
    if (!block?.enabled || !source.trim()) return [];
    const multiple = block.mode === "multiple";
    const hook = block.hook || "activated";
    if (!multiple && !Object.hasOwn(ScriptField.hooks, hook)) return [];
    const key = `script.${item.id}.${path}`;
    const name = block.label || item.name || game.i18n.localize("HOLLOWS.SCRIPT.defaultName");
    const stamp = JSON.stringify([
      multiple, hook, block.rateLimit, block.on, block.eventType, name, text, item.system?.weaponType, source,
    ]);
    let cache = this.#cache.get(item);
    const cached = cache?.get(path);
    if (cached?.stamp === stamp) return cached.mechanics;
    let mechanics = [];
    try {
      const definitions = multiple ? this.#compileBody(source, true)() : {
        "": { ...block, hook, run: this.#compileBody(source, !!ScriptField.hooks[hook].sync) },
      };
      if (multiple && !foundry.utils.isPlainObject(definitions)) {
        throw new TypeError(game.i18n.localize("HOLLOWS.SCRIPT.invalidDefinitions"));
      }
      mechanics = Object.entries(definitions).map(([id, definition]) => {
        const reaction = definition.promptOnPlayer !== undefined;
        const event = definition.event || { type: definition.eventType };
        if (multiple) {
          if (!Object.hasOwn(ScriptField.hooks, definition.hook)) {
            throw new TypeError(game.i18n.format("HOLLOWS.SCRIPT.invalidHandlerOption", { id, field: "hook" }));
          }
          if (reaction && ScriptField.hooks[definition.hook].sync) {
            throw new TypeError(game.i18n.format("HOLLOWS.SCRIPT.invalidHandlerOption", { id, field: "promptOnPlayer" }));
          }
          if (reaction && (definition.run !== undefined)) {
            throw new TypeError(game.i18n.format("HOLLOWS.SCRIPT.invalidHandlerOption", { id, field: "run" }));
          }
          if (!reaction && (definition.applyOnGM !== undefined)) {
            throw new TypeError(game.i18n.format("HOLLOWS.SCRIPT.invalidHandlerOption", { id, field: "applyOnGM" }));
          }
          for (const [field, choices] of Object.entries({
            rateLimit: ScriptField.rateLimits, on: ScriptField.turnScopes, eventType: ScriptField.events,
          })) {
            if ((definition[field] !== undefined) && !Object.hasOwn(choices, definition[field])) {
              throw new TypeError(game.i18n.format("HOLLOWS.SCRIPT.invalidHandlerOption", { id, field }));
            }
          }
          if (definition.hook === "onEvent") {
            if ((definition.event !== undefined) && (definition.eventType !== undefined)) {
              throw new TypeError(game.i18n.format("HOLLOWS.SCRIPT.ambiguousEvent", { id }));
            }
            if (!Object.hasOwn(ScriptField.events, event.type)) {
              throw new TypeError(game.i18n.format("HOLLOWS.SCRIPT.invalidHandlerOption", { id, field: "event.type" }));
            }
          }
        }
        const sync = !!ScriptField.hooks[definition.hook].sync;
        const rateLimit = sync || !definition.rateLimit || (definition.rateLimit === "none")
          ? "" : definition.rateLimit;
        const handlerKey = multiple ? `${key}.${id}` : key;
        const run = reaction
          ? (_H, actor, ctx) => this.#offerReaction(item, handlerKey, actor, ctx, !!definition.applyOnGM)
          : definition.run;
        const mechanic = this.#buildMechanic(definition.hook, {
          key: handlerKey, name: definition.label || name, text: text || "",
          weapon: item.system?.weaponType || "", rateLimit,
          on: definition.on || "actor", event,
          timing: definition.timing, result: definition.result, weaponType: definition.weaponType,
          ownerMoveOnly: definition.ownerMoveOnly,
          cost: definition.cost, targetSelection: definition.targetSelection, subSelect: definition.subSelect,
        }, this.#makeInvoker(run, handlerKey, sync, item));
        mechanic.rateLimit = rateLimit;
        if (definition.available) {
          const available = this.#makeInvoker(definition.available, handlerKey, true, item);
          mechanic.available = actor => {
            const result = available(actor);
            return (result !== this.#failed) && result;
          };
        }
        if (definition.getLabel) {
          const getLabel = this.#makeInvoker(definition.getLabel, handlerKey, true, item);
          mechanic.getLabel = actor => {
            const result = getLabel(actor);
            return result === this.#failed ? mechanic.name : result;
          };
        }
        if (reaction) {
          mechanic.promptOnPlayer = this.#makeInvoker(definition.promptOnPlayer, handlerKey, false, item);
          if (definition.applyOnGM) {
            mechanic.applyOnGM = this.#makeInvoker(definition.applyOnGM, handlerKey, false, item);
          }
        }
        return mechanic;
      });
    } catch (error) {
      this.#report(item, key, error, "compile");
    }
    if (!cache) this.#cache.set(item, cache = new Map());
    cache.set(path, { stamp, mechanics });
    return mechanics;
  }

  /**
   * Renown scripts require enabled Renown; base scripts do not.
   * @param {Actor|null} actor Carrier actor.
   * @param {Function|null} [type] Mechanic constructor to select.
   * @returns {Mechanic[]} Actor's compiled mechanics.
   */
  static getMechanics(actor, type = null) {
    if (!globalThis.hollows?.settings?.allowCustomScripts) return [];
    const mechanics = [];
    for (const item of actor?.items ?? []) {
      for (const slot of item.scriptSlots) {
        if (!slot.enabled) continue;
        for (const mechanic of this.#compile(item, slot)) {
          if (!type || (mechanic instanceof type)) mechanics.push(mechanic);
        }
      }
    }
    return mechanics;
  }

  /**
   * Dispatch locally; the caller determines which client handles the event.
   * @param {Function} matches Predicate receiving an event descriptor.
   * @param {object} [context] Event context.
   * @param {Actor|null} [context.actor] Actor for a local event; null for a scene event.
   * @param {object} [context.payload] Event-specific data passed to the script.
   * @returns {Promise<void>}
   */
  static async runEvents(matches, { actor = null, payload = {} } = {}) {
    let carriers = actor ? [actor] : [];
    if (!actor && game.user.isGM) {
      const { getActiveSceneHunters } = await import("../../canvas/zone.js");
      carriers = getActiveSceneHunters();
    }
    for (const carrier of carriers) {
      for (const mechanic of this.getMechanics(carrier, ScriptedEvent)) {
        if (matches(mechanic.event)) await mechanic.run(carrier, payload);
      }
    }
  }
}
