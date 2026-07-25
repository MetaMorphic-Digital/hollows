import { Mechanic } from "./Mechanic.js";

/**
 * On-death interceptor. Run by the hunter death gate in priority order (highest
 * first); the first handler returning { handled: true } consumes the death.
 */
export class OnDeath extends Mechanic {
  constructor(config = {}) {
    super(config);
    this.priority = Number(config.priority || 0);
    this.active = typeof config.active === "function" ? config.active : null;
    this.handler = typeof config.handler === "function" ? config.handler : null;
  }

  matches(actor) {
    return this.active ? !!this.active(actor) : true;
  }

  async run(actor) {
    return this.handler ? ((await this.handler(actor)) || {}) : {};
  }
}
