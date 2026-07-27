import { STAT_LABELS } from "../../../data/_module.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;
import { getActiveEntityActor, getActorZone, getHuntersInZone, getTokenZone, isCloseZone, isRangedZone } from "../../../canvas/zone.js";
import { getTotalStatForActor } from "../../../documents/actor/hunter-combat.js";
import { adjustHunterResource, getFocusCount, getFocusLimit } from "../../../documents/actor/resources.js";
import { openTakeCoverForActor } from "../../../data/actions/take-cover.js";
import { hasActiveUseOptions, openUseForActor } from "../../../data/actions/use.js";
import { openReloadForActor } from "../../../data/actions/reload.js";
import { openGuardDialogForActor } from "../../../data/actions/guard.js";
import { applyFocusToActor } from "../../../data/actions/focus.js";
import { openRecoverForActor } from "../../../data/actions/recover.js";
import { openHealForActor } from "../../../data/actions/heal.js";
import { getManoeuvreAvailability } from "../../../data/actions/index.js";
import { getCombatTurnKey, isSameCombatRound } from "../../../helpers/combat-runtime.js";
import { getWeaponStatModsForActor } from "../../../data/actor-models.js";
import {
  cleanupWeaponAbilitiesForActor,
  getShotgunWeapons,
  hasWeaponEquipped,
  isShotgunLoaded,
  isShotgunWeapon,
} from "../../../helpers/weapon-utils.js";
import { addCondition, hasCondition, removeCondition, setConditionSafe } from "../../../documents/actor/conditions.js";
import { getActiveCurseConfig } from "../../../canvas/overlays.js";
import {
  deleteHunterEquipmentSlot,
  getHunterEquipmentItemForSlot,
} from "../../../documents/actor/hunter-equipment.js";
import { activeRelicEffect } from "../../../documents/item/relic-cypher.js";
import { postEffectTextChat, relicHasActiveUse, runEffectGroups } from "../../../data/relic/apply-effect.js";
import {
  addEchoById, applySeedEchoEffect,
  getEchoPacks, hasEchoRollContent, rollEchoFlow,
} from "../../../documents/actor/echo.js";
import {
  getActiveEchoItems, getEchoDamageBonus, hasEchoRestriction,
} from "../../../data/echo/index.js";
import { getEffectiveEntityStat } from "../../../documents/entity/entity-stats.js";
import { triggerEntityTriggeredAbilities } from "../../../data/entity/actions/entity-special.js";
import { isNewHunterActor, openCharacterCreationWizard } from "../../apps/character-creation.mjs";
import { normalizeRange } from "../../../dice/roll-helpers.js";
import {
  evaluateResult,
  outcomeClassFromLabel,
} from "../../../dice/roll-outcome.js";
import { HunterStatRollFlow } from "../../../dice/flow.js";
import { buildStandardRollCardHtml } from "../../ui/roll-card.js";
import { dispatchToGM, runGMQuery } from "../../../helpers/queries.js";
import { activateAbility, evaluateStatOverrideSuccess, getActivatedAbilities, getAttackRollMode, getStatOverrides, runOnAttackResult, tryActivateStatOverride } from "../../../helpers/weapon-abilities/dispatchers.js";
import { applyEffects } from "../../../data/mechanics/dsl/effects.js";
import { openAttackDialog } from "../../../data/actions/attack.js";
import { openExpendReadyDialog } from "../../../data/actions/expend-ready.js";
import { getEffectiveCapacity } from "../../../documents/item/weapon.js";
import {
  getAvailableWeaponForms,
  getEffectiveWeaponAttackProfiles,
  getSelectedWeaponForm,
  getWeaponPackDocs,
} from "../../../data/weapons/index.js";
import { getWeaponAbilityDocs } from "../../../documents/actor/ability-grant.js";

export default class HollowsHunterSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["hollows", "sheet", "actor", "hunter"],
    position: { width: 640, height: 720 },
    window: { resizable: true },
    form: { submitOnChange: false, closeOnSubmit: false },
  };

  static PARTS = {
    sheet: {
      template: "systems/hollows/templates/actor/hunter-sheet.html",
      root: true,
    },
  };

  get title() {
    return this.actor?.name ?? "Hunter";
  }

  render(options = {}) {
    const wc = this.element?.querySelector(".window-content");
    if (wc) this._savedScrollTop = wc.scrollTop;
    return super.render(options);
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const data = {
      ...context,
      actor: this.actor,
      system: this.actor.system,
      editable: this.isEditable,
      owner: this.document.isOwner,
      limited: this.document.limited,
    };
    return this._prepareSheetContext(data);
  }

  async _prepareSheetContext(data) {
    data.actor = this.actor;
    data.system = this.actor.system;
    data.statLabels = STAT_LABELS;
    const statMods = getWeaponStatModsForActor(this.actor);
    data.statMods = statMods;
    data.statsTotal = Object.fromEntries(
      Object.keys(this.actor.system.stats).map(key => {
        const total = getTotalStatForActor(this.actor, key);
        return [key, total];
      }),
    );
    const weapons = this.actor.items.filter(i => i.type === "weapon");
    const abilities = this.actor.items.filter(i => i.type === "weapon-ability");
    data.hasReloadableWeapons = weapons.some(w => getEffectiveCapacity(w) > 0 || isShotgunWeapon(w));
    data.reloadableWeapons = weapons
      .filter(w => getEffectiveCapacity(w) > 0 || isShotgunWeapon(w))
      .map(w => {
        const max = getEffectiveCapacity(w);
        const cur = Number(w.system?.capacity?.value ?? 0);
        const isShotgun = isShotgunWeapon(w);
        const loaded = isShotgun ? (w.system?.loaded ? "Loaded" : "Empty") : "";
        return {
          id: w.id,
          name: w.name,
          current: cur,
          max,
          isShotgun,
          loaded,
        };
      });
    data.weaponsWithAbilities = weapons.map((weapon, index) => {
      const baseForms = getAvailableWeaponForms(weapon);
      const activeForm = getSelectedWeaponForm(weapon);
      const attackProfiles = getEffectiveWeaponAttackProfiles(weapon);
      return {
        weapon,
        index,
        abilities: abilities.filter((a) => {
          const boundId = String(a.system?.boundWeaponId || "");
          if (boundId) return boundId === weapon.id;
          return a.system.weaponType && a.system.weaponType === weapon.system.weaponType;
        }),
        activeForm,
        attackProfiles,
        availableForms: baseForms.map(f => f.name),
      };
    });
    data.weaponCount = weapons.length;
    const curseCfg = getActiveCurseConfig();
    data.curseTrackingEnabled = curseCfg.enabled && curseCfg.targets.hunter;
    data.hasArmour = hasWeaponEquipped(this.actor, "Armour");
    data.hasRifle = hasWeaponEquipped(this.actor, "Rifle");
    data.hasBook = hasWeaponEquipped(this.actor, "Book");
    // Generic activated-manoeuvre surface: one button per ActivatedAbility the
    // actor carries (Ready-cost ones are surfaced in the Expend Ready dialog).
    data.activatedManoeuvres = getActivatedAbilities(this.actor)
      .filter((a) => a.cost?.condition !== "ready")
      .map((a) => ({ key: a.key, name: a.getLabel ? a.getLabel(this.actor) : (a.buttonLabel || a.name) }));
    data.focusActive = hasCondition(this.actor, "focus");
    data.canFocus = getManoeuvreAvailability(this.actor, "focus", { source: "turn", silent: true }).available;
    data.canGuard = getManoeuvreAvailability(this.actor, "guard", { source: "turn", silent: true }).available;
    data.canUse = hasActiveUseOptions();
    data.isDying = hasCondition(this.actor, "dying");
    data.isDead = hasCondition(this.actor, "dead") || !!this.actor.getFlag("hollows", "dead");
    data.isNewHunter = isNewHunterActor(this.actor);
    data.currentZone = getActorZone(this.actor);
    data.isInSupport = data.currentZone === "Support";
    data.focusCount = getFocusCount(this.actor);
    data.focusLimit = getFocusLimit(this.actor);
    const relic = getHunterEquipmentItemForSlot(this.actor, "relic");
    data.equipmentSlots = {
      exploration: getHunterEquipmentItemForSlot(this.actor, "exploration"),
      battle: getHunterEquipmentItemForSlot(this.actor, "battle"),
      relic,
    };
    data.relicText = relic ? activeRelicEffect(relic).text || "" : "";
    data.relicHasUse = relicHasActiveUse(relic);
    const echoes = this.actor.items.filter(i => i.type === "echo");
    data.echoes = {
      boons: echoes.filter(e => String(e.system?.echoType || "") === "boon"),
      banes: echoes.filter(e => String(e.system?.echoType || "") === "bane"),
    };
    data.echoCounts = { boon: data.echoes.boons.length, bane: data.echoes.banes.length };
    data.canRollEcho = hasEchoRollContent();
    data.malignancy = this.actor.system?.malignancy || "";
    data.isGM = !!game.user?.isGM;
    return data;
  }

  async _onChangeForm(formConfig, event) {
    const input = event?.target;
    const name = String(input?.name ?? "");
    if (input?.tagName !== "SELECT" && name && (name === "name" || name.startsWith("system."))) {
      event.preventDefault?.();
      event.stopPropagation?.();
      const value = input.type === "checkbox" ? input.checked
        : input.type === "number" ? (Number(input.value) || 0)
          : String(input.value ?? "");
      await this.document.update({ [name]: value }, { render: false });
      return;
    }
    return super._onChangeForm(formConfig, event);
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const wc = this.element.querySelector(".window-content");
    wc?.classList.add("hollows-sheet");
    if (this._savedScrollTop && wc) {
      wc.scrollTop = this._savedScrollTop;
      this._savedScrollTop = 0;
    }

    this._applyHeaderActionButtonLayout(this.element);
    this._renderEquipmentDeleteButtons(this.element);

    if (!this._activeMainTab) this._activeMainTab = "stats";
    for (const tab of this.element.querySelectorAll(".sheet-tabs[data-group='mainTabs'] [data-tab]")) {
      tab.addEventListener("click", e => {
        e.preventDefault();
        this._activeMainTab = tab.dataset.tab;
        this._activateHunterTab("mainTabs", "sheet-body", this._activeMainTab);
      });
    }
    this._activateHunterTab("mainTabs", "sheet-body", this._activeMainTab);

    if (!this._activeWeaponTab) this._activeWeaponTab = "weapon-0";
    for (const tab of this.element.querySelectorAll(".sheet-tabs[data-group='weaponTabs'] [data-tab]")) {
      tab.addEventListener("click", e => {
        e.preventDefault();
        this._activeWeaponTab = tab.dataset.tab;
        this._activateHunterTab("weaponTabs", "weapon-tabs-content", this._activeWeaponTab);
      });
    }
    this._activateHunterTab("weaponTabs", "weapon-tabs-content", this._activeWeaponTab);

    if (this.isEditable) {
      this.element.querySelector("[data-edit=\"img\"]")?.addEventListener("click", () => {
        new foundry.applications.apps.FilePicker.implementation({
          type: "image",
          current: this.document.img ?? "",
          callback: async path => { await this.document.update({ img: path }); },
        }).render({ force: true });
      });
    }

    const bind = (sel, handler) => {
      for (const el of this.element.querySelectorAll(sel)) {
        el.addEventListener("click", handler.bind(this));
      }
    };
    bind("[data-roll]", this._onStatRoll);
    bind("[data-ability-chat]", this._onWeaponAbilityChat);
    bind("[data-action='add-weapon']", this._onAddWeapon);
    bind("[data-action='edit-weapon']", this._onEditWeapon);
    bind("[data-action='remove-weapon']", this._onRemoveWeapon);
    bind("[data-action='replace-weapon']", this._onReplaceWeapon);
    bind("[data-action='attack-entity']", this._onAttackEntity);
    bind("[data-action='focus']", this._onFocus);
    bind("[data-action='expend-ready']", this._onExpendReady);
    bind("[data-action='guard']", this._onGuard);
    bind("[data-action='begin-character-creation']", this._onBeginCharacterCreation);
    bind("[data-action='take-cover']", this._onTakeCover);
    bind("[data-action='use']", this._onUse);
    bind("[data-action='reload-weapon']", this._onReloadWeapon);
    bind("[data-action='support-recover']", this._onSupportRecover);
    bind("[data-action='support-heal']", this._onSupportHeal);
    bind("[data-action='cling-to-life']", this._onClingToLife);
    bind("[data-action='activated-ability']", this._onActivatedAbility);
    bind("[data-action='use-relic']", this._onUseRelic);
    bind("[data-action='chat-relic']", this._onChatRelic);
    bind("[data-action='delete-equipment']", this._onDeleteEquipment);
    bind("[data-action='roll-echo']", this._onRollEcho);
    bind("[data-action='add-echo']", this._onAddEcho);
    bind("[data-action='echo-toggle']", this._onToggleEcho);
    bind("[data-action='echo-delete']", this._onDeleteEcho);
    bind("[data-action='echo-trigger']", this._onTriggerEcho);
    bind("[data-action='echo-reset']", this._onResetEchoes);
  }

  _activateHunterTab(group, containerClass, tabName) {
    if (!tabName || !this.element) return;
    for (const tab of this.element.querySelectorAll(`.sheet-tabs[data-group='${group}'] [data-tab]`)) {
      tab.classList.toggle("active", tab.dataset.tab === tabName);
    }
    for (const panel of this.element.querySelectorAll(`.${containerClass} > .tab`)) {
      const isActive = panel.dataset.tab === tabName;
      panel.classList.toggle("active", isActive);
    }
  }

  _applyHeaderActionButtonLayout(html) {
    const headerActions = html.querySelector(".header-actions");
    const actionStack = headerActions?.querySelector(".hunter-action-stack");
    const actionRows = actionStack?.querySelectorAll(".hunter-action-stack-row") || [];
    const actionButtons = [];
    actionRows.forEach(row => row.querySelectorAll(":scope > .stat-roll").forEach(b => actionButtons.push(b)));
    const stackWidth = Math.max(0, Math.floor(actionStack?.clientWidth || headerActions?.clientWidth || 0));
    if (stackWidth > 0) {
      const width = `${stackWidth}px`;
      actionRows.forEach(row => { row.style.width = width; });
      actionButtons.forEach(button => {
        button.style.width = width;
        button.style.minWidth = width;
        button.style.maxWidth = width;
      });
    }
  }

  _renderEquipmentDeleteButtons(html) {
    const sections = html.querySelectorAll(".sheet-section.equipment .hollows-form-section");
    const explorationSection = sections[0];
    const relicUseButton = sections[2]?.querySelector("[data-action='use-relic']");
    if (relicUseButton) relicUseButton.classList.toggle("muted", !!relicUseButton.disabled);
    if (getHunterEquipmentItemForSlot(this.actor, "exploration") && explorationSection) {
      let actions = explorationSection.querySelector(".equipment-actions");
      if (!actions) {
        actions = document.createElement("div");
        actions.className = "equipment-actions";
        explorationSection.appendChild(actions);
      }
      if (!actions.querySelector("[data-slot='exploration']")) {
        actions.insertAdjacentHTML("beforeend", "<button type=\"button\" class=\"stat-roll danger compact\" data-action=\"delete-equipment\" data-slot=\"exploration\">Delete</button>");
      }
    }
  }

  _blockIfEchoRestricted(actionKey, label) {
    if (hasEchoRestriction(this.actor, actionKey)) {
      ui.notifications.warn(`${this.actor.name} cannot ${label} due to a Burden.`);
      return true;
    }
    return false;
  }

  _blockIfManoeuvreUnavailable(manoeuvre, label) {
    const availability = getManoeuvreAvailability(this.actor, manoeuvre, { source: "turn" });
    if (availability.available) return false;
    const reason = availability.reason ? ` (${availability.reason})` : "";
    ui.notifications.warn(`${label} is unavailable${reason}.`);
    return true;
  }

  async _onStatRoll(event) {
    event.preventDefault();
    const statKey = event.currentTarget.dataset.roll;
    const statLabel = STAT_LABELS[statKey] ?? statKey;
    const statValue = this._getTotalStat(statKey);
    const flow = new HunterStatRollFlow(this.actor, {
      title: `${statLabel} Test`,
      cardTitle: "tests",
      statLabel,
      statValue,
      tn: null,
      promptTn: true,
      focusCount: getFocusCount(this.actor),
      spendFocus: async () => adjustHunterResource(this.actor, { focus: -1 }),
    });
    const result = await flow.roll();
    if (!result) return;
    await result.roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: `${statLabel} Test`,
      content: buildStandardRollCardHtml(result.card),
    });
  }

  _getTotalStat(statKey) {
    return getTotalStatForActor(this.actor, statKey);
  }

  _getEntityActor() {
    const scene = canvas?.scene;
    if (scene?.tokens?.size) {
      const tokenDoc = scene.tokens.contents.find(t => t.actor?.type === "entity");
      return tokenDoc?.actor || null;
    }
    return game.actors.find(a => a.type === "entity") || null;
  }

  _getThrallActorsInScene() {
    const scene = canvas?.scene;
    if (!scene?.tokens?.size) return [];
    const seen = new Set();
    const thralls = [];
    for (const tokenDoc of scene.tokens.contents) {
      const actor = tokenDoc?.actor;
      if (!actor || actor.type !== "thrall") continue;
      if (seen.has(actor.id)) continue;
      seen.add(actor.id);
      thralls.push(actor);
    }
    return thralls;
  }

  async _onAttackEntity(event) {
    event.preventDefault();
    await openAttackDialog(this.actor);
  }

  async _onReloadWeapon(event) {
    event.preventDefault();
    if (this._blockIfEchoRestricted("reload", "Reload")) return;
    await openReloadForActor(this.actor);
  }

  async _onFocus(event) {
    event.preventDefault();
    if (this._blockIfEchoRestricted("focus", "Focus")) return;
    if (this._blockIfManoeuvreUnavailable("focus", "Focus")) return;
    await applyFocusToActor(this.actor);
  }

  async _onBeginCharacterCreation(event) {
    event.preventDefault();
    await openCharacterCreationWizard(this.actor);
  }

  async _onExpendReady(event) {
    event.preventDefault();
    await openExpendReadyDialog(this.actor);
  }

  async _onGuard(event) {
    event.preventDefault();
    if (this._blockIfEchoRestricted("guard", "Guard")) return;
    if (this._blockIfManoeuvreUnavailable("guard", "Guard")) return;
    await openGuardDialogForActor(this.actor);
  }

  async _onTakeCover(event) {
    event.preventDefault();
    if (this._blockIfEchoRestricted("takeCover", "Take Cover")) return;
    await openTakeCoverForActor(this.actor);
  }

  async _onUse(event) {
    event.preventDefault();
    await openUseForActor(this.actor);
  }

  async _onActivatedAbility(event) {
    event.preventDefault();
    const key = String(event.currentTarget?.dataset?.abilityKey || "");
    const ability = getActivatedAbilities(this.actor).find((a) => a.key === key);
    if (!ability) return;
    const combat = game.combat;
    if (combat?.started) {
      const current = combat.combatant?.actor;
      if (!current || current.id !== this.actor.id) {
        ui.notifications.warn("You can only use this on your turn.");
        return;
      }
    }
    await activateAbility(this.actor, ability);
  }

  async _onUseRelic(event) {
    event.preventDefault();
    const item = getHunterEquipmentItemForSlot(this.actor, "relic");
    if (!item) {
      ui.notifications.warn("No relic selected.");
      return;
    }
    if (this.actor.system?.equipment?.relic?.used) {
      ui.notifications.warn("Relic already used this Hollow.");
      return;
    }
    await this._useRelicEffect(item);
  }

  async _useRelicEffect(item) {
    const eff = activeRelicEffect(item);
    await postEffectTextChat(item, {
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      title: item.name || "Relic",
    });
    await runEffectGroups(item, {
      trigger: "onUse",
      profile: item.system?.upgraded ? "cypher" : "base",
      bearer: this.actor,
    });
    if (item.system?.deleteWhenUsed) {
      await deleteHunterEquipmentSlot(this.actor, "relic");
    } else if (String(eff.uses || "oneOff") !== "reusable") {
      await this.actor.update({ "system.equipment.relic.used": true });
    }
  }

  async _onDeleteEquipment(event) {
    event.preventDefault();
    const slot = String(event.currentTarget.dataset.slot || "");
    if (!["exploration", "battle", "relic"].includes(slot)) return;
    const item = getHunterEquipmentItemForSlot(this.actor, slot);
    if (!item) {
      ui.notifications.warn("No equipment in that slot.");
      return;
    }
    const removed = await deleteHunterEquipmentSlot(this.actor, slot);
    if (!removed) return;
    ui.notifications.info(`${item.name} removed.`);
  }

  // Passive relics post their text to chat without being used/consumed.
  async _onChatRelic(event) {
    event.preventDefault();
    const item = getHunterEquipmentItemForSlot(this.actor, "relic");
    if (!item) {
      ui.notifications.warn("No relic selected.");
      return;
    }
    await postEffectTextChat(item, { speaker: ChatMessage.getSpeaker({ actor: this.actor }), title: item.name || "Relic" });
  }

  async _onRollEcho(event) {
    event.preventDefault();
    await rollEchoFlow(this.actor);
  }

  async _onAddEcho(event) {
    event.preventDefault();
    if (!game.user?.isGM) {
      ui.notifications.warn("Only the GM can add Echoes directly.");
      return;
    }
    const packOptions = [];
    for (const pack of getEchoPacks()) {
      const index = await pack.getIndex();
      for (const entry of index) packOptions.push(`<option value="${entry._id}">${entry.name}</option>`);
    }
    const worldOptions = (game.items?.filter(i => i.type === "echo") || [])
      .map(i => `<option value="${i.id}">${i.name}</option>`);
    if (!packOptions.length && !worldOptions.length) {
      ui.notifications.warn("No Echoes available in compendiums or world items.");
      return;
    }
    const groups = [
      packOptions.length ? `<optgroup label="Compendium">${packOptions.join("")}</optgroup>` : "",
      worldOptions.length ? `<optgroup label="World Items">${worldOptions.join("")}</optgroup>` : "",
    ].join("");
    const echoContent = `
        <form class="hollows-roll-dialog">
          <div class="form-group">
            <label>Echo</label>
            <select name="echoId">${groups}</select>
          </div>
        </form>
      `;
    const pickId = await foundry.applications.api.DialogV2.wait({
      window: { title: "Add Echo" },
      content: echoContent,
      buttons: [
        { action: "add", label: "Add", default: true, callback: (_e, _b, dialog) => String(dialog.element.querySelector("[name=echoId]")?.value || "") },
        { action: "cancel", label: "Cancel", callback: () => null },
      ],
      rejectClose: false,
    }) ?? "";
    if (!pickId) return;
    await addEchoById(this.actor, pickId);
  }

  async _onToggleEcho(event) {
    event.preventDefault();
    const echoId = String(event.currentTarget.dataset.echoId || "");
    if (!echoId) return;
    const echo = this.actor.items.get(echoId);
    if (!echo || echo.type !== "echo") return;
    await echo.update({ "system.suppressed": !echo.system?.suppressed });
  }

  async _onDeleteEcho(event) {
    event.preventDefault();
    if (!game.user?.isGM) return;
    const echoId = String(event.currentTarget.dataset.echoId || "");
    if (!echoId) return;
    await this.actor.deleteEmbeddedDocuments("Item", [echoId]);
  }

  async _onTriggerEcho(event) {
    event.preventDefault();
    if (!game.user?.isGM) return;
    const echoId = String(event.currentTarget.dataset.echoId || "");
    if (!echoId) return;
    const echo = this.actor.items.get(echoId);
    if (!echo || echo.type !== "echo") return;
    await applySeedEchoEffect(this.actor, echo, { countAsGain: false });
  }

  async _onResetEchoes(event) {
    event.preventDefault();
    if (!game.user?.isGM) return;
    try { await this.actor.unsetFlag("hollows", "seedEchoCounts"); } catch (err) {}
    const updates = this.actor.items
      .filter(i => i.type === "echo" && i.system?.usedThisHollow)
      .map(i => ({ _id: i.id, "system.usedThisHollow": false }));
    if (updates.length) await this.actor.updateEmbeddedDocuments("Item", updates);
    ui.notifications.info("Echoes reset for a new Hollow.");
  }

  _evaluateResult(rollValue, statValue, tn) {
    return evaluateResult(rollValue, statValue, tn);
  }

  _outcomeClass(label) {
    return outcomeClassFromLabel(label);
  }

  async _onClingToLife(event) {
    event.preventDefault();
    const actor = this.actor;
    if (!actor || actor.type !== "hunter") return;
    if (hasCondition(actor, "dead")) return;
    if (!hasCondition(actor, "dying")) return;
    const statLabel = STAT_LABELS.hard || "Hard";
    const statValue = this._getTotalStat("hard");
    const roll = await (new Roll("1d20")).evaluate();
    const rolled = Number(roll.terms?.[0]?.results?.[0]?.result ?? 20);
    const outcome = evaluateResult(rolled, statValue, null);
    const success = outcome.label === "Success" || outcome.label === "Superior Success" || outcome.label === "Critical Success";
    const critical = outcome.label === "Critical Success";

    if (!success) {
      await removeCondition(actor, "dying");
      await addCondition(actor, "dead");
      await actor.setFlag("hollows", "dead", true);
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="hollows-chat"><strong>${actor.name}</strong> fails to cling to life and dies.</div>`,
      });
      return;
    }

    if (critical) {
      await adjustHunterResource(actor, { resolve: 1, wounds: 1 });
      await removeCondition(actor, "dying");
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="hollows-chat"><strong>${actor.name}</strong> clings to life (critical) and stabilizes (+1 Resolve, +1 Wound).</div>`,
      });
      return;
    }

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: "Cling to Life",
      content: `<div class="hollows-chat"><strong>${actor.name}</strong> clings to life (Hard ${rolled}/${statValue}) - still dying.</div>`,
    });
  }

  async _rollStatWithOutcome(statLabel, statValue, tn, mode, options = {}) {
    const flow = new HunterStatRollFlow(this.actor, {
      title: `${statLabel} Test`,
      cardTitle: "tests",
      statLabel,
      statValue,
      tn,
      focusCount: getFocusCount(this.actor),
      spendFocus: async () => adjustHunterResource(this.actor, { focus: -1 }),
    });
    return await flow.roll({ mode, useFocus: !!options.useFocus });
  }

  async _onSupportRecover(event) {
    event.preventDefault();
    await openRecoverForActor(this.actor);
  }

  async _onSupportHeal(event) {
    event.preventDefault();
    await openHealForActor(this.actor);
  }

  async _onWeaponAbilityChat(event) {
    event.preventDefault();
    const abilityId = event.currentTarget.dataset.abilityId;
    const ability = this.actor.items.get(abilityId);
    if (!ability) return;
    const safeName = foundry.utils.escapeHTML(ability.name || "Ability");
    const safeText = foundry.utils.escapeHTML(ability.system.text || "").replaceAll("\n", "<br/>");
    const content = `
      <div class="hollows-ability-chat">
        <h3>${safeName}</h3>
        <div>${safeText}</div>
      </div>
    `;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: `${ability.name || "Ability"}`,
      content,
    });
  }

  async _promptAbilityPick(docs, title) {
    if (!docs.length) {
      ui.notifications.warn("No matching weapon abilities found.");
      return null;
    }
    const options = docs.map(d => `<option value="${d.id}">${d.name}</option>`).join("");
    const content = `
      <form class="hollows-roll-dialog">
        <div class="form-group">
          <label>Ability</label>
          <select name="abilityId">${options}</select>
        </div>
      </form>
    `;
    return await foundry.applications.api.DialogV2.wait({
      window: { title },
      content,
      buttons: [
        {
          action: "apply",
          label: "Apply",
          default: true,
          callback: (_e, _b, dialog) => {
            const abilityId = dialog.element.querySelector("[name=abilityId]")?.value;
            return docs.find(d => d.id === abilityId) || null;
          },
        },
        { action: "cancel", label: "Cancel", callback: () => null },
      ],
      rejectClose: false,
    }) ?? null;
  }

  async _grantAbilityFromDoc(doc, durationType) {
    if (!doc) return null;
    const data = foundry.utils.deepClone(doc.toObject());
    delete data._id;
    data.system = data.system || {};
    data.system.durationType = durationType || "temporary";
    data.system.boundWeaponId = "";
    const created = await this.actor.createEmbeddedDocuments("Item", [data]);
    return created?.[0] || null;
  }

  _countWeaponType(weaponType) {
    return this.actor.items.filter(i => i.type === "weapon" && i.system?.weaponType === weaponType).length;
  }

  _countPermanentTier1(weaponType) {
    return this.actor.items
      .filter(i => i.type === "weapon-ability")
      .filter(i => i.system?.weaponType === weaponType)
      .filter(i => Number(i.system?.tier ?? 0) === 1)
      .filter(i => String(i.system?.durationType || "permanent") === "permanent")
      .length;
  }

  async _assignPermanentTier1IfNeeded(weapon) {
    if (!weapon || weapon.type !== "weapon") return;
    const weaponType = weapon.system?.weaponType;
    if (!weaponType) return;
    const weaponCount = this._countWeaponType(weaponType);
    const permCount = this._countPermanentTier1(weaponType);
    if (permCount >= weaponCount) return;

    const docs = await getWeaponAbilityDocs(weaponType, 1);
    const chosen = await this._promptAbilityPick(docs, `Choose Permanent Tier 1 (${weaponType})`);
    if (!chosen) {
      ui.notifications.warn(`No permanent Tier 1 selected for ${weaponType}.`);
      return;
    }
    const granted = await this._grantAbilityFromDoc(chosen, "permanent");
    if (granted) {
      await granted.update({
        "system.boundWeaponId": weapon.id,
        "system.weaponType": weaponType,
      });
    }
  }

  async _onAddWeapon(event) {
    event.preventDefault();
    const count = this.actor.items.filter(i => i.type === "weapon").length;
    if (count >= 2) {
      ui.notifications.warn("A Hunter can only have two weapons.");
      return;
    }
    const docs = await getWeaponPackDocs();
    if (!docs.length) {
      ui.notifications.warn("No weapons found in compendiums.");
      return;
    }
    const options = docs
      .map(d => `<option value="${d.uuid}">${d.name}</option>`)
      .join("");
    const content = `
      <form>
        <div class="form-group">
          <label>Select a weapon</label>
          <select name="weaponId">${options}</select>
        </div>
      </form>
    `;
    await foundry.applications.api.DialogV2.wait({
      window: { title: "Add Weapon From Compendium" },
      content,
      buttons: [
        {
          action: "add",
          label: "Add",
          default: true,
          callback: async (_e, _b, dialog) => {
            const selectedId = dialog.element.querySelector("[name=weaponId]")?.value;
            const entry = docs.find(d => d.uuid === selectedId);
            if (!entry) return;
            const data = foundry.utils.deepClone(entry.toObject());
            delete data._id;
            const created = await this.actor.createEmbeddedDocuments("Item", [data]);
            const weapon = created?.[0] || null;
            if (weapon) {
              await this._assignPermanentTier1IfNeeded(weapon);
            }
          },
        },
      ],
      rejectClose: false,
    });
  }

  async _onEditWeapon(event) {
    event.preventDefault();
    const itemId = event.currentTarget.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;
    item.sheet.render(true);
  }

  async _onRemoveWeapon(event) {
    event.preventDefault();
    const itemId = event.currentTarget.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;
    await item.delete();
    await cleanupWeaponAbilitiesForActor(this.actor);
  }

  async _onReplaceWeapon(event) {
    event.preventDefault();
    const itemId = event.currentTarget.dataset.itemId;
    const current = this.actor.items.get(itemId);
    if (!current) return;
    const docs = await getWeaponPackDocs();
    if (!docs.length) {
      ui.notifications.warn("No weapons found in compendiums.");
      return;
    }
    const options = docs
      .map(d => `<option value="${d.uuid}">${d.name}</option>`)
      .join("");
    const content = `
      <form>
        <div class="form-group">
          <label>Select weapon to replace with</label>
          <select name="weaponId">${options}</select>
        </div>
      </form>
    `;
    await foundry.applications.api.DialogV2.wait({
      window: { title: "Replace Weapon" },
      content,
      buttons: [
        {
          action: "replace",
          label: "Replace",
          default: true,
          callback: async (_e, _b, dialog) => {
            const selectedId = dialog.element.querySelector("[name=weaponId]")?.value;
            const entry = docs.find(d => d.uuid === selectedId);
            if (!entry) return;
            const data = foundry.utils.deepClone(entry.toObject());
            delete data._id;
            const created = await this.actor.createEmbeddedDocuments("Item", [data]);
            await current.delete();
            await cleanupWeaponAbilitiesForActor(this.actor);
            const weapon = created?.[0] || null;
            if (weapon) {
              await this._assignPermanentTier1IfNeeded(weapon);
            }
          },
        },
      ],
      rejectClose: false,
    });
  }

  async _onDropItem(event, data) {
    const item = await Item.implementation.fromDropData(data);
    if (item?.type === "weapon") {
      const count = this.actor.items.filter(i => i.type === "weapon").length;
      if (count >= 2) {
        ui.notifications.warn("A Hunter can only have two weapons.");
        return false;
      }
    }
    return super._onDropItem(event, data);
  }
}
