import { makeSpearForm } from "./base.js";

export const SPEAR_HEAVY_FORM = makeSpearForm({
  key: "Heavy",
  name: "Heavy",
  label: "Heavy",
  text: "",
  damage: { resolve: 2, wounds: 3 }
});
