/**
 * Brandish — Pistol T1. Instead of the attack action, the carrier may make
 * two manoeuvres (three in total on the turn).
 *
 * Purely a turn-start reminder: a StartOfTurnAction (on the carrier's own
 * turn) that posts a chat notice. The "two manoeuvres instead of attack"
 * accounting is handled at the table.
 */
import { StartOfTurnAction } from "../../mechanics/StartOfTurnAction.js";

export const BRANDISH = new StartOfTurnAction({
  key: "pistol.t1.brandish",
  weapon: "Pistol", tier: 1,
  name: "Brandish",
  text: "The monster can wait; you've got things to do. Instead of your attack action each turn, you may make two manoeuvres (allowing you to make three manoeuvres in total on your turn).",
  on: "actor",
  effects: [
    { type: "chatNotice", message: "<strong>{actor}</strong> may make <strong>3 manoeuvres</strong> this turn instead of attacking (Brandish)." }
  ]
});
