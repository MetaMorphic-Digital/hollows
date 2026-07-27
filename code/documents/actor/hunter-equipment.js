import { confirmDialog } from "../../applications/apps/selection-dialogs.mjs";
import { getContentPacks } from "../../helpers/extensions.js";

// ─── Equipment Packs ──────────────────────────────────────────────────────────

export async function getEquipmentPackDocs(kind) {
  const packs = getContentPacks(`${kind}-equipment`).map((id) => game.packs.get(id)).filter(Boolean);
  const docs = await Promise.all(packs.map((p) => p.getDocuments()));
  return docs.flat().filter((d) => d.type === "equipment");
}

export function getEquipmentWorldDocs(kind) {
  return (game.items?.contents || []).filter((item) =>
    item.type === "equipment" && getEquipmentCatalogSlotKey(item) === kind
  );
}

export async function getEquipmentDocs(kind) {
  const docs = [...(await getEquipmentPackDocs(kind)), ...getEquipmentWorldDocs(kind)];
  const seen = new Set();
  return docs.filter((doc) => {
    const key = getEquipmentDocReference(doc);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getEquipmentDocReference(doc) {
  return String(doc?.uuid || doc?.id || "");
}

export function equipmentDocMatchesReference(doc, reference) {
  const ref = String(reference || "");
  if (!ref) return false;
  return getEquipmentDocReference(doc) === ref || String(doc?.id || "") === ref;
}

function getEquipmentCatalogSlotKey(item) {
  const slot = getEquipmentSlotKey(item?.system?.category);
  if (slot) return slot;
  return String(item?.system?.category || "") ? "" : "exploration";
}

// ─── Equipment Slots ──────────────────────────────────────────────────────────

export function getEquipmentSlotKey(category) {
  const key = String(category || "").toLowerCase();
  if (key === "exploration") return "exploration";
  if (key === "battle") return "battle";
  return "";
}

export function getHunterEquipmentItemsForSlot(actor, slot) {
  if (!actor || actor.type !== "hunter") return [];
  const slotKey = String(slot || "");
  if (slotKey === "relic") return actor.items.filter((item) => item.type === "relic");
  return actor.items.filter((item) =>
    item.type === "equipment" && getEquipmentSlotKey(item.system?.category) === slotKey
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

export async function replaceHunterEquipmentSlot(actor, slot, doc) {
  if (!actor || actor.type !== "hunter" || !doc) return null;
  const slotKey = String(slot || "");
  await deleteHunterEquipmentSlot(actor, slotKey);
  const payload = foundry.utils.deepClone(doc.toObject());
  delete payload._id;
  if (payload.type === "equipment" && getEquipmentSlotKey(slotKey)) {
    foundry.utils.setProperty(payload, "system.category", slotKey);
  }
  const created = await actor.createEmbeddedDocuments("Item", [payload]);
  const item = created?.[0] || null;
  await syncEquipmentSlotsFromItems(actor);
  return item;
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
