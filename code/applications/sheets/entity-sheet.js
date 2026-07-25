import { DEFENCE_LABELS } from "../../data/_module.mjs";
import {
  getEffectiveEntityStat,
  getEntityBaseSystem
} from "../../documents/entity/entity-stats.js";
import { createDefaultEntityAbility } from "../../data/entity/action-schema.js";
import { entityAbilityBlockedBy } from "../../data/relic/passive.js";
import {
  configureEntityEnhancementItem,
  deleteGeneratedEnhancementAbility,
  promptEntityEnhancementSelection
} from "../../documents/entity/entity-enhancements.js";
import {
  applyEntityShrugOff,
  openEntityProwlDialog,
  openEntityTurnAroundDialog
} from "../../data/entity/actions/entity-manoeuvre.js";
import { buildActiveEdgeDisplay, removeEntityEdge } from "../../documents/entity/edges.js";
import { runEntityActionPauses } from "../../helpers/weapon-abilities/dispatchers.js";
import { triggerEntityInterrupt } from "../../data/entity/actions/entity-interrupt.js";
import { performEntityAttack } from "../../data/entity/actions/entity-attack.js";
import { performEntityManoeuvre } from "../../data/entity/actions/entity-manoeuvre.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

function getEntityAbilityDisplayText(ability) {
  const system = ability?.system || {};
  const profileText = String(system.profile?.text || "").trim();
  if (profileText) return profileText;
  const groups = Array.isArray(system.afterAttack?.groups) ? system.afterAttack.groups : [];
  const other = groups.find((group) => String(group?.otherText || "").trim());
  return other ? String(other.otherText || "") : "";
}

export class HollowsEntitySheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["hollows", "sheet", "actor", "entity"],
    position: { width: 680, height: 780 },
    window: { resizable: true },
    form: { submitOnChange: false, closeOnSubmit: false }
  };

  static PARTS = {
    sheet: {
      template: "systems/hollows/templates/actor/entity-sheet.html",
      root: true
    }
  };

  get title() {
    return this.actor?.name ?? "Entity";
  }

  render(options = {}) {
    const sb = this.element?.querySelector(".sheet-body");
    if (sb) this._savedScrollTop = sb.scrollTop;
    return super.render(options);
  }

  _getLiveEntityActor() {
    return game.actors?.get(this.actor.id) || this.actor;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const data = {
      ...context,
      actor: this.actor,
      system: this.actor.system,
      editable: this.isEditable,
      owner: this.document.isOwner,
      limited: this.document.limited
    };
    return this._prepareSheetContext(data);
  }

  async _prepareSheetContext(data) {
    const actor = this._getLiveEntityActor();
    const system = foundry.utils.deepClone(getEntityBaseSystem(actor));
    system.defences = system.defences || {};
    system.health = system.health || {};
    system.health.resolve = system.health.resolve || {};
    system.health.wounds = system.health.wounds || {};
    system.threat = system.threat || {};
    system.defences.close = getEffectiveEntityStat(actor, "close");
    system.defences.ranged = getEffectiveEntityStat(actor, "ranged");
    system.defences.wyrd = getEffectiveEntityStat(actor, "wyrd");
    system.health.resolve.max = getEffectiveEntityStat(actor, "resolveMax");
    system.health.wounds.max = getEffectiveEntityStat(actor, "woundsMax");
    system.health.resolve.value = Math.min(Number(system.health.resolve.value ?? 0), Number(system.health.resolve.max ?? 0));
    system.health.wounds.value = Math.min(Number(system.health.wounds.value ?? 0), Number(system.health.wounds.max ?? 0));
    system.threat.perRound = getEffectiveEntityStat(actor, "threatPerRound");
    system.threat.max = getEffectiveEntityStat(actor, "threatCap");
    data.actor = actor;
    data.system = system;
    data.defenceLabels = DEFENCE_LABELS;
    const abilities = actor.items.filter(i => i.type === "entity-ability");
    const enhancements = actor.items.filter(i => i.type === "entity-enhancement");
    const byKind = (kind) => abilities.filter(a => a.system?.kind === kind);
    data.entityAttacks = byKind("attack");
    data.entityInterrupts = byKind("interrupt");
    data.entityManoeuvres = byKind("manoeuvre");
    data.entitySpecials = byKind("special");
    data.entityWhenBroken = byKind("whenBroken");
    data.entityDoom = byKind("doom");
    data.activeEdges = buildActiveEdgeDisplay(actor);
    data.entityEnhancements = enhancements;
    // Relic/cypher-disabled abilities: greyed, non-clickable buttons.
    data.abilityBlocks = {};
    for (const ability of abilities) {
      const blockedBy = entityAbilityBlockedBy(actor, ability.id);
      if (blockedBy) data.abilityBlocks[ability.id] = blockedBy;
    }
    return data;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const wc = this.element.querySelector(".window-content");
    wc?.classList.add("hollows-sheet");
    const sb = this.element.querySelector(".sheet-body");
    if (this._savedScrollTop && sb) {
      sb.scrollTop = this._savedScrollTop;
      this._savedScrollTop = 0;
    }

    if (!this._activeTab) this._activeTab = "stats";
    for (const tab of this.element.querySelectorAll(".sheet-tabs[data-group='mainTabs'] [data-tab]")) {
      tab.addEventListener("click", e => {
        e.preventDefault();
        this._activeTab = tab.dataset.tab;
        this._activateEntityTab(this._activeTab);
      });
    }
    this._activateEntityTab(this._activeTab);

    if (this.isEditable) {
      this.element.querySelector('[data-edit="img"]')?.addEventListener("click", () => {
        new foundry.applications.apps.FilePicker.implementation({
          type: "image",
          current: this.document.img ?? "",
          callback: async path => { await this.document.update({ img: path }); }
        }).render({ force: true });
      });
    }

    for (const el of this.element.querySelectorAll("[data-ability-hover]")) {
      el.addEventListener("mouseenter", (event) => {
        const actor = this._getLiveEntityActor();
        const target = event.currentTarget;
        if (!target) return;
        if (target.getAttribute("title")) target.removeAttribute("title");
        if (target.dataset.tooltip) delete target.dataset.tooltip;
        if (target.dataset.hollowsTooltip) return;
        const itemId = String(target.dataset.itemId || "");
        if (!itemId) return;
        const ability = actor.items.get(itemId);
        if (!ability) return;
        const rawText = getEntityAbilityDisplayText(ability);
        const trimmed = String(rawText).trim();
        if (!trimmed) return;
        target.dataset.hollowsTooltip = trimmed.replaceAll("\r\n", "\n");
      });
      el.addEventListener("click", (event) => {
        if (!event.shiftKey) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const itemId = String(event.currentTarget?.dataset?.itemId || "");
        if (!itemId) return;
        this._onAbilityChat({
          preventDefault: () => {},
          currentTarget: { dataset: { itemId } }
        });
      });
    }
    for (const el of this.element.querySelectorAll("[data-ability-chat]")) {
      el.addEventListener("click", this._onAbilityChat.bind(this));
    }
    for (const el of this.element.querySelectorAll("[data-attack-roll]")) {
      el.addEventListener("click", this._onAttackRoll.bind(this));
    }
    for (const el of this.element.querySelectorAll("[data-interrupt-use]")) {
      el.addEventListener("click", this._onInterruptUse.bind(this));
    }
    for (const el of this.element.querySelectorAll("[data-entity-manoeuvre]")) {
      el.addEventListener("click", this._onEntityManoeuvre.bind(this));
    }
    for (const el of this.element.querySelectorAll("[data-manoeuvre-use]")) {
      el.addEventListener("click", this._onManoeuvreUse.bind(this));
    }
    for (const el of this.element.querySelectorAll("[data-entity-ability-add]")) {
      el.addEventListener("click", this._onEntityAbilityAdd.bind(this));
    }
    for (const el of this.element.querySelectorAll("[data-entity-ability-edit]")) {
      el.addEventListener("click", this._onEntityAbilityEdit.bind(this));
    }
    for (const el of this.element.querySelectorAll("[data-entity-ability-delete]")) {
      el.addEventListener("click", this._onEntityAbilityDelete.bind(this));
    }
    for (const el of this.element.querySelectorAll("[data-edge-delete]")) {
      el.addEventListener("click", this._onEdgeDelete.bind(this));
    }
    for (const el of this.element.querySelectorAll("[data-enhancement-add]")) {
      el.addEventListener("click", this._onEnhancementAdd.bind(this));
    }
    for (const el of this.element.querySelectorAll("[data-enhancement-edit]")) {
      el.addEventListener("click", this._onEnhancementEdit.bind(this));
    }
    for (const el of this.element.querySelectorAll("[data-enhancement-delete]")) {
      el.addEventListener("click", this._onEnhancementDelete.bind(this));
    }
    for (const el of this.element.querySelectorAll("[data-enhancement-chat]")) {
      el.addEventListener("click", this._onEnhancementChat.bind(this));
    }
    for (const el of this.element.querySelectorAll("[data-drag][data-item-id]")) {
      el.setAttribute("draggable", "true");
      el.addEventListener("dragstart", (event) => this._onAbilityDragStart(event));
    }
  }

  _activateEntityTab(tabName) {
    if (!tabName || !this.element) return;
    for (const tab of this.element.querySelectorAll(".sheet-tabs[data-group='mainTabs'] [data-tab]")) {
      tab.classList.toggle("active", tab.dataset.tab === tabName);
    }
    for (const panel of this.element.querySelectorAll(".sheet-body > .tab")) {
      const isActive = panel.dataset.tab === tabName;
      panel.classList.toggle("active", isActive);
    }
  }

  async _onChangeForm(formConfig, event) {
    const input = event?.target;
    const name = String(input?.name ?? "");
    if (input?.tagName !== "SELECT" && name && (name === "name" || name.startsWith("system."))) {
      event.preventDefault?.();
      event.stopPropagation?.();
      const actor = this._getLiveEntityActor();
      const value = input.type === "checkbox" ? input.checked
        : input.type === "number" ? (Number(input.value) || 0)
        : String(input.value ?? "");
      await actor.update({ [name]: value }, { render: false });
      return;
    }
    return super._onChangeForm(formConfig, event);
  }

  async _onEntityManoeuvre(event) {
    event.preventDefault();
    const mode = String(event.currentTarget.dataset.entityManoeuvre || "");
    const basicLabel = { prowl: "Prowl", shrug: "Shrug Off", turn: "Turn Around" }[mode] || "";
    const pause = await runEntityActionPauses({
      actionType: "manoeuvre",
      stage: "beforeResolve",
      entityActor: this.actor,
      actionName: basicLabel
    });
    if (pause.cancelled) return;
    if (mode === "prowl") {
      await openEntityProwlDialog(this.actor);
    } else if (mode === "shrug") {
      await applyEntityShrugOff(this.actor);
    } else if (mode === "turn") {
      await openEntityTurnAroundDialog(this.actor);
    }
  }

  async _onEntityAbilityAdd(event) {
    event.preventDefault();
    const actor = this._getLiveEntityActor();
    const kind = String(event.currentTarget.dataset.entityAbilityAdd || "");
    if (!kind) return;
    const names = {
      attack: "New Attack",
      interrupt: "New Interrupt",
      manoeuvre: "New Manoeuvre",
      special: "New Special",
      whenBroken: "New When Broken",
      doom: "New Doom"
    };
    await actor.createEmbeddedDocuments("Item", [{
      name: names[kind] || "New Ability",
      type: "entity-ability",
      system: createDefaultEntityAbility(kind)
    }]);
  }

  async _onEntityAbilityEdit(event) {
    event.preventDefault();
    const actor = this._getLiveEntityActor();
    const itemId = String(event.currentTarget.dataset.itemId || "");
    const item = actor.items.get(itemId);
    if (!item) return;
    item.sheet?.render(true);
  }

  async _onEntityAbilityDelete(event) {
    event.preventDefault();
    const actor = this._getLiveEntityActor();
    const itemId = String(event.currentTarget.dataset.itemId || "");
    const item = actor.items.get(itemId);
    if (!item) return;
    await item.delete();
  }

  async _onEdgeDelete(event) {
    event.preventDefault();
    const index = Number(event.currentTarget.dataset.edgeDelete ?? -1);
    const ok = await removeEntityEdge(this.actor, index);
    if (!ok) {
      ui.notifications.warn("Failed to remove Edge.");
      return;
    }
    this.render(false);
  }

  async _onEnhancementAdd(event) {
    event.preventDefault();
    const doc = await promptEntityEnhancementSelection();
    if (!doc) return;
    const createData = foundry.utils.deepClone(doc.toObject());
    delete createData._id;
    createData.folder = null;
    const created = await this.actor.createEmbeddedDocuments("Item", [createData]);
    const item = created?.[0] || null;
    if (item) {
      await configureEntityEnhancementItem(this.actor, item);
    }
  }

  async _onEnhancementEdit(event) {
    event.preventDefault();
    const actor = this._getLiveEntityActor();
    const itemId = String(event.currentTarget.dataset.itemId || "");
    const item = actor.items.get(itemId);
    if (!item) return;
    item.sheet?.render(true);
  }

  async _onEnhancementDelete(event) {
    event.preventDefault();
    const actor = this._getLiveEntityActor();
    const itemId = String(event.currentTarget.dataset.itemId || "");
    const item = actor.items.get(itemId);
    if (!item) return;
    await deleteGeneratedEnhancementAbility(item);
    await actor.deleteEmbeddedDocuments("Item", [itemId], { hollowsSkipGeneratedCleanup: true });
    this.render(false);
  }

  async _onEnhancementChat(event) {
    event.preventDefault();
    const actor = this._getLiveEntityActor();
    const itemId = String(event.currentTarget.dataset.itemId || "");
    const item = actor.items.get(itemId);
    if (!item) return;
    const safeName = foundry.utils.escapeHTML(item.name || "Enhancement");
    const category = foundry.utils.escapeHTML(String(item.system?.category || "default"));
    const safeText = foundry.utils.escapeHTML(String(item.system?.text || "")).replaceAll("\n", "<br/>");
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: `${item.name || "Enhancement"}`,
      content: `
        <div class="hollows-ability-chat">
          <h3>${safeName}</h3>
          <div><strong>Category:</strong> ${category}</div>
          <div>${safeText}</div>
        </div>
      `
    });
  }

  _onAbilityDragStart(event) {
    const actor = this._getLiveEntityActor();
    const itemId = event.currentTarget?.dataset?.itemId;
    if (!itemId) return;
    const item = actor.items.get(itemId);
    if (!item) return;
    const dragData = item.toDragData();
    event.dataTransfer?.setData("text/plain", JSON.stringify(dragData));
  }

  async _onAbilityChat(event) {
    event.preventDefault();
    const actor = this._getLiveEntityActor();
    const itemId = String(event.currentTarget.dataset.itemId || "");
    const ability = actor.items.get(itemId);
    if (!ability) return;
    const safeName = foundry.utils.escapeHTML(ability.name || "Ability");
    const rawText = getEntityAbilityDisplayText(ability);
    const safeText = foundry.utils.escapeHTML(rawText).replaceAll("\n", "<br/>");
    const content = `
      <div class="hollows-ability-chat">
        <h3>${safeName}</h3>
        <div>${safeText}</div>
      </div>
    `;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: `${ability.name || "Ability"}`,
      content
    });
  }

  _ensureAbilityEditorClosed(item) {
    if (!item?.sheet?.rendered) return true;
    ui.notifications.warn("Close or save the ability editor first.");
    return false;
  }


  async _onInterruptUse(event) {
    event.preventDefault();
    const actor = this._getLiveEntityActor();
    const itemId = String(event.currentTarget.dataset.itemId || "");
    const interruptItem = actor.items.get(itemId);
    if (!interruptItem) return;
    if (!this._ensureAbilityEditorClosed(interruptItem)) return;
    await triggerEntityInterrupt(actor, interruptItem.system, interruptItem);
  }

  async _onManoeuvreUse(event) {
    event.preventDefault();
    const actor = this._getLiveEntityActor();
    const manoeuvreItem = actor.items.get(String(event.currentTarget.dataset.itemId || ""));
    if (!manoeuvreItem) return;
    if (!this._ensureAbilityEditorClosed(manoeuvreItem)) return;
    await performEntityManoeuvre(actor, manoeuvreItem);
  }

  async _onAttackRoll(event, options = {}) {
    event.preventDefault();
    const actor = this._getLiveEntityActor();
    const attackItem = actor.items.get(String(event.currentTarget.dataset.itemId || ""));
    if (!attackItem) return;
    if (!this._ensureAbilityEditorClosed(attackItem)) return;
    await performEntityAttack(actor, attackItem, options);
  }
}
