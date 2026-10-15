import ScriptField from "../../data/fields/script-field.mjs";

/** @import HollowsItem from "../../documents/item.mjs"; */

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

/** GM editor for an item's automation script, with a draft until Save. */
export default class HollowsScriptEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  /**
   * @param {object} options
   * @param {HollowsItem} options.document
   * @param {string} options.path
   * @param {string} [options.title] Localized window title.
   */
  constructor({ document, path, title, ...options } = {}) {
    super(options);
    this.doc = document;
    this.path = path;
    this._title = title || game.i18n.localize("HOLLOWS.SCRIPT.title");
    this.draft = null;
  }

  /** @inheritdoc */
  static DEFAULT_OPTIONS = {
    classes: ["hollows", "sheet", "item", "script-editor"],
    position: { width: 720, height: 720 },
    window: { resizable: true },
    actions: {
      save: async function() { return this._onSave(); },
      close: async function() { return this.close(); },
    },
  };

  /** @inheritdoc */
  static PARTS = {
    sheet: {
      template: "systems/hollows/templates/item/script-editor.html",
      scrollable: [""],
      root: true,
    },
  };

  /** @inheritdoc */
  get title() {
    return this._title;
  }

  /**
   * Rechecked on Save in case the compendium was locked while the editor was open.
   * @param {HollowsItem} document
   * @param {string} path
   * @returns {boolean}
   */
  static canEdit(document, path) {
    const validPath = document.scriptSlots.some(slot => slot.path === path);
    return !!(validPath && game.user.isGM && hollows.settings.allowCustomScripts
      && (!document.pack || !game.packs.get(document.pack)?.locked));
  }

  /**
   * @param {HollowsItem} document
   * @param {string} path Script field path.
   * @param {object} [options] Additional editor options.
   * @returns {boolean} Whether an editor was opened.
   */
  static open(document, path, options = {}) {
    if (!this.canEdit(document, path)) {
      this.#warnUnavailable();
      return false;
    }
    new this({ ...options, document, path }).render({ force: true });
    return true;
  }

  /** Prefer a specific GM or setting warning over the generic item warning. */
  static #warnUnavailable() {
    const key = !game.user.isGM ? "gmOnly"
      : !hollows.settings.allowCustomScripts ? "disabledWarning" : "cannotEdit";
    ui.notifications.warn(game.i18n.localize(`HOLLOWS.SCRIPT.${key}`));
  }

  /** Hidden hook-specific fields remain in the draft. */
  #readForm() {
    const root = this.element;
    const value = name => root.querySelector(`[name="${name}"]`).value;
    const hook = value("hook");
    return {
      enabled: root.querySelector("[name=\"enabled\"]").checked,
      label: value("label"),
      mode: value("mode"),
      hook,
      eventType: value("eventType"),
      on: value("on"),
      rateLimit: ScriptField.hooks[hook].sync ? "none" : value("rateLimit"),
      source: value("source"),
    };
  }

  /** Keep the draft if the update is rejected. */
  async _onSave() {
    if (!HollowsScriptEditor.canEdit(this.doc, this.path)) {
      HollowsScriptEditor.#warnUnavailable();
      return;
    }
    this.draft = this.#readForm();
    const updated = await this.doc.update(Object.fromEntries(
      Object.entries(this.draft).map(([key, value]) => [`${this.path}.${key}`, value]),
    ));
    if (!updated) return;
    this.draft = null;
    ui.notifications.info(game.i18n.localize("HOLLOWS.SCRIPT.saved"));
    this.render();
  }

  /** @inheritdoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const stored = foundry.utils.getProperty(this.doc, this.path) || {};
    const block = this.draft ?? stored;
    const hook = String(block.hook || "activated");
    const multiple = block.mode === "multiple";
    const selected = multiple ? {} : ScriptField.hooks[hook] || ScriptField.hooks.activated;
    const { HOLLOWS_API, HOLLOWS_API_NOTES, HOLLOWS_SYNC_API } = await import("../../api.mjs");
    const api = selected.sync ? HOLLOWS_SYNC_API : HOLLOWS_API;
    const notes = selected.sync ? {} : HOLLOWS_API_NOTES;
    return {
      ...context,
      documentName: this.doc.name,
      block: {
        ...block, hook, mode: block.mode || "single", rateLimit: selected.sync ? "none" : block.rateLimit || "none",
      },
      multiple,
      hideLimit: multiple || selected.sync,
      selectedHook: {
        ...selected,
        returns: selected.returns ? game.i18n.localize(selected.returns) : "",
      },
      canEdit: HollowsScriptEditor.canEdit(this.doc, this.path),
      modeChoices: ScriptField.modes,
      hookChoices: ScriptField.hooks,
      eventChoices: ScriptField.events,
      turnScopes: ScriptField.turnScopes,
      rateLimits: ScriptField.rateLimits,
      runsOn: game.i18n.localize(ScriptField.clients[hook] || ScriptField.clients.activated),
      glossary: Object.entries(api).map(([name, members]) => ({
        name,
        note: notes[name] ? game.i18n.localize(notes[name]) : "",
        members: Object.keys(members).map(fn => `H.${name}.${fn}`).join(", "),
      })),
    };
  }

  /** @inheritdoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this.element.querySelector(".window-content")?.classList.add("hollows-sheet");
    for (const name of ["mode", "hook"]) {
      this.element.querySelector(`[name="${name}"]`).addEventListener("change", () => {
        this.draft = this.#readForm();
        this.render();
      });
    }
  }
}
