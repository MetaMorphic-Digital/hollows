import {
  chooseHollowLinkedDocument,
  chooseHollowSceneAddMode,
  chooseHollowSceneAttach,
  chooseHollowSceneKind,
} from "../../apps/hollow-sheet-dialogs.mjs";
import { pickOne } from "../../apps/selection-dialogs.mjs";
import { getActiveSceneHunters } from "../../../canvas/zone.js";
import { effectUseNeedsBearer, postEffectTextChat, runEffectGroups } from "../../../data/relic/apply-effect.js";
import { runHollowIncursionStep } from "../../../documents/actor/incursion.js";
import {
  addHollowRootDoc,
  addHollowRootDroppedDocument,
  addHollowScene,
  addHollowSceneDoc,
  addHollowSceneDroppedDocument,
  addHollowSceneFromSceneDoc,
  createHollowLinkedDocument,
  prepareHollowLinkContext,
  removeHollowRootDoc,
  removeHollowScene,
  removeHollowSceneDoc,
  resolveHollowDroppedDocument,
  resolveHollowsLinkedDocument,
  resolveHollowsScene,
  setHollowSceneLink,
  toggleHollowLinkVisibility,
  toggleHollowSceneVisibility,
  updateHollowSceneField,
} from "../../../documents/actor/hollow-links.js";
import { postHazardChatCard } from "../../../documents/actor/hazard-damage.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

const ACTOR_DRAG_KINDS = new Set(["entity", "hazard", "thrall"]);
const INCURSION_STEP_IDS = ["gather", "resonate", "commune", "rend"];

function resetIncursionStepUpdate(stepId) {
  return {
    [`system.incursion.steps.${stepId}.done`]: false,
    [`system.incursion.steps.${stepId}.notes`]: "",
    [`system.incursion.steps.${stepId}.performerActorId`]: "",
    [`system.incursion.steps.${stepId}.performerName`]: "",
    [`system.incursion.steps.${stepId}.performerImg`]: "",
  };
}

export default class HollowsHollowSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["hollows", "sheet", "actor", "hollow"],
    position: { width: 820, height: 820 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      headerImage: function() { this._chooseHeaderImage(); },
      incursionStep: function(event, target) { return this._onIncursionStep(event, target); },
      incursionRoll: function(event, target) { return this._onIncursionRoll(event, target); },
      incursionClear: function(event) { return this._onIncursionClear(event); },
      sceneAdd: function(event) { return this._onSceneAdd(event); },
      sceneRemove: function(event, target) { return this._onSceneRemove(event, target); },
      sceneAddDoc: function(event, target) { return this._onSceneAddDoc(event, target); },
      sceneRemoveDoc: function(event, target) { return this._onSceneRemoveDoc(event, target); },
      sceneRollHazard: function(event, target) { return this._onSceneRollHazard(event, target); },
      sceneReveal: function(event, target) { return this._onSceneReveal(event, target); },
      linkReveal: function(event, target) { return this._onLinkReveal(event, target); },
      useRumour: function(event, target) { return this._onUseRumour(event, target); },
      openDoc: function(event, target) { return this._onOpenDoc(event, target); },
      openScene: function(event, target) { return this._onOpenScene(event, target); },
      editScene: function(event, target) { return this._onEditScene(event, target); },
      linkedAdd: function(event, target) { return this._onLinkedAdd(event, target); },
      linkedRemove: function(event, target) { return this._onLinkedRemove(event, target); },
    },
  };

  static TABS = {
    hollowTabs: {
      tabs: [
        { id: "incursion" },
        { id: "scenes" },
        { id: "thralls" },
        { id: "rumours" },
      ],
      initial: "incursion",
    },
  };

  static PARTS = {
    sheet: {
      template: "systems/hollows/templates/actor/hollow-sheet.html",
      root: true,
    },
  };

  get title() {
    return this.actor?.name ?? "Hollow";
  }

  render(options = {}) {
    const wc = this.element?.querySelector(".window-content");
    if (wc) this._savedScrollTop = wc.scrollTop;
    return super.render(options);
  }

  _getHeaderControls() {
    const controls = super._getHeaderControls();
    if (this.isEditable) {
      controls.unshift({ action: "headerImage", icon: "fas fa-image", label: "Header Image" });
    }
    return controls;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.actor.system;
    const steps = system?.incursion?.steps || {};
    const data = {
      ...context,
      actor: this.actor,
      system,
      editable: this.isEditable,
      owner: this.document.isOwner,
      limited: this.document.limited,
      malignancyOptions: ["", "Dominion", "Fear", "Fury", "Grief", "Hunger", "Pride"],
      statusOptions: ["active", "cleansed", "dormant"],
      isActive: String(system?.status || "") === "active",
      incursionSteps: INCURSION_STEP_IDS.map((id) => ({
        id,
        label: id.charAt(0).toUpperCase() + id.slice(1),
        data: steps[id] || { done: false, notes: "" },
      })),
      tabs: this._prepareTabs("hollowTabs"),
    };
    Object.assign(data, await prepareHollowLinkContext(this.actor));
    return data;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const wc = this.element.querySelector(".window-content");
    wc?.classList.add("hollows-sheet");
    if (this._savedScrollTop && wc) {
      wc.scrollTop = this._savedScrollTop;
      this._savedScrollTop = 0;
    }
  }

  async _onChangeForm(formConfig, event) {
    const input = event?.target;
    const name = String(input?.name ?? "");
    if (name && ((name === "name") || name.startsWith("system."))) {
      event.preventDefault();
      event.stopPropagation();
      const value = input.type === "checkbox" ? input.checked
        : input.type === "number" ? (Number(input.value) || 0)
          : String(input.value ?? "");
      const sceneField = name.match(/^system\.scenes\.(\d+)\.(name|notes)$/);
      if (sceneField) {
        await updateHollowSceneField(this.actor, Number(sceneField[1]), sceneField[2], value);
      } else {
        await this.document.update({ [name]: value }, { render: false });
      }
      return;
    }
    return super._onChangeForm(formConfig, event);
  }

  async _chooseHeaderImage() {
    const current = String(this.actor.system?.headerImg || "");
    new foundry.applications.apps.FilePicker.implementation({
      type: "image",
      current,
      callback: async path => { await this.actor.update({ "system.headerImg": path }); },
    }).render({ force: true });
  }

  async _onIncursionStep(event, target) {
    event.preventDefault();
    const stepId = target?.dataset?.stepId;
    if (!stepId) return;
    if (!game.user?.isGM) return;
    await this.actor.update(resetIncursionStepUpdate(stepId));
  }

  async _onIncursionRoll(event, target) {
    event.preventDefault();
    const stepId = String(target?.dataset?.stepId || "");
    const label = String(target?.dataset?.stepLabel || stepId);
    if (!stepId) return;
    await runHollowIncursionStep(this.actor, stepId, label);
  }

  async _onIncursionClear(event) {
    event.preventDefault();
    if (!game.user?.isGM) return;
    const update = {};
    for (const step of INCURSION_STEP_IDS) {
      Object.assign(update, resetIncursionStepUpdate(step));
    }
    await this.actor.update(update);
  }

  async _onSceneAdd(event) {
    event.preventDefault();
    await addHollowScene(this.actor);
  }

  _sceneIndex(target) {
    const index = Number(target?.dataset?.sceneIndex ?? -1);
    return index >= 0 ? index : -1;
  }

  async _pickLinkedRef(kind, create) {
    return create
      ? await createHollowLinkedDocument(kind, { returnRef: true })
      : await chooseHollowLinkedDocument(kind, { returnRef: true });
  }

  async _onSceneRemove(event, target) {
    event.preventDefault();
    const index = this._sceneIndex(target);
    if (index < 0) return;
    await removeHollowScene(this.actor, index);
  }

  async _onSceneAddDoc(event, target) {
    event.preventDefault();
    const index = this._sceneIndex(target);
    if (index < 0) return;
    const kind = await chooseHollowSceneKind();
    if (!kind) return;
    const mode = await chooseHollowSceneAddMode(kind);
    if (!mode) return;
    const id = await this._pickLinkedRef(kind, mode === "create");
    if (!id) return;
    await addHollowSceneDoc(this.actor, index, kind, id);
  }

  async _onSceneRemoveDoc(event, target) {
    event.preventDefault();
    const index = this._sceneIndex(target);
    const kind = String(target?.dataset?.kind || "");
    const id = String(target?.dataset?.id || "");
    if ((index < 0) || !kind || !id) return;
    await removeHollowSceneDoc(this.actor, index, kind, id);
  }

  async _onSceneRollHazard(event, target) {
    event.preventDefault();
    const id = String(target?.dataset?.id || "");
    if (!id) return;
    const hazard = await resolveHollowsLinkedDocument("hazard", id);
    if (!hazard) return;
    await postHazardChatCard(hazard);
  }

  async _onSceneReveal(event, target) {
    event.preventDefault();
    const index = this._sceneIndex(target);
    if (index < 0) return;
    await toggleHollowSceneVisibility(this.actor, index);
  }

  async _onLinkReveal(event, target) {
    event.preventDefault();
    const kind = String(target?.dataset?.kind || "");
    const id = String(target?.dataset?.id || "");
    if (!kind || !id) return;
    await toggleHollowLinkVisibility(this.actor, kind, id);
  }

  async _onUseRumour(event, target) {
    event.preventDefault();
    const id = String(target?.dataset?.id || "");
    if (!id) return;
    const rumour = await resolveHollowsLinkedDocument("rumour", id);
    if (!rumour) return;
    const needsBearer = effectUseNeedsBearer(rumour);
    const bearer = needsBearer ? await this._pickRumourBearer() : null;
    if (needsBearer && !bearer) return;
    await postEffectTextChat(rumour, { title: rumour.name || "Rumour" });
    await runEffectGroups(rumour, { trigger: "onUse", bearer });
  }

  async _pickRumourBearer() {
    const hunters = getActiveSceneHunters();
    if (!hunters.length) {
      ui.notifications.warn("No active scene Hunters found.");
      return null;
    }
    if (hunters.length === 1) return hunters[0];
    const id = await pickOne({
      title: "Choose Acting Hunter",
      label: "Hunter",
      options: hunters.map((hunter) => ({ value: hunter.id, label: hunter.name })),
    });
    return id ? hunters.find((hunter) => hunter.id === id) || null : null;
  }

  async _onLinkedAdd(event, target) {
    event.preventDefault();
    const kind = String(target?.dataset?.kind || "");
    if (!kind) return;
    const id = await this._pickLinkedRef(kind, target?.dataset?.create === "true");
    if (!id) return;
    await addHollowRootDoc(this.actor, kind, id);
  }

  async _onLinkedRemove(event, target) {
    event.preventDefault();
    const kind = String(target?.dataset?.kind || "");
    const id = String(target?.dataset?.id || "");
    if (!kind || !id) return;
    await removeHollowRootDoc(this.actor, kind, id);
  }

  async _onOpenDoc(event, target) {
    event.preventDefault();
    const kind = String(target?.dataset?.kind || "");
    const id = String(target?.dataset?.id || "");
    if (!kind || !id) return;
    const doc = await resolveHollowsLinkedDocument(kind, id);
    if (doc) doc.sheet?.render(true);
  }

  async _resolveSceneFromTarget(target) {
    const sceneId = String(target?.dataset?.sceneId || "");
    return sceneId ? await resolveHollowsScene(sceneId) : null;
  }

  async _onOpenScene(event, target) {
    event.preventDefault();
    const scene = await this._resolveSceneFromTarget(target);
    if (!scene) return;
    if (scene.pack) {
      scene.sheet?.render(true);
      return;
    }
    await scene.view();
  }

  async _onEditScene(event, target) {
    event.preventDefault();
    const scene = await this._resolveSceneFromTarget(target);
    if (scene) scene.sheet?.render(true);
  }

  _onDragStart(event) {
    const uuid = String(event.currentTarget.dataset.uuid || "");
    const kind = String(event.currentTarget.dataset.kind || "");
    if (!uuid) return;
    const payload = { type: ACTOR_DRAG_KINDS.has(kind) ? "Actor" : "Item", uuid };
    event.dataTransfer.setData("text/plain", JSON.stringify(payload));
    event.dataTransfer.setData("application/json", JSON.stringify(payload));
    event.dataTransfer.setData("text/uri-list", uuid);
    event.dataTransfer.effectAllowed = "copy";
  }

  async _onDrop(event) {
    const sceneDrop = event.target?.closest?.("[data-scene-drop]");
    if (sceneDrop) return this._onSceneDrop(event, sceneDrop);

    const doc = await resolveHollowDroppedDocument(event);
    if (!doc) return;
    if (await addHollowRootDroppedDocument(this.actor, doc)) return;

    if (doc.documentName === "Scene") {
      const choice = await chooseHollowSceneAttach(doc, this.actor.system?.scenes);
      if (!choice) return;
      if (choice.mode === "new") {
        await addHollowSceneFromSceneDoc(this.actor, doc);
      } else if ((choice.mode === "existing") && (choice.index >= 0)) {
        await setHollowSceneLink(this.actor, choice.index, doc);
      }
    }
  }

  async _onSceneDrop(event, target) {
    const sceneIndex = this._sceneIndex(target);
    if (sceneIndex < 0) return;
    const doc = await resolveHollowDroppedDocument(event);
    if (!doc) return;
    await addHollowSceneDroppedDocument(this.actor, sceneIndex, doc);
  }
}
