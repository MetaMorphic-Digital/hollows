/**
 * Skirmisher — Pistol T1. When the carrier Moves to a Close area, gain +2
 * Quick until the start of their next turn; to a Ranged area, +2 Sharp.
 *
 * An OnMoveAction (phase "after"), restricted to owner-performed moves. The
 * `skirmisherStatBonus` effect reads the destination zone and accumulates the
 * `skirmisherBonus` flag (each stat once per round, no toggling on re-entry)
 * — consumed by getTotalStatForActor, cleared at the carrier's turn start.
 */
import { OnMoveAction } from "../../mechanics/OnMoveAction.js";

export const SKIRMISHER = new OnMoveAction({
  key: "pistol.t1.skirmisher",
  weapon: "Pistol", tier: 1,
  name: "Skirmisher",
  text: "Line up the perfect shot. When you Move to a Close area, gain +2 Quick until the start of your next turn. When you Move to a Ranged area, gain +2 Sharp until the start of your next turn.",
  phase: "after",
  ownerMoveOnly: true,
  effects: [
    { type: "skirmisherStatBonus" }
  ]
});
