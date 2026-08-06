import { AttackDamageChange } from "../../mechanics/AttackDamageChange.js";
import { getActorZone } from "../../../canvas/zone.js";

export const PIERCE = new AttackDamageChange({
  key: "spear.t1.pierce",
  weapon: "Spear", tier: 1,
  name: "Pierce",
  text: "While you are in Flank Left or Flank Right, inflict +0/+1 damage.",
  weaponType: "Spear",
  mode: "add",
  delta: { resolve: 0, wounds: 1 },
  when: ({ actor }) => ["Flank Left", "Flank Right"].includes(getActorZone(actor)),
});
