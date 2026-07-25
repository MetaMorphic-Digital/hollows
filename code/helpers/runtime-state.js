export function getHollowsNamespace() {
  if (!game.hollows) game.hollows = {};
  return game.hollows;
}

export function getHollowsWeaponIndex() {
  return getHollowsNamespace().weaponIndex || null;
}

export function setHollowsWeaponIndex(index) {
  getHollowsNamespace().weaponIndex = index;
  return index;
}
