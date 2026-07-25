/**
 * Reload action orchestration. Refills weapon Capacity / reloads Shotguns.
 *
 * Ability hooks (Kicking and Screaming, Fresh Shells, …) listen for the
 * generic `reload` event emitted via `runOnReload` — this file knows nothing
 * about which abilities react.
 *
 * Moved out of hunter-combat.js into data/actions/ per the action-layer
 * architecture (orchestration lives in data/).
 */
import { isShotgunWeapon, isShotgunLoaded } from "../../helpers/weapon-utils.js";
import { runOnReload, runReloadFullCheck } from "../../helpers/weapon-abilities/dispatchers.js";
import { getEffectiveCapacity } from "../../documents/item/weapon.js";
import { getSelectedWeaponForm } from "../weapons/index.js";

export async function openReloadForActor(actor) {
  if (!actor || actor.type !== "hunter") return;
  const weapons = actor.items
    .filter((i) => i.type === "weapon" && (getEffectiveCapacity(i) > 0 || isShotgunWeapon(i)));
  if (!weapons.length) return;
  const applyReload = async (weapon) => {
    if (isShotgunWeapon(weapon)) {
      const wasEmpty = !isShotgunLoaded(weapon);
      if (!wasEmpty) return;            // already Loaded — no-op, emit nothing
      await runOnReload(actor, { weapon, phase: "before" });
      await weapon.update({ "system.loaded": true });
      await runOnReload(actor, { weapon, phase: "after" });
      return;
    }
    const max = getEffectiveCapacity(weapon);
    if (!max) return;
    const reloadToFull = getSelectedWeaponForm(weapon)?.reload?.capacity === "full";
    const current = Number(weapon.system.capacity.value ?? 0);
    // An ability may convert this Reload into a full-Capacity refill (Come Out
    // Shooting). reload.js stays ability-agnostic — it just asks the dispatcher.
    const abilityFull = await runReloadFullCheck(actor, weapon);
    const next = (abilityFull || reloadToFull) ? max : Math.min(max, current + 1);
    if (next <= current) return;        // no actual capacity gain — emit nothing
    await weapon.update({ "system.capacity.value": next });
    await runOnReload(actor, { weapon, phase: "after" });
  };

  if (weapons.length === 1) {
    await applyReload(weapons[0]);
    return;
  }

  const options = weapons
    .map((w) => {
      if (isShotgunWeapon(w)) {
        return `<option value="${w.id}">${w.name} (${isShotgunLoaded(w) ? "Loaded" : "Empty"})</option>`;
      }
      return `<option value="${w.id}">${w.name} (${Number(w.system?.capacity?.value ?? 0)}/${getEffectiveCapacity(w)})</option>`;
    })
    .join("");
  const content = `
    <form class="hollows-roll-dialog">
      <div class="form-group">
        <label>Weapon</label>
        <select name="weaponId">${options}</select>
      </div>
    </form>
  `;
  await foundry.applications.api.DialogV2.wait({
    window: { title: "Reload" },
    content,
    rejectClose: false,
    buttons: [
      {
        action: "reload",
        label: "Reload",
        default: true,
        callback: async (_e, _b, dialog) => {
          const weaponId = dialog.element.querySelector("[name=weaponId]")?.value;
          const weapon = actor.items.get(weaponId);
          if (!weapon) return;
          await applyReload(weapon);
        }
      },
      { action: "cancel", label: "Cancel", callback: () => null }
    ]
  });
}
