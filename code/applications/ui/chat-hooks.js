import { applyHazardRoll } from "../../documents/actor/hazard-damage.js";
import { getActiveHunterForUser } from "../../canvas/zone.js";
import { createHazardChatUiHandlers } from "./chat-hazards.js";

export function registerChatUiHooks() {
  const hazards = createHazardChatUiHandlers({
    applyHazardRoll,
    getActiveHunterForUser
  });
  Hooks.on("renderChatMessageHTML", hazards.onRenderHazardMessage);
}
