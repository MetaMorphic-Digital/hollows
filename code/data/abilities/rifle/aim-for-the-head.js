/**
 * Aim For the Head — Rifle T1. When the carrier spends Focus as part of an
 * attack, they may convert it: each Focus spent grants +1/+1 damage instead of
 * rolling with advantage.
 *
 * Registered as an attack option provider. The ability owns its dialog field
 * and attack-card section: it pushes onto `attackState.cardLines`, which
 * attack.js renders blind.
 */
import { hasWeaponAbility } from "../../../helpers/weapon-utils.js";
import { registerAttackOptionProvider } from "../../actions/attack-options.js";

const ABILITY = { key: "rifle.t1.aim-for-the-head", name: "Aim For the Head", weaponType: "Rifle", tier: 1 };

/** True when the carrier holds Aim For the Head. */
export function isAimForTheHeadAvailable(actor) {
  return hasWeaponAbility(actor, ABILITY);
}

/** The dialog field injected into the attack dialog. */
export function aimForTheHeadDialogHtml() {
  return `
      <div class="form-group aim-for-head">
        <label>Aim For the Head: spend Focus for +1/+1 each</label>
        <input type="number" name="aimFocus" min="0" value="0" />
      </div>
    `;
}

/**
 * Wire the dialog field: clamp the spend to available Focus and make it
 * mutually exclusive with the normal Focus-for-Advantage checkbox.
 */
export function prepareAimForTheHeadDialog(root, { focusCount, updateSuggestedMode } = {}) {
  const aimInput = root?.querySelector?.("[name=aimFocus]");
  if (!aimInput) return;
  const focusInput = root.querySelector("[name=useFocus]");
  const maxFocus = Math.max(0, Number(focusCount ?? 0) || 0);
  aimInput.setAttribute("max", String(maxFocus));
  aimInput.disabled = maxFocus <= 0;

  const sync = () => {
    const spend = Math.max(0, Math.floor(Number(aimInput.value) || 0));
    if (focusInput) {
      if (spend > 0) focusInput.checked = false;
      focusInput.disabled = spend > 0;
    }
    updateSuggestedMode?.();
  };

  aimInput.addEventListener("input", sync);
  focusInput?.addEventListener("change", () => {
    if (focusInput.checked) aimInput.value = "0";
    sync();
  });
  sync();
}

/**
 * Apply the chosen Aim spend to the attack: no advantage, +1/+1 damage per
 * Focus spent, plus the ability's own attack-card line. Mutates attackState
 * in place (the context object attack.js threads through the attack flow).
 */
export function applyAimForTheHead(root, attackState) {
  const focusCount = Math.max(0, Number(attackState.focusCount ?? 0) || 0);
  const aimInput = root?.querySelector?.("[name=aimFocus]");
  let spend = Math.max(0, Math.floor(Number(aimInput?.value ?? 0) || 0));
  spend = Math.min(spend, focusCount);
  if (spend <= 0) return attackState;

  attackState.useFocusAdv = false;
  attackState.focusSpend = spend;
  attackState.damageResolve = Number(attackState.damageResolve ?? 0) + spend;
  attackState.damageWounds = Number(attackState.damageWounds ?? 0) + spend;
  attackState.aimForTheHeadSpend = spend;
  attackState.cardLines.push(`<div><strong>Aim For the Head:</strong> spent ${spend} Focus for +${spend}/+${spend} damage.</div>`);
  return attackState;
}

registerAttackOptionProvider((actor) => {
  if (!isAimForTheHeadAvailable(actor)) return null;
  return {
    key: ABILITY.key,
    dialogHtml: aimForTheHeadDialogHtml,
    prepare: (root, context = {}) => prepareAimForTheHeadDialog(root, {
      focusCount: context.focusCount,
      updateSuggestedMode: context.updateSuggestedMode
    }),
    damageBonus: (root, _actor, attackState) => applyAimForTheHead(root, attackState)
  };
});
