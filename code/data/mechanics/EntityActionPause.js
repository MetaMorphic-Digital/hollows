import { Mechanic } from "./Mechanic.js";

/** Interrupts an entity action at a named stage to run a handler. */
export class EntityActionPause extends Mechanic {
  constructor(config = {}) {
    super(config);
    this.actionType = config.actionType || "attack";
    this.stage = config.stage || "beforeResolve";
    this.active = typeof config.active === "function" ? config.active : null;
    this.handler = typeof config.handler === "function" ? config.handler : null;
  }

  match(actor, context = {}) {
    const ctxType = String(context.actionType || "");
    const myType = this.actionType;
    const typeMatches = Array.isArray(myType) ? myType.includes(ctxType) : (ctxType === String(myType || ""));
    if (!typeMatches) return false;
    if (String(context.stage || "") !== String(this.stage || "")) return false;
    if (this.active && !this.active(actor, context)) return false;
    return this.when?.({ actor, ...context }) ?? true;
  }

  async run(actor, context = {}) {
    if (!this.handler) return {};
    return await this.handler(actor, context) || {};
  }
}
