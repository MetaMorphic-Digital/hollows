import { getActiveEntityActor, getActorZone } from "../../canvas/zone.js";
import { ZONE_GROUPS } from "../../data/gameplay-constants.js";
import { STAT_LABELS } from "../../data/system-constants.js";
import { HunterStatRollFlow } from "../../dice/flow.js";
import { buildStandardRollCardHtml } from "../../applications/ui/roll-card.js";
import { getTotalStatForActor } from "../actor/hunter-combat.js";
import { getFocusCount, adjustHunterResource } from "../actor/resources.js";
import { addCondition, getSpecialConditionRollMods } from "../actor/conditions.js";
import { getEffectiveEntityStat } from "../entity/entity-stats.js";
import { addThreatToZone } from "../../canvas/overlays.js";

/** Use an Anchor against its broken Entity from a Close area. */
export default class Anchor {
  static #attempts = new foundry.utils.Semaphore(1);

  /** Prompt the bearer before sending the attempt to the active GM. */
  static async use(item) {
    try {
      const entity = this.#target(item);
      const config = await this.#flow(item, entity).prompt();
      if (!config) return;
      const { runUserQuery } = await import("../../helpers/queries.js");
      await runUserQuery(game.users.activeGM, "hollows.anchorUse", { itemUuid: item.uuid, config }, { notifyOnError: false });
    } catch (err) {
      ui.notifications.warn(err.message);
    }
  }

  /** Validate the bearer, target and position for an Anchor attempt. */
  static #target(item) {
    const entity = getActiveEntityActor();
    if (!item || !game.combat?.started || !entity || (entity.id !== item.system.anchor.entityId)
      || item.actor.statuses.has("dying") || item.actor.statuses.has("dead")
      || (entity.system.health.resolve.value > 0) || entity.statuses.has("anchored")
      || !ZONE_GROUPS.close.includes(getActorZone(item.actor))) {
      throw new Error(game.i18n.localize("HOLLOWS.REFUGE.anchorUnavailable"));
    }
    return entity;
  }

  /** Roll against Wyrd using the Anchor's chosen Hunter stat. */
  static #flow(item, entity) {
    const hunter = item.actor;
    const stat = item.system.anchor.stat;
    return new HunterStatRollFlow(hunter, {
      title: item.name, statLabel: STAT_LABELS[stat], statValue: getTotalStatForActor(hunter, stat),
      tn: getEffectiveEntityStat(entity, "wyrd", { targetActor: hunter, target: hunter }),
      focusCount: getFocusCount(hunter), spendFocus: () => adjustHunterResource(hunter, { focus: -1 }),
    });
  }

  /** Resolve Anchor attempts sequentially on the active GM. */
  static apply(data) {
    return this.#attempts.add(() => this.#resolve(data));
  }

  /** Resolve Threat, permanent penalties and consumption on the GM. */
  static async #resolve({ itemUuid, config }) {
    const item = await fromUuid(itemUuid);
    const entity = this.#target(item);
    const hunter = item.actor;
    const flow = this.#flow(item, entity);
    const result = await flow.roll({ ...config, tn: flow.tn + getSpecialConditionRollMods(hunter).tnMod });
    await result.roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: hunter }), content: buildStandardRollCardHtml(result.card) });
    const rank = result.chosen.outcome.rank;
    if (!result.success) {
      await addThreatToZone(getActorZone(hunter), 3);
      return;
    }
    const penalty = rank === 2 ? 1 : 2;
    const update = { "system.health.resolve.max": Math.max(0, entity.system.health.resolve.max - penalty) };
    for (const stat of ["close", "ranged", "wyrd"]) update[`system.defences.${stat}`] = Math.max(0, entity.system.defences[stat] - penalty);
    await entity.update(update);
    await addCondition(entity, "anchored");
    if (rank === 2) await addThreatToZone(getActorZone(hunter), 1);
    await item.delete();
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: hunter }),
      content: `<p>${game.i18n.format("HOLLOWS.REFUGE.anchorSuccess", { name: foundry.utils.escapeHTML(entity.name), penalty })}</p>`,
    });
  }
}
