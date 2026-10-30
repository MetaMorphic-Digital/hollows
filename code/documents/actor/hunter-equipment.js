import HollowsItem from "../item.mjs";
import { confirmDialog } from "../../applications/apps/selection-dialogs.mjs";
import { ItemCatalog } from "../../data/item-catalog.js";

// ─── Equipment Packs ──────────────────────────────────────────────────────────

/** Load equipment of a category from visible compendiums. */
async function getEquipmentPackDocs(kind) {
  const entries = (await ItemCatalog.getIndex("equipment")).filter(item => item.system.category === kind);
  return Promise.all(entries.map(item => fromUuid(item.uuid)));
}

/** List visible world equipment of a category. */
function getEquipmentWorldDocs(kind) {
  return (game.items?.contents || []).filter((item) =>
    item.visible && (item.type === "equipment") && (item.system.category === kind),
  );
}

export async function getEquipmentDocs(kind) {
  const docs = [...(await getEquipmentPackDocs(kind)), ...getEquipmentWorldDocs(kind)];
  const seen = new Set();
  return docs.filter((doc) => {
    const key = HollowsItem.getSourceUuid(doc);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Equipment Slots ──────────────────────────────────────────────────────────

export function getHunterEquipmentItemsForSlot(actor, slot) {
  if (!actor || actor.type !== "hunter") return [];
  const slotKey = String(slot || "");
  if (slotKey === "relic") return actor.items.filter((item) => item.type === "relic");
  return actor.items.filter((item) =>
    item.type === "equipment" && item.system.category === slotKey
  );
}

export function getHunterEquipmentItemForSlot(actor, slot) {
  return getHunterEquipmentItemsForSlot(actor, slot)[0] || null;
}

export async function syncEquipmentSlotsFromItems(actor) {
  if (!actor || actor.type !== "hunter") return;
  if (!getHunterEquipmentItemForSlot(actor, "relic") && actor.system?.equipment?.relic?.used) {
    await actor.update({ "system.equipment.relic.used": false });
  }
}

export async function deleteHunterEquipmentSlot(actor, slot) {
  if (!actor || actor.type !== "hunter") return false;
  const slotKey = String(slot || "");
  const items = getHunterEquipmentItemsForSlot(actor, slotKey);
  if (items.length) {
    await actor.deleteEmbeddedDocuments("Item", items.map((item) => item.id));
  }
  if (slotKey === "relic") await actor.update({ "system.equipment.relic.used": false });
  await syncEquipmentSlotsFromItems(actor);
  return items.length > 0;
}

export async function confirmReplaceHunterRelic(actor, incomingName = "Relic") {
  if (!actor || actor.type !== "hunter") return false;
  const currentRelic = getHunterEquipmentItemsForSlot(actor, "relic")[0] || null;
  if (!currentRelic) return true;
  return await confirmDialog({
    title: "Replace Relic",
    bodyHtml: `<p>Equipping <strong>${foundry.utils.escapeHTML(String(incomingName || "Relic"))}</strong> will replace <strong>${foundry.utils.escapeHTML(currentRelic.name)}</strong>.</p>`,
    yesLabel: "Replace",
    noLabel: "Cancel"
  });
}

export async function applyRelicReplacementForHunter(actor) {
  if (!actor || actor.type !== "hunter") return;
  const currentRelic = getHunterEquipmentItemsForSlot(actor, "relic")[0] || null;
  if (currentRelic) await actor.deleteEmbeddedDocuments("Item", [currentRelic.id]);
  await actor.update({ "system.equipment.relic.used": false });
  await syncEquipmentSlotsFromItems(actor);
}
