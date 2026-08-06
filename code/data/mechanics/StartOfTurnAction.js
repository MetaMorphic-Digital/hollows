import { Mechanic } from "./Mechanic.js";

/** A passive that applies effects when the carrier's or the entity's turn begins. */
export class StartOfTurnAction extends Mechanic {
  constructor(config = {}) {
    super(config);
    this.on = config.on || "actor";
    this.prompt = config.prompt || null;
    this.effects = Array.isArray(config.effects) ? config.effects : [];
    this.fallbackEffects = Array.isArray(config.fallbackEffects) ? config.fallbackEffects : [];
  }

  async run({ actor, entity } = {}) {
    if (this.when && !this.when({ actor, entity })) return;
    const { applyEffects } = await import("./dsl/effects.js");
    if (this.prompt) {
      const confirm = await foundry.applications.api.DialogV2.wait({
        window: { title: this.prompt.title || this.name },
        content: `<div class="hollows-roll-dialog">${this.prompt.message || ""}</div>`,
        rejectClose: false,
        buttons: [
          { action: "yes", label: this.prompt.acceptLabel || "Apply", default: true, callback: () => true },
          { action: "no", label: this.prompt.declineLabel || "Skip", callback: () => false },
        ],
      });
      await applyEffects(confirm ? this.effects : this.fallbackEffects, { actor, entity });
      return;
    }
    await applyEffects(this.effects, { actor, entity });
  }
}
