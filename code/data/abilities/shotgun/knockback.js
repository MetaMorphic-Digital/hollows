/**
 * Knockback — Shotgun T1. When the carrier inflicts Resolve damage with the
 * Shotgun, they may reposition one Hunter in Close or remove 1 Threat from
 * their area.
 *
 * An OnAttackResultAction (Resolve damage, Shotgun) whose effect is a `choice`:
 * the carrier picks the reposition or the Threat removal, or skips.
 */
import { OnAttackResultAction } from "../../mechanics/OnAttackResultAction.js";

export const KNOCKBACK = new OnAttackResultAction({
  key: "shotgun.t1.knockback",
  weapon: "Shotgun", tier: 1,
  name: "Knockback",
  text: "Send it stumbling. When you inflict Resolve damage with the Shotgun, you may Reposition one Hunter in Close or remove 1 Threat from your area.",
  result: "any",
  damageType: "Resolve",
  weaponType: "Shotgun",
  effects: [
    {
      type: "choice",
      title: "Knockback",
      message: "Reposition one Hunter in Close, or remove 1 Threat from your area?",
      options: [
        {
          label: "Reposition a Hunter in Close",
          effects: [
            { type: "chatNotice", message: "<strong>{actor}</strong> — Knockback: reposition one Hunter in Close." }
          ]
        },
        {
          label: "Remove 1 Threat from your area",
          effects: [
            { type: "removeThreat", amount: 1, zone: "self" }
          ]
        }
      ]
    }
  ]
});
