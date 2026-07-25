import { resolveHunterStatRoll } from "./hunter-rolls.js";
import { resolveSuggestedRollMode } from "./roll-helpers.js";
import { getSpecialConditionRollMods } from "../documents/actor/conditions.js";

export class HunterStatRollFlow {
  constructor(actor, {
    title = "Test",
    cardTitle = "",
    statLabel = "",
    statValue,
    tn = null,
    fallbackMode = "normal",
    focusCount = 0,
    spendFocus = null,
    advantages = [],
    disadvantages = [],
    promptTn = false
  } = {}) {
    this.actor = actor || null;
    this.title = title;
    this.cardTitle = cardTitle || title;
    this.statLabel = statLabel;
    this.statValue = statValue;
    this.tn = tn;
    this.fallbackMode = fallbackMode;
    this.focusCount = Number(focusCount ?? 0);
    this.spendFocus = spendFocus;
    this.advantages = Array.isArray(advantages) ? advantages : [];
    this.disadvantages = Array.isArray(disadvantages) ? disadvantages : [];
    this.promptTn = !!promptTn;
    this.result = null;
  }

  get canUseFocus() {
    return this.focusCount > 0;
  }

  async prompt() {
    const condMods = getSpecialConditionRollMods(this.actor || null);
    return await foundry.applications.api.DialogV2.wait({
      window: { title: this.title },
      content: `
        <form class="hollows-roll-dialog">
          ${this.promptTn ? `
            <div class="form-group">
              <label>Target Number (optional)</label>
              <input type="number" name="tn" placeholder="Leave blank for no TN" />
            </div>
          ` : ""}
          ${this.canUseFocus ? `
            <div class="form-group">
              <label class="checkbox">
                <input type="checkbox" name="useFocus" />
                Spend Focus for Advantage
              </label>
            </div>
          ` : ""}
          <div class="form-group">
            <label>Roll Mode</label>
            <select name="mode">
              <option value="normal" selected>Normal</option>
              <option value="adv">Advantage</option>
              <option value="dis">Disadvantage</option>
            </select>
          </div>
        </form>
      `,
      render: (_e, dialog) => {
        const root = dialog.element;
        const modeSelect = root.querySelector("[name=mode]");
        if (!modeSelect) return;
        const updateMode = () => {
          const focusAdvantage = !!root.querySelector("[name=useFocus]")?.checked && this.canUseFocus;
          modeSelect.value = resolveSuggestedRollMode({
            advantages: [...this.advantages, focusAdvantage],
            disadvantages: [...this.disadvantages, condMods.disadvTests],
            fallback: this.fallbackMode
          });
        };
        root.querySelector("[name=useFocus]")?.addEventListener("change", updateMode);
        updateMode();
      },
      buttons: [
        {
          action: "roll",
          label: "Roll",
          default: true,
          callback: (_e, _b, dialog) => ({
            useFocus: this.canUseFocus && !!dialog.element.querySelector("[name=useFocus]")?.checked,
            mode: String(dialog.element.querySelector("[name=mode]")?.value || "normal"),
            tn: this.promptTn ? optionalNumber(dialog.element.querySelector("[name=tn]")?.value) : this.tn
          })
        }
      ],
      rejectClose: false
    }) ?? null;
  }

  async roll(config = null) {
    const wasPrompted = !config;
    const rollConfig = config || await this.prompt();
    if (!rollConfig) return null;
    let tn = rollConfig.tn === undefined ? this.tn : rollConfig.tn;
    if (wasPrompted && tn != null) tn += getSpecialConditionRollMods(this.actor).tnMod;
    const rollResult = await resolveHunterStatRoll({
      statValue: this.statValue,
      tn,
      mode: rollConfig.mode,
      useFocus: !!rollConfig.useFocus,
      focusCount: this.focusCount,
      spendFocus: this.spendFocus
    });
    this.result = {
      ...rollResult,
      success: Number(rollResult.chosen?.outcome?.rank ?? 0) >= 2,
      statLabel: this.statLabel,
      statValue: this.statValue,
      tn
    };
    this.result.card = this.cardData();
    return this.result;
  }

  cardData() {
    if (!this.result) return null;
    return {
      actorName: this.actor?.name || "",
      title: this.cardTitle,
      statLabel: this.statLabel,
      statValue: this.statValue,
      tn: this.result.tn,
      results: this.result.results,
      mode: this.result.effectiveMode,
      chosen: this.result.chosen,
      useFocus: this.result.useFocus
    };
  }
}

function optionalNumber(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isNaN(n) ? null : n;
}
