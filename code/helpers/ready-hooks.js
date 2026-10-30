import { runHollowsReady } from "./ready-bootstrap.js";
import RefugeData from "../data/actors/refuge.mjs";

export function registerReadyHooks() {
  Hooks.once("ready", runHollowsReady);
  Hooks.once("ready", () => {
    Hooks.on("userConnected", () => RefugeData.renderSheets());
    Hooks.on("updateUser", (user, changes) => {
      if (("character" in changes) || ("role" in changes)) RefugeData.renderSheets();
    });
  });
}
