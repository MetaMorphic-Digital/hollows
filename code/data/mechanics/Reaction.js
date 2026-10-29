/** Ask a player to resolve a system reaction, then apply its result on the caller's client. */
import { Mechanic } from "./Mechanic.js";

export class Reaction extends Mechanic {
  constructor(key, { promptOnPlayer, applyOnGM, weapon, tier, name, text, form } = {}) {
    super({ key, weapon, tier, name, text, form });
    this.promptOnPlayer = promptOnPlayer || null;
    this.applyOnGM = applyOnGM || null;
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
