import { Mechanic } from "./Mechanic.js";

/** A manoeuvre surfaced as a button on the hunter sheet. */
export class ActivatedAbility extends Mechanic {
  constructor(config = {}) {
    super(config);
    this.buttonAction = config.buttonAction || this.key;
    this.buttonLabel = config.buttonLabel || this.name;
    this.cost = config.cost || null;
    this.rateLimit = config.rateLimit || null;
    this.dialog = config.dialog || null;
    this.effects = Array.isArray(config.effects) ? config.effects : [];
    this.run = config.run || null;
    this.aura = !!config.aura;
  }

  available(actor) {
    return this.when?.({ actor }) ?? true;
  }
}
