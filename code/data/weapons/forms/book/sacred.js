import { Reaction } from "../../../mechanics/Reaction.js";
import { makeBookForm } from "./base.js";

export const BOOK_SACRED_GUARD = new Reaction("book.form.sacred.guard", {
  weapon: "Book",
  tier: 0,
  form: "Sacred",
  name: "Sacred",
  text: "When you Guard, an ally may restore 1 Resolve.",
  event: { type: "guard" },
  promptOnPlayer: async ({ actorId } = {}) => {
    const actor = actorId ? game.actors.get(String(actorId)) : null;
    if (!actor || actor.type !== "hunter") return null;
    if (!actor.testUserPermission(game.user, "OWNER")) return null;
    const { chooseOneTarget } = await import("../../../../applications/apps/selection-dialogs.mjs");
    const { getActiveSceneHunters, getActorTokenOnScene } = await import("../../../../canvas/zone.js");
    const { hasCondition } = await import("../../../../documents/actor/conditions.js");
    const { adjustHunterResource } = await import("../../../../documents/actor/resources.js");

    const candidates = getActiveSceneHunters()
      .filter((candidate) => candidate.id !== actor.id)
      .filter((candidate) => !hasCondition(candidate, "dead"))
      .map((candidate) => getActorTokenOnScene(candidate))
      .filter(Boolean);
    const token = await chooseOneTarget(candidates, {
      title: "Sacred",
      label: "Choose Hunter",
      hint: "Sacred: another Hunter may restore 1 Resolve.",
      promptSingle: true,
      allowCancel: true
    });
    const target = token?.actor || null;
    if (!target || target.type !== "hunter") return null;
    await adjustHunterResource(target, { resolve: 1 });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="hollows-chat"><strong>${target.name}</strong> restores <strong>1 Resolve</strong> (Sacred).</div>`
    });
    return { used: true };
  }
});

export const BOOK_SACRED_FORM = makeBookForm({
  key: "Sacred",
  name: "Sacred",
  label: "Sacred",
  text: "When you Guard, an ally\nmay restore 1 Resolve.",
  damage: { resolve: 1, wounds: 1 },
  mechanics: [BOOK_SACRED_GUARD]
});
