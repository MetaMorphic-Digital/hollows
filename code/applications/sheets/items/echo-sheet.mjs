import EffectBuilderItemSheet from "./effect-builder.mjs";
import { MALIGNANCY_LIST } from "../../../data/echo/index.js";
import { createDefaultEffectGroup } from "../../../data/relic/effect-schema.js";
import { WEAPONS } from "../../../data/weapons/config.js";

function choiceMap(entries) {
  return Object.fromEntries(entries.map((entry) => [entry.value, entry.label]));
}

function hunterWeaponChoices(actor) {
  return (actor?.items || [])
    .filter((item) => item.type === "weapon")
    .map((weapon) => ({
      value: weapon.id,
      label: `${weapon.name} (${weapon.system?.weaponType || "Weapon"})`,
    }));
}

export default class HollowsEchoSheet extends EffectBuilderItemSheet {
  static DEFAULT_OPTIONS = {
    classes: ["hollows", "sheet", "item", "echo", "builder"],
    actions: {
      // Echo has a single groups path; every group is an onDeath trigger.
      addGroup: async function(event, target) {
        const path = target?.dataset?.groupsPath;
        if (!path) return;
        const groups = foundry.utils.deepClone(foundry.utils.getProperty(this.item.system, path) || []);
        groups.push({ ...createDefaultEffectGroup(), trigger: "onDeath" });
        this._captureScroll();
        await this.document.update({ [`system.${path}`]: groups });
      },
    },
  };

  static PARTS = {
    sheet: {
      template: "systems/hollows/templates/item/echo-sheet.html",
      root: true,
    },
  };

  get title() {
    return this.item?.name ?? "Echo";
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const category = String(this.item.system?.category || "seed");
    const parent = this.item.parent?.type === "hunter" ? this.item.parent : null;
    return {
      ...context,
      item: this.item,
      system: this.item.system,
      systemFields: this.item.system.schema.fields,
      editable: this.isEditable,
      owner: this.document.isOwner,
      limited: this.document.limited,
      isSeedEcho: category === "seed",
      isWeaponEcho: category === "weapon",
      isMalignancyEcho: category === "malignancy",
      echoTypeChoices: { boon: "Boon", bane: "Bane" },
      categoryChoices: { seed: "Seed", weapon: "Weapon", malignancy: "Malignancy" },
      malignancyChoices: MALIGNANCY_LIST.map(name => ({ value: name, label: name })),
      weaponTypeChoices: choiceMap(Object.values(WEAPONS).map((weapon) => ({
        value: weapon.key,
        label: weapon.label,
      }))),
      weaponChoices: hunterWeaponChoices(parent),
      hasHunterParent: !!parent,
      replaceDyingOutcomeChoices: {
        preventDeath: "Prevent death",
        dieAfterEffects: "Apply effects, then die",
      },
    };
  }

  _needsRerender(name) {
    return super._needsRerender(name)
      || name === "system.category"
      || name === "system.sourceWeaponId"
      || name === "system.onAcquire.enhancesExplorationRoll"
      || name === "system.onAcquire.createsHazard"
      || name === "system.onAcquire.createsThrall"
      || name === "system.replaceDyingState.enabled"
      || name === "system.replaceDyingState.outcome";
  }

  async _writeField(name, value, render = false) {
    if (name === "system.category") {
      const category = String(value || "seed");
      const update = { "system.category": category };
      if (category !== "weapon") {
        update["system.sourceWeaponId"] = "";
        update["system.weaponType"] = "";
      }
      if (category !== "malignancy") update["system.malignancy"] = "";
      await this.document.update(update, { render });
      return;
    }
    if (name === "system.sourceWeaponId") {
      const weapon = this.item.parent?.items?.get(String(value || ""));
      await this.document.update({
        "system.sourceWeaponId": String(value || ""),
        "system.weaponType": String(weapon?.system?.weaponType || this.item.system?.weaponType || ""),
      }, { render });
      return;
    }
    await super._writeField(name, value, render);
  }
}
