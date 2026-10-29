import { runUserQuery, COMBAT_QUERY_TIMEOUT } from "../../helpers/queries.js";
import { getActiveHollowActor } from "../../canvas/zone.js";
import { getPrimaryRefugeActor } from "../../data/refuge/index.js";
import { removeCondition } from "./conditions.js";
import { adjustHunterResource } from "./resources.js";

const REFUGE_ACTIONS = new foundry.utils.Semaphore(1);

/** Send Refuge actions to the active GM for sequential execution. */
export async function requestRefugeAction(data) {
  return runUserQuery(game.users.activeGM, "hollows.refugeAction", data, { timeout: COMBAT_QUERY_TIMEOUT });
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

/** Restore lost health and wake a Hunter, or grant temporary health. */
export async function applyRecover(refuge, hunter, { type = "fullRecovery", resolve = 0, wounds = 0 } = {}) {
  const temporary = type === "temporaryHealth";
  if (temporary) {
    await adjustHunterResource(hunter, { resolve, wounds }, { allowTemporary: true });
  } else {
    await hunter.update({
      "system.health.resolve.value": Math.max(hunter.system.health.resolve.value, hunter.system.health.resolve.max),
      "system.health.wounds.value": Math.max(hunter.system.health.wounds.value, hunter.system.health.wounds.max),
    });
    await removeCondition(hunter, "dead");
    await removeCondition(hunter, "dying");
  }
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: refuge }),
    content: `<div class="hollows-chat">${game.i18n.format(temporary ? "HOLLOWS.REFUGE.temporaryHealthGained" : "HOLLOWS.REFUGE.recovered", {
      name: foundry.utils.escapeHTML(hunter.name), resolve, wounds,
    })}</div>`,
  });
  return true;
}

export async function applyEnterRefuge(refuge) {
  if (!refuge || refuge.type !== "refuge") return false;
  const hunters = refuge.system.enteringHunters;
  if (!hunters.length) return false;
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
  for (const hunter of hunters) await hunter.system.enterRefuge(refuge);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: refuge }),
    content: `<div class="hollows-chat">The Hunters enter the <strong>Refuge</strong> — <strong>-1 Bone</strong>, <strong>+3 Doom</strong>.</div>`
  });
  return true;
}

export async function applyRefugeActionPayload(data = {}) {
  const type = String(data.type || "");
  const refuge = data.refugeId ? game.actors.get(String(data.refugeId)) : getPrimaryRefugeActor();
  if (!refuge || refuge.type !== "refuge") return;
  const handler = REFUGE_HANDLERS[type];
  if (handler) return REFUGE_ACTIONS.add(handler, refuge, data);
}

const REFUGE_HANDLERS = {
  buyUpgrade: async (refuge, data) => {
    const upgrade = await fromUuid(data.upgradeUuid);
    return refuge.system.buyUpgrade(upgrade);
  },
  useUpgrade: async (refuge, data) => {
    const hunter = await fromUuid(data.hunterUuid);
    return refuge.system.useUpgrade(data.itemId, data.action, hunter, data.choice);
  },
  recoverOnEntry: async (refuge, data) => {
    const hunter = await fromUuid(data.hunterUuid);
    return refuge.system.recoverOnEntry(hunter);
  },
  enterRefuge: applyEnterRefuge,
  enterHunter: async (refuge, data) => {
    const hunter = await fromUuid(data.hunterUuid);
    await hunter.system.enterRefuge(refuge);
  },
  unlockEquipment: async (refuge, data) => {
    const { default: RefugeResupply } = await import("./refuge-resupply.mjs");
    return RefugeResupply.unlock(refuge, [await fromUuid(data.itemUuid)]);
  },
  installationTest: async (refuge, data) => {
    const hunter = await fromUuid(data.hunterUuid);
    const { default: RefugeInstallation } = await import("./refuge-installation.mjs");
    await RefugeInstallation.apply(hunter, data.testId, data.config);
  },
};
