import { makePistolForm } from "./base.js";

export const PISTOL_HAND_CANNON_FORM = makePistolForm({
  key: "Hand Cannon",
  name: "Hand Cannon",
  label: "Hand Cannon",
  text: "",
  damage: { resolve: 3, wounds: 3 },
  capacity: { max: 1, value: 1 }
});
