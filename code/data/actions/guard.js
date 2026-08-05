/**
 * Guard action orchestration. Restore 2 Resolve, or revive a Dying ally when
 * they share the area. Applies the Bulwark zone bonus and emits generic Guard
 * reactions.
 *
 * Moved out of weapon-utils.js into data/actions/ per the action-layer
 * architecture (orchestration lives in data/).
 */
import { getActorZone, getTokenZone, getActorTokenOnScene } from "../../canvas/zone.js";
import { addCondition, removeCondition } from "../../documents/actor/conditions.js";
import { adjustHunterResource } from "../../documents/actor/resources.js";
import { hasWeaponEquipped } from "../../helpers/weapon-utils.js";
import { runOnGuard } from "../../helpers/weapon-abilities/dispatchers.js";

export async function openGuardDialogForActor(actor, sourceActor = null) {
  const self = actor;
  const selfZone = getActorZone(self);
  const zoneTokens = canvas.tokens.placeables.filter(token => {
    const actor = token.actor;
    if (actor?.type !== "hunter") return false;
    return (actor.id !== self.id) && (getTokenZone(token) === selfZone) && actor.isRevivable;
  });

  const reviveOptions = zoneTokens
    .map((t) => `<option value="${t.document?.uuid || t.uuid}">${t.name}</option>`)
    .join("");
  const canRevive = !!selfZone && (zoneTokens.length > 0);
  const content = `
    <form class="hollows-roll-dialog">
      <div class="form-group">
        <label>Guard Option</label>
        <select name="mode">
          <option value="self" selected>Restore 2 Resolve</option>
          ${canRevive ? `<option value="revive">Revive Dying Hunter in ${selfZone}</option>` : ""}
        </select>
      </div>
      ${canRevive ? `
        <div class="form-group guard-revive-target" hidden>
          <label>Target</label>
          <select name="targetId">${reviveOptions}</select>
        </div>
      ` : ""}
    </form>
  `;
  const applied = await foundry.applications.api.DialogV2.wait({
    window: { title: "Guard" },
    content,
    rejectClose: false,
    render: (_e, dialog) => {
      if (!canRevive) return;
      const el = dialog.element;
      const modeSelect = el.querySelector("select[name='mode']");
      const targetGroup = el.querySelector(".guard-revive-target");
      if (!modeSelect) return;
      const updateTargetVisibility = () => {
        const mode = String(modeSelect.value || "self");
        if (targetGroup) targetGroup.hidden = mode !== "revive";
      };
      modeSelect.addEventListener("change", updateTargetVisibility);
      updateTargetVisibility();
    },
    buttons: [
      {
        action: "apply",
        label: "Apply",
        default: true,
        callback: async (_e, _b, dialog) => {
          const el = dialog.element;
          const mode = String(el.querySelector("[name=mode]")?.value || "self");
          if (mode === "revive" && canRevive) {
            const targetUuid = String(el.querySelector("[name=targetId]")?.value || "");
            const targetToken = targetUuid ? await fromUuid(targetUuid) : null;
            const target = targetToken?.actor;
            if (!target || target.type !== "hunter") return false;
            if (!game.user?.isGM) {
              const sourceToken = getActorTokenOnScene(self);
              await ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor: self }),
                content: `<div class="hollows-chat"><span class="hollows-guard-revive" data-guard-source="${sourceToken?.document?.uuid || sourceToken?.uuid || ""}" data-guard-target="${targetToken?.document?.uuid || targetToken?.uuid || ""}"></span></div>`,
                flags: {
                  hollows: {
                    guardRevive: {
                      sourceTokenUuid: sourceToken?.document?.uuid || sourceToken?.uuid || "",
                      targetTokenUuid: targetToken?.document?.uuid || targetToken?.uuid || "",
                    },
                  },
                },
              });
              return true;
            }

            if (!actor.isRevivable) return false;

            await removeCondition(target, "dying");
            await adjustHunterResource(target, { resolve: 1, wounds: 1 });
            await target.setFlag("hollows", "dyingRevivedOnce", true);
            await ChatMessage.create({
              speaker: ChatMessage.getSpeaker({ actor: sourceActor || self }),
              content: `<div class="hollows-chat"><strong>${self.name}</strong> Guards and revives <strong>${target.name}</strong> (+1 Resolve, +1 Wound).</div>`,
            });
            if (hasWeaponEquipped(self, "Armour")) await addCondition(self, "ready");
            return true;
          }

          await adjustHunterResource(self, { resolve: 2 });
          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: sourceActor || self }),
            content: `<div class="hollows-chat"><strong>${self.name}</strong> Guards and restores <strong>2 Resolve</strong>.</div>`,
          });
          if (hasWeaponEquipped(self, "Armour")) await addCondition(self, "ready");
          return true;
        },
      },
    ],
  });
  if (applied) {
    // Generic guard event — abilities subscribe via event-Reactions.
    await runOnGuard(self);
  }
}
