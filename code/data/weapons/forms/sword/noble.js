import { Reaction } from "../../../mechanics/Reaction.js";
import { makeSwordForm } from "./base.js";

export const NOBLE_FEINT_REACTION = new Reaction("sword.form.noble.feint", {
  weapon: "Sword", name: "Noble",
  event: { type: "swordFeint" },
  promptOnPlayer: async ({ actorId } = {}) => {
    const actor = actorId ? game.actors.get(String(actorId)) : null;
    if (!actor || !actor.testUserPermission(game.user, "OWNER")) return null;
    const { getActorZone } = await import("../../../../canvas/zone.js");
    const zone = getActorZone(actor);
    if (!zone) return null;
    const { chooseHunterInZone } = await import("../../../../applications/apps/selection-dialogs.mjs");
    const target = await chooseHunterInZone(zone, "Feint (Noble): Choose Hunter to Guard");
    if (!target) return null;
    return { targetId: target.id };
  },
  applyOnGM: async (_ctx, { targetId } = {}) => {
    if (!targetId) return;
    const { GRANT_MANOEUVRE } = await import("../../../actions/index.js");
    const { primaryOwnerOf } = await import("../../../../helpers/reactions.js");
    const target = game.actors.get(String(targetId));
    if (!target) return;
    const owner = primaryOwnerOf(target) || game.user;
    await GRANT_MANOEUVRE.offer(owner, { targetId, manoeuvre: "guard" });
  }
});

export const SWORD_NOBLE_FORM = makeSwordForm({
  key: "Noble",
  name: "Noble",
  label: "Noble",
  text: "When you Feint, one Hunter in your\narea may Guard as an immediate action.",
  damage: { resolve: 2, wounds: 2 },
  mechanics: [NOBLE_FEINT_REACTION]
});
