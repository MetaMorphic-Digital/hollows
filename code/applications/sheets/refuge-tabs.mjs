import { NPC_ROLES } from "../../data/refuge/index.js";

export default [
  {
    id: "upgrades",
    label: "HOLLOWS.REFUGE.upgrades",
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
  },

  {
    id: "actions",
    label: "HOLLOWS.REFUGE.tabs.actions",
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
  },

  {
    id: "resources",
    label: "HOLLOWS.REFUGE.tabs.resources",
    template: "systems/hollows/templates/actor/refuge/resources-tab.html",
    prepareContext: sheet => ({
      equipmentStock: sheet.actor.items.filter(item => item.type === "equipment")
        .map(item => ({ id: item.id, name: item.name, category: item.system.schema.fields.category.choices[item.system.category] })),
      entityChoices: game.actors.filter(actor => actor.type === "entity")
        .map(actor => ({ value: actor.id, label: actor.name })),
    }),
  },

  {
    id: "residents",
    label: "HOLLOWS.REFUGE.tabs.residents",
    template: "systems/hollows/templates/actor/refuge/residents-tab.html",
    prepareContext: (sheet) => {
      const actor = sheet.actor;
      const residentIds = actor.system.residents;
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
          .filter((a) => (a.type === "npc") && !residentIds.includes(a.id))
          .map((a) => ({ id: a.id, name: a.name })),
        npcRoleRows: NPC_ROLES.map(role => {
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
  },
];
