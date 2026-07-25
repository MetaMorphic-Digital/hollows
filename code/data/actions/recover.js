import { getActorZone } from "../../canvas/zone.js";
import { buildStandardRollCardHtml } from "../../applications/ui/roll-card.js";
import { HunterStatRollFlow } from "../../dice/flow.js";
import { getTotalStatForActor } from "../../documents/actor/hunter-combat.js";
import { adjustHunterResource, getFocusCount } from "../../documents/actor/resources.js";

export async function openRecoverForActor(actor) {
  if (!actor || actor.type !== "hunter") return;
  const zone = getActorZone(actor);
  if (zone !== "Support") {
    ui.notifications.warn("Recover is only available in Support.");
    return;
  }

  const statValue = getTotalStatForActor(actor, "hard");
  let rollOutcome = null;
  try {
    const flow = new HunterStatRollFlow(actor, {
      title: "Recover",
      cardTitle: "uses Recover",
      statLabel: "Hard",
      statValue,
      tn: null,
      focusCount: getFocusCount(actor),
      spendFocus: async () => adjustHunterResource(actor, { focus: -1 })
    });
    rollOutcome = await flow.roll();
  } catch (err) {
    console.error("Hollows | Recover roll failed", err);
    ui.notifications.error("Recover roll failed. See console.");
    return;
  }
  if (!rollOutcome) return;

  const { roll, success } = rollOutcome;
  const options = success
    ? [
      { id: "resolve", label: "Restore 4 Resolve", amount: 4, type: "resolve" },
      { id: "wounds", label: "Restore 2 Wounds", amount: 2, type: "wounds" }
    ]
    : [
      { id: "resolve", label: "Restore 2 Resolve", amount: 2, type: "resolve" },
      { id: "wounds", label: "Restore 1 Wound", amount: 1, type: "wounds" }
    ];
  const optionRows = options.map((o) => `<option value="${o.id}">${o.label}</option>`).join("");
  await foundry.applications.api.DialogV2.wait({
    window: { title: "Recover" },
    content: `
      <form class="hollows-roll-dialog">
        <div class="form-group">
          <label>Recover Result</label>
          <select name="recoverChoice">${optionRows}</select>
        </div>
      </form>
    `,
    buttons: [
      {
        action: "apply",
        label: "Apply",
        default: true,
        callback: async (_e, _b, dialog) => {
          const pick = String(dialog.element.querySelector("[name=recoverChoice]")?.value || "");
          const choice = options.find((o) => o.id === pick) || options[0];
          await adjustHunterResource(actor, {
            resolve: choice.type === "resolve" ? choice.amount : 0,
            wounds: choice.type === "wounds" ? choice.amount : 0
          });
          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            flavor: "Recover",
            content: buildStandardRollCardHtml({
              ...rollOutcome.card,
              extraLines: [choice.label]
            }),
            rolls: [roll]
          });
        }
      }
    ],
    rejectClose: false
  });
}
