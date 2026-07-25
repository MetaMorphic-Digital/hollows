import { getActorZone, getHuntersInZone } from "../../canvas/zone.js";
import { buildStandardRollCardHtml } from "../../applications/ui/roll-card.js";
import { HunterStatRollFlow } from "../../dice/flow.js";
import { getTotalStatForActor } from "../../documents/actor/hunter-combat.js";
import { adjustHunterResource, getFocusCount } from "../../documents/actor/resources.js";

export async function openHealForActor(actor) {
  if (!actor || actor.type !== "hunter") return;
  const zone = getActorZone(actor);
  if (zone !== "Support") {
    ui.notifications.warn("Heal is only available in Support.");
    return;
  }

  const statValue = getTotalStatForActor(actor, "wise");
  let rollOutcome = null;
  try {
    const flow = new HunterStatRollFlow(actor, {
      title: "Heal",
      cardTitle: "uses Heal",
      statLabel: "Wise",
      statValue,
      tn: null,
      focusCount: getFocusCount(actor),
      spendFocus: async () => adjustHunterResource(actor, { focus: -1 })
    });
    rollOutcome = await flow.roll();
  } catch (err) {
    console.error("Hollows | Heal roll failed", err);
    ui.notifications.error("Heal roll failed. See console.");
    return;
  }
  if (!rollOutcome) return;

  const { roll, success } = rollOutcome;
  const supportHunters = getHuntersInZone("Support");
  const otherHunters = supportHunters.filter((h) => h.id !== actor.id);
  if (!otherHunters.length && !success) {
    ui.notifications.warn("No other Hunters in Support to heal.");
    return;
  }

  const options = [];
  if (success) {
    options.push({ id: "self", label: "Heal 1 Wound on yourself", targetId: actor.id, amount: 1 });
  }
  for (const hunter of otherHunters) {
    options.push({
      id: `ally-${hunter.id}`,
      label: success ? `Heal 2 Wounds on ${hunter.name}` : `Heal 1 Wound on ${hunter.name}`,
      targetId: hunter.id,
      amount: success ? 2 : 1
    });
  }
  if (!options.length) {
    ui.notifications.warn("No valid targets for Heal.");
    return;
  }

  const optionRows = options.map((o) => `<option value="${o.id}">${o.label}</option>`).join("");
  await foundry.applications.api.DialogV2.wait({
    window: { title: "Heal" },
    content: `
      <form class="hollows-roll-dialog">
        <div class="form-group">
          <label>Heal Target</label>
          <select name="healChoice">${optionRows}</select>
        </div>
      </form>
    `,
    buttons: [
      {
        action: "apply",
        label: "Apply",
        default: true,
        callback: async (_e, _b, dialog) => {
          const pick = String(dialog.element.querySelector("[name=healChoice]")?.value || "");
          const choice = options.find((o) => o.id === pick) || options[0];
          const target = game.actors.get(choice.targetId);
          if (!target) return;
          await adjustHunterResource(target, { wounds: choice.amount });
          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            flavor: "Heal",
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
