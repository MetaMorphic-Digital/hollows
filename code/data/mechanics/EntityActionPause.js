import { Mechanic } from "./Mechanic.js";
import { evalTriggers } from "./dsl/triggers.js";

export class EntityActionPause extends Mechanic {
  constructor(config = {}) {
    super(config);
    this.actionType = config.actionType || "attack";
    this.stage = config.stage || "beforeResolve";
    this.triggers = config.triggers || {};
    this.active = typeof config.active === "function" ? config.active : null;
    this.handler = typeof config.handler === "function" ? config.handler : null;
  }

  match(actor, context = {}) {
    const ctxType = String(context.actionType || "");
    const myType = this.actionType;
    const typeMatches = Array.isArray(myType) ? myType.includes(ctxType) : ctxType === String(myType || "");
    if (!typeMatches) return false;
    if (String(context.stage || "") !== String(this.stage || "")) return false;
    if (this.active && !this.active(actor, context)) return false;
    return evalTriggers(this.triggers, { actor, ...context });
  }

  async run(actor, context = {}) {
    if (!this.handler) return {};
    return await this.handler(actor, context) || {};
  }
}
