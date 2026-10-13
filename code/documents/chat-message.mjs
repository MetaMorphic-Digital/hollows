import { applyHazardRoll } from "./actor/hazard-damage.js";

/**
 * System implementation of the ChatMessage class.
 * @extends {foundry.documents.ChatMessage}
 */
export default class HollowsChatMessage extends foundry.documents.ChatMessage {
  #hazardRolls = new foundry.utils.Semaphore(1);

  /** Read roll records, including the previous UUID-keyed flag format. */
  get hazardProgress() {
    const progress = this.getFlag("hollows", "hazard")?.progress ?? [];
    if (Array.isArray(progress)) return [...progress];
    const entries = foundry.utils.flattenObject(progress);
    return Object.keys(entries).filter(key => key.endsWith(".label")).map(key => {
      const actorUuid = key.slice(0, -6);
      return { actorUuid, label: entries[key], passed: entries[`${actorUuid}.passed`] };
    });
  }

  /** Resolve this card's rolls sequentially on the GM client. */
  applyHazardRoll(actor, rollValue) {
    return this.#hazardRolls.add(applyHazardRoll, this, actor, rollValue);
  }
}
