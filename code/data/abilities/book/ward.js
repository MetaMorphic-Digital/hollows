import { ActivatedAbility } from "../../mechanics/ActivatedAbility.js";
import { IncomingDamageModifier } from "../../mechanics/IncomingDamageModifier.js";
import { getActorZone, getHuntersInZone } from "../../../canvas/zone.js";
import { adjustHunterResource } from "../../../documents/actor/resources.js";
import { runGMQuery } from "../../../helpers/queries.js";
import { hasWeaponAbility } from "../../../helpers/weapon-utils.js";

export const WARD = new ActivatedAbility({
  key: "book.t1.ward",
  weapon: "Book", tier: 1,
  name: "Ward Ally",
  run: async (actor, ctx) => {
    const zone = getActorZone(actor);
    if (!zone) {
      ui.notifications.warn("You must be in a zone to use Ward.");
      ctx._cancelled = true;
      return;
    }

    if (!actor.statuses.has("sheltered")) {
      ui.notifications.warn("Ward requires Sheltered.");
      ctx._cancelled = true;
      return;
    }

    if (Number(actor.system.health.wounds.value ?? 0) <= 0) {
      ui.notifications.warn("Not enough Wounds to use Ward.");
      ctx._cancelled = true;
      return;
    }

    const candidates = getHuntersInZone(zone).filter((a) => a.id !== actor.id);
    if (!candidates.length) {
      ui.notifications.warn("No allies in your area for Ward.");
      ctx._cancelled = true;
      return;
    }

    const esc = (v) => foundry.utils.escapeHTML(String(v ?? ""));
    const options = candidates.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join("");
    const targetId = await foundry.applications.api.DialogV2.wait({
      window: { title: "Ward: Choose Hunter" },
      content: `<form class="hollows-roll-dialog"><div class="form-group"><label>Ward</label><select name="targetId">${options}</select></div></form>`,
      rejectClose: false,
      buttons: [
        { action: "apply", label: "Apply", default: true, callback: (_e, _b, d) => String(d.element.querySelector("[name=targetId]")?.value || "") },
        { action: "cancel", label: "Cancel", callback: () => "" },
      ],
    }) ?? "";
    if (!targetId) { ctx._cancelled = true; return; }

    const target = game.actors.get(targetId);

    await adjustHunterResource(actor, { wounds: -1 });
    if (game.user?.isGM) {
      await actor.setFlag("hollows", "wardSuppressed", { targetId: target.id });
      await target.setFlag("hollows", "wardGranted", { sourceId: actor.id });
    } else {
      await runGMQuery("hollows.actorMutation", { actorId: actor.id, type: "flag", payload: { key: "wardSuppressed", value: { targetId: target.id } } });
      await runGMQuery("hollows.actorMutation", { actorId: target.id, type: "flag", payload: { key: "wardGranted", value: { sourceId: actor.id } } });
    }
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="hollows-chat"><strong>${esc(actor.name)}</strong> wards <strong>${esc(target.name)}</strong> (Ward).</div>`,
    });
  },
});

export const WARD_DAMAGE_REDUCTION = new IncomingDamageModifier({
  key: "book.t1.ward",
  weapon: "Book", tier: 1,
  name: "Ward",
  scope: "targetState",
  damageSource: "entity",
  timing: "postMitigation",
  apply: ({ target, damageValue, shelteredApplied }) => {
    const selfWard = target.statuses.has("sheltered")
      && !target.getFlag("hollows", "wardSuppressed")
      && hasWeaponAbility(target, {
        key: "book.t1.ward",
        name: "Ward",
        weaponType: "Book",
        tier: 1,
      });
    const grantedWard = !!target.getFlag("hollows", "wardGranted");
    if (!selfWard && !grantedWard) return null;
    return {
      damageValue: Math.max(0, Number(damageValue || 0) - (shelteredApplied ? 1 : 2)),
      note: "Ward: -2",
    };
  },
});
