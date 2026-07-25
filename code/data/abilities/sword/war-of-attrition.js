import { getActorZone } from "../../../canvas/zone.js";
import { isSameCombatRound } from "../../../helpers/combat-runtime.js";
import { Reaction } from "../../mechanics/Reaction.js";
import { openGuardDialogForActor } from "../../actions/guard.js";

/**
 * War of Attrition — Sword T1. Once per round, when the Entity spends Threat
 * from your area, Guard as an immediate action. Event-driven on `threatSpent`.
 */
export const WAR_OF_ATTRITION = new Reaction("sword.t1.war-of-attrition", {
  weapon: "Sword", tier: 1, name: "War of Attrition",
  event: { type: "threatSpent" },
  promptOnPlayer: async ({ actorId, zone, amount }) => {
    const actor = game.actors.get(actorId);
    if (getActorZone(actor) !== String(zone || "")) return null;
    const spent = Math.max(0, Number(amount ?? 0));
    if (spent <= 0) return null;

    const combat = game.combat;
    const roundKey = combat?.started ? { combatId: combat.id, round: Number(combat.round ?? 0) } : null;
    const used = actor.getFlag("hollows", "swordWarAttritionUsed");
    if (roundKey && used && isSameCombatRound(used, roundKey)) return null;

    const confirm = await foundry.applications.api.DialogV2.wait({
      window: { title: "War of Attrition" },
      content: `<div class="hollows-roll-dialog"><div>The Entity spent <strong>${spent}</strong> Threat from <strong>${zone}</strong>. Guard as an immediate action?</div></div>`,
      rejectClose: false,
      buttons: [
        { action: "yes", label: "Guard", default: true, callback: () => true },
        { action: "no", label: "Skip", callback: () => false }
      ]
    });
    if (confirm !== true) return null;
    if (roundKey) await actor.setFlag("hollows", "swordWarAttritionUsed", roundKey);
    await openGuardDialogForActor(actor);
    return { used: true };
  }
});
