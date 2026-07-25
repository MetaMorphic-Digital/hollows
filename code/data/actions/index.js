/**
 * Manoeuvre registry — the action layer's hub. Maps a manoeuvre name to its
 * orchestration entry point so abilities can grant manoeuvres declaratively
 * (`grantManoeuvre` effect, Control reaction) without hard-coding the call.
 *
 *   runManoeuvre(name, actor)  — run a manoeuvre on the actor's own client.
 *                                When `name` is empty, the actor is prompted.
 *   GRANT_MANOEUVRE            — cross-client courier: when a manoeuvre is
 *                                granted to a Hunter owned by another player,
 *                                this reaction runs it on that player's client.
 */
import { Reaction } from "../mechanics/Reaction.js";
import { openTakeCoverForActor } from "./take-cover.js";
import { openReloadForActor } from "./reload.js";
import { openGuardDialogForActor } from "./guard.js";
import { applyFocusToActor } from "./focus.js";
import { grantMoveNotice } from "./move.js";
import { openUseForActor } from "./use.js";
import { getRegisteredManoeuvreAvailability } from "./manoeuvre-availability.js";

export { registerManoeuvreAvailabilityProvider } from "./manoeuvre-availability.js";
export { registerDefenceOptionProvider } from "./defence-options.js";
export { registerTerrainDiscardProvider } from "./terrain-discard-options.js";

export const MANOEUVRES = {
  "take-cover": openTakeCoverForActor,
  "reload":     openReloadForActor,
  "guard":      openGuardDialogForActor,
  "focus":      applyFocusToActor,
  "move":       grantMoveNotice,
  "use":        openUseForActor
};

export const MANOEUVRE_LABELS = {
  "take-cover": "Take Cover",
  "reload":     "Reload",
  "guard":      "Guard",
  "focus":      "Focus",
  "move":       "Move",
  "use":        "Use"
};

export function getManoeuvreAvailability(actor, manoeuvre, context = {}) {
  const key = String(manoeuvre || "");
  if (!key || !MANOEUVRES[key]) {
    return { available: false, reason: "Unknown manoeuvre" };
  }
  return getRegisteredManoeuvreAvailability(actor, key, context);
}

export function isManoeuvreAvailable(actor, manoeuvre, context = {}) {
  return getManoeuvreAvailability(actor, manoeuvre, context).available;
}

/** Prompt the acting player to choose a manoeuvre. Returns "" on cancel. */
async function promptManoeuvreChoice(actor, options, context = {}) {
  const names = (Array.isArray(options) && options.length)
    ? options.filter((m) => MANOEUVRES[m])
    : Object.keys(MANOEUVRES);
  const availableNames = names.filter((m) => isManoeuvreAvailable(actor, m, { source: "granted", ...context, silent: true }));
  if (!availableNames.length) {
    ui.notifications?.warn?.("No available manoeuvres.");
    return "";
  }
  const optHtml = names
    .filter((m) => availableNames.includes(m))
    .map((m) => `<option value="${m}">${MANOEUVRE_LABELS[m] || m}</option>`)
    .join("");
  const picked = await foundry.applications.api.DialogV2.wait({
    window: { title: "Immediate Manoeuvre" },
    content: `<form class="hollows-roll-dialog"><div class="form-group"><label>Manoeuvre</label><select name="m">${optHtml}</select></div></form>`,
    rejectClose: false,
    buttons: [
      { action: "ok", label: "Confirm", default: true, callback: (_e, _b, d) => String(d.element.querySelector("[name=m]")?.value || "") },
      { action: "cancel", label: "Cancel", callback: () => "" }
    ]
  });
  return picked || "";
}

/**
 * Run a manoeuvre on `actor`. When `name` is empty the actor picks one
 * (optionally restricted to `opts.options`). Runs on the caller's client.
 */
export async function runManoeuvre(name, actor, opts = {}) {
  if (!actor) return;
  let key = String(name || "");
  if (!key) {
    key = await promptManoeuvreChoice(actor, opts.options, { source: opts.source || "granted" });
    if (!key) return;
  }
  const fn = MANOEUVRES[key];
  if (!fn) {
    console.warn(`Hollows | unknown manoeuvre: ${key}`);
    return;
  }
  const availability = getManoeuvreAvailability(actor, key, { source: opts.source || "granted" });
  if (!availability.available) {
    const label = MANOEUVRE_LABELS[key] || key;
    const reason = availability.reason ? ` (${availability.reason})` : "";
    ui.notifications?.warn?.(`${label} is unavailable${reason}.`);
    return;
  }
  return await fn(actor);
}

/**
 * Cross-client courier for granted manoeuvres (see module header). The
 * granting client offers this reaction to the recipient's owner; the
 * recipient's client then runs the manoeuvre (and picks it, if unspecified).
 */
export const GRANT_MANOEUVRE = new Reaction("grant-manoeuvre", {
  name: "Granted Manoeuvre",
  promptOnPlayer: async ({ targetId, manoeuvre, options } = {}) => {
    const target = targetId ? game.actors.get(String(targetId)) : null;
    if (!target || target.type !== "hunter") return null;
    if (!target.testUserPermission(game.user, "OWNER")) return null;
    await runManoeuvre(manoeuvre || "", target, { options, source: "granted" });
    return { used: true };
  }
});
