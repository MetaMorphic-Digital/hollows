import { makeRifleForm } from "./base.js";

export const RIFLE_REPEATING_FORM = makeRifleForm({
  key: "Repeating",
  name: "Repeating",
  label: "Repeating",
  text: "",
  damage: { resolve: 2, wounds: 2 },
  capacity: { max: 4, value: 4 }
});
