import { runHollowsInit } from "./init-bootstrap.js";

export function registerInitHooks() {
  Hooks.once("init", runHollowsInit);
}
