import { HunterStatRollFlow } from "../../dice/flow.js";
import { buildStandardRollCardHtml } from "../../applications/ui/roll-card.js";
import { getTotalStatForActor } from "./hunter-combat.js";
import { getFocusCount, adjustHunterResource } from "./resources.js";
import { requestRefugeAction } from "./refuge.js";

/** Hard tests owed by Hunters when a Refuge upgrade is installed. */
export default class RefugeInstallation {
  /** Record each installation once so closing a roll dialog does not discard the test. */
  static async queue(upgrades) {
    const tests = upgrades.filter(item => item.system.hardTestOnInstall);
    if (!tests.length) return;
    const hunters = game.actors.filter(actor => (actor.type === "hunter")
      && game.users.some(user => !user.isGM && (user.character?.id === actor.id)));
    for (const hunter of hunters) {
      await hunter.update({
        "system.refuge.installationTests": [
          ...hunter.system.refuge.installationTests,
          ...tests.map(item => ({ id: foundry.utils.randomID(), name: item.name })),
        ],
      });
    }
  }

  /** Use the standard stat-test dialog for the next outstanding installation. */
  static async prompt(hunter, refuge) {
    const test = hunter.system.refuge.installationTests[0];
    const config = await this.#flow(hunter, test).prompt();
    if (!config) return;
    await requestRefugeAction({
      type: "installationTest", refugeId: refuge.id, hunterUuid: hunter.uuid, testId: test.id, config,
    });
  }

  /** Roll and consume one outstanding test inside the Refuge action queue. */
  static async apply(hunter, testId, config) {
    const test = hunter.system.refuge.installationTests.find(test => test.id === testId);
    if (!test) return;
    const result = await this.#flow(hunter, test).roll({ ...config, tn: null });
    await result.roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: hunter }),
      flavor: game.i18n.format("HOLLOWS.REFUGE.installationTest", { name: test.name }),
      content: buildStandardRollCardHtml(result.card),
    });
    await hunter.update({
      "system.refuge.installationTests": hunter.system.refuge.installationTests.filter(test => test.id !== testId),
      "system.corruption.value": hunter.system.corruption.value + (result.success ? 0 : 1),
    });
  }

  /** Build the same Hard test on the choosing client and the GM client. */
  static #flow(hunter, test) {
    return new HunterStatRollFlow(hunter, {
      title: game.i18n.format("HOLLOWS.REFUGE.installationTest", { name: test.name }),
      cardTitle: "tests", statLabel: "Hard", statValue: getTotalStatForActor(hunter, "hard"),
      focusCount: getFocusCount(hunter), spendFocus: () => adjustHunterResource(hunter, { focus: -1 }),
    });
  }
}
