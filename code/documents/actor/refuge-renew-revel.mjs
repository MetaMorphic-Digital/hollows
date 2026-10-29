import { getActiveHollowActor } from "../../canvas/zone.js";
import { STAT_LABELS } from "../../data/system-constants.js";
import { pickOne, pickMany, confirmDialog } from "../../applications/apps/selection-dialogs.mjs";

/** Renew stat progression and Revel's temporary Echo suppression. */
export default class RefugeRenewRevel {
  /** Collect the visitor's choice before sending the action to the GM. */
  static async prepare(hunter, refuge, { type }) {
    const hollow = getActiveHollowActor();
    if (!hollow) throw new Error(game.i18n.localize("HOLLOWS.REFUGE.activeHollowRequired"));
    if (type === "renew") {
      this.#checkRenew(hunter, hollow.id);
      const threshold = refuge.system.benefits.renewMarks;
      const stat = await pickOne({
        title: game.i18n.localize("HOLLOWS.REFUGE.renewAction"),
        hint: game.i18n.localize("HOLLOWS.REFUGE.renewHint"),
        options: Object.keys(hunter.system.stats).map(stat => ({
          value: stat, label: `${STAT_LABELS[stat]} (${hunter.system.statsMarks[stat]}/${threshold})`,
        })),
      });
      return stat ? { hollowId: hollow.id, stat } : null;
    }
    const limit = Math.min(refuge.system.benefits.revelEchoLimit, hunter.activeEchoes.length);
    const title = game.i18n.localize("HOLLOWS.REFUGE.revelAction");
    if (!limit) {
      const confirmed = await confirmDialog({ title, bodyHtml: game.i18n.localize("HOLLOWS.REFUGE.revelWithoutEchoes") });
      return confirmed ? { hollowId: hollow.id, echoIds: [] } : null;
    }
    while (true) {
      const echoIds = await pickMany({
        title, hint: game.i18n.format("HOLLOWS.REFUGE.revelHint", { count: limit }),
        options: hunter.activeEchoes.map(echo => ({
          value: echo.id, label: `${echo.name} (${echo.system.echoType})`,
        })),
      });
      if (!echoIds) return null;
      const error = this.#revelChoiceError(hunter, refuge, echoIds);
      if (!error) return { hollowId: hollow.id, echoIds };
      ui.notifications.warn(error);
    }
  }

  /** Resolve the choice inside the shared Refuge action queue. */
  static async apply(hunter, refuge, type, choice) {
    if (getActiveHollowActor()?.id !== choice.hollowId) {
      throw new Error(game.i18n.localize("HOLLOWS.REFUGE.activeHollowRequired"));
    }
    if (type === "renew") await this.#renew(hunter, refuge, choice);
    else await this.#revel(hunter, refuge, choice);
  }

  /** Renew can be used only once for each Hollow, including after death. */
  static #checkRenew(hunter, hollowId) {
    if (hunter.system.refuge.renewals.some(entry => entry.hollowId === hollowId)) {
      throw new Error(game.i18n.localize("HOLLOWS.REFUGE.renewAlreadyUsed"));
    }
  }

  /** Check the suppression count and the requirement to suppress Boons first. */
  static #revelChoiceError(hunter, refuge, echoIds) {
    const echoes = hunter.activeEchoes;
    const count = Math.min(refuge.system.benefits.revelEchoLimit, echoes.length);
    if ((echoIds.length !== count) || echoIds.some(id => !echoes.some(echo => echo.id === id))) {
      return game.i18n.format("HOLLOWS.REFUGE.revelHint", { count });
    }
    const remainingBoon = echoes.some(echo => (echo.system.echoType === "boon") && !echoIds.includes(echo.id));
    if (remainingBoon && echoes.some(echo => (echo.system.echoType === "bane") && echoIds.includes(echo.id))) {
      return game.i18n.localize("HOLLOWS.REFUGE.suppressBoonsFirst");
    }
    return null;
  }

  /** Add a mark and replace the temporary increase when it becomes permanent. */
  static async #renew(hunter, refuge, { hollowId, stat }) {
    this.#checkRenew(hunter, hollowId);
    const { renewMarks, renewDisadvantage } = refuge.system.benefits;
    const marks = hunter.system.statsMarks[stat] + 1;
    const permanent = marks >= renewMarks;
    const update = {
      [`system.statsMarks.${stat}`]: permanent ? 0 : marks,
      "system.refuge.renewals": [...hunter.system.refuge.renewals, { hollowId, stat: permanent ? "none" : stat }],
    };
    const label = STAT_LABELS[stat];
    const notice = game.i18n.format(permanent ? "HOLLOWS.REFUGE.renewPermanent" : "HOLLOWS.REFUGE.renewTemporary", {
      name: hunter.name, stat: label,
    });
    if (permanent) {
      update[`system.stats.${stat}`] = hunter.system.stats[stat] + 1;
      const roll = await this.#roll(hunter, "HOLLOWS.REFUGE.renewAction", renewDisadvantage, notice);
      if (roll.total > hunter.system.corruption.value) update["system.corruption.value"] = hunter.system.corruption.value + 1;
    } else {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: hunter }), content: `<p>${foundry.utils.escapeHTML(notice)}</p>`,
      });
    }
    await hunter.update(update);
  }

  /** Suppress the selected Echoes until this Hollow is cleansed and roll to reduce Corruption. */
  static async #revel(hunter, refuge, { hollowId, echoIds }) {
    const error = this.#revelChoiceError(hunter, refuge, echoIds);
    if (error) throw new Error(error);
    const echoes = echoIds.map(id => hunter.items.get(id));
    const notice = echoes.length ? game.i18n.format("HOLLOWS.REFUGE.revelSuppressed", {
      names: echoes.map(echo => echo.name).join(", "),
    }) : "";
    const roll = await this.#roll(hunter, "HOLLOWS.REFUGE.revelAction", refuge.system.benefits.revelAdvantage, notice);
    if (echoes.length) {
      await hunter.updateEmbeddedDocuments("Item", echoes.map(echo => ({
        _id: echo.id, "system.state": [...echo.system.state, "suppressed"],
      })));
    }
    const update = {
      "system.refuge.revelEchoes": [...hunter.system.refuge.revelEchoes, ...echoIds.map(echoId => ({ hollowId, echoId }))],
    };
    if (roll.total > hunter.system.corruption.value) {
      update["system.corruption.value"] = Math.max(0, hunter.system.corruption.value - 1);
    }
    await hunter.update(update);
  }

  /** Both Renew's disadvantage and Revel's advantage favour the higher Corruption roll. */
  static async #roll(hunter, titleKey, keepHighest, notice) {
    const roll = await new Roll(keepHighest ? "2d20kh" : "1d20").evaluate();
    const title = game.i18n.localize(titleKey);
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: hunter }),
      flavor: `<p>${foundry.utils.escapeHTML(title)} — ${game.i18n.format("HOLLOWS.REFUGE.corruptionTarget", { value: hunter.system.corruption.value })}</p>`
        + (notice ? `<p>${foundry.utils.escapeHTML(notice)}</p>` : ""),
    });
    return roll;
  }
}
