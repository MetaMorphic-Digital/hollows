import { getActiveHunterForUser } from "../../canvas/zone.js";
import { createHazardChatUiHandlers } from "./chat-hazards.js";

/** Register Hazard rendering and changes to the current user's hunter. */
export function registerChatUiHooks() {
  const hazards = createHazardChatUiHandlers({
    getActiveHunterForUser,
  });
  Hooks.on("renderChatMessageHTML", hazards.onRenderHazardMessage);
  Hooks.on("controlToken", () => hazards.refreshHazardButtons());
  Hooks.on("updateUser", (user, changes) => {
    if ((user.id === game.user.id) && ("character" in changes)) hazards.refreshHazardButtons();
  });
  Hooks.on("canvasReady", () => hazards.refreshHazardButtons());
}
