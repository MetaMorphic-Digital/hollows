/**
 * Expend Ready action orchestration. A single generic dialog that lists
 * "Become Unready" plus every ApplyToZone / ActivatedAbility the carrier
 * holds with `cost.condition === "ready"` (Bulwark, Control, Grit Your Teeth,
 * and any future Ready-spending ability — no per-ability dialog branches).
 *
 * Ready removal is performed by the cost system (payCost → removeCondition),
 * which in turn fires the conditionRemoved event — so Barbed and other
 * Ready-discharge reactions trigger uniformly here too.
 */
import { removeCondition } from "../../documents/actor/conditions.js";
import {
  getApplyToZoneAbilities, getApplyToZoneTargets,
  getActivatedAbilities, activateAbility, activateApplyToZone,
} from "../../helpers/weapon-abilities/dispatchers.js";

/**
 * @import HollowsActor from "../../documents/actor.mjs";
 */

/**
 * Escape a string.
 */
const esc = (v) => foundry.utils.escapeHTML(String(v ?? ""));

/**
 * Open expend-ready dialog.
 * @param {HollowsActor} actor
 */
export async function openExpendReadyDialog(actor) {
  if (!actor || (actor.type !== "hunter")) return;
  if (!actor.statuses.has("ready")) {
    ui.notifications.warn(`${actor.name} is not Ready.`);
    return;
  }

  // Ready-cost abilities. ApplyToZone abilities are always listed when the
  // carrier holds them, but the option is disabled (with a note) when there
  // is no valid zone-mate target right now.
  const zoneAbilities = getApplyToZoneAbilities(actor)
    .filter((a) => a.cost?.condition === "ready");
  const activatedAbilities = getActivatedAbilities(actor)
    .filter((a) => a.cost?.condition === "ready");

  const zoneTargets = new Map();
  for (const a of zoneAbilities) zoneTargets.set(a.key, getApplyToZoneTargets(actor, a));

  const modeOptions = ["<option value=\"unready\" selected>Become Unready</option>"];
  for (const a of zoneAbilities) {
    const hasTargets = (zoneTargets.get(a.key) || []).length > 0;
    modeOptions.push(
      `<option value="zone:${esc(a.key)}"${hasTargets ? "" : " disabled"}>${esc(a.label || a.name)}${hasTargets ? "" : " — no ally in your area"}</option>`,
    );
  }
  for (const a of activatedAbilities) modeOptions.push(`<option value="act:${esc(a.key)}">${esc(a.label || a.name)}</option>`);

  // All current ApplyToZone Ready abilities target same-zone allies, so one
  // shared target list suffices; recomputed per-ability if that changes.
  const targets = zoneAbilities
    .map((a) => zoneTargets.get(a.key) || [])
    .find((list) => list.length) || [];
  const targetOptions = targets.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join("");

  const subSelectBlocks = zoneAbilities
    .filter((a) => a.subSelect)
    .map((a) => {
      const opts = (a.subSelect.options || [])
        .map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`)
        .join("");
      return `
        <div class="form-group sub-select" data-for="zone:${esc(a.key)}" hidden>
          <label>${esc(a.subSelect.label || "Option")}</label>
          <select name="sub:${esc(a.key)}">${opts}</select>
        </div>
      `;
    })
    .join("");

  const content = `
    <form class="hollows-roll-dialog">
      <div class="form-group">
        <label>Expend Ready</label>
        <select name="mode">${modeOptions.join("")}</select>
      </div>
      ${targets.length ? `
        <div class="form-group target-group" hidden>
          <label>Ally</label>
          <select name="targetId">${targetOptions}</select>
        </div>
      ` : ""}
      ${subSelectBlocks}
    </form>
  `;

  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: "Expend Ready" },
    content,
    rejectClose: false,
    render: (_e, dialog) => {
      const el = dialog.element;
      const modeSelect = el.querySelector("[name=mode]");
      const targetGroup = el.querySelector(".target-group");
      const subGroups = el.querySelectorAll(".sub-select");
      const update = () => {
        const mode = String(modeSelect?.value || "unready");
        const isZone = mode.startsWith("zone:");
        if (targetGroup) targetGroup.hidden = !isZone;
        for (const sub of subGroups) {
          sub.hidden = sub.dataset.for !== mode;
        }
      };
      modeSelect?.addEventListener("change", update);
      update();
    },
    buttons: [
      {
        action: "apply",
        label: "Apply",
        default: true,
        callback: (_e, _b, dialog) => {
          const el = dialog.element;
          const mode = String(el.querySelector("[name=mode]")?.value || "unready");
          if (mode === "unready") return { mode: "unready" };
          if (mode.startsWith("zone:")) {
            const key = mode.slice(5);
            return {
              mode: "zone",
              key,
              targetId: String(el.querySelector("[name=targetId]")?.value || ""),
              subValue: String(el.querySelector(`[name="sub:${key}"]`)?.value || ""),
            };
          }
          if (mode.startsWith("act:")) {
            return { mode: "act", key: mode.slice(4) };
          }
          return null;
        },
      },
      { action: "cancel", label: "Cancel", callback: () => false },
    ],
  });

  if (!choice) return;

  if (choice.mode === "unready") {
    await removeCondition(actor, "ready");
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="hollows-chat"><strong>${actor.name}</strong> expends <strong>Ready</strong> and becomes <strong>Unready</strong>.</div>`,
    });
    return;
  }

  if (choice.mode === "zone") {
    const ability = zoneAbilities.find((a) => a.key === choice.key);
    if (!ability) return;
    const target = getApplyToZoneTargets(actor, ability).find((t) => t.id === choice.targetId);
    if (!target) {
      ui.notifications.warn("No valid ally selected.");
      return;
    }
    const payload = {};
    if (ability.subSelect && choice.subValue) payload[ability.subSelect.name] = choice.subValue;
    await activateApplyToZone(actor, ability, target, { payload });
    return;
  }

  if (choice.mode === "act") {
    const ability = activatedAbilities.find((a) => a.key === choice.key);
    if (!ability) return;
    await activateAbility(actor, ability);
  }
}
