import { getHollowsWeaponIndex } from "../../../helpers/runtime-state.js";
import {
  STAT_LABELS,
  DEFENCE_LABELS,
} from "../../../data/_module.mjs";
import { editItemScript } from "../../apps/script-editor.mjs";
import {
  getAvailableWeaponForms,
  getEffectiveWeaponAttackProfiles,
  getEffectiveWeaponCapacity,
  getEffectiveWeaponDamage,
  getSelectedWeaponForm,
  getWeaponPackDocs,
} from "../../../data/weapons/index.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

export default class HollowsWeaponSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["hollows", "sheet", "item", "weapon"],
    position: { width: 520, height: 620 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      editScript: editItemScript,
      /** @this {HollowsWeaponSheet} */
      addAttackProfile: async function() {
        if (!this.isEditable || !game.user.isGM) return;
        const profiles = foundry.utils.deepClone(this.item.system.attackProfiles);
        profiles.push({ range: "Close", stat: "Strong", defence: "Close" });
        await this.item.update({ "system.attackProfiles": profiles });
        this.render();
      },
      /** @this {HollowsWeaponSheet} */
      removeAttackProfile: async function(event, target) {
        if (!this.isEditable || !game.user.isGM) return;
        const profiles = foundry.utils.deepClone(this.item.system.attackProfiles);
        profiles.splice(Number(target.dataset.index), 1);
        await this.item.update({ "system.attackProfiles": profiles });
        this.render();
      },
      unbindAbility: async function(event, target) {
        if (!this.isEditable) return;
        return this._onUnbindAbility(event, target);
      },
      deleteAbility: async function(event, target) {
        if (!this.isEditable) return;
        return this._onDeleteAbility(event, target);
      },
    },
  };

  static PARTS = {
    sheet: {
      template: "systems/hollows/templates/item/weapon-sheet.html",
      root: true,
    },
  };

  get title() {
    return this.item?.name ?? "Weapon";
  }

  render(options = {}) {
    const wc = this.element?.querySelector(".window-content");
    if (wc) this._savedScrollTop = wc.scrollTop;
    return super.render(options);
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.item.system?.toObject
      ? this.item.system.toObject()
      : foundry.utils.deepClone(this.item.system);
    const data = {
      ...context,
      item: this.item,
      system,
      editable: this.isEditable,
      owner: this.document.isOwner,
      limited: this.document.limited,
      statLabels: STAT_LABELS,
      canEditWeapon: game.user.isGM && this.isEditable,
      attackProfileChoices: {
        range: ["Close", "Ranged", "Anywhere"],
        stat: Object.values(STAT_LABELS),
        defence: Object.values(DEFENCE_LABELS),
      },
    };

    let packDoc = null;
    data.modifierChoicesForDisplay = system.modifierChoices;
    data.attackProfilesForDisplay = getEffectiveWeaponAttackProfiles(this.item);
    data.formsForDisplay = await getAvailableWeaponForms(this.item);
    data.activeForm = getSelectedWeaponForm(this.item);
    if (system.appliedForm && !data.formsForDisplay.some(form => form.uuid === system.appliedForm.uuid)) {
      const { uuid, name, weaponType } = system.appliedForm;
      data.formsForDisplay.push({ uuid, name, weaponType });
    }
    data.scriptsAllowed = hollows.settings.allowCustomScripts;
    data.canEditScripts = game.user.isGM && this.isEditable;
    data.effectiveDamage = getEffectiveWeaponDamage(this.item);
    data.effectiveCapacity = getEffectiveWeaponCapacity(this.item);
    data.system.capacity = {
      value: Number(this.item.system?.capacity?.value ?? data.effectiveCapacity.value ?? 0),
      max: Number(data.effectiveCapacity.max ?? 0),
    };

    if (this.item.pack) {
      const pack = game.packs.get(this.item.pack);
      if (pack) {
        const doc = await pack.getDocument(this.item._id);
        if (doc) packDoc = doc;
      }
    }
    if (!packDoc) {
      const docs = await getWeaponPackDocs();
      packDoc = docs.find(d => d.name === this.item.name) ||
        docs.find(d => d.system?.weaponType && (d.system.weaponType === this.item.system.weaponType)) ||
        null;
    }
    const weaponIndex = getHollowsWeaponIndex();
    if (!packDoc && weaponIndex) {
      const byName = weaponIndex.get(this.item.name);
      const byType = weaponIndex.get(this.item.system.weaponType);
      packDoc = byName || byType || null;
    }
    if (packDoc?.system) {
      const fields = ["description", "coreAbility"];
      for (const field of fields) {
        if (!data.system[field]) {
          data.system[field] = packDoc.system[field] || this.item._source?.system?.[field] || "";
        }
      }
    }
    const itemOwner = this.item.parent;
    if (itemOwner?.type === "hunter") {
      data.assignedAbilities = itemOwner.items
        .filter(i => i.type === "weaponAbility")
        .filter(a => {
          const boundId = String(a.system?.boundWeaponId || "");
          if (boundId) return boundId === this.item.id;
          return a.system?.weaponType === this.item.system?.weaponType;
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    } else {
      data.assignedAbilities = [];
    }
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
    if (this.isEditable) {
      this.element.addEventListener("dragover", ev => ev.preventDefault());
      this.element.addEventListener("drop", this._onDropItem.bind(this));
    }
  }

  async _onChangeForm(formConfig, event) {
    const input = event.target;
    const name = input.name;

    if (name === "formUuid") return this._onSelectedFormChange(event);
    if (name === "system.modifierChoice") return this._onModifierChoiceChange(event);

    // Toggling renown reveals/hides the whole section, so it needs a render;
    // the name/text fields below take the silent renderless path.
    if (name === "system.renown.enabled") {
      event.preventDefault?.();
      event.stopPropagation?.();
      await this.item.update({ "system.renown.enabled": !!input.checked });
      this.render();
      return;
    }

    if ((name === "name") || name.startsWith("system.")) {
      event.preventDefault();
      event.stopPropagation();
      let value = input.value;
      if (input.type === "checkbox") value = input.checked;
      else if (input.type === "number") value = Number(value);
      else if (input.dataset.dtype === "Boolean") value = value === "true";
      if (name.startsWith("system.attackProfiles.")) {
        const [, , index, field] = name.split(".");
        const profiles = foundry.utils.deepClone(this.item.system.attackProfiles);
        profiles[index][field] = value;
        await this.item.update({ "system.attackProfiles": profiles }, { render: false });
      } else {
        await this.document.update({ [name]: value }, { render: false });
      }
      return;
    }

    return super._onChangeForm(formConfig, event);
  }

  async _onUnbindAbility(event, target = event.currentTarget) {
    event.preventDefault();
    const abilityId = String(target?.dataset?.abilityId || "");
    const owner = this.item.parent;
    if (!owner || (owner.type !== "hunter")) return;
    const ability = owner.items.get(abilityId);
    if (!ability || (ability.type !== "weaponAbility")) return;
    await ability.update({ "system.boundWeaponId": "" });
    this.render();
  }

  async _onDeleteAbility(event, target = event.currentTarget) {
    event.preventDefault();
    const abilityId = String(target?.dataset?.abilityId || "");
    const owner = this.item.parent;
    if (!owner || (owner.type !== "hunter")) return;
    const ability = owner.items.get(abilityId);
    if (!ability || (ability.type !== "weaponAbility")) return;
    await ability.delete();
    this.render();
  }

  /** Apply a dropped form or bind a weapon ability. */
  async _onDropItem(event) {
    event.preventDefault();
    const targetWeaponType = String(this.item.system?.weaponType || "");
    if (!targetWeaponType) {
      ui.notifications.warn("This weapon has no weapon type.");
      return;
    }
    let dropData = null;
    try {
      dropData = JSON.parse(event.dataTransfer?.getData("text/plain") || "");
    } catch { dropData = null; }
    if (!dropData) return;
    let dropped = null;
    try {
      dropped = await Item.implementation.fromDropData(dropData);
    } catch { dropped = null; }
    if (dropped?.type === "weaponForm") {
      await this.item.system.applyForm(dropped);
      this.render();
      return;
    }
    if (!dropped || (dropped.type !== "weaponAbility")) return;
    const owner = this.item.parent;
    if (!owner || (owner.type !== "hunter")) {
      ui.notifications.warn("Open this weapon from a Hunter to assign abilities.");
      return;
    }
    const droppedWeaponType = String(dropped.system?.weaponType || "");
    if (!droppedWeaponType || (droppedWeaponType !== targetWeaponType)) {
      ui.notifications.warn(`Only ${targetWeaponType} abilities can be assigned to this weapon.`);
      return;
    }
    if (dropped.parent?.id === owner.id) {
      await dropped.update({ "system.boundWeaponId": this.item.id, "system.weaponType": targetWeaponType });
      this.render();
      return;
    }
    const payload = foundry.utils.deepClone(dropped.toObject());
    delete payload._id;
    payload.system = payload.system || {};
    payload.system.boundWeaponId = this.item.id;
    payload.system.weaponType = targetWeaponType;
    const created = await owner.createEmbeddedDocuments("Item", [payload]);
    if (created?.length) this.render();
  }

  /** Apply the form selected from the catalogue. */
  async _onSelectedFormChange(event) {
    event.preventDefault();
    event.stopPropagation();
    const uuid = event.target.value;
    await this.item.system.applyForm(uuid ? await fromUuid(uuid) : null);
    this.render();
  }

  async _onModifierChoiceChange(event) {
    event.preventDefault?.();
    event.stopPropagation?.();
    const choiceId = event.target?.value ?? event.currentTarget?.value;
    const choices = this.item.system.modifierChoices;
    const choice = choices.find(c => c.id === choiceId);
    if (!choice) {
      await this.item.update({ "system.modifierChoice": "" });
      this.render();
      return;
    }
    await this.item.update({
      "system.modifierChoice": choiceId,
    });
    this.render();
  }
}
