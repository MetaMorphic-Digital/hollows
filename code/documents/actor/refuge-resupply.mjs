import HollowsItem from "../item.mjs";
import { pickOne, pickMany, confirmDialog } from "../../applications/apps/selection-dialogs.mjs";
import { getEquipmentDocs, getHunterEquipmentItemsForSlot } from "./hunter-equipment.js";
import RefugeUpgradeData from "../../data/items/refuge-upgrade.mjs";

/** Choose, store and replenish the Refuge's equipment. */
export default class RefugeResupply {
  /** Choose an unlock or a complete equipment loadout before spending resources. */
  static async prepare(hunter, refuge, { type }) {
    const stock = refuge.items.filter(item => item.type === "equipment");
    if (type !== "resupply") {
      const category = type === "unlockBattle" ? "battle" : "exploration";
      const sources = new Set(stock.map(HollowsItem.getSourceUuid));
      const options = (await getEquipmentDocs(category)).filter(item => !sources.has(HollowsItem.getSourceUuid(item)));
      if (!options.length) {
        ui.notifications.warn(game.i18n.localize("HOLLOWS.EQUIPMENT.nothingToUnlock"));
        return null;
      }
      const uuid = await pickOne({
        title: game.i18n.localize(RefugeUpgradeData.ACTIONS[type].label),
        options: options.map(item => ({ value: item.uuid, label: item.name })),
      });
      return uuid ? { uuid } : null;
    }
    const choice = { equipment: [], replaceRelic: false };
    for (const category of ["exploration", "battle"]) {
      const available = stock.filter(item => item.system.category === category);
      const carried = new Set(getHunterEquipmentItemsForSlot(hunter, category).map(HollowsItem.getSourceUuid));
      const options = available.map(item => ({ value: item.uuid, label: item.name, selected: carried.has(HollowsItem.getSourceUuid(item)) }));
      const limit = refuge.system.benefits[`${category}Slots`];
      let picked;
      while (true) {
        picked = await pickMany({
          title: game.i18n.localize(category === "battle" ? "HOLLOWS.EQUIPMENT.battle" : "HOLLOWS.EQUIPMENT.exploration"), options,
          hint: game.i18n.format("HOLLOWS.EQUIPMENT.chooseUpTo", { limit }),
        });
        if (picked === null) return null;
        if (picked.length <= limit) break;
        ui.notifications.warn(game.i18n.format("HOLLOWS.EQUIPMENT.chooseUpTo", { limit }));
        for (const option of options) option.selected = picked.includes(option.value);
      }
      choice.equipment.push(...picked);
      if ((category === "battle") && (picked.length === limit) && hunter.items.some(item => item.type === "relic")
        && !refuge.system.benefits.extraRelicSlot) {
        choice.replaceRelic = await confirmDialog({
          title: game.i18n.localize("HOLLOWS.REFUGE.resupply"),
          bodyHtml: game.i18n.localize("HOLLOWS.EQUIPMENT.replaceRelic"),
        });
        if (!choice.replaceRelic) return null;
      }
    }
    return choice;
  }

  /** Copy newly discovered equipment into the Refuge's stock. */
  static async unlock(refuge, items) {
    const sources = new Set(refuge.items.filter(item => item.type === "equipment").map(HollowsItem.getSourceUuid));
    const additions = [];
    for (const item of items) {
      const source = HollowsItem.getSourceUuid(item);
      if (sources.has(source)) continue;
      sources.add(source);
      const data = HollowsItem.toEmbeddedData(item);
      data.system.used = false;
      additions.push(data);
    }
    if (!additions.length) return false;
    await refuge.createEmbeddedDocuments("Item", additions);
    return true;
  }

  /** Apply the chosen loadout on the GM before the Refuge charges the action. */
  static async apply(hunter, refuge, type, choice) {
    const uuids = type === "resupply" ? choice.equipment : [choice.uuid];
    const templates = await Promise.all(uuids.map(uuid => fromUuid(uuid)));
    if (templates.some(item => !item)) throw new Error(game.i18n.localize("HOLLOWS.EQUIPMENT.missingItem"));
    if (type !== "resupply") {
      if (!(await this.unlock(refuge, templates))) {
        throw new Error(game.i18n.localize("HOLLOWS.EQUIPMENT.nothingToUnlock"));
      }
      return;
    }

    const owned = hunter.items.filter(item => item.type === "equipment");
    const selected = new Set(templates.map(HollowsItem.getSourceUuid));
    const removed = owned.filter(item => !selected.has(HollowsItem.getSourceUuid(item))).map(item => item.id);
    if (choice.replaceRelic) removed.push(...hunter.items.filter(item => item.type === "relic").map(item => item.id));
    if (removed.length) await hunter.deleteEmbeddedDocuments("Item", removed);
    const updates = owned.filter(item => !removed.includes(item.id) && item.system.used)
      .map(item => ({ _id: item.id, "system.used": false }));
    if (updates.length) await hunter.updateEmbeddedDocuments("Item", updates);
    const carried = new Set(owned.map(HollowsItem.getSourceUuid));
    const additions = templates.filter(item => !carried.has(HollowsItem.getSourceUuid(item))).map(item => {
      const data = HollowsItem.toEmbeddedData(item);
      data.system.used = false;
      return data;
    });
    if (additions.length) await hunter.createEmbeddedDocuments("Item", additions, { hollowsSkipEquipmentSlotCheck: true });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: hunter }),
      content: `<p>${game.i18n.format("HOLLOWS.EQUIPMENT.resupplied", { name: foundry.utils.escapeHTML(hunter.name) })}</p>`,
    });
  }
}
