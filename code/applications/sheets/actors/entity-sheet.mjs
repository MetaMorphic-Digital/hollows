import { DEFENCE_LABELS } from "../../../data/_module.mjs";
import { THREAT_PLACEMENT_SCOPE_LABELS, ZONE_GROUPS } from "../../../data/gameplay-constants.js";
import {
  getEffectiveEntityStat,
  getEntityBaseSystem,
} from "../../../documents/entity/entity-stats.js";
import { createDefaultEntityAbility, getEntityAbilityText } from "../../../data/entity/action-schema.js";
import { entityAbilityBlockedBy } from "../../../data/relic/passive.js";
import {
  configureEntityEnhancementItem,
  deleteGeneratedEnhancementAbility,
  promptEntityEnhancementSelection,
} from "../../../documents/entity/entity-enhancements.js";
import {
  applyEntityShrugOff,
  openEntityProwlDialog,
  openEntityTurnAroundDialog,
} from "../../../data/entity/actions/entity-manoeuvre.js";
import { buildActiveEdgeDisplay, removeEntityEdge } from "../../../documents/entity/edges.js";
import { runEntityActionPauses } from "../../../helpers/weapon-abilities/dispatchers.js";
import { triggerEntityInterrupt } from "../../../data/entity/actions/entity-interrupt.js";
import { performEntityAttack } from "../../../data/entity/actions/entity-attack.js";
import { performEntityManoeuvre } from "../../../data/entity/actions/entity-manoeuvre.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

// Zones offered by the Select Zones chips on a placement rule.
const PLACEMENT_ZONE_CHOICES = [...ZONE_GROUPS.close, ...ZONE_GROUPS.ranged];

export default class HollowsEntitySheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["hollows", "sheet", "actor", "entity"],
    position: { width: 680, height: 780 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
  };

  /** @inheritdoc */
  static TABS = {
    mainTabs: {
      tabs: [{ id: "stats" }, { id: "attacks" }, { id: "actions" }, { id: "edges" }, { id: "about" }],
      initial: "stats",
      labelPrefix: "HOLLOWS.ACTOR.ENTITY.TABS",
    },
  };

  static PARTS = {
    sheet: {
      template: "systems/hollows/templates/actor/entity-sheet.html",
      scrollable: [""],
      root: true,
    },
  };

  /** @inheritdoc */
  get title() {
    return this.actor?.name ?? "Entity";
  }

  /** Live actor for synthetic-token sheets. */
  _getLiveEntityActor() {
    return game.actors?.get(this.actor.id) || this.actor;
  }

  /** @inheritdoc */
  async _prepareContext(options) {
    return this._prepareSheetContext(await super._prepareContext(options));
  }

  /** Build the Entity sheet context. */
  async _prepareSheetContext(data) {
    const actor = this._getLiveEntityActor();
    // Inputs are bound to the stored values; modifiers are shown beside them, never written back.
    const system = foundry.utils.deepClone(getEntityBaseSystem(actor));
    data.actor = actor;
    data.system = system;
    data.tabs = this._prepareTabs("mainTabs");
    data.effective = {
      close: getEffectiveEntityStat(actor, "close"),
      ranged: getEffectiveEntityStat(actor, "ranged"),
      wyrd: getEffectiveEntityStat(actor, "wyrd"),
      resolveMax: getEffectiveEntityStat(actor, "resolveMax"),
      woundsMax: getEffectiveEntityStat(actor, "woundsMax"),
      threatPerRound: getEffectiveEntityStat(actor, "threatPerRound"),
      threatCap: getEffectiveEntityStat(actor, "threatCap"),
    };
    data.defenceLabels = DEFENCE_LABELS;
    data.threatScopes = THREAT_PLACEMENT_SCOPE_LABELS;
    data.threatZoneList = PLACEMENT_ZONE_CHOICES;
    const abilities = actor.items.filter(i => i.type === "entityAbility");
    const enhancements = actor.items.filter(i => i.type === "entityEnhancement");
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

  /** @inheritdoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    const wc = this.element.querySelector(".window-content");
    wc?.classList.add("hollows-sheet");

    if (this.isEditable) {
      this.element.querySelector("[data-edit=\"img\"]")?.addEventListener("click", () => {
        new foundry.applications.apps.FilePicker.implementation({
          type: "image",
          current: this.document.img ?? "",
          callback: async path => { await this.document.update({ img: path }); },
        }).render({ force: true });
      });
    }

    for (const el of this.element.querySelectorAll("[data-ability-hover]")) {
      el.addEventListener("mouseenter", (event) => {
        const target = event.currentTarget;
        if (target.dataset.hollowsTooltip) return;
        const ability = this._getLiveEntityActor().items.get(target.dataset.itemId);
        if (!ability) return;
        const text = getEntityAbilityText(ability.system);
        if (!text) return;
        target.dataset.hollowsTooltip = text.replaceAll("\r\n", "\n");
      });
      el.addEventListener("click", (event) => {
        if (!event.shiftKey) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const itemId = String(event.currentTarget?.dataset?.itemId || "");
        if (!itemId) return;
        this._onAbilityChat({
          preventDefault: () => {},
          currentTarget: { dataset: { itemId } },
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
    for (const el of this.element.querySelectorAll("[data-threat-rule-add]")) {
      el.addEventListener("click", this._onThreatRuleAdd.bind(this));
    }
    for (const el of this.element.querySelectorAll("[data-threat-rule-delete]")) {
      el.addEventListener("click", this._onThreatRuleDelete.bind(this));
    }
    for (const el of this.element.querySelectorAll("[data-rule-field]")) {
      el.addEventListener("change", this._onThreatRuleChange.bind(this));
    }
    for (const el of this.element.querySelectorAll("[data-rule-zone]")) {
      el.addEventListener("change", this._onThreatRuleZoneToggle.bind(this));
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

  /** Clone the editable placement rules. */
  _placementRules() {
    return foundry.utils.deepClone(getEntityBaseSystem(this._getLiveEntityActor())?.threat?.placement ?? []);
  }

  /** Update one placement rule field. */
  async _onThreatRuleChange(event) {
    // These inputs carry no name; stop the event before submitOnChange re-submits the whole form.
    event.stopPropagation();
    const target = event.currentTarget;
    const index = Number(target.dataset.ruleIndex ?? -1);
    const field = target.dataset.ruleField;
    const rules = this._placementRules();
    if (index < 0 || index >= rules.length) return;
    rules[index][field] = target.type === "number"
      ? Math.max(0, Number(target.value) || 0)
      : target.value;
    await this._getLiveEntityActor().update({ "system.threat.placement": rules });
  }

  /** Update selected zones for one rule. */
  async _onThreatRuleZoneToggle(event) {
    event.stopPropagation();
    const index = Number(event.currentTarget.dataset.ruleIndex ?? -1);
    const rules = this._placementRules();
    if (index < 0 || index >= rules.length) return;
    rules[index].zones = Array.from(this.element.querySelectorAll(`[data-rule-zone][data-rule-index="${index}"]:checked`))
      .map((checkbox) => checkbox.dataset.ruleZone);
    await this._getLiveEntityActor().update({ "system.threat.placement": rules });
  }

  /** Add a placement rule. */
  async _onThreatRuleAdd(event) {
    event.preventDefault();
    const actor = this._getLiveEntityActor();
    const rules = this._placementRules();
    const amount = Math.max(1, Number(getEffectiveEntityStat(actor, "threatPerRound")) || 0);
    rules.push({ scope: "all", zones: [], amount, perZoneMax: 0 });
    await actor.update({ "system.threat.placement": rules });
  }

  /** Delete a placement rule. */
  async _onThreatRuleDelete(event) {
    event.preventDefault();
    const index = Number(event.currentTarget.dataset.threatRuleDelete ?? -1);
    const rules = this._placementRules();
    if (index < 0 || index >= rules.length) return;
    rules.splice(index, 1);
    await this._getLiveEntityActor().update({ "system.threat.placement": rules });
  }

  /** Run a basic Entity manoeuvre. */
  async _onEntityManoeuvre(event) {
    event.preventDefault();
    const mode = String(event.currentTarget.dataset.entityManoeuvre || "");
    const basicLabel = { prowl: "Prowl", shrug: "Shrug Off", turn: "Turn Around" }[mode] || "";
    const pause = await runEntityActionPauses({
      actionType: "manoeuvre",
      stage: "beforeResolve",
      entityActor: this.actor,
      actionName: basicLabel,
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

  /** Create an Entity ability. */
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
      doom: "New Doom",
    };
    await actor.createEmbeddedDocuments("Item", [{
      name: names[kind] || "New Ability",
      type: "entityAbility",
      system: createDefaultEntityAbility(kind),
    }]);
  }

  /** Open the ability editor. */
  async _onEntityAbilityEdit(event) {
    event.preventDefault();
    const actor = this._getLiveEntityActor();
    const itemId = String(event.currentTarget.dataset.itemId || "");
    const item = actor.items.get(itemId);
    if (!item) return;
    item.sheet?.render(true);
  }

  /** Delete an ability. */
  async _onEntityAbilityDelete(event) {
    event.preventDefault();
    const actor = this._getLiveEntityActor();
    const itemId = String(event.currentTarget.dataset.itemId || "");
    const item = actor.items.get(itemId);
    if (!item) return;
    await item.delete();
  }

  /** Remove an active Edge. */
  async _onEdgeDelete(event) {
    event.preventDefault();
    await removeEntityEdge(this.actor, Number(event.currentTarget.dataset.edgeDelete));
  }

  /** Add an enhancement. */
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

  /** Open the enhancement editor. */
  async _onEnhancementEdit(event) {
    event.preventDefault();
    const actor = this._getLiveEntityActor();
    const itemId = String(event.currentTarget.dataset.itemId || "");
    const item = actor.items.get(itemId);
    if (!item) return;
    item.sheet?.render(true);
  }

  /** Delete an enhancement and any generated ability. */
  async _onEnhancementDelete(event) {
    event.preventDefault();
    const actor = this._getLiveEntityActor();
    const itemId = String(event.currentTarget.dataset.itemId || "");
    const item = actor.items.get(itemId);
    if (!item) return;
    await deleteGeneratedEnhancementAbility(item);
    await actor.deleteEmbeddedDocuments("Item", [itemId], { hollowsSkipGeneratedCleanup: true });
  }

  /** Post an enhancement to chat. */
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
      `,
    });
  }

  /** Start an ability drag. */
  _onAbilityDragStart(event) {
    const actor = this._getLiveEntityActor();
    const itemId = event.currentTarget?.dataset?.itemId;
    if (!itemId) return;
    const item = actor.items.get(itemId);
    if (!item) return;
    const dragData = item.toDragData();
    event.dataTransfer?.setData("text/plain", JSON.stringify(dragData));
  }

  /** Post an ability to chat. */
  async _onAbilityChat(event) {
    event.preventDefault();
    const actor = this._getLiveEntityActor();
    const itemId = String(event.currentTarget.dataset.itemId || "");
    const ability = actor.items.get(itemId);
    if (!ability) return;
    const safeName = foundry.utils.escapeHTML(ability.name || "Ability");
    const rawText = getEntityAbilityText(ability?.system);
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
      content,
    });
  }

  /** Guard against using open ability editors. */
  _ensureAbilityEditorClosed(item) {
    if (!item?.sheet?.rendered) return true;
    ui.notifications.warn("Close or save the ability editor first.");
    return false;
  }

  /** Use an interrupt. */
  async _onInterruptUse(event) {
    event.preventDefault();
    const actor = this._getLiveEntityActor();
    const itemId = String(event.currentTarget.dataset.itemId || "");
    const interruptItem = actor.items.get(itemId);
    if (!interruptItem) return;
    if (!this._ensureAbilityEditorClosed(interruptItem)) return;
    await triggerEntityInterrupt(actor, interruptItem.system, interruptItem);
  }

  /** Use an authored manoeuvre. */
  async _onManoeuvreUse(event) {
    event.preventDefault();
    const actor = this._getLiveEntityActor();
    const manoeuvreItem = actor.items.get(String(event.currentTarget.dataset.itemId || ""));
    if (!manoeuvreItem) return;
    if (!this._ensureAbilityEditorClosed(manoeuvreItem)) return;
    await performEntityManoeuvre(actor, manoeuvreItem);
  }

  /** Roll an attack. */
  async _onAttackRoll(event, options = {}) {
    event.preventDefault();
    const actor = this._getLiveEntityActor();
    const attackItem = actor.items.get(String(event.currentTarget.dataset.itemId || ""));
    if (!attackItem) return;
    if (!this._ensureAbilityEditorClosed(attackItem)) return;
    await performEntityAttack(actor, attackItem, options);
  }
}
