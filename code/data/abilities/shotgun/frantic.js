/**
 * Frantic — Shotgun T1. The first time each turn the carrier misses with an
 * attack, they suffer 1 Resolve damage and the Entity suffers 2 Resolve.
 *
 * An OnAttackResultAction on `miss`, once per turn. Fires from any attack flow
 * that dispatches runOnAttackResult (the weapon-attack dialog and the untyped
 * immediate attack) — Frantic keys on "an attack", not on the Shotgun.
 */
import { OnAttackResultAction } from "../../mechanics/OnAttackResultAction.js";

export const FRANTIC = new OnAttackResultAction({
  key: "shotgun.t1.frantic",
  weapon: "Shotgun", tier: 1,
  name: "Frantic",
  text: "Kill it! Kill it now! The first time each turn you miss with an attack, you suffer 1 Resolve damage and inflict 2 Resolve damage on the Entity.",
  result: "miss",
  rateLimit: "oncePerTurn",
  effects: [
    { type: "damageSelf", resolve: 1 },
    { type: "chatNotice", message: "<strong>{actor}</strong> suffers <strong>1 Resolve</strong> (Frantic)." },
    { type: "damageEntity", resolve: 2, label: "Frantic" }
  ]
});
