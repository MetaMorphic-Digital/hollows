import { dispatchToGM } from "../../helpers/queries.js";
import { getActiveHollowActor } from "../../canvas/zone.js";
import {
  getPrimaryRefugeActor,
  getRefugeActionHandler,
  registerRefugeActionHandler,
  registerRefugeActions,
  canRecover,
  getRecoverOptions,
  getRecoverAmounts
} from "../../data/refuge/index.js";
import { pickOne, resolveActionHunter } from "../../applications/apps/selection-dialogs.js";
import { applyInterceptors } from "../../helpers/extensions.js";
import { adjustHunterResource } from "./resources.js";

export async function requestRefugeAction(data) {
  if (game.user?.isGM) return false;
  await dispatchToGM("refugeAction", data);
  return true;
}

// `extra` folds other fields into the same clamped resource update.
export async function adjustRefugeResources(refuge, { bone = 0, hearts = 0 } = {}, extra = {}) {
  if (!refuge) return false;
  const curBone = Math.max(0, Number(refuge.system?.resources?.bone ?? 0));
  const curHearts = Math.max(0, Number(refuge.system?.resources?.hearts ?? 0));
  await refuge.update({
    "system.resources.bone": Math.max(0, curBone + Number(bone || 0)),
    "system.resources.hearts": Math.max(0, curHearts + Number(hearts || 0)),
    ...extra
  });
  return true;
}

export async function spendRefugeBone(refuge, amount) {
  if (!refuge || refuge.type !== "refuge") return false;
  const value = Math.max(0, Number(amount ?? 0));
  if (!value) return false;
  return adjustRefugeResources(refuge, { bone: -value });
}

export async function addRefugeResources(deltaBone, deltaHearts) {
  const refuge = getPrimaryRefugeActor();
  if (!refuge) return false;
  await adjustRefugeResources(refuge, {
    bone: Math.max(0, Number(deltaBone ?? 0)),
    hearts: Math.max(0, Number(deltaHearts ?? 0))
  });
  return true;
}

export async function applyRecover(refuge, hunter, mode = "full") {
  if (!refuge || refuge.type !== "refuge" || !hunter) return false;
  const recovery = getRecoverAmounts(refuge, hunter, mode);
  if (recovery.mode === "full") {
    await adjustHunterResource(hunter, {
      resolve: recovery.resolveValue,
      wounds: recovery.woundsValue
    });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: refuge }),
      content: `<div class="hollows-chat"><strong>${hunter.name}</strong> fully recovers.</div>`
    });
  } else {
    await adjustHunterResource(hunter, {
      resolve: recovery.resolveDelta,
      wounds: recovery.woundsDelta
    }, { allowTemporary: true });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: refuge }),
      content: `
        <div class="hollows-chat">
          <div><strong>${hunter.name}</strong> gains temporary recovery.</div>
          <div>Resolve +${recovery.resolveDelta}, Wounds +${recovery.woundsDelta}</div>
        </div>
      `
    });
  }
  await applyInterceptors("refuge-recover", { refuge, hunter, mode });
  return true;
}

export async function applyEnterRefuge(refuge) {
  if (!refuge || refuge.type !== "refuge") return false;
  const bone = Math.max(0, Number(refuge.system?.resources?.bone ?? 0));
  if (bone < 1) {
    ui.notifications.warn("Entering the Refuge costs 1 Bone.");
    return false;
  }
  await spendRefugeBone(refuge, 1);
  const hollow = getActiveHollowActor();
  if (hollow) {
    const current = Number(hollow.system?.doom?.current ?? 0);
    const cap = Number(hollow.system?.doom?.cap ?? 0);
    let next = current + 3;
    if (cap > 0) next = Math.min(cap, next);
    await hollow.update({ "system.doom.current": next });
  }
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: refuge }),
    content: `<div class="hollows-chat">The Hunters enter the <strong>Refuge</strong> — <strong>-1 Bone</strong>, <strong>+3 Doom</strong>.</div>`
  });
  return true;
}

export async function applySetUnlocks(refuge, kind, list = []) {
  if (!refuge || refuge.type !== "refuge") return false;
  const key = String(kind || "") === "exploration" ? "system.unlockedExploration" : "system.unlockedBattle";
  await refuge.update({ [key]: Array.isArray(list) ? list : [] });
  return true;
}

export async function applyRefugeActionPayload(data = {}) {
  const type = String(data.type || "");
  const refuge = data.refugeId ? game.actors.get(String(data.refugeId)) : getPrimaryRefugeActor();
  if (!refuge || refuge.type !== "refuge") return;
  const handler = getRefugeActionHandler(type);
  if (handler) await handler(refuge, data);
}

async function openRecover(refuge, hunter = null) {
  if (!canRecover(refuge)) return;
  const target = await resolveActionHunter(hunter, { title: "Recover" });
  if (!target) return;
  const recoverOptions = getRecoverOptions(refuge);
  let mode = "full";
  if (recoverOptions.length > 1) {
    mode = await pickOne({
      title: "Recover",
      label: "Recovery Type",
      options: recoverOptions.map((o) => ({ value: o.id, label: o.label }))
    });
    if (!mode) return;
  }
  await applyRecover(refuge, target, mode);
}

registerRefugeActions([{
  id: "recover",
  name: "Recover",
  category: "Recover",
  requires: [],
  description: "Restore lost Resolve and Wounds.",
  open: openRecover
}]);

registerRefugeActionHandler("enterRefuge", async (refuge) => applyEnterRefuge(refuge));
registerRefugeActionHandler("spendBone", async (refuge, data) => spendRefugeBone(refuge, data.amount));
registerRefugeActionHandler("setUnlocks", async (refuge, data) => applySetUnlocks(refuge, String(data.kind || ""), Array.isArray(data.list) ? data.list : []));
