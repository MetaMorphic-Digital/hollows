// Refuge sheet tab registry. A tab renders only when its `hasContent` passes;

import { getRefugeActions, getRefugeNpcRoles } from "../../data/refuge/index.js";
import {
  equipmentDocMatchesReference,
  getEquipmentDocReference,
  getEquipmentDocs,
} from "../../documents/actor/hunter-equipment.js";
import { requestRefugeAction, applySetUnlocks } from "../../documents/actor/refuge.js";
import { getActiveHunterForUser } from "../../canvas/zone.js";

const TABS = [];
export default TABS;

function registerRefugeTab(def) {
  if (!def?.id || TABS.some((t) => t.id === def.id)) return;
  TABS.push(def);
  TABS.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

// ─── Actions ──────────────────────────────────────────────────────────────────

async function openRefugeAction(sheet, actionId) {
  const def = getRefugeActions().find((a) => a.id === actionId);
  if (typeof def?.open !== "function") return;
  const activeHunter = game.user?.isGM ? null : getActiveHunterForUser();
  if (!game.user?.isGM && !activeHunter) {
    ui.notifications.warn("Select or control your Hunter to use Refuge actions.");
    return;
  }
  await def.open(sheet.actor, activeHunter);
}

registerRefugeTab({
  id: "actions",
  label: "Actions",
  order: 20,
  template: "systems/hollows/templates/actor/refuge/actions-tab.html",
  hasContent: () => getRefugeActions().length > 0,
  prepareContext: (sheet) => ({
    actionsCatalog: getRefugeActions().map((a) => ({
      id: a.id,
      name: a.name,
      category: a.category,
      description: a.description,
      requires: a.requires || [],
      available: typeof a.available === "function" ? !!a.available(sheet.actor) : true,
    })),
  }),
  activateListeners: (sheet, root) => {
    for (const el of root.querySelectorAll("[data-action-use]")) {
      el.addEventListener("click", async (event) => {
        event.preventDefault();
        await openRefugeAction(sheet, String(event.currentTarget.dataset.actionUse || ""));
      });
    }
  },
});

// ─── Resources ────────────────────────────────────────────────────────────────

registerRefugeTab({
  id: "resources",
  label: "Resources",
  order: 30,
  template: "systems/hollows/templates/actor/refuge/resources-tab.html",
});

// ─── Unlocks ──────────────────────────────────────────────────────────────────

async function getUnlockDocs(kind) {
  return getEquipmentDocs(kind);
}

function unlockedIds(actor, kind) {
  const list = kind === "exploration" ? actor.system?.unlockedExploration : actor.system?.unlockedBattle;
  return Array.isArray(list) ? list : [];
}

async function getUnlockOptions(actor, kind) {
  const ids = unlockedIds(actor, kind);
  return (await getUnlockDocs(kind)).map((doc) => ({
    id: getEquipmentDocReference(doc),
    docId: String(doc.id || ""),
    name: doc.name,
    text: doc.system?.text || "",
    unlocked: ids.some((id) => equipmentDocMatchesReference(doc, id)),
  }));
}

registerRefugeTab({
  id: "unlocks",
  label: "Unlocks",
  order: 40,
  template: "systems/hollows/templates/actor/refuge/unlocks-tab.html",
  hasContent: async () =>
    (await getUnlockDocs("exploration")).length + (await getUnlockDocs("battle")).length > 0,
  prepareContext: async (sheet) => ({
    unlockExplorationOptions: await getUnlockOptions(sheet.actor, "exploration"),
    unlockBattleOptions: await getUnlockOptions(sheet.actor, "battle"),
  }),
  activateListeners: (sheet, root) => {
    for (const el of root.querySelectorAll("[data-unlock-kind]")) {
      el.addEventListener("change", async (event) => {
        event.preventDefault();
        const input = event.currentTarget;
        const kind = String(input.dataset.unlockKind || "");
        const id = String(input.dataset.unlockId || "");
        const docId = String(input.dataset.unlockDocId || "");
        if (!kind || !id) return;
        const current = unlockedIds(sheet.actor, kind);
        const next = input.checked
          ? (current.includes(id) ? current : current.concat([id]))
          : current.filter((x) => x !== id && x !== docId);
        if (await requestRefugeAction({ type: "setUnlocks", refugeId: sheet.actor.id, kind, list: next })) return;
        await applySetUnlocks(sheet.actor, kind, next);
      });
    }
  },
});

// ─── Residents ────────────────────────────────────────────────────────────────

registerRefugeTab({
  id: "residents",
  label: "Residents",
  order: 50,
  template: "systems/hollows/templates/actor/refuge/residents-tab.html",
  prepareContext: (sheet) => {
    const actor = sheet.actor;
    const residentIds = Array.isArray(actor.system?.residents) ? actor.system.residents : [];
    const residents = residentIds
      .map((id) => game.actors.get(id))
      .filter((a) => a?.type === "npc")
      .map((a) => ({
        id: a.id,
        name: a.name,
        occupation: a.system?.refugeOccupation || "",
        inRefuge: !!a.system?.inRefuge,
      }));
    const roleCandidates = residents.filter((r) => r.inRefuge).map((r) => ({ id: r.id, name: r.name }));
    return {
      residents,
      availableNpcs: game.actors.contents
        .filter((a) => a.type === "npc" && !residentIds.includes(a.id))
        .map((a) => ({ id: a.id, name: a.name })),
      npcRoleRows: getRefugeNpcRoles().map((role) => ({
        key: role.key,
        label: role.label,
        current: String(actor.system?.npcRoles?.[role.key] || ""),
        candidates: roleCandidates,
      })),
    };
  },
  activateListeners: (sheet, root) => {
    for (const el of root.querySelectorAll("[data-role-select]")) {
      el.addEventListener("change", async (event) => {
        const role = String(event.currentTarget.dataset.roleSelect || "");
        if (!role) return;
        await sheet.actor.update({ [`system.npcRoles.${role}`]: String(event.currentTarget.value || "") });
      });
    }
    root.querySelector("[data-resident-add]")?.addEventListener("click", async (event) => {
      event.preventDefault();
      const npcId = String(root.querySelector("[name=npcId]")?.value || "");
      const npc = game.actors.get(npcId);
      if (!npc || npc.type !== "npc") return;
      const residentIds = Array.isArray(sheet.actor.system?.residents) ? [...sheet.actor.system.residents] : [];
      if (!residentIds.includes(npcId)) residentIds.push(npcId);
      await sheet.actor.update({ "system.residents": residentIds });
      if (!npc.system?.inRefuge) await npc.update({ "system.inRefuge": true });
    });
    for (const el of root.querySelectorAll("[data-resident-remove]")) {
      el.addEventListener("click", async (event) => {
        event.preventDefault();
        const npcId = String(event.currentTarget.dataset.residentRemove || "");
        if (!npcId) return;
        const residentIds = (Array.isArray(sheet.actor.system?.residents) ? sheet.actor.system.residents : [])
          .filter((id) => id !== npcId);
        await sheet.actor.update({ "system.residents": residentIds });
        const npc = game.actors.get(npcId);
        if (npc?.type === "npc" && npc.system?.inRefuge) await npc.update({ "system.inRefuge": false });
      });
    }
  },
});
