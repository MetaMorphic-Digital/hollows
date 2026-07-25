import { registerChatUiHooks } from "./applications/ui/chat-hooks.js";
import {
  registerCombatRuntimeHooks,
  registerCombatUiHooks
} from "./helpers/combat-hooks.js";
import { registerChatMessageHooks } from "./helpers/chat-hooks-runtime.js";
import { registerInitHooks } from "./helpers/init-hooks.js";
import { registerReadyHooks } from "./helpers/ready-hooks.js";
import { registerActorHooks } from "./helpers/actor-hooks.js";
import { registerCanvasHooks } from "./helpers/canvas-hooks.js";

registerActorHooks();
registerCanvasHooks();
registerChatMessageHooks();
registerChatUiHooks();
registerCombatRuntimeHooks();
registerCombatUiHooks();
registerInitHooks();
registerReadyHooks();
