/**
 * Activated manoeuvre — surfaces as a button on the hunter sheet. On click,
 * the dispatcher checks the rate limit, pays the cost, opens a dialog (if
 * configured), then applies effects.
 *
 * Config:
 *   buttonAction: "walk in"            — data-action attribute on the sheet
 *   cost: { resource, amount }        — paid on activate
 *   rateLimit: "oncePerRound"|null
 *   dialog: { title, content, parseChoice } | null
 *   effects: [...]
 *
 * Rifle example: Walk In (1 Focus, 1/round).
 */
import { Mechanic } from "./Mechanic.js";
import { evalTriggers } from "./dsl/triggers.js";

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
    this.triggers = config.triggers || {};
    // Aura: surface this manoeuvre on every Hunter (not just the carrier) when
    // available() passes — the dispatcher lifts the carriership gate. Mirrors
    // AttackDamageChange.aura.
    this.aura = !!config.aura;
  }

  available(actor) {
    return evalTriggers(this.triggers, { actor });
  }
}
