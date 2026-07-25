import { Mechanic } from "./Mechanic.js";

// Passive, GLOBAL zone lock. An ability declares which zones are locked for a
// given kind:
//   "placement" — Threat cannot be placed there (Sanctify: discarded).
//   "spend"     — the Entity cannot spend Threat from there (Annul).
//
// `lockedZones({ kind })` inspects live game state (active conditions, terrain,
// …) and returns the locked zone ids. These are NOT carrier-gated — the
// dispatcher (getThreatLockedZones) collects across every instance, and the
// Threat funnels (addThreatToZone / spendThreatFromZones) consult the result.
export class ThreatLock extends Mechanic {
  constructor(config = {}) {
    super(config);
    this.lockedZones = typeof config.lockedZones === "function" ? config.lockedZones : () => [];
  }
}
