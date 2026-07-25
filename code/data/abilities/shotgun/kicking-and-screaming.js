/**
 * Kicking and Screaming — Shotgun T1. When the carrier reloads a Shotgun while
 * in a Close area, they may make an immediate untyped 1/1 Hard attack before
 * the weapon flips to Loaded.
 *
 * Event-driven Reaction on the `reload` event (phase: "before"). reload.js
 * emits the event only for a real Shotgun reload (wasEmpty → Loaded), so we
 * just need to filter weapon-type/zone/permission and dispatch the prompt.
 *
 * The triggered attack is weaponless (openAttackDialog weaponless mode): a full
 * attack dialog (focus, attack options) but no weapon, so weapon-specific
 * bonuses (Solid Shot etc.) don't fire while carriership-gated and aura bonuses
 * (Seeing Red, In the Thick of It, Massive Damage aura) still apply.
 */
import { Reaction } from "../../mechanics/Reaction.js";
import { getActorZone, isCloseZone } from "../../../canvas/zone.js";
import { isShotgunWeapon } from "../../../helpers/weapon-utils.js";
import { openAttackDialog } from "../../actions/attack.js";

export const KICKING_AND_SCREAMING = new Reaction("shotgun.t1.kicking-and-screaming", {
  weapon: "Shotgun", tier: 1, name: "Kicking and Screaming",
  event: { type: "reload", phase: "before" },
  promptOnPlayer: async ({ actorId, weaponId, weaponType }) => {
    if (String(weaponType || "") !== "Shotgun") return null;
    const actor = game.actors.get(actorId);
    const weapon = actor.items.get(weaponId);
    if (!weapon || !isShotgunWeapon(weapon)) return null;
    const zone = getActorZone(actor);
    if (!zone || !isCloseZone(zone)) return null;

    const confirm = await foundry.applications.api.DialogV2.wait({
      window: { title: "Kicking and Screaming" },
      content: `<div class="hollows-roll-dialog"><div>Make an immediate <strong>1/1 Hard</strong> attack before reloading?</div></div>`,
      rejectClose: false,
      buttons: [
        { action: "yes", label: "Attack", default: true, callback: () => true },
        { action: "no", label: "Skip", callback: () => false }
      ]
    }) ?? false;
    if (!confirm) return null;

    // Weaponless 1/1 Hard attack — full attack dialog (focus, attack options)
    // but no weapon, so weapon-specific bonuses (Solid Shot etc.) don't fire.
    await openAttackDialog(actor, {
      title: "Kicking and Screaming",
      weaponless: true,
      forcedProfile: { stat: "hard", defence: "close" },
      damageOverride: { resolve: 1, wounds: 1 }
    });
    return { used: true };
  }
});
