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
import { StatOverride } from "../../data/mechanics/StatOverride.js";
import { AttackRollModifier } from "../../data/mechanics/AttackRollModifier.js";
import { EntityStatModifier } from "../../data/mechanics/EntityStatModifier.js";
import { EntityAbilityModifier } from "../../data/mechanics/EntityAbilityModifier.js";
import { TakeCoverModifier } from "../../data/mechanics/TakeCoverModifier.js";
import { getActiveSceneHunters, getActorZone } from "../../canvas/zone.js";
import { EntityActionPause } from "../../data/mechanics/EntityActionPause.js";
import { ThreatLock } from "../../data/mechanics/ThreatLock.js";
import { OnDeath } from "../../data/mechanics/OnDeath.js";
import { WeaponModifier } from "../../data/mechanics/WeaponModifier.js";
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

/** A script called by an action provider or interceptor. */
export class ScriptedProvider extends Mechanic {
  constructor(config = {}) {
    super(config);
    this.hook = config.hook;
    this.event = config.event;
    this.priority = config.priority || 0;
  }
}

/** Compile item scripts into the existing mechanic classes. */
export default class ScriptCompiler {
  /** Run item scripts for a gameplay event, passing each result to the next handler. */
  static async runInterceptors(event, ctx, value) {
    for (const mechanic of this.getProviders("interceptor", ctx.actor, ctx.item)) {
      if (mechanic.event !== event) continue;
      const actor = ctx.actor ?? mechanic.carrier;
      const carrier = mechanic.matchCarrier ? mechanic.matchCarrier(actor, { ...ctx, value }) : mechanic.carrier;
      if (!carrier) continue;
      const result = await mechanic.run(actor, { ...ctx, carrier, value });
      if (result != null) value = result;
    }
    return value;
  }

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
   * Supply script context and report callback errors.
   * @param {Function} fn
   * @param {string} key
   * @param {Item} item
   * @param {{sync?: boolean, routeToGM?: boolean, runOnGM?: boolean, combatOnly?: boolean, carrierIds?: string[], fallback?: *, api?: object}} [options]
   * @returns {Function} Returns the fallback on failure; void remains a successful result.
   */
  static #makeInvoker(fn, key, item, { sync = false, routeToGM = false, runOnGM = false, combatOnly = false, carrierIds, fallback = this.#failed, api = sync ? SYNC_API : API } = {}) {
    const context = (actor, ctx) => ({ carrier: item.parent, carrierIds, ...ctx, actor, item });
    if (sync) return (actor, ctx = {}) => {
      if (combatOnly && !game.combat?.started) return fallback;
      try {
        const result = fn(api, actor, context(actor, ctx));
        if (result && (typeof result.then === "function")) {
          Promise.resolve(result).catch(error => this.#report(item, key, error, "runtime"));
          throw new TypeError(game.i18n.localize("HOLLOWS.SCRIPT.syncPromise"));
        }
        return result;
      } catch (error) {
        this.#report(item, key, error, "runtime");
        return fallback;
      }
    };
    return async (actor, ctx = {}, choice) => {
      if (combatOnly && !game.combat?.started) return fallback;
      try {
        ctx = context(actor, ctx);
        if ((runOnGM && !game.user.isGM) || (routeToGM && !ctx.carrier.isOwner)) {
          return await this.#runOnGM(item, key, "execute", ctx);
        }
        return await fn(api, actor, ctx, choice);
      } catch (error) {
        this.#report(item, key, error, "runtime");
        return fallback;
      }
    };
  }

  /** Send documents and scene tokens by UUID, including target lists. */
  static #serializeContext(ctx) {
    if (!foundry.utils.isPlainObject(ctx)) return ctx;
    const serialize = value => {
      if (value?.document instanceof foundry.abstract.Document) {
        return { $scriptDocument: value.document.uuid, $scriptToken: true };
      }
      return value instanceof foundry.abstract.Document ? { $scriptDocument: value.uuid } : value;
    };
    return Object.fromEntries(Object.entries(ctx).map(([key, value]) =>
      [key, Array.isArray(value) ? value.map(serialize) : serialize(value)]));
  }

  /** Restore document and token references on the receiving client. */
  static async #resolveContext(ctx) {
    if (!foundry.utils.isPlainObject(ctx)) return ctx;
    const resolve = async value => {
      if (!value?.$scriptDocument) return value;
      const document = await fromUuid(value.$scriptDocument);
      return value.$scriptToken ? document.object : document;
    };
    return Object.fromEntries(await Promise.all(Object.entries(ctx).map(async ([key, value]) =>
      [key, await (Array.isArray(value) ? Promise.all(value.map(resolve)) : resolve(value))])));
  }

  /** Run a callback on the GM and restore document references in its result. */
  static async #runOnGM(item, key, phase, ctx, choice) {
    const { runGMQuery } = await import("../../helpers/queries.js");
    const result = await runGMQuery("hollows.scriptReaction", {
      itemUuid: item.uuid, key, phase, context: this.#serializeContext(ctx),
      choice: this.#serializeContext(choice),
    }, { timeout: 300_000 });
    return this.#resolveContext(result);
  }

  /**
   * Ask the recipient, then optionally apply the choice on the GM.
   * @param {Item} item
   * @param {string} key
   * @param {object} ctx
   * @param {boolean} apply Whether the handler has an applyOnGM callback.
   * @param {User} [recipient] Defaults to the carrier's owner.
   * @returns {Promise<*>} False when the recipient declines.
   */
  static async #offerReaction(item, key, ctx, apply, recipient) {
    const { primaryOwnerOf } = await import("../../helpers/reactions.js");
    const { runUserQuery } = await import("../../helpers/queries.js");
    const request = { itemUuid: item.uuid, key, context: this.#serializeContext(ctx) };
    const owner = recipient || primaryOwnerOf(ctx.carrier) || game.user;
    const choice = await runUserQuery(owner, "hollows.scriptReaction", {
      ...request, phase: "promptOnPlayer",
    }, { timeout: 300_000 });
    if ((choice == null) || (choice === false)) return false;
    if (!apply) return this.#resolveContext(choice);
    return this.#runOnGM(item, key, "applyOnGM", ctx, choice);
  }

  /**
   * Resolve the current item and callback for a script query.
   * @param {object} request Serialized query data.
   * @returns {Promise<*>} Callback result.
   */
  static async runReaction({ itemUuid, key, phase, context, choice }) {
    const item = await fromUuid(itemUuid);
    const mechanic = this.getMechanics(item.parent).find(entry => entry.key === key);
    const callback = mechanic[phase];
    const ctx = await this.#resolveContext(context);
    choice = await this.#resolveContext(choice);
    const result = await callback(ctx.actor, ctx, choice);
    if (result === this.#failed) return false;
    return this.#serializeContext(result);
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
      if (Mechanic.isRateLimited(actor, mechanic)) return this.#failed;
      const result = await run();
      if ((result !== this.#failed) && (result !== false)) await Mechanic.markRateLimit(actor, mechanic);
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
        mechanic.stage = config.stage || "effects";
        mechanic.run = async (ctx = {}) =>
          this.#limited(ctx.carrier || ctx.actor, mechanic, () => invoke(ctx.actor, ctx));
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
        const mechanic = new OnDefenceResultAction(config);
        mechanic.run = async (ctx = {}) => {
          const result = await this.#limited(ctx.carrier || ctx.actor, mechanic, () => invoke(ctx.actor, ctx));
          return result === this.#failed ? false : result;
        };
        return mechanic;
      }
      case "onMove": {
        const mechanic = new OnMoveAction(config);
        mechanic.run = async (ctx = {}) => {
          if (mechanic.ownerMoveOnly && !ctx.byOwner) return;
          return this.#limited(mechanic.carrier, mechanic,
            () => invoke(ctx.actor, ctx));
        };
        return mechanic;
      }
      case "reloadFullCheck":
      case "onEvent": {
        const mechanic = new ScriptedEvent({ ...config, event: hook === "reloadFullCheck" ? { type: hook } : config.event });
        mechanic.run = async (actor, payload = {}) => {
          return this.#limited(mechanic.carrier, mechanic, () => invoke(actor, {
            event: mechanic.event.type, payload,
          }));
        };
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
        if (!invoke) return mechanic;
        mechanic.apply = async (ctx = {}) => {
          const carrier = ctx.carrier ?? ctx.target;
          const result = await this.#limited(carrier, mechanic,
            () => invoke(ctx.target, ctx));
          if (Number.isFinite(result)) return { damageValue: result, note: config.name };
          return Number.isFinite(result?.damageValue) ? result : null;
        };
        return mechanic;
      }
      case "entityActionPause": {
        const mechanic = new EntityActionPause(config);
        mechanic.handler = async (actor, ctx) => {
          const result = await this.#limited(actor, mechanic, () => invoke(actor, ctx));
          return result === this.#failed ? {} : result;
        };
        return mechanic;
      }
      case "onDeath": {
        const mechanic = new OnDeath(config);
        mechanic.handler = actor => this.#limited(actor, mechanic, async () => {
          const result = await invoke(actor);
          return result?.handled ? result : false;
        });
        return mechanic;
      }
      case "threatLock": {
        const mechanic = new ThreatLock(config);
        mechanic.lockedZones = ctx => invoke(mechanic.carrier, ctx);
        return mechanic;
      }
      case "weaponModifier": return new WeaponModifier(config);
      case "attackOptions":
      case "defenceOptions":
      case "terrainDiscard":
      case "manoeuvreAvailability":
      case "resourceLimit":
      case "threatEnhancement":
      case "interceptor": {
        const mechanic = new ScriptedProvider(config);
        mechanic.run = invoke;
        return mechanic;
      }
      case "statOverride": return new StatOverride(config);
      case "attackRoll": return new AttackRollModifier(config);
      case "entityStat": return new EntityStatModifier(config);
      case "entityCost": return new EntityAbilityModifier(config);
      case "takeCover": return new TakeCoverModifier(config);
      default:
        return null;
    }
  }

  /** Bind callbacks to a mechanic and its aura carriers. */
  static #createMechanic(item, config, callbacks, carrierIds) {
    const { key, hook } = config;
    const sync = !!ScriptField.hooks[hook].sync;
    const reaction = callbacks.promptOnPlayer !== undefined;
    const invoker = (fn, options = {}) => this.#makeInvoker(fn, key, item, {
      carrierIds, combatOnly: ScriptField.hooks[hook].combatOnly, ...options,
    });
    const recipient = callbacks.recipient && invoker(callbacks.recipient, { sync: true, fallback: false });
    const run = reaction ? (_H, actor, ctx) => {
      const user = recipient && recipient(actor, ctx);
      if (recipient && !user) return false;
      return this.#offerReaction(item, key, ctx, !!callbacks.applyOnGM, user);
    } : callbacks.run;
    let invoke = ScriptField.hooks[hook].optionalRun && (run === undefined) ? null : invoker(run, {
      sync, routeToGM: !reaction, runOnGM: config.runOnGM, fallback: ScriptField.hooks[hook].fallback,
    });
    if (ScriptField.hooks[hook].options) {
      const buildOptions = invoker(run, { sync: true, api: API, fallback: null });
      invoke = (actor, ctx = {}) => buildOptions(actor, {
        ...ctx, applyOnGM: choice => this.#runOnGM(item, key, "applyOnGM", {
          ...ctx, actor, carrier: item.parent,
        }, choice),
      });
    }
    const mechanic = this.#buildMechanic(hook, config, invoke);
    mechanic.rateLimit = config.rateLimit;
    mechanic.carrier = item.parent;
    mechanic.group = config.group;
    mechanic.aura = !!config.aura;
    for (const method of ["active", "matchCarrier", "available", "getLabel"]) {
      if (!callbacks[method]) continue;
      mechanic[method] = invoker(callbacks[method], {
        sync: true, combatOnly: false, fallback: method === "getLabel" ? mechanic.name : false,
      });
    }
    if (callbacks.when) {
      const when = invoker(callbacks.when, { sync: true, fallback: false });
      mechanic.when = ctx => when(ctx.actor, ctx);
    }
    if (reaction) {
      mechanic.promptOnPlayer = invoker(callbacks.promptOnPlayer);
    } else if (!sync) {
      mechanic.execute = invoker(run);
    }
    if (callbacks.applyOnGM) mechanic.applyOnGM = invoker(callbacks.applyOnGM);
    if (mechanic.aura) mechanic.withCarriers = ids => this.#createMechanic(item, config, callbacks, ids);
    return mechanic;
  }

  /**
   * Cache per document instance so synthetic actors do not share compiled scripts.
   * @param {Item} item
   * @param {{path: string, text: string, name?: string}} slot
   * @returns {Mechanic[]} Compiled mechanics; empty for disabled or invalid scripts.
   */
  static #compile(item, { path, text, name: slotName }) {
    const block = foundry.utils.getProperty(item, path);
    const source = String(block?.source ?? "");
    if (!block?.enabled || !source.trim()) return [];
    if (!block.trusted && !globalThis.hollows?.settings?.allowCustomScripts) return [];
    const multiple = block.mode === "multiple";
    const hook = block.hook || "activated";
    if (!multiple && !Object.hasOwn(ScriptField.hooks, hook)) return [];
    const key = `script.${item.id}.${path}`;
    const name = block.label || slotName || item.name || game.i18n.localize("HOLLOWS.SCRIPT.defaultName");
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
          if (!reaction && !ScriptField.hooks[definition.hook].options && (definition.applyOnGM !== undefined)) {
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
        const { run, promptOnPlayer, applyOnGM, active, matchCarrier, when, available, getLabel, recipient, ...config } = definition;
        return this.#createMechanic(item, {
          ...config,
          key: handlerKey, name: definition.label || name, text: text || "",
          weapon: item.system?.weaponType || "", rateLimit,
          on: definition.on || "actor", event,
        }, { run, promptOnPlayer, applyOnGM, active, matchCarrier, when, available, getLabel, recipient });
      });
    } catch (error) {
      this.#report(item, key, error, "compile");
    }
    if (!cache) this.#cache.set(item, cache = new Map());
    cache.set(path, { stamp, mechanics });
    return mechanics;
  }

  /**
   * Compile scripts from the item's active slots.
   * @param {Actor|null} actor Carrier actor.
   * @param {Function|null} [type] Mechanic constructor to select.
   * @returns {Mechanic[]} Actor's compiled mechanics.
   */
  static getMechanics(actor, type = null) {
    return Array.from(actor?.items ?? []).flatMap(item => this.getItemMechanics(item, type));
  }

  /** Compile mechanics from one item, including a weapon that has just been removed. */
  static getItemMechanics(item, type = null) {
    return item.scriptSlots.filter(slot => slot.enabled)
      .flatMap(slot => this.#compile(item, slot))
      .filter(mechanic => !type || (mechanic instanceof type));
  }

  /** Collect non-aura mechanics from Hunters on the current scene. */
  static getSceneMechanics(type) {
    return getActiveSceneHunters().flatMap(actor => this.getMechanics(actor, type))
      .filter(mechanic => !mechanic.aura);
  }

  /** Collect scene auras with the carrier IDs for each group. */
  static getAuras(type) {
    const groups = new Map();
    for (const actor of getActiveSceneHunters()) {
      for (const mechanic of this.getMechanics(actor, type)) {
        if (!mechanic.aura) continue;
        const key = mechanic.group || mechanic;
        if (!groups.has(key)) {
          groups.set(key, { mechanic, carrierIds: [] });
        }
        groups.get(key).carrierIds.push(actor.id);
      }
    }
    return [...groups.values()].map(({ mechanic, carrierIds }) => mechanic.withCarriers(carrierIds));
  }

  /** Collect current item providers in priority order. */
  static getProviders(hook, actor = null, item = null) {
    if (item) return this.getItemMechanics(item, ScriptedProvider)
      .filter(m => m.hook === hook).sort((a, b) => b.priority - a.priority);
    const local = actor ? this.getMechanics(actor, ScriptedProvider) : this.getSceneMechanics(ScriptedProvider);
    return [...local.filter(m => !m.aura), ...this.getAuras(ScriptedProvider)]
      .filter(m => m.hook === hook).sort((a, b) => b.priority - a.priority);
  }

  /**
   * Dispatch locally; the caller determines which client handles the event.
   * @param {Function} matches Predicate receiving an event descriptor.
   * @param {object} [context] Event context.
   * @param {Actor|null} [context.actor] Actor for a local event; null for a scene event.
   * @param {object} [context.payload] Event-specific data passed to the script.
   * @returns {Promise<*[]>} Results returned by matching handlers.
   */
  static async runEvents(matches, { actor = null, payload = {} } = {}) {
    if (!actor && !game.user.isGM) return [];
    const local = actor ? this.getMechanics(actor, ScriptedEvent) : this.getSceneMechanics(ScriptedEvent);
    const zone = actor && getActorZone(actor);
    const foreign = zone ? this.getSceneMechanics(ScriptedEvent).filter(mechanic =>
      (mechanic.event.scope === "zoneMate") && (mechanic.carrier.id !== actor.id)
      && (getActorZone(mechanic.carrier) === zone)) : [];
    const seen = new Set();
    const results = [];
    for (const mechanic of [
      ...local.filter(m => !m.aura && (m.event.scope !== "zoneMate")), ...foreign, ...this.getAuras(ScriptedEvent),
    ]) {
      if (!matches(mechanic.event)) continue;
      if (mechanic.group && seen.has(mechanic.group)) continue;
      if (mechanic.group) seen.add(mechanic.group);
      results.push(await mechanic.run(actor || mechanic.carrier, payload));
    }
    return results;
  }
}
