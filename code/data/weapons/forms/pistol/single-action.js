import { makePistolForm } from "./base.js";

export const PISTOL_SINGLE_ACTION_FORM = makePistolForm({
  key: "Single Action",
  name: "Single Action",
  label: "Single Action",
  text: "",
  damage: { resolve: 2, wounds: 1 },
  capacity: { max: 3, value: 3 }
});
