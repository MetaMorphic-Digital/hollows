import { runHollowsReady } from "./ready-bootstrap.js";

export function registerReadyHooks() {
  Hooks.once("ready", runHollowsReady);
}
