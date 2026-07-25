import { AttackDamageChange } from "../../mechanics/AttackDamageChange.js";
import { getHuntersInZone } from "../../../canvas/zone.js";
import { hasWeaponAbility } from "../../../helpers/weapon-utils.js";

const DECOY_LANE_MAP = {
  "Ranged Left": "Flank Left",
  "Ranged Front": "Front",
  "Ranged Right": "Flank Right"
};

export const DECOY = new AttackDamageChange({
  key: "spear.t1.decoy",
  weapon: "Spear", tier: 1,
  name: "Decoy",
  text: "Hunters attacking from a Ranged zone that matches your Front zone gain +1/+1 damage.",
  aura: true,
  delta: { resolve: 1, wounds: 1 },
  active: (actor, context) => {
    const requiredZone = DECOY_LANE_MAP[String(context?.attackerZone || "")] || "";
    if (!requiredZone) return false;
    return getHuntersInZone(requiredZone).some((h) =>
      h?.id && h.id !== actor?.id && hasWeaponAbility(h, {
        key: "spear.t1.decoy",
        name: "Decoy",
        weaponType: "Spear",
        tier: 1
      })
    );
  }
});
