/** Weapon templates supplied by visible Item compendiums. */
export class WeaponCatalog {
  /** Read the index fields needed to choose weapons and abilities. */
  static async getIndex(type) {
    const packs = game.packs.filter(pack => (pack.documentName === "Item") && pack.visible);
    const indexes = await Promise.all(packs.map(pack => pack.getIndex({
      fields: ["type", "system.weaponType", "system.tier"],
    })));
    return indexes.flatMap(index => index.contents)
      .filter(item => item.type === type)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Load the matching weapon or ability templates. */
  static async getDocuments(type, { weaponType, tier } = {}) {
    const entries = (await this.getIndex(type)).filter(item =>
      (!weaponType || (item.system.weaponType === weaponType))
      && ((tier === undefined) || (item.system.tier === tier)));
    return Promise.all(entries.map(item => fromUuid(item.uuid)));
  }
}

/** Load the available Weapon templates. */
export async function getWeaponPackDocs() {
  return WeaponCatalog.getDocuments("weapon");
}
