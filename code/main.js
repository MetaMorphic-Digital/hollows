import { registerActorHooks } from "./helpers/actor-hooks.js";
import { registerCanvasHooks } from "./helpers/canvas-hooks.js";
import { registerChatMessageHooks } from "./helpers/chat-hooks-runtime.js";
import { registerChatUiHooks } from "./applications/ui/chat-hooks.js";
import { registerInitHooks } from "./helpers/init-hooks.js";
import { registerReadyHooks } from "./helpers/ready-hooks.js";

/**
 * FIXME: All these various hooks should be moved into proper extensions of their various
 * applications, models, and document classes rather than using Hooks. It is preferrable
 * for a system to leverage subclassing rather than hooks, which are mostly there for modules to use.
 */
export default function doThing() {
  registerActorHooks();
  registerCanvasHooks();
  registerChatMessageHooks();
  registerChatUiHooks();
  registerInitHooks();
  registerReadyHooks();
}
