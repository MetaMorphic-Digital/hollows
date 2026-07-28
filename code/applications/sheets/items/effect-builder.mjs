import { createDefaultEffectGroup } from "../../../data/relic/effect-schema.js";
import { HOLLOWS_CONDITIONS } from "../../../data/system-constants.js";
import { RELIC_EFFECT_CHOICES } from "../../../data/relic/effect-choices.js";
import { ZONE_GROUPS } from "../../../data/gameplay-constants.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

const BUILDER_ZONES = ["Support", ...ZONE_GROUPS.ranged, ...ZONE_GROUPS.close];
// Resolved lazily: modules register their own conditions after this file evaluates.
const conditionChoices = () => Object.entries(HOLLOWS_CONDITIONS).map(([key, cfg]) => ({ key, label: cfg?.label || key }));

// Field changes that flip section visibility and therefore need a re-render;
// everything else patches silently (no scroll jump). Group fields are array-
// indexed, so this is matched on the trailing segment rather than a fixed set.
function needsRerender(name) {
  const last = name.split(".").pop();
  if (["side", "source", "enabled", "zoneMode", "trigger"].includes(last)) return true;
  if (name.endsWith(".entityScope") || name.endsWith(".hunterScope")) return true;
  if (name.endsWith(".ability.entityId")) return true;
  if (name.endsWith(".reaction.kind")) return true;
  return name.endsWith(".ability.mode");
}

// Shared schema-driven builder base for the Rumour and Relic sheets.
export default class EffectBuilderItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["hollows", "sheet", "item"],
    position: { width: 600, height: 760 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      addGroup: async function(event, target) {
        const path = target?.dataset?.groupsPath;
        if (!path) return;
        const groups = foundry.utils.deepClone(foundry.utils.getProperty(this.item.system, path) || []);
        groups.push(createDefaultEffectGroup());
        this._captureScroll();
        await this.document.update({ [`system.${path}`]: groups });
      },
      removeGroup: async function(event, target) {
        const path = target?.dataset?.groupsPath;
        const index = Number(target?.dataset?.index);
        if (!path || Number.isNaN(index)) return;
        const groups = foundry.utils.deepClone(foundry.utils.getProperty(this.item.system, path) || []);
        groups.splice(index, 1);
        this._captureScroll();
        await this.document.update({ [`system.${path}`]: groups });
      },
    },
  };

  _captureScroll() {
    this._scrollTop = this.element?.querySelector(".window-content")?.scrollTop ?? 0;
  }

  populateBuilderContext(data) {
    data.item = this.item;
    data.system = this.item.system;
    data.choices = RELIC_EFFECT_CHOICES;
    data.zoneList = BUILDER_ZONES;
    data.conditionChoices = conditionChoices();
    data.entityChoices = (game.actors?.contents || [])
      .filter((actor) => actor.type === "entity")
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((actor) => ({ id: actor.id, name: actor.name }));
    // Per-entity ability lists for the ability clause's entity-to-ability picker.
    data.entityAbilityMap = {};
    for (const actor of (game.actors?.contents || [])) {
      if (actor.type !== "entity") continue;
      data.entityAbilityMap[actor.id] = actor.items
        .filter((entry) => entry.type === "entityAbility")
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((entry) => ({ id: entry.id, name: entry.name }));
    }
    data.editable = this.isEditable;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    this.populateBuilderContext(context);
    return context;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const wc = this.element.querySelector(".window-content");
    wc?.classList.add("hollows-sheet");
    if (wc && this._scrollTop) {
      wc.scrollTop = this._scrollTop;
      this._scrollTop = 0;
    }
    if (this.isEditable) {
      this.element.querySelector("[data-edit=\"img\"]")?.addEventListener("click", () => {
        new foundry.applications.apps.FilePicker.implementation({
          type: "image",
          current: this.document.img ?? "",
          callback: async path => { await this.document.update({ img: path }); },
        }).render({ force: true });
      });
    }
  }

  async _onChangeForm(formConfig, event) {
    const input = event?.target;

    if (input?.classList?.contains("array-toggle")) {
      event.preventDefault?.();
      event.stopPropagation?.();
      const path = input.dataset.arrayPath;
      if (!path || path.includes("..")) return;
      const values = Array.from(this.element.querySelectorAll(`.array-toggle[data-array-path="${path}"]:checked`))
        .map((cb) => cb.dataset.value)
        .filter(Boolean);
      const render = this._arrayToggleRender(path);
      if (render) this._captureScroll();
      await this._writeField(path, values, render);
      return;
    }

    const name = String(input?.name ?? "");
    if (!this._validFieldName(name)) {
      return super._onChangeForm(formConfig, event);
    }
    event.preventDefault?.();
    event.stopPropagation?.();
    const render = this._needsRerender(name);
    if (render) this._captureScroll();
    await this._writeField(name, this._fieldValue(input), render);
  }

  _arrayToggleRender(path) {
    return false;
  }

  _fieldValue(input) {
    return input.type === "checkbox" ? input.checked
      : input.type === "number" ? (Number(input.value) || 0)
        : String(input.value ?? "");
  }

  _needsRerender(name) {
    return needsRerender(name);
  }

  _validFieldName(name) {
    return (name === "name") || name.startsWith("system.");
  }

  async _writeField(name, value, render = false) {
    const match = name.match(/^(.*\.groups)\.(\d+)\.(.+)$/);
    if (match) {
      const arrayPath = match[1];
      const idx = Number(match[2]);
      const arr = foundry.utils.deepClone(foundry.utils.getProperty(this.document, arrayPath) || []);
      if (!arr[idx]) return;
      foundry.utils.setProperty(arr[idx], match[3], value);
      await this.document.update({ [arrayPath]: arr }, { render });
      return;
    }
    await this.document.update({ [name]: value }, { render });
  }
}
