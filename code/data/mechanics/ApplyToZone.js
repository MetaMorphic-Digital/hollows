import { Mechanic } from "./Mechanic.js";

/** A manoeuvre that picks zone-mates and applies effects to each of them. */
export class ApplyToZone extends Mechanic {
  constructor(config = {}) {
    super(config);
    this.buttonAction = config.buttonAction || null;
    this.cost = config.cost || null;
    this.rateLimit = config.rateLimit || null;
    this.targetSelection = {
      scope: "ally",
      zoneScope: "sameZone",
      count: 1,
      ...(config.targetSelection || {}),
    };
    this.subSelect = config.subSelect || null;
    this.label = config.label || this.name;
    this.effects = Array.isArray(config.effects) ? config.effects : [];
  }

  available(actor) {
    return this.when?.({ actor }) ?? true;
  }
}
