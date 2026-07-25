/**
 * Start-of-turn trigger. `on: "entity"` fires when the active entity's turn
 * begins; `on: "actor"` fires when the carrier's own turn begins.
 *
 * Supports a `prompt` field for handshake-style abilities (Drink Deep: ask the
 * carrier's owner whether to apply the special effect, else fall through to
 * `fallbackEffects`).
 *
 * Knife examples: Drink Deep (entity-turn-start, prompt → either remove
 *                 bleeding + Focus party, or normal bleeding damage).
 */
import { Mechanic } from "./Mechanic.js";
import { evalTriggers } from "./dsl/triggers.js";

export class StartOfTurnAction extends Mechanic {
  constructor(config = {}) {
    super(config);
    this.on = config.on || "actor";            // "actor" | "entity"
    this.triggers = config.triggers || {};
    this.prompt = config.prompt || null;        // { title, message }
    this.effects = Array.isArray(config.effects) ? config.effects : [];
    this.fallbackEffects = Array.isArray(config.fallbackEffects) ? config.fallbackEffects : [];
  }

  async run({ actor, entity } = {}) {
    if (!evalTriggers(this.triggers, { actor, entity })) return;
    const { applyEffects } = await import("./dsl/effects.js");
    if (this.prompt) {
      const confirm = await foundry.applications.api.DialogV2.wait({
        window: { title: this.prompt.title || this.name },
        content: `<div class="hollows-roll-dialog">${this.prompt.message || ""}</div>`,
        rejectClose: false,
        buttons: [
          { action: "yes", label: this.prompt.acceptLabel || "Apply", default: true, callback: () => true },
          { action: "no", label: this.prompt.declineLabel || "Skip", callback: () => false }
        ]
      });
      if (confirm) await applyEffects(this.effects, { actor, entity });
      else await applyEffects(this.fallbackEffects, { actor, entity });
      return;
    }
    await applyEffects(this.effects, { actor, entity });
  }
}
