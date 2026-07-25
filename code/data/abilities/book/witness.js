import { OnAttackResultAction } from "../../mechanics/OnAttackResultAction.js";

export const WITNESS = new OnAttackResultAction({
  key: "book.t1.witness",
  weapon: "Book", tier: 1,
  name: "Witness",
  result: "miss",
  rateLimit: "oncePerRound",
  prompt: {
    title: "Witness",
    message: "Focus as an immediate action?",
    acceptLabel: "Focus",
    declineLabel: "Skip"
  },
  handler: async (actor) => {
    const { applyFocusToActor } = await import("../../actions/focus.js");
    await applyFocusToActor(actor);
    return {};
  }
});
