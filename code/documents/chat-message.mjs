import { applyHazardRoll } from "./actor/hazard-damage.js";

/**
 * System implementation of the ChatMessage class.
 * @extends {foundry.documents.ChatMessage}
 */
export default class HollowsChatMessage extends foundry.documents.ChatMessage {
  #hazardRolls = new foundry.utils.Semaphore(1);

  /** Return a copy of the recorded Hazard rolls. */
  get hazardProgress() {
    const progress = this.getFlag("hollows", "hazard")?.progress ?? [];
    return [...progress];
  }

  /** Resolve this card's rolls sequentially on the GM client. */
  applyHazardRoll(actor, rollValue) {
    return this.#hazardRolls.add(applyHazardRoll, this, actor, rollValue);
  }
}
