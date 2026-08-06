import { AttackDamageChange } from "../../mechanics/AttackDamageChange.js";

export const SEEING_RED = new AttackDamageChange({
  key: "shotgun.t1.seeing-red",
  weapon: "Shotgun", tier: 1,
  name: "Seeing Red",
  text: "Time to die. While you are Broken, you inflict +1/+1 damage.",
  when: ({ actor }) => actor.system.health.resolve.value === 0,
  delta: { resolve: 1, wounds: 1 },
});
