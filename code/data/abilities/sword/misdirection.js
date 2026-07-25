import { OnAttackResultAction } from "../../mechanics/OnAttackResultAction.js";
import { shiftThreatViaDialog } from "../../../canvas/threat-ops.js";

export const MISDIRECTION = new OnAttackResultAction({
  key: "sword.t1.misdirection",
  weapon: "Sword", tier: 1,
  name: "Misdirection",
  text: "Nothing to see here. Once per round, when you miss with an attack, shift 2 Threat into or out of your area.",
  result: "miss",
  rateLimit: "oncePerRound",
  handler: (actor) => applyMisdirection(actor)
});

// Prompt the direction, then shift 2 Threat in/out via the shared zone-threat picker.
async function applyMisdirection(actor) {
  const action = await foundry.applications.api.DialogV2.wait({
    window: { title: "Misdirection" },
    content: `<div class="hollows-roll-dialog"><div>Shift 2 Threat into or out of your area.</div></div>`,
    rejectClose: false,
    buttons: [
      { action: "into", label: "Shift In", default: true, callback: () => "in" },
      { action: "out", label: "Shift Out", callback: () => "out" },
      { action: "skip", label: "Skip", callback: () => "" }
    ]
  }) ?? "";
  if (!action) return { cancelled: true };
  const shifted = await shiftThreatViaDialog(actor, action === "in"
    ? {
        amount: 2,
        sourceConstraint: "adjacent",
        destConstraint: "self",
        excludeSupport: false,
        label: "Misdirection",
        reason: "Misdirection"
      }
    : {
        amount: 2,
        sourceConstraint: "self",
        destConstraint: "adjacentToSource",
        excludeSupport: false,
        label: "Misdirection",
        reason: "Misdirection"
      });
  return shifted ? {} : { cancelled: true };
}
