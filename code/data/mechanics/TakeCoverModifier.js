import { Mechanic } from "./Mechanic.js";

export class TakeCoverModifier extends Mechanic {
  constructor(config = {}) {
    super(config);
    this.expandZones = !!config.expandZones;
    this.statKey = config.statKey || null;
    this.allowOtherTarget = !!config.allowOtherTarget;
  }
}
