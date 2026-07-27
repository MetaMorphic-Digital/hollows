import { getHollowsWeaponIndex } from "../../../helpers/runtime-state.js";
import {
  STAT_LABELS,
} from "../../../data/_module.mjs";
import {
  getAvailableWeaponForms,
  getEffectiveWeaponAttackProfiles,
  getEffectiveWeaponCapacity,
  getEffectiveWeaponDamage,
  getEffectiveWeaponHealthBonus,
  getEffectiveWeaponModifierChoices,
  getWeaponPackDocs,
} from "../../../data/weapons/index.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

const ATTACK_PROFILE_RANGES = [
  { value: "Close", label: "Close" },
  { value: "Ranged", label: "Ranged" },
  { value: "Anywhere", label: "Anywhere" },
];

const ATTACK_PROFILE_STATS = [
  { value: "Strong", label: "Strong" },
  { value: "Hard", label: "Hard" },
  { value: "Quick", label: "Quick" },
  { value: "Sharp", label: "Sharp" },
  { value: "Wise", label: "Wise" },
];

const ATTACK_PROFILE_DEFENCES = [
  { value: "Close", label: "Close" },
  { value: "Ranged", label: "Ranged" },
  { value: "Wyrd", label: "Wyrd" },
];

export default class HollowsWeaponSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["hollows", "sheet", "item", "weapon"],
    position: { width: 520, height: 620 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      addCustomAttackProfile: async function(event, target) {
        if (!this.isEditable) return;
        return this._onAddCustomAttackProfile(event, target);
      },
      removeCustomAttackProfile: async function(event, target) {
        if (!this.isEditable) return;
        return this._onRemoveCustomAttackProfile(event, target);
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
    };

    let packDoc = null;
    data.modifierChoicesForDisplay = getEffectiveWeaponModifierChoices(this.item);
    data.attackProfilesForDisplay = getEffectiveWeaponAttackProfiles(this.item);
    data.customAttackProfilesForDisplay = Array.isArray(system.customForm?.attackProfiles)
      ? system.customForm.attackProfiles
      : [];
    data.attackProfileRangeChoices = ATTACK_PROFILE_RANGES;
    data.attackProfileStatChoices = ATTACK_PROFILE_STATS;
    data.attackProfileDefenceChoices = ATTACK_PROFILE_DEFENCES;
    data.formsForDisplay = getAvailableWeaponForms(this.item);
    data.effectiveDamage = getEffectiveWeaponDamage(this.item);
    data.effectiveCapacity = getEffectiveWeaponCapacity(this.item);
    data.effectiveHealthBonus = getEffectiveWeaponHealthBonus(this.item);
    data.system.capacity = {
      value: Number(this.item.system?.capacity?.value ?? data.effectiveCapacity.value ?? 0),
      max: Number(data.effectiveCapacity.max ?? 0),
    };
    data.system.health_bonus = data.effectiveHealthBonus;

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
        docs.find(d => d.system?.weaponType && d.system.weaponType === this.item.system.weaponType) ||
        null;
    }
    const weaponIndex = getHollowsWeaponIndex();
    if (!packDoc && weaponIndex) {
      const byName = weaponIndex.get(this.item.name);
      const byType = weaponIndex.get(this.item.system.weaponType);
      packDoc = byName || byType || null;
    }
    if (packDoc?.system) {
      const fields = ["outlook", "lies", "fears", "description", "coreAbility"];
      for (const field of fields) {
        if (!data.system[field]) {
          data.system[field] = packDoc.system[field] || this.item._source?.system?.[field] || "";
        }
      }
    }
    const itemOwner = this.item.parent;
    if (itemOwner?.type === "hunter") {
      data.assignedAbilities = itemOwner.items
        .filter(i => i.type === "weapon-ability")
        .filter(a => {
          const boundId = String(a.system?.boundWeaponId || "");
          if (boundId) return boundId === this.item.id;
          return a.system?.weaponType === this.item.system?.weaponType;
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    } else {
      data.assignedAbilities = [];
    }
    this._formsForDisplay = data.formsForDisplay;
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
      this.element.addEventListener("drop", this._onDropAbility.bind(this));
    }
  }

  async _onChangeForm(formConfig, event) {
    const input = event?.target;
    const name = String(input?.name ?? "");

    if (name === "system.selectedForm") return this._onSelectedFormChange(event);
    if (name === "system.modifierChoice") return this._onModifierChoiceChange(event);
    if (name === "system.formAttackChoice") return this._onFormAttackChoiceChange(event);

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

  _getCustomAttackProfiles() {
    const profiles = this.item.system?.customForm?.attackProfiles;
    return Array.isArray(profiles)
      ? foundry.utils.deepClone(profiles)
      : [];
  }

  async _onAddCustomAttackProfile(event) {
    event.preventDefault();
    const profiles = this._getCustomAttackProfiles();
    profiles.push({ range: "Close", stat: "Strong", defence: "Close" });
    await this.item.update({ "system.customForm.attackProfiles": profiles });
    this.render();
  }

  async _onRemoveCustomAttackProfile(event, target = event.currentTarget) {
    event.preventDefault();
    const index = Number(target?.dataset?.index ?? -1);
    const profiles = this._getCustomAttackProfiles();
    if (index < 0 || index >= profiles.length) return;
    profiles.splice(index, 1);
    await this.item.update({ "system.customForm.attackProfiles": profiles });
    this.render();
  }

  async _onUnbindAbility(event, target = event.currentTarget) {
    event.preventDefault();
    const abilityId = String(target?.dataset?.abilityId || "");
    const owner = this.item.parent;
    if (!owner || owner.type !== "hunter") return;
    const ability = owner.items.get(abilityId);
    if (!ability || ability.type !== "weapon-ability") return;
    await ability.update({ "system.boundWeaponId": "" });
    this.render();
  }

  async _onDeleteAbility(event, target = event.currentTarget) {
    event.preventDefault();
    const abilityId = String(target?.dataset?.abilityId || "");
    const owner = this.item.parent;
    if (!owner || owner.type !== "hunter") return;
    const ability = owner.items.get(abilityId);
    if (!ability || ability.type !== "weapon-ability") return;
    await ability.delete();
    this.render();
  }

  async _onDropAbility(event) {
    event.preventDefault();
    const owner = this.item.parent;
    if (!owner || owner.type !== "hunter") {
      ui.notifications.warn("Open this weapon from a Hunter to assign abilities.");
      return;
    }
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
    if (!dropped || dropped.type !== "weapon-ability") return;
    const droppedWeaponType = String(dropped.system?.weaponType || "");
    if (!droppedWeaponType || droppedWeaponType !== targetWeaponType) {
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

  async _onSelectedFormChange(event) {
    event.preventDefault?.();
    event.stopPropagation?.();
    const value = event.target?.value ?? event.currentTarget?.value;
    const forms = this._formsForDisplay || getAvailableWeaponForms(this.item);
    const form = forms.find(f => f.name === value || f.key === value);
    const update = {
      "system.selectedForm": value,
      "system.modifierChoice": "",
    };
    if (form?.capacity) {
      update["system.capacity.value"] = Number(form.capacity.value ?? 0);
    }
    if (value === "Silk" && !this.item.system.formAttackChoice) {
      update["system.formAttackChoice"] = "Quick";
    }
    await this.item.update(update);
    this.render();
  }

  async _onFormAttackChoiceChange(event) {
    event.preventDefault?.();
    event.stopPropagation?.();
    const choice = event.target?.value ?? event.currentTarget?.value;
    await this.item.update({ "system.formAttackChoice": choice });
    this.render();
  }

  async _onModifierChoiceChange(event) {
    event.preventDefault?.();
    event.stopPropagation?.();
    const choiceId = event.target?.value ?? event.currentTarget?.value;
    const choices = getEffectiveWeaponModifierChoices(this.item);
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
