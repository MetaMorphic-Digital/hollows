import { getHuntersInZone, getThreatInZone } from "../../../canvas/zone.js";
import { hasWeaponAbility } from "../../../helpers/weapon-utils.js";
import { AttackDamageChange } from "../../mechanics/AttackDamageChange.js";

function hasGotYourBack(actor) {
  return hasWeaponAbility(actor, {
    key: "sword.t1.got-your-back",
    name: "Got Your Back",
    weaponType: "Sword",
    tier: 1
  });
}

// Carrier bonus: +1 Resolve while an ally shares your area.
function shouldSwordGotYourBackSelfBonus(actor, zone) {
  if (!actor || !zone) return false;
  if (!hasGotYourBack(actor)) return false;
  return getHuntersInZone(zone).some((h) => h.id !== actor.id);
}

// Ally bonus: an attacker in the area gains +1 Resolve when a Got Your Back
// carrier shares the area and there is Threat there.
function shouldSwordGotYourBackAllyBonus(attacker, zone) {
  if (!attacker || !zone) return false;
  if (getThreatInZone(zone) <= 0) return false;
  return getHuntersInZone(zone)
    .filter((h) => h.id !== attacker.id)
    .some((h) => hasGotYourBack(h));
}

/**
 * Got Your Back — Sword T1. An aura damage modifier: any attacker in the area
 * gains +1 Resolve when the self- or ally-condition holds.
 */
export const GOT_YOUR_BACK_DAMAGE = new AttackDamageChange({
  key: "sword.t1.got-your-back",
  weapon: "Sword", tier: 1,
  name: "Got Your Back",
  aura: true,
  active: (actor, ctx) =>
    shouldSwordGotYourBackSelfBonus(actor, ctx?.attackerZone) ||
    shouldSwordGotYourBackAllyBonus(actor, ctx?.attackerZone),
  delta: { resolve: 1, wounds: 0 }
});
