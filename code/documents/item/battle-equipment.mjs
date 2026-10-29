import EquipmentData from "../../data/items/equipment.mjs";
import { HOLLOWS_CONDITIONS } from "../../data/system-constants.js";
import { confirmDialog, pickOne, promptForm } from "../../applications/apps/selection-dialogs.mjs";
import { getActorZone, getActiveSceneHunters, getHuntersInZone, getZoneList, getThreatInZone, isCloseZone, isRangedZone, isThreatZone } from "../../canvas/zone.js";
import { pickThreatRemovalsFromZones, removeThreatFromZones } from "../../canvas/threat-ops.js";
import { addThreatToZoneSafe, nextHopsTowardZone } from "../../canvas/overlays.js";
import { getTerrainPoolValue, spendTerrainPoolTag } from "../../canvas/terrain-pool.js";
import { adjustHunterResource, setFocusCount, spendResolve } from "../actor/resources.js";
import { setConditionSafe, setFreeTerrainTag, isFreeTerrainTag } from "../actor/conditions.js";
import { isShotgunWeapon, syncHunterLoadedStatusFromShotguns } from "../../helpers/weapon-utils.js";
import { getEffectiveCapacity } from "./weapon.js";
import { registerHandler, runUserQuery, COMBAT_QUERY_TIMEOUT } from "../../helpers/queries.js";
import { primaryOwnerOf } from "../../helpers/reactions.js";
import { AttackDamageChange } from "../../data/mechanics/AttackDamageChange.js";
import { OnAttackResultAction } from "../../data/mechanics/OnAttackResultAction.js";

/** Resolve configured equipment effects on the GM, with choices on the user's client. */
export default class BattleEquipment {
  static #uses = new WeakMap();

  /** Attach equipment effects to combat events and user queries. */
  static register() {
    registerHandler("hollows.battleEquipmentUse", async ({ itemUuid, userId, context }) => {
      const item = await fromUuid(itemUuid);
      const actor = item.actor;
      if (!this.#uses.has(actor)) this.#uses.set(actor, new foundry.utils.Semaphore(1));
      return this.#uses.get(actor).add(() => this.#apply(item, game.users.get(userId), context));
    });
    registerHandler("hollows.battleEquipmentChoice", async ({ itemUuid, context }) =>
      this.#choose(await fromUuid(itemUuid), context));
    registerHandler("hollows.battleEquipmentAttack", async ({ itemUuid }) => {
      const item = await fromUuid(itemUuid);
      const { stat, defence, resolve, wounds } = item.system.attack;
      const { openAttackDialog } = await import("../../data/actions/attack.js");
      const result = await openAttackDialog(item.actor, {
        weaponless: true, title: item.name, forcedProfile: { stat, defence }, damageOverride: { resolve, wounds },
      });
      return result.rolled;
    });
    Hooks.on("updateItem", async (weapon, changes, options, userId) => {
      if ((userId !== game.user.id) || !game.combat?.started || (weapon.type !== "weapon") || !weapon.actor) return;
      const emptied = isShotgunWeapon(weapon) ? changes.system?.loaded === false
        : (getEffectiveCapacity(weapon) > 0) && (changes.system?.capacity?.value === 0);
      if (!emptied) return;
      const owner = primaryOwnerOf(weapon.actor);
      for (const item of this.#items(weapon.actor, "weaponEmpty")) {
        if (await this.use(item, { weaponUuid: weapon.uuid, user: owner?.active ? owner : game.user })) break;
      }
    });
  }

  /** Apply unspent equipment configured for combat start. */
  static async onCombatStart(hunter) {
    const owner = primaryOwnerOf(hunter);
    for (const item of this.#items(hunter, "combatStart")) {
      await this.use(item, { user: owner?.active ? owner : game.user });
    }
  }

  /** Offer equipment before an Entity restores Resolve. */
  static async modifyResolveRecovery(amount) {
    if (amount <= 0) return amount;
    const result = await this.#offer("entityRestore");
    return result ? Math.floor(amount * result.recoveryMultiplier) : amount;
  }

  /** Pending damage bonuses that match this weapon attack. */
  static attackBonuses(actor, context) {
    if (!game.combat?.started || !context.weapon) return [];
    return (actor.getFlag("hollows", "equipmentAttackBonuses") || [])
      .filter(bonus => !bonus.weaponTypes.length || bonus.weaponTypes.includes(context.weapon.system.weaponType));
  }

  /** Consume only the bonuses used by this attack, including a miss. */
  static async consumeAttackBonuses(actor, context) {
    const bonuses = actor.getFlag("hollows", "equipmentAttackBonuses") || [];
    const used = this.attackBonuses(actor, context);
    await actor.setFlag("hollows", "equipmentAttackBonuses", bonuses.filter(bonus => !used.includes(bonus)));
  }

  /** Whether the bearer meets the equipment's area restriction. */
  static #matchesZone(item) {
    const zone = getActorZone(item.actor);
    switch (item.system.zone) {
      case "close": return isCloseZone(zone);
      case "ranged": return isRangedZone(zone);
      case "support": return zone === "Support";
      default: return true;
    }
  }

  /** Unspent equipment eligible for the current event. */
  static #items(hunter, trigger) {
    return hunter.items.filter(item => (item.type === "equipment") && (item.system.category === "battle")
      && (item.system.trigger === trigger) && !item.system.used && this.#matchesZone(item));
  }

  /** Serialize a Hunter's equipment uses through the active GM. */
  static async use(item, { user = game.user, ...context } = {}) {
    try {
      return await runUserQuery(game.users.activeGM, "hollows.battleEquipmentUse", {
        itemUuid: item.uuid, userId: user.id, context,
      }, { timeout: COMBAT_QUERY_TIMEOUT, notifyOnError: false });
    } catch (err) {
      ui.notifications.warn(err.message);
      return false;
    }
  }

  /** Offer the reaction to eligible bearers until one accepts. */
  static async #offer(trigger) {
    for (const hunter of getActiveSceneHunters().filter(actor => !actor.statuses.has("dead"))) {
      const owner = primaryOwnerOf(hunter);
      for (const item of this.#items(hunter, trigger)) {
        const result = await this.use(item, { user: owner?.active ? owner : game.user });
        if (result) return result;
      }
    }
    return false;
  }

  /** Offer cancellation before an Entity manoeuvre resolves. */
  static async cancelManoeuvre(context) {
    if ((context.stage !== "beforeResolve") || !["manoeuvre", "prowl", "turnAround", "shrugOff"].includes(context.actionType)) return false;
    const result = await this.#offer("entityManoeuvre");
    return result ? result.cancelled : false;
  }

  /** Collect all choices before spending resources or changing documents. */
  static async #choose(item, context) {
    if (!this.#matchesZone(item)) {
      ui.notifications.warn(game.i18n.format("HOLLOWS.EQUIPMENT.requiresZone", {
        zone: game.i18n.localize(item.system.schema.fields.zone.choices[item.system.zone]),
      }));
      return null;
    }
    let prompted = false;
    const choices = [];
    for (const effect of item.system.effects) {
      const definition = EquipmentData.EFFECTS[effect.type];
      if (definition.trigger && (definition.trigger !== item.system.trigger)) {
        ui.notifications.warn(game.i18n.format("HOLLOWS.EQUIPMENT.incompatibleTrigger", { effect: game.i18n.localize(definition.label) }));
        return null;
      }
      const choice = {};
      if (["resource", "condition"].includes(effect.type) && (effect.target === "chosen")) {
        choice.targetId = await pickOne({ title: item.name, options: getActiveSceneHunters().filter(hunter => !hunter.statuses.has("dead"))
          .map(hunter => ({ value: hunter.id, label: hunter.name })) });
        if (!choice.targetId) return null;
        prompted = true;
      }
      if (effect.type === "capacity") {
        const weapons = item.actor.items.filter(weapon => (weapon.type === "weapon")
          && (isShotgunWeapon(weapon) || (getEffectiveCapacity(weapon) > 0))
          && (!effect.weaponTypes.size || effect.weaponTypes.has(weapon.system.weaponType)));
        if (context.weaponUuid) {
          if (!weapons.some(weapon => weapon.uuid === context.weaponUuid)) return null;
          choice.weaponUuid = context.weaponUuid;
        } else {
          if (!weapons.length) {
            ui.notifications.warn(game.i18n.localize("HOLLOWS.EQUIPMENT.noWeapon"));
            return null;
          }
          choice.weaponUuid = await pickOne({ title: item.name, options: weapons.map(weapon => ({ value: weapon.uuid, label: weapon.name })) });
          if (!choice.weaponUuid) return null;
          prompted = true;
        }
      }
      if (effect.type === "threat") {
        if (effect.threatMode === "remove") {
          choice.removals = await pickThreatRemovalsFromZones(getZoneList(), effect.amount, { title: item.name, reason: item.name });
          if (!choice.removals.length) return null;
        } else {
          choice.shifts = await this.#chooseThreatShift(item);
          if (!choice.shifts) return null;
        }
        prompted = true;
      }
      if ((effect.type === "movement") && (effect.direction === "choose")) {
        choice.direction = await pickOne({ title: item.name, options: [
          { value: "towards", label: game.i18n.localize("HOLLOWS.EQUIPMENT.towards") },
          { value: "away", label: game.i18n.localize("HOLLOWS.EQUIPMENT.away") },
        ] });
        if (!choice.direction) return null;
        prompted = true;
      }
      choices.push(choice);
    }
    if (!prompted && !item.system.attack.enabled && (item.system.trigger !== "combatStart")) {
      if (!(await confirmDialog({ title: item.name, bodyHtml: "<p>" + foundry.utils.escapeHTML(item.system.text) + "</p>" }))) return null;
    }
    return choices;
  }

  /** Choose an adjacent destination on a shortest path for each area's Threat. */
  static async #chooseThreatShift(item) {
    const zone = getActorZone(item.actor);
    const sources = getZoneList().filter(source => isThreatZone(source) && (getThreatInZone(source) > 0))
      .map(source => ({ source, destinations: nextHopsTowardZone(source, zone) }))
      .filter(({ destinations }) => destinations.length);
    if (!sources.length) return null;
    const fields = sources.map(({ source, destinations }, index) => ({ type: "select", name: String(index), label: source,
      options: destinations.map(value => ({ value, label: value })) }));
    const choice = await promptForm({ title: item.name, fields,
      bodyHtml: game.i18n.format("HOLLOWS.EQUIPMENT.shiftHint", { zone }) });
    return choice ? sources.map(({ source }, index) => ({ source, destination: choice[index], amount: getThreatInZone(source) })) : null;
  }

  /** Hunters selected by a health or condition effect. */
  static #targets(actor, effect, choice) {
    switch (effect.target) {
      case "chosen": return [game.actors.get(choice.targetId)];
      case "zone": return getHuntersInZone(getActorZone(actor));
      case "close": return getActiveSceneHunters().filter(hunter => isCloseZone(getActorZone(hunter)));
      case "all": return getActiveSceneHunters();
      default: return [actor];
    }
  }

  /** Check the terrain needed by all effects before paying for the equipment. */
  static #checkTerrainPool(item, choices) {
    const pool = { elevated: getTerrainPoolValue("elevated"), sheltered: getTerrainPoolValue("sheltered") };
    const states = new Map();
    for (const [index, effect] of item.system.effects.entries()) {
      if ((effect.type !== "condition") || !HOLLOWS_CONDITIONS[effect.condition].terrain) continue;
      const key = effect.condition;
      const active = effect.conditionMode === "add";
      for (const target of this.#targets(item.actor, effect, choices[index])) {
        const id = target.uuid + "." + key;
        const state = states.get(id) || { active: target.statuses.has(key), free: isFreeTerrainTag(target, key) };
        if (state.active === active) continue;
        if (!effect.freeTerrain) {
          if (active) pool[key] -= 1;
          else if (!state.free) pool[key] += 1;
        }
        if (pool[key] < 0) throw new Error(game.i18n.format("HOLLOWS.EQUIPMENT.insufficientTerrain", {
          condition: HOLLOWS_CONDITIONS[key].label,
        }));
        states.set(id, { active, free: active && effect.freeTerrain });
      }
    }
  }

  /** Apply the configured effects and exhaust the equipment after acceptance. */
  static async #apply(item, user, context) {
    const actor = item.actor;
    if (!game.combat?.started || item.system.used || actor.statuses.has("dead") || actor.statuses.has("dying")) return false;
    const choices = await runUserQuery(user, "hollows.battleEquipmentChoice", {
      itemUuid: item.uuid, context,
    }, { timeout: COMBAT_QUERY_TIMEOUT });
    if (!choices) return false;
    if (item.system.attack.enabled) {
      const rolled = await runUserQuery(user, "hollows.battleEquipmentAttack", { itemUuid: item.uuid }, { timeout: COMBAT_QUERY_TIMEOUT });
      if (!rolled) return false;
    }
    this.#checkTerrainPool(item, choices);
    const result = { cancelled: false, recoveryMultiplier: 1 };
    const notices = [item.system.text];
    if (item.system.resolveCost) await spendResolve(actor, item.system.resolveCost);
    for (const [index, effect] of item.system.effects.entries()) {
      const choice = choices[index];
      switch (effect.type) {
        case "resource":
          for (const target of this.#targets(actor, effect, choice)) {
            const amount = effect.resourceMode === "full" ? target.system.health[effect.resource].max : effect.amount;
            await adjustHunterResource(target, { [effect.resource]: effect.resourceMode === "lose" ? -amount : amount }, {
              allowTemporary: effect.resourceMode === "temporary",
            });
            if ((effect.resource === "wounds") && ["heal", "full"].includes(effect.resourceMode) && target.isRevivable) {
              await setConditionSafe(target, "dying", false);
              await target.setFlag("hollows", "dyingRevivedOnce", true);
            }
          }
          break;
        case "capacity": {
          const weapon = await fromUuid(choice.weaponUuid);
          if (isShotgunWeapon(weapon)) {
            await weapon.update({ "system.loaded": true });
            await syncHunterLoadedStatusFromShotguns(actor);
          } else {
            const max = getEffectiveCapacity(weapon);
            await weapon.update({ "system.capacity.value": effect.full ? max : Math.min(max, weapon.system.capacity.value + effect.amount) });
          }
          break;
        }
        case "nextAttack": {
          const bonuses = actor.getFlag("hollows", "equipmentAttackBonuses") || [];
          await actor.setFlag("hollows", "equipmentAttackBonuses", [...bonuses, {
            weaponTypes: Array.from(effect.weaponTypes), resolve: effect.resolve, wounds: effect.wounds,
          }]);
          break;
        }
        case "condition": {
          const active = effect.conditionMode === "add";
          for (const target of this.#targets(actor, effect, choice)) {
            if (effect.condition === "focus") {
              if (active) await adjustHunterResource(target, { focus: 1 });
              else await setFocusCount(target, 0);
              continue;
            }
            if (target.statuses.has(effect.condition) === active) continue;
            if (active && !effect.freeTerrain) await spendTerrainPoolTag(effect.condition);
            await setConditionSafe(target, effect.condition, active, { skipPoolRefund: effect.freeTerrain });
            if (active) await setFreeTerrainTag(target, effect.condition, effect.freeTerrain);
          }
          break;
        }
        case "threat":
          if (effect.threatMode === "remove") await removeThreatFromZones(actor, choice.removals, { reason: item.name });
          else {
            const shifts = choice.shifts.map(shift => ({ ...shift, amount: Math.min(shift.amount, getThreatInZone(shift.source)) }));
            for (const shift of shifts) await addThreatToZoneSafe(shift.source, -shift.amount);
            for (const shift of shifts) await addThreatToZoneSafe(shift.destination, shift.amount);
          }
          break;
        case "cancelAction": result.cancelled = true; break;
        case "recovery": result.recoveryMultiplier *= effect.multiplier; break;
        case "movement":
          notices.push(game.i18n.localize((choice.direction || effect.direction) === "towards"
            ? "HOLLOWS.EQUIPMENT.moveTowards" : "HOLLOWS.EQUIPMENT.moveAway"));
          break;
      }
    }
    await item.update({ "system.used": true });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: "<p><strong>" + foundry.utils.escapeHTML(item.name) + "</strong>: "
        + notices.filter(Boolean).map(text => foundry.utils.escapeHTML(text)).join(" ") + "</p>",
    });
    return result;
  }
}

export const EQUIPMENT_ATTACK_DAMAGE = new AttackDamageChange({
  key: "equipment.nextAttack", aura: true,
  delta: (actor, context) => BattleEquipment.attackBonuses(actor, context).reduce((total, bonus) => ({
    resolve: total.resolve + bonus.resolve, wounds: total.wounds + bonus.wounds,
  }), { resolve: 0, wounds: 0 }),
});

export const EQUIPMENT_ATTACK_CONSUME = new OnAttackResultAction({
  key: "equipment.nextAttack", aura: true,
  active: (actor, context) => BattleEquipment.attackBonuses(actor, context).length > 0,
  handler: (actor, context) => BattleEquipment.consumeAttackBonuses(actor, context),
});
