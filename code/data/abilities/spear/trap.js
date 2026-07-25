import { AttackRollModifier } from "../../mechanics/AttackRollModifier.js";
import { getActorZone, getThreatInZone } from "../../../canvas/zone.js";

const TRAP_ZONES = ["Front", "Flank Left", "Flank Right"];

export const TRAP = new AttackRollModifier({
  key: "spear.t1.trap",
  weapon: "Spear", tier: 1,
  name: "Trap",
  text: "While you are in Close (not Rear) with 3+ Threat, your attacks have advantage.",
  scope: "self",
  rollMode: "adv"
});

TRAP.active = (carrier) => {
  const zone = getActorZone(carrier);
  return !!zone && TRAP_ZONES.includes(zone) && getThreatInZone(zone) >= 3;
};
