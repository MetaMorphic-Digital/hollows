export const WEAPONS = {
  Armour: { key: "Armour", label: "Armour" },
  Book: { key: "Book", label: "Book" },
  Knife: { key: "Knife", label: "Knife" },
  Pistol: { key: "Pistol", label: "Pistol" },
  Rifle: { key: "Rifle", label: "Rifle" },
  Shotgun: { key: "Shotgun", label: "Shotgun" },
  Spear: { key: "Spear", label: "Spear" },
  Sword: { key: "Sword", label: "Sword" }
};

export function registerWeaponType(def) {
  const key = String(def?.key || "").trim();
  if (!key) throw new Error("Hollows weapon type registration requires a key.");
  WEAPONS[key] = { key, label: String(def.label || key) };
}
