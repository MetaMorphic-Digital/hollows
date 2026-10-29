// Refuge sheet tab registry. A tab renders only when its `hasContent` passes;

import { getRefugeNpcRoles } from "../../data/refuge/index.js";

const TABS = [];
export default TABS;

/** Registry exposed to content packs through hollows.applications.sheets. */
export class RefugeTabRegistry {
  /**
   * Duplicate IDs are ignored; lower order values render first.
   * @param {object} definition
   * @param {string} definition.id Unique tab identifier.
   * @param {string} definition.label Tab title.
   * @param {string} definition.template Handlebars template path.
   * @param {number} [definition.order] Sort priority.
   * @param {Function} [definition.hasContent] Visibility predicate.
   * @param {Function} [definition.prepareContext] Template data provider.
   * @param {Function} [definition.activateListeners] DOM listener setup.
   */
  static register(definition) {
    if (!definition?.id || TABS.some(tab => tab.id === definition.id)) return;
    TABS.push(definition);
    TABS.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }
}

// ─── Upgrades ─────────────────────────────────────────────────────────────────

RefugeTabRegistry.register({
  id: "upgrades",
  label: "HOLLOWS.REFUGE.upgrades",
  order: 10,
  template: "systems/hollows/templates/actor/refuge/upgrades-tab.html",
  prepareContext: (sheet) => ({
    upgrades: sheet.actor.system.upgradeItems.map(item => ({
      id: item.id,
      name: item.name,
      text: item.system.text,
      category: item.system.schema.fields.category.choices[item.system.category],
      pending: item.system.pending,
      missing: item.system.getMissingRequirements(sheet.actor).join(", "),
    })),
  }),
});

// ─── Actions ──────────────────────────────────────────────────────────────────

RefugeTabRegistry.register({
  id: "actions",
  label: "Actions",
  order: 20,
  template: "systems/hollows/templates/actor/refuge/actions-tab.html",
  hasContent: actor => actor.system.upgradeItems.some(item => item.system.actions.length),
  prepareContext: (sheet) => ({
    actionsCatalog: sheet.actor.system.upgradeItems.flatMap(item => item.system.actions.map((action, index) => ({
      itemId: item.id,
      action: index,
      name: item.system.schema.fields.actions.element.fields.type.choices[action.type],
      cost: action.cost,
      upgradeName: item.name,
      description: item.system.text,
      available: item.system.isAvailable(sheet.actor),
    }))),
  }),
});

// ─── Resources ────────────────────────────────────────────────────────────────

RefugeTabRegistry.register({
  id: "resources",
  label: "Resources",
  order: 30,
  template: "systems/hollows/templates/actor/refuge/resources-tab.html",
});

// ─── Residents ────────────────────────────────────────────────────────────────

RefugeTabRegistry.register({
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
      npcRoleRows: getRefugeNpcRoles().map(role => {
        const current = actor.system.npcRoles[role.key];
        const assigned = game.actors.get(current);
        const candidates = [...roleCandidates];
        if (assigned && !candidates.some(candidate => candidate.id === current)) {
          candidates.push({ id: current, name: assigned.name });
        }
        return { key: role.key, label: role.label, current, candidates };
      }),
    };
  },
  activateListeners: (sheet, root) => {
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
