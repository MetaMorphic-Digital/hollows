import { StatModifier } from "../../mechanics/StatModifier.js";

export const PRISTINE = new StatModifier({
  key: "rifle.t1.pristine",
  weapon: "Rifle", tier: 1,
  name: "Pristine",
  text: "Don't let them touch you. While you have your maximum number of Wounds or higher, +1 to all stats.",
  stats: ["strong", "hard", "quick", "sharp", "wise"],
  delta: 1,
  when: ({ actor }) => actor.system.health.wounds.value >= actor.system.health.wounds.max,
});
