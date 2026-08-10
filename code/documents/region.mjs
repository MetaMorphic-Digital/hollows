/**
 * System implementation of the RegionDocument class.
 * @extends {foundry.documents.RegionDocument}
 */
export default class HollowsRegionDocument extends foundry.documents.RegionDocument {
  /**
   * Update this region's curse data.
   * @param {number} value
   * @param {boolean} [delta=false]   Use the value as a delta, adding it to the current value.
   * @returns {Promise<HollowsRegionDocument>}
   */
  async updateRegionCurse(value, delta = false) {
    if (!Number.isFinite(value)) return this;
    if (delta) value = (this.flags[hollows.id]?.curse?.current ?? 0) + value;
    value = Math.clamp(value, 0, 6);
    await this.setFlag(hollows.id, "curse.current", value);
    return this;
  }
}
