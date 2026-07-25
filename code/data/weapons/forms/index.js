import { registerWeaponForm } from "../registry.js";
import { KNIFE_WICKED_FORM } from "./knife/index.js";
import { ARMOUR_METAL_FORM, ARMOUR_SILK_FORM } from "./armour/index.js";
import { SPEAR_HEAVY_FORM } from "./spear/index.js";
import { BOOK_SACRED_FORM } from "./book/index.js";
import { SHOTGUN_SAWN_OFF_FORM } from "./shotgun/index.js";
import { RIFLE_REPEATING_FORM } from "./rifle/index.js";
import { SWORD_NOBLE_FORM } from "./sword/index.js";
import { PISTOL_HAND_CANNON_FORM, PISTOL_SINGLE_ACTION_FORM } from "./pistol/index.js";

export const BASE_WEAPON_FORMS = Object.freeze([
  KNIFE_WICKED_FORM,
  ARMOUR_METAL_FORM,
  ARMOUR_SILK_FORM,
  SPEAR_HEAVY_FORM,
  BOOK_SACRED_FORM,
  SHOTGUN_SAWN_OFF_FORM,
  RIFLE_REPEATING_FORM,
  SWORD_NOBLE_FORM,
  PISTOL_HAND_CANNON_FORM,
  PISTOL_SINGLE_ACTION_FORM
]);

for (const form of BASE_WEAPON_FORMS) {
  registerWeaponForm(form);
}
