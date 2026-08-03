// GM-only editor for the script block at a given field path — a weapon's Renown
// block or a Weapon Ability.
import {
  SCRIPT_HOOKS,
  SCRIPT_RATE_LIMITS,
  SCRIPT_TURN_SCOPES,
  SCRIPT_EVENTS,
  SCRIPT_HOOK_CLIENT,
} from "../../data/items/script-schema.js";
import { customScriptsAllowed } from "../../helpers/settings.js";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

export default class HollowsScriptEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor({ document, path, title, ...options } = {}) {
    super(options);
    this.doc = document;
    this.path = path;
    this._title = title || "Mechanic Script";
    // Nothing reaches the document until Save; the draft survives re-renders.
    this.draft = null;
  }

  static DEFAULT_OPTIONS = {
    classes: ["hollows", "sheet", "item", "script-editor"],
    position: { width: 720, height: 720 },
    window: { resizable: true },
    actions: {
      save: async function() { return this._onSave(); },
      close: async function() { return this.close(); },
    },
  };

  static PARTS = {
    sheet: {
      template: "systems/hollows/templates/item/script-editor.html",
      scrollable: [""],
      root: true,
    },
  };

  get title() {
    return this._title;
  }

  #readForm() {
    const root = this.element;
    const value = (name) => root.querySelector(`[name="${name}"]`)?.value ?? "";
    return {
      enabled: !!root.querySelector("[name=\"enabled\"]")?.checked,
      label: String(value("label")),
      hook: String(value("hook") || "activated"),
      eventType: String(value("eventType") || "guard"),
      on: String(value("on") || "actor"),
      rateLimit: String(value("rateLimit") || "none"),
      source: String(value("source")),
    };
  }

  async _onSave() {
    const data = this.#readForm();
    await this.doc.update(Object.fromEntries(
      Object.entries(data).map(([key, val]) => [`${this.path}.${key}`, val]),
    ));
    this.draft = null;
    ui.notifications.info("Script saved.");
    this.render();
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const stored = foundry.utils.getProperty(this.doc, this.path) || {};
    const block = this.draft ?? stored;
    const hook = String(block.hook || "activated");
    const { HOLLOWS_API, HOLLOWS_API_LEVELS } = await import("../../api.js");

    return {
      ...context,
      documentName: this.doc?.name ?? "",
      block: {
        enabled: !!block.enabled,
        label: String(block.label ?? ""),
        hook,
        eventType: String(block.eventType || "guard"),
        on: String(block.on || "actor"),
        rateLimit: String(block.rateLimit || "none"),
        source: String(block.source ?? ""),
      },
      selectedHook: SCRIPT_HOOKS[hook] || SCRIPT_HOOKS.activated,
      unsaved: !!this.draft,
      hookChoices: Object.fromEntries(Object.entries(SCRIPT_HOOKS).map(([key, cfg]) => [key, cfg.label])),
      eventChoices: SCRIPT_EVENTS,
      turnScopes: SCRIPT_TURN_SCOPES,
      rateLimits: SCRIPT_RATE_LIMITS,
      runsOn: SCRIPT_HOOK_CLIENT[hook] || "",
      glossary: Object.entries(HOLLOWS_API).map(([name, members]) => ({
        name,
        level: HOLLOWS_API_LEVELS[name] || "",
        members: Object.keys(members || {}).map((fn) => `H.${name}.${fn}`).join(", "),
      })),
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.element.querySelector(".window-content")?.classList.add("hollows-sheet");
    this.element.querySelector("[name=\"hook\"]")?.addEventListener("change", () => {
      this.draft = this.#readForm();
      this.render();
    });
  }
}

/** @returns {boolean} whether the editor opened. GM only. */
export function openScriptEditor(document, path, { title = "Mechanic Script" } = {}) {
  if (!game.user?.isGM) {
    ui.notifications.warn("Only a GM can edit mechanic scripts.");
    return false;
  }
  if (!customScriptsAllowed()) {
    ui.notifications.warn(
      "Custom scripts are disabled. Enable \"Allow Custom Mechanic Scripts\" in the system settings first — "
      + "scripts run on every connected client, so turn this on only if you trust the source of your content.",
    );
    return false;
  }
  if (!document || !path) return false;
  new HollowsScriptEditor({ document, path, title }).render({ force: true });
  return true;
}
