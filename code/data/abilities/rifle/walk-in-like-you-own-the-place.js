import { ActivatedAbility } from "../../mechanics/ActivatedAbility.js";

export const WALK_IN_LIKE_YOU_OWN_THE_PLACE = new ActivatedAbility({
  key: "rifle.t1.walk-in-like-you-own-the-place",
  weapon: "Rifle", tier: 1,
  name: "Walk In Like You Own the Place",
  buttonLabel: "Walk In",
  text: "The decor isn't up to much, but at least it's sturdy. As an immediate action on your turn, you may spend Focus to claim a terrain tag.",
  cost: { resource: "focus", amount: 1 },
  effects: [
    { type: "claimTerrainTag", label: "Walk In Like You Own the Place" }
  ]
});
