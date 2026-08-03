// Compiles a stored script block into a mechanic instance: the hook picks the
// class, so scripts ride the same dispatchers as hand-written abilities.
// `attackDamage` and `statModifier` compile sync — their dispatchers read the
// result immediately.
import { ActivatedAbility } from "../../data/mechanics/ActivatedAbility.js";
import { StartOfTurnAction } from "../../data/mechanics/StartOfTurnAction.js";
import { EndOfTurnAction } from "../../data/mechanics/EndOfTurnAction.js";
import { OnAttackResultAction } from "../../data/mechanics/OnAttackResultAction.js";
import { OnDefenceResultAction } from "../../data/mechanics/OnDefenceResultAction.js";
import { OnMoveAction } from "../../data/mechanics/OnMoveAction.js";
import { AttackDamageChange } from "../../data/mechanics/AttackDamageChange.js";
import { IncomingDamageModifier } from "../../data/mechanics/IncomingDamageModifier.js";
import { StatModifier } from "../../data/mechanics/StatModifier.js";
import { Mechanic } from "../../data/mechanics/Mechanic.js";
import { SCRIPT_HOOKS } from "../../data/items/script-schema.js";
import { customScriptsAllowed } from "../../helpers/settings.js";
import { HOLLOWS_API as API, HOLLOWS_SYNC_API as SYNC_API } from "../../api.js";

/**
 * A script bound to a game event. Unlike Reaction it runs locally, because
 * Reaction's cross-client prompt needs a query handler registered at init.
 */
export class ScriptedEvent extends Mechanic {
  constructor(config = {}) {
    super(config);
    this.eventType = String(config.eventType || "");
    this.rateLimit = config.rateLimit || "";
  }
}

const CACHE = new Map();

// Once per script per session — a hook like attackDamage fires every attack.
const REPORTED = new Set();

function report(key, error, phase) {
  console.error(`Hollows | Script ${key} ${phase}`, error);
  const seen = `${key}|${phase}|${error.message}`;
  if (REPORTED.has(seen)) return;
  REPORTED.add(seen);
  if (game.user?.isGM) ui.notifications?.error?.(`Script "${key}" ${phase}: ${error.message} (further repeats are console-only)`);
}

function compileBody(source, key, sync) {
  const body = sync ? `"use strict"; ${source}` : `"use strict"; return (async () => { ${source} })();`;
  try {
    return new Function("H", "actor", "ctx", body);
  } catch (error) {
    report(key, error, "failed to compile");
    return null;
  }
}

// `ctx.item` lets a script tell its own weapon from another of the same type.
function makeInvoker(fn, key, sync, item) {
  if (sync) {
    return (actor, ctx = {}) => {
      try {
        return fn(SYNC_API, actor, { ...ctx, item });
      } catch (error) {
        report(key, error, "threw");
        return undefined;
      }
    };
  }
  return async (actor, ctx = {}) => {
    try {
      return await fn(API, actor, { ...ctx, item });
    } catch (error) {
      report(key, error, "threw");
      return undefined;
    }
  };
}

// ActivatedAbility and OnAttackResultAction are rate-limited by their own
// dispatchers; the rest are wrapped here.
async function limited(actor, mechanic, run) {
  if (!mechanic.rateLimit) return run();
  const { isRateLimited, markRateLimit } = await import("../../helpers/weapon-abilities/dispatchers.js");
  if (isRateLimited(actor, mechanic)) return undefined;
  const out = await run();
  await markRateLimit(actor, mechanic);
  return out;
}

function buildMechanic(hook, config, invoke) {
  switch (hook) {
    case "activated": {
      const mechanic = new ActivatedAbility({
        ...config,
        buttonAction: `script-${config.key}`,
        buttonLabel: config.name,
        rateLimit: config.rateLimit || null,
      });
      mechanic.run = async (actor, ctx) => invoke(actor, { ...ctx, actor });
      return mechanic;
    }
    case "startOfTurn": {
      const mechanic = new StartOfTurnAction({ ...config, on: config.on || "actor" });
      mechanic.run = async ({ actor, entity } = {}) =>
        limited(actor, mechanic, () => invoke(actor, { actor, entity }));
      return mechanic;
    }
    case "endOfTurn": {
      const mechanic = new EndOfTurnAction(config);
      mechanic.run = async (actor) => limited(actor, mechanic, () => invoke(actor, { actor }));
      return mechanic;
    }
    case "onAttackResult": {
      const mechanic = new OnAttackResultAction({
        ...config,
        result: "any",
        rateLimit: config.rateLimit || null,
      });
      // The dispatcher folds { damageType, damageValue, cardLine } back into the
      // attack, before damage lands.
      mechanic.handler = async (actor, ctx) => (await invoke(actor, ctx)) || {};
      return mechanic;
    }
    case "onDefenceResult": {
      const mechanic = new OnDefenceResultAction({ ...config, result: "any" });
      mechanic.run = async (ctx = {}) =>
        limited(ctx.actor, mechanic, () => invoke(ctx.actor, ctx));
      return mechanic;
    }
    case "onMove": {
      const mechanic = new OnMoveAction({ ...config, phase: "after" });
      mechanic.run = async ({ actor, fromZone, toZone, phase } = {}) =>
        limited(actor, mechanic, () => invoke(actor, { actor, fromZone, toZone, phase }));
      return mechanic;
    }
    case "onEvent": {
      const mechanic = new ScriptedEvent(config);
      mechanic.run = async (actor, payload = {}) =>
        limited(actor, mechanic, () => invoke(actor, { actor, event: mechanic.eventType, payload }));
      return mechanic;
    }
    case "statModifier": {
      const mechanic = new StatModifier(config);
      mechanic.value = (actor, statKey) => Number(invoke(actor, { actor, stat: statKey }) || 0);
      return mechanic;
    }
    case "attackDamage": {
      const mechanic = new AttackDamageChange(config);
      mechanic.getDelta = (actor, ctx = {}) => {
        const out = invoke(actor, { ...ctx, actor });
        return { resolve: Number(out?.resolve || 0), wounds: Number(out?.wounds || 0) };
      };
      return mechanic;
    }
    case "incomingDamage": {
      const mechanic = new IncomingDamageModifier(config);
      mechanic.apply = async (ctx = {}) => {
        const out = await invoke(ctx.carrier ?? ctx.target, ctx);
        if (out == null) return null;
        return { damageValue: Math.max(0, Number(out) || 0), note: config.name };
      };
      return mechanic;
    }
    default:
      return null;
  }
}

/** @returns {Mechanic|null} for the script block at `path` on `item`. */
export function compileScriptedMechanic(item, path) {
  const block = foundry.utils.getProperty(item, path);
  const source = String(block?.source ?? "").trim();
  if (!block?.enabled || !source) return null;

  const hook = String(block.hook || "activated");
  // "none" is the schema's no-limit choice; mechanics expect an empty string.
  const rateLimit = (!block.rateLimit || (block.rateLimit === "none")) ? "" : String(block.rateLimit);
  const key = `script.${item.id}.${path}`;
  const stamp = `${hook}|${rateLimit}|${block.on ?? ""}|${block.eventType ?? ""}|${block.label ?? ""}|${source}`;
  const cached = CACHE.get(key);
  if (cached?.stamp === stamp) return cached.mechanic;

  const sync = !!SCRIPT_HOOKS[hook]?.sync;
  const fn = compileBody(source, key, sync);
  if (!fn) return null;

  const mechanic = buildMechanic(hook, {
    key,
    name: String(block.label || item.name || "Script"),
    text: String(item.system?.text ?? ""),
    weapon: String(item.system?.weaponType ?? ""),
    rateLimit,
    on: String(block.on || "actor"),
    eventType: String(block.eventType || "guard"),
  }, makeInvoker(fn, key, sync, item));

  if (!mechanic) return null;
  CACHE.set(key, { stamp, mechanic });
  return mechanic;
}

/** Scripts the actor carries: Weapon Ability scripts and enabled Renown ones. */
export function getScriptedMechanics(actor) {
  // Gates execution, not just the editor: items can arrive from packs with a
  // script already on them.
  if (!customScriptsAllowed()) return [];
  const out = [];
  for (const item of (actor?.items?.contents ?? [])) {
    if (item.type === "weaponAbility") {
      const mechanic = compileScriptedMechanic(item, "system.script");
      if (mechanic) out.push(mechanic);
    } else if ((item.type === "weapon") && item.system?.renown?.enabled) {
      const mechanic = compileScriptedMechanic(item, "system.renown.script");
      if (mechanic) out.push(mechanic);
    }
  }
  return out;
}
