import { pickOne, pickMany, promptForm, confirmDialog } from "./selection-dialogs.mjs";
import { WeaponCatalog } from "../../data/weapons/registry.js";
import { getAvailableWeaponForms } from "../../data/weapons/resolvers.js";
import { getRefugeAllowedWeaponTiers } from "../../data/refuge/resolvers.js";
import { STAT_LABELS } from "../../data/system-constants.js";

/** Collect Refuge weapon choices before sending the action to the GM. */
export default class RefugeRearmReforgeDialogs {
  constructor(hunter, refuge) {
    this.hunter = hunter;
    this.tiers = getRefugeAllowedWeaponTiers(refuge);
    this.weapons = hunter.items.filter(item => item.type === "weapon");
  }

  /** Abilities belonging to a weapon, including unbound abilities of its type. */
  #abilitiesFor(weapon) {
    return this.hunter.items.filter(item => (item.type === "weaponAbility")
      && (item.system.boundWeaponId ? item.system.boundWeaponId === weapon.id
        : item.system.weaponType === weapon.system.weaponType));
  }

  /** Identity used to prevent duplicate abilities across compendiums. */
  #abilityKey(item) {
    return `${item.system.weaponType}:${item.system.tier}:${item.name}`;
  }

  /** Return a complete choice, or null when the action is cancelled. */
  static async prepare(hunter, refuge, action) {
    const chooser = new this(hunter, refuge);
    let choice;
    switch (action) {
      case "rearm": choice = await chooser.#rearm(); break;
      case "reforge": choice = await chooser.#reforge(); break;
      case "reshape": choice = await chooser.#reshape(); break;
      case "removeEcho": {
        const echoes = hunter.items.filter(item => item.type === "echo");
        const echoId = await chooser.#pick("HOLLOWS.REFUGE.removeEcho", echoes);
        choice = echoId ? { echoId } : null;
        break;
      }
      default: return {};
    }
    if (!choice) return null;
    const changes = await Promise.all((choice.weapons || []).map(async pick => {
      const weapon = pick.uuid ? await fromUuid(pick.uuid) : hunter.items.get(pick.id);
      const form = pick.formUuid ? await fromUuid(pick.formUuid) : null;
      return `${hunter.items.get(pick.id).name} → ${weapon.name}${form ? ` (${form.name})` : ""}`;
    }));
    for (const pick of choice.abilities || []) {
      changes.push(`${hunter.items.get(pick.id).name} → ${(await fromUuid(pick.uuid)).name}`);
    }
    if (choice.echoId) changes.push(hunter.items.get(choice.echoId).name);
    if (choice.stats) changes.push(Object.entries(choice.stats).map(([key, value]) => `${STAT_LABELS[key]} ${value}`).join(", "));
    const confirmed = await confirmDialog({
      title: game.i18n.localize(`HOLLOWS.REFUGE.${action}`),
      bodyHtml: `<p>${game.i18n.localize("HOLLOWS.REFUGE.confirmWeaponChanges")}</p>`
        + `<ul>${changes.map(change => `<li>${foundry.utils.escapeHTML(change)}</li>`).join("")}</ul>`,
    });
    return confirmed ? choice : null;
  }

  /** Choose an owned item, reporting an empty list to the player. */
  async #pick(title, items) {
    if (!items.length) {
      ui.notifications.warn(game.i18n.localize("HOLLOWS.REFUGE.nothingToReplace"));
      return null;
    }
    return pickOne({
      title: game.i18n.localize(title), options: items.map(item => ({ value: item.id, label: item.name })),
    });
  }

  /** Replace a chosen subset of one weapon's temporary abilities. */
  async #rearm() {
    const id = await this.#pick("HOLLOWS.REFUGE.rearm", this.weapons);
    if (!id) return null;
    const weapon = this.hunter.items.get(id);
    const current = this.#abilitiesFor(weapon)
      .filter(item => (item.system.durationType === "temporary") && this.tiers.includes(item.system.tier));
    if (!current.length) {
      ui.notifications.warn(game.i18n.localize("HOLLOWS.REFUGE.nothingToReplace"));
      return null;
    }
    const ids = await pickMany({
      title: game.i18n.localize("HOLLOWS.REFUGE.rearm"),
      options: current.map(item => ({ value: item.id, label: `${item.name} (Tier ${item.system.tier})` })),
    });
    if (!ids?.length) return null;
    const abilities = await this.#replaceAbilities(current.filter(item => ids.includes(item.id)), [weapon]);
    return abilities ? { weapons: [], abilities } : null;
  }

  /** Reforge one weapon and replace its temporary abilities and one permanent Tier 1. */
  async #reforge() {
    const id = await this.#pick("HOLLOWS.REFUGE.reforge", this.weapons);
    if (!id) return null;
    const old = this.hunter.items.get(id);
    const excluded = this.weapons.filter(item => item.id !== id).map(item => item.system.weaponType);
    const selection = await this.#chooseWeapon(old, excluded);
    if (!selection) return null;
    const current = this.#abilitiesFor(old);
    const replace = current.filter(item => item.system.durationType === "temporary");
    const permanent = current.filter(item => (item.system.durationType === "permanent") && (item.system.tier === 1));
    if (permanent.length) {
      const permanentId = await this.#pick("HOLLOWS.REFUGE.replacePermanent", permanent);
      if (!permanentId) return null;
      replace.push(this.hunter.items.get(permanentId));
    }
    const abilities = await this.#replaceAbilities(replace, [selection.weapon]);
    return abilities ? { weapons: [selection.choice], abilities } : null;
  }

  /** Permute base stats and choose two weapons, retaining ability tiers and durations. */
  async #reshape() {
    if (this.weapons.length !== 2) {
      ui.notifications.warn(game.i18n.localize("HOLLOWS.REFUGE.requiresTwoWeapons"));
      return null;
    }
    const stats = await this.#chooseStats();
    if (!stats) return null;
    const weapons = [];
    for (const old of this.weapons) {
      const selection = await this.#chooseWeapon(old, weapons.map(pick => pick.weapon.system.weaponType));
      if (!selection) return null;
      weapons.push(selection);
    }
    const current = this.hunter.items.filter(item => item.type === "weaponAbility");
    const replace = current.filter(item => item.system.durationType === "temporary");
    const permanent = current.filter(item => item.system.durationType === "permanent");
    if (permanent.length) {
      const ids = await pickMany({
        title: game.i18n.localize("HOLLOWS.REFUGE.replacePermanent"),
        options: permanent.map(item => ({ value: item.id, label: `${item.name} (Tier ${item.system.tier})` })),
      });
      if (!ids) return null;
      replace.push(...permanent.filter(item => ids.includes(item.id)));
    }
    const abilities = await this.#replaceAbilities(replace, weapons.map(pick => pick.weapon));
    return abilities ? { stats, weapons: weapons.map(pick => pick.choice), abilities } : null;
  }

  /** Choose a permutation of the existing base stats. */
  async #chooseStats() {
    const stats = this.hunter.system.stats;
    const options = Object.entries(stats).map(([key, value]) => ({ value: key, label: `${STAT_LABELS[key]} (${value})` }));
    while (true) {
      const choice = await promptForm({
        title: game.i18n.localize("HOLLOWS.REFUGE.reshape"),
        fields: Object.keys(stats).map(key => ({ type: "select", name: key, label: STAT_LABELS[key], value: key, options })),
      });
      if (!choice) return null;
      if (new Set(Object.values(choice)).size === options.length) {
        return Object.fromEntries(Object.entries(choice).map(([key, source]) => [key, stats[source]]));
      }
      ui.notifications.warn(game.i18n.localize("HOLLOWS.REFUGE.statPermutation"));
    }
  }

  /** Choose a weapon template, form and any stat or attack variant. */
  async #chooseWeapon(old, excluded) {
    this.weaponIndex ??= await WeaponCatalog.getIndex("weapon");
    const entries = this.weaponIndex.filter(item => !excluded.includes(item.system.weaponType));
    const uuid = await pickOne({
      title: `${game.i18n.localize("HOLLOWS.REFUGE.reforge")}: ${old.name}`,
      options: [
        ...(!excluded.includes(old.system.weaponType) ? [{ value: "current", label: old.name }] : []),
        ...entries.filter(item => item.system.weaponType !== old.system.weaponType)
          .map(item => ({ value: item.uuid, label: item.name })),
      ],
    });
    if (!uuid) return null;
    const template = uuid === "current" ? old : await fromUuid(uuid);
    const forms = await getAvailableWeaponForms(template.system.weaponType);
    let formUuid = null;
    let variant = "primary";
    if (forms.length) {
      formUuid = await pickOne({ title: template.name, options: forms.map(form => ({ value: form.uuid, label: form.name })) });
      if (!formUuid) return null;
      variant = await (await fromUuid(formUuid)).system.chooseAttackProfile();
      if (!variant) return null;
    }
    let modifierChoice = template.system.modifierChoice;
    if (template.system.modifierChoices.length) {
      modifierChoice = await pickOne({
        title: template.name, options: template.system.modifierChoices.map(modifier => ({ value: modifier.id, label: modifier.label })),
      });
      if (!modifierChoice) return null;
    }
    return {
      choice: { id: old.id, uuid: uuid === "current" ? null : uuid, formUuid, variant, modifierChoice },
      weapon: { id: old.id, system: template.system },
    };
  }

  /** Choose each replacement from the unlocked tiers, excluding retained and already chosen abilities. */
  async #replaceAbilities(current, weapons) {
    this.abilityIndex ??= await WeaponCatalog.getIndex("weaponAbility");
    const occupied = new Set(this.hunter.items.filter(item => (item.type === "weaponAbility") && !current.includes(item))
      .map(item => this.#abilityKey(item)));
    const choices = [];
    for (const old of current) {
      const candidates = this.abilityIndex.filter(item => (item.system.tier === old.system.tier)
        && this.tiers.includes(item.system.tier) && weapons.some(weapon => weapon.system.weaponType === item.system.weaponType)
        && !occupied.has(this.#abilityKey(item)));
      if (!candidates.length) {
        ui.notifications.warn(game.i18n.format("HOLLOWS.REFUGE.noReplacement", { name: old.name, tier: old.system.tier }));
        return null;
      }
      const uuid = await pickOne({
        title: `${old.name} (Tier ${old.system.tier})`,
        options: candidates.map(item => ({ value: item.uuid, label: `${item.name} (${item.system.weaponType})` })),
      });
      if (!uuid) return null;
      const template = candidates.find(item => item.uuid === uuid);
      const weapon = weapons.find(item => item.system.weaponType === template.system.weaponType);
      choices.push({ id: old.id, uuid, weaponId: weapon.id });
      occupied.add(this.#abilityKey(template));
    }
    return choices;
  }
}
