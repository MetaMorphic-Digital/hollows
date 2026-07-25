/**
 * Reaction — GM→player query pattern. The GM asks one specific player for a
 * choice (Counterattack? Spend Focus? Pick martyr?). Distinct from the game's
 * "Interrupt" action (an Entity behavior referred to elsewhere as
 * `triggerEntityInterrupt`).
 *
 * Each `Reaction` couples a player-side prompt (returns a choice or null)
 * with an optional GM-side apply step. Registered via `Reaction.register()`
 * against `CONFIG.queries`. The single `.offer(user, ctx)` entry point
 * dispatches the prompt to the receiving user's client and runs `applyOnGM`
 * back on the caller (usually GM) if a choice is returned.
 *
 * Optional `event` field marks a Reaction as auto-fired by an event dispatcher
 * (e.g. Barbed fires whenever Ready is removed). When `event.type` matches a
 * registered dispatcher (`runOnConditionRemoved`, `runOnThreatPlaced`, etc.),
 * the dispatcher iterates event-flagged reactions and offers them to the
 * relevant owner. Reactions without `event` remain purely imperative.
 */
import { Mechanic } from "./Mechanic.js";

export class Reaction extends Mechanic {
  constructor(key, { promptOnPlayer, applyOnGM, weapon, tier, name, text, event, form } = {}) {
    super({ key, weapon, tier, name, text, form });
    this.promptOnPlayer = promptOnPlayer || null;
    this.applyOnGM = applyOnGM || null;
    this.event = event || null;
  }

  register(registerHandler) {
    if (!this.promptOnPlayer) return;
    if (typeof registerHandler !== "function") return;
    registerHandler(`hollows.reaction.${this.key}`, async (ctx, opts) => {
      return await this.promptOnPlayer(ctx, opts);
    });
  }

  async offer(targetUser, context = {}, opts = {}) {
    const { offerReaction } = await import("../../helpers/queries.js");
    const choice = await offerReaction(targetUser, this.key, context, opts);
    if (choice && this.applyOnGM) {
      await this.applyOnGM(context, choice);
    }
    return choice;
  }
}
