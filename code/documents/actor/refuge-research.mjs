import { confirmDialog, pickOne, promptForm } from "../../applications/apps/selection-dialogs.mjs";
import { getActiveHollowActor } from "../../canvas/zone.js";
import { STAT_LABELS } from "../../data/system-constants.js";
import { EDGE_DEFS } from "../../data/entity/edges.js";
import { HunterStatRollFlow } from "../../dice/flow.js";
import { buildStandardRollCardHtml } from "../../applications/ui/roll-card.js";
import { getEffectiveEntityStat } from "../entity/entity-stats.js";
import { applyEdgeState } from "../entity/edges.js";
import { getTotalStatForActor } from "./hunter-combat.js";
import { getFocusCount, adjustHunterResource } from "./resources.js";
import { addCondition, removeCondition, getSpecialConditionRollMods } from "./conditions.js";
import { confirmReplaceHunterRelic, applyRelicReplacementForHunter } from "./hunter-equipment.js";

/** Research choices and their application through the Refuge action queue. */
export default class RefugeResearch {
  /** Collect research choices before committing resources. */
  static async prepare(hunter, refuge, action) {
    const { type } = action;
    if (type === "uncoverEdge") return this.#prepareEdge(hunter, refuge, action.cost);
    if (type === "craftAnchor") return this.#prepareAnchor(hunter);
    if (type === "essenceSyphon") return this.#prepareSyphon(refuge);
    const hollow = getActiveHollowActor();
    if (!hollow) throw new Error(game.i18n.localize("HOLLOWS.REFUGE.activeHollowRequired"));
    const confirmed = await confirmDialog({
      title: game.i18n.localize(type === "openHeart" ? "HOLLOWS.REFUGE.openHeart" : "HOLLOWS.REFUGE.closeHeart"),
      bodyHtml: game.i18n.localize(type === "openHeart" ? "HOLLOWS.REFUGE.openHeartHint" : "HOLLOWS.REFUGE.closeHeartHint"),
    });
    return confirmed ? { hollowId: hollow.id } : null;
  }

  /** Resolve research, crafting or the chosen Heart state on the GM. */
  static async apply(hunter, refuge, type, choice) {
    switch (type) {
      case "uncoverEdge": return this.#applyEdge(hunter, refuge, choice);
      case "craftAnchor": return this.#craftAnchor(hunter, choice);
      case "essenceSyphon": return this.#syphon(refuge, choice);
      default: {
        if (getActiveHollowActor()?.id !== choice.hollowId) {
          throw new Error(game.i18n.localize("HOLLOWS.REFUGE.activeHollowRequired"));
        }
        const state = type === "openHeart" ? "open" : "closed";
        await hunter.update({ "system.refuge.heart": { state, hollowId: choice.hollowId } });
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: hunter }),
          content: `<p>${game.i18n.localize(state === "open" ? "HOLLOWS.REFUGE.openHeartHint" : "HOLLOWS.REFUGE.closeHeartHint")}</p>`,
        });
      }
    }
  }

  /** Build an ordinary Hunter stat test, including Focus and condition modifiers. */
  static #flow(hunter, stat, title, { tn = null, advantage = false } = {}) {
    return new HunterStatRollFlow(hunter, {
      title, statLabel: STAT_LABELS[stat], statValue: getTotalStatForActor(hunter, stat), tn,
      advantages: [advantage], focusCount: getFocusCount(hunter),
      spendFocus: () => adjustHunterResource(hunter, { focus: -1 }),
    });
  }

  /** Select the Entity, preparation and preferred Edges before rolling. */
  static async #prepareEdge(hunter, refuge, cost) {
    const availableBone = Math.max(0, refuge.system.resources.bone - cost.bone);
    const assistants = refuge.system.visitingHunters.filter(actor => (actor.id !== hunter.id)
      && !actor.statuses.has("dead") && (actor.system.refuge.actions.value > 0));
    const entities = game.actors.filter(actor => (actor.type === "entity") && actor.visible);
    if (!entities.length) throw new Error(game.i18n.localize("HOLLOWS.REFUGE.noResearchEntities"));
    const fields = [
      { type: "select", name: "entityId", label: game.i18n.localize("HOLLOWS.REFUGE.anchorEntity"), options: entities.map(actor => ({ value: actor.id, label: actor.name })) },
      { type: "number", name: "bone", label: game.i18n.localize("HOLLOWS.REFUGE.researchBone"), min: 0, max: availableBone, value: 0 },
      { type: "checkbox", name: "encountered", label: game.i18n.localize("HOLLOWS.REFUGE.researchEncountered") },
      { type: "checkbox", name: "fought", label: game.i18n.localize("HOLLOWS.REFUGE.researchFought") },
      ...assistants.map(actor => ({ type: "checkbox", name: actor.id, label: game.i18n.format("HOLLOWS.REFUGE.researchAssistant", { name: actor.name }) })),
    ];
    if (refuge.system.benefits.researchAnyStat) fields.push(
      { type: "checkbox", name: "gaol", label: game.i18n.localize("HOLLOWS.REFUGE.researchOccupiedGaol") },
      { type: "select", name: "stat", label: game.i18n.localize("HOLLOWS.REFUGE.anchorStat"), options: Object.entries(STAT_LABELS).map(([value, label]) => ({ value, label })), value: "wise" },
    );
    fields.push(
      { type: "select", name: "edge", label: game.i18n.localize("HOLLOWS.REFUGE.researchEdge"), options: EDGE_DEFS.map(edge => ({ value: edge.id, label: `${edge.name}: ${edge.desc}` })) },
      { type: "select", name: "extraEdge", label: game.i18n.localize("HOLLOWS.REFUGE.researchExtraEdge"), options: EDGE_DEFS.map(edge => ({ value: edge.id, label: `${edge.name}: ${edge.desc}` })), value: EDGE_DEFS[1].id },
    );
    let choice;
    while (true) {
      choice = await promptForm({ title: game.i18n.localize("HOLLOWS.REFUGE.uncoverEdge"), fields });
      if (!choice) return null;
      if (choice.edge !== choice.extraEdge) break;
      ui.notifications.warn(game.i18n.localize("HOLLOWS.REFUGE.researchDifferentEdges"));
      for (const field of fields) field.value = choice[field.name];
    }
    choice.bone = Math.clamp(Math.trunc(choice.bone), 0, availableBone);
    choice.assistants = assistants.filter(actor => choice[actor.id]).map(actor => actor.id);
    for (const actor of assistants) delete choice[actor.id];
    choice.stat = choice.gaol ? choice.stat : "wise";
    choice.config = await this.#edgeFlow(hunter, refuge, choice).prompt();
    return choice.config ? choice : null;
  }

  /** Recalculate the Entity's TN from the selected preparation. */
  static #edgeFlow(hunter, refuge, choice) {
    const entity = game.actors.get(choice.entityId);
    if (!entity) throw new Error(game.i18n.localize("HOLLOWS.REFUGE.selectionMissing"));
    const tn = Math.max(...["close", "ranged", "wyrd"].map(stat => getEffectiveEntityStat(entity, stat))) + 5
      - (choice.assistants.length * 2) - (choice.bone * 3) - (choice.encountered ? 3 : 0) - (choice.fought ? 5 : 0);
    return this.#flow(hunter, choice.stat, game.i18n.localize("HOLLOWS.REFUGE.uncoverEdge"), {
      tn, advantage: refuge.system.benefits.researchAdvantage,
    });
  }

  /** Spend assistants' actions and replace the Entity's existing Edges on success. */
  static async #applyEdge(hunter, refuge, choice) {
    const assistants = choice.assistants.map(id => game.actors.get(id));
    if (assistants.some(actor => !actor || actor.statuses.has("dead")
      || (actor.system.refuge.id !== refuge.id) || (actor.system.refuge.actions.value < 1))) {
      throw new Error(game.i18n.localize("HOLLOWS.REFUGE.researchAssistantUnavailable"));
    }
    const flow = this.#edgeFlow(hunter, refuge, choice);
    const result = await flow.roll({ ...choice.config, tn: flow.tn + getSpecialConditionRollMods(hunter).tnMod });
    await result.roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: hunter }), content: buildStandardRollCardHtml(result.card) });
    for (const actor of assistants) await actor.update({ "system.refuge.actions.value": actor.system.refuge.actions.value - 1 });
    const rank = result.chosen.outcome.rank;
    if (result.success) {
      const edges = [{ id: choice.edge, extra: rank === 3 ? 1 : 0 }];
      if (rank === 4) edges.push({ id: choice.extraEdge, extra: 1 });
      await applyEdgeState(game.actors.get(choice.entityId), edges);
    } else if (rank === 0) {
      const config = await this.#ask(hunter, { type: "hard" });
      const hard = await this.#flow(hunter, "hard", game.i18n.localize("HOLLOWS.REFUGE.researchCriticalFailure")).roll(config);
      await hard.roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: hunter }), content: buildStandardRollCardHtml(hard.card) });
      await hunter.update({ "system.corruption.value": hunter.system.corruption.value + 1 }, { hollowsSkipEcho: hard.success });
    }
  }

  /** Choose the Anchor's target, stat and payment. */
  static async #prepareAnchor(hunter) {
    if (!hunter.system.validateEquipmentSlot("relic")) return null;
    const entities = game.actors.filter(actor => (actor.type === "entity") && actor.visible);
    if (!entities.length) throw new Error(game.i18n.localize("HOLLOWS.REFUGE.noResearchEntities"));
    const relics = hunter.system.equipment.relic.used ? [] : hunter.items.filter(item => item.type === "relic");
    const choice = await promptForm({
      title: game.i18n.localize("HOLLOWS.REFUGE.craftAnchor"),
      fields: [
        { type: "select", name: "entityId", label: game.i18n.localize("HOLLOWS.REFUGE.anchorEntity"), options: entities.map(actor => ({ value: actor.id, label: actor.name })) },
        { type: "select", name: "stat", label: game.i18n.localize("HOLLOWS.REFUGE.anchorStat"), options: Object.entries(STAT_LABELS).map(([value, label]) => ({ value, label })), value: "hard" },
        { type: "select", name: "payment", label: game.i18n.localize("HOLLOWS.REFUGE.anchorPayment"), options: [
          { value: "bone", label: game.i18n.localize("HOLLOWS.REFUGE.anchorPayBone") },
          ...relics.map(item => ({ value: item.id, label: item.name })),
        ] },
      ],
    });
    if (!choice) return null;
    choice.relicId = choice.payment === "bone" ? "" : choice.payment;
    if (!choice.relicId && !(await confirmReplaceHunterRelic(hunter, "Anchor"))) return null;
    return choice;
  }

  /** Craft an equipped Anchor; no Entity has been captured yet. */
  static async #craftAnchor(hunter, choice) {
    const entity = game.actors.get(choice.entityId);
    if (!entity || (choice.relicId && !hunter.items.has(choice.relicId))) {
      throw new Error(game.i18n.localize("HOLLOWS.REFUGE.selectionMissing"));
    }
    await applyRelicReplacementForHunter(hunter);
    await hunter.createEmbeddedDocuments("Item", [{
      name: game.i18n.format("HOLLOWS.REFUGE.anchorName", { name: entity.name }), type: "relic",
      system: { anchor: { enabled: true, entityId: entity.id, stat: choice.stat }, text: game.i18n.localize("HOLLOWS.REFUGE.anchorHint") },
    }], { hollowsSkipEquipmentSlotCheck: true });
  }

  /** Choose a captive and collect a stat choice from each visitor. */
  static async #prepareSyphon(refuge) {
    const entities = [...refuge.system.anchoredEntities].map(id => game.actors.get(id)).filter(Boolean);
    if (!entities.length) throw new Error(game.i18n.localize("HOLLOWS.REFUGE.requiresAnchoredEntity"));
    const entityId = await pickOne({
      title: game.i18n.localize("HOLLOWS.REFUGE.essenceSyphon"), hint: game.i18n.localize("HOLLOWS.REFUGE.syphonHint"),
      options: entities.map(actor => ({ value: actor.id, label: actor.name })),
    });
    if (!entityId) return null;
    const hunters = [];
    for (const hunter of refuge.system.visitingHunters) {
      const stat = await this.#ask(hunter, { type: "stat" });
      if (!stat) return null;
      hunters.push({ id: hunter.id, stat });
    }
    return { entityId, hunters };
  }

  /** Consume one captive and permanently increase each participating visitor's chosen stat. */
  static async #syphon(refuge, choice) {
    if (!refuge.system.anchoredEntities.has(choice.entityId)) {
      throw new Error(game.i18n.localize("HOLLOWS.REFUGE.requiresAnchoredEntity"));
    }
    const entity = game.actors.get(choice.entityId);
    if (!entity) throw new Error(game.i18n.localize("HOLLOWS.REFUGE.selectionMissing"));
    const hunters = choice.hunters.map(({ id, stat }) => ({ hunter: game.actors.get(id), stat }));
    if (hunters.some(({ hunter }) => !hunter || (hunter.system.refuge.id !== refuge.id))) {
      throw new Error(game.i18n.localize("HOLLOWS.REFUGE.hunterNotInRefuge"));
    }
    for (const { hunter, stat } of hunters) {
      const roll = await new Roll("1d20").evaluate();
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: hunter }),
        flavor: game.i18n.format("HOLLOWS.REFUGE.syphonResult", { stat: STAT_LABELS[stat], corruption: hunter.system.corruption.value }),
      });
      const update = { [`system.stats.${stat}`]: hunter.system.stats[stat] + 2 };
      if (roll.total > hunter.system.corruption.value) update["system.corruption.value"] = hunter.system.corruption.value + 1;
      await hunter.update(update);
    }
    await removeCondition(entity, "anchored");
    await addCondition(entity, "dead");
    await refuge.update({ "system.anchoredEntities": [...refuge.system.anchoredEntities].filter(id => id !== entity.id) });
  }

  /** Send an individual choice to an online owner, falling back to the active GM. */
  static async #ask(hunter, data) {
    const { runUserQuery, COMBAT_QUERY_TIMEOUT } = await import("../../helpers/queries.js");
    const owner = game.users.find(user => user.active && !user.isGM && hunter.testUserPermission(user, "OWNER"));
    return runUserQuery(owner || game.users.activeGM, "hollows.refugeResearchPrompt", { hunterId: hunter.id, ...data }, { timeout: COMBAT_QUERY_TIMEOUT });
  }

  /** Handle a visitor's stat choice or the mandatory Hard test after a critical failure. */
  static async prompt({ hunterId, type }) {
    const hunter = game.actors.get(hunterId);
    if (type === "stat") return pickOne({
      title: `${hunter.name}: ${game.i18n.localize("HOLLOWS.REFUGE.essenceSyphon")}`,
      options: Object.entries(STAT_LABELS).map(([value, label]) => ({ value, label })),
    });
    const flow = this.#flow(hunter, "hard", game.i18n.localize("HOLLOWS.REFUGE.researchHardTest"));
    return await flow.prompt() || { useFocus: false, tn: null, mode: getSpecialConditionRollMods(hunter).disadvTests ? "dis" : "normal" };
  }
}
