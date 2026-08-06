import { Mechanic } from "./Mechanic.js";

/** A passive that fires after one of the carrier's attacks resolves a given way. */
export class OnAttackResultAction extends Mechanic {
  constructor(config = {}) {
    super(config);
    this.result = config.result || "any";
    this.damageType = config.damageType || null;
    this.weaponType = config.weaponType || null;
    this.scope = config.scope || "self";
    this.reaction = config.reaction || null;
    this.timing = config.timing || "immediate";
    this.rateLimit = config.rateLimit || null;
    this.prompt = config.prompt || null;
    this.effects = Array.isArray(config.effects) ? config.effects : [];
    this.handler = typeof config.handler === "function" ? config.handler : null;
    this.matchCarrier = typeof config.matchCarrier === "function" ? config.matchCarrier : null;
    this.active = typeof config.active === "function" ? config.active : null;
    this.aura = !!config.aura;
  }

  matchActive(actor, context = {}) {
    return this.active ? !!this.active(actor, context) : true;
  }

  matchResult(actualResult) {
    if (this.result === "any") return true;
    return this.result === actualResult;
  }

  matchDamage({ damageType, damageValue } = {}) {
    if (!this.damageType) return true;
    return (String(damageType) === String(this.damageType)) && (Number(damageValue) > 0);
  }

  async run(context = {}) {
    const { actor, entity } = context;
    if (this.when && !this.when({ actor, entity })) return false;
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
      if (!confirm) return false;
    }
    const ctx = { ...context, actor, entity };
    let out = {};
    if (this.handler) {
      out = (await this.handler(actor, ctx)) || {};
      if (out.cancelled) return false;
    }
    const { applyEffects } = await import("./dsl/effects.js");
    await applyEffects(this.effects, ctx);
    if (ctx._cancelled) return false;
    return out;
  }
}
