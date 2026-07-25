/**
 * Utilities for safely setting flags on actors and messages,
 * routing through the GM when the current user lacks permissions.
 */

import { runGMQuery } from "../helpers/queries.js";

export async function setActorFlagSafe(actor, key, value) {
  if (!actor || !key) return false;
  if (game.user?.isGM || actor.testUserPermission(game.user, "OWNER")) {
    try {
      await actor.setFlag("hollows", key, value);
    } catch (err) {
      console.warn("Hollows | Failed to set actor flag", err);
    }
    return true;
  }
  try {
    await runGMQuery("hollows.actorMutation", {
      actorId: actor.id,
      type: "flag",
      payload: { key, value }
    });
    return true;
  } catch (err) {
    console.warn("Hollows | Failed to set actor flag via query", err);
    return false;
  }
}

export async function setMessageFlagSafe(message, key, value) {
  if (!message) return;
  if (game.user?.isGM) {
    try {
      await message.setFlag("hollows", key, value);
    } catch (err) {
      console.warn("Hollows | Failed to set message flag", err);
    }
    return;
  }
  try {
    await runGMQuery("hollows.setMessageFlag", { messageId: message.id, key, value });
  } catch (err) {
    console.warn("Hollows | Failed to relay message flag via query", err);
  }
}
