import { getPrimaryRefugeActor, getRefugeAllowedWeaponTiers } from "../../data/refuge/index.js";
import { getWeaponAbilityDocs, isDuplicateWeaponAbility, grantWeaponAbilityToHunter } from "../actor/ability-grant.js";
import { addRefugeResources } from "../actor/refuge.js";
import { evaluateResult } from "../../dice/roll-outcome.js";
import { getActiveEntityActor } from "../../canvas/zone.js";
import { applyInterceptors } from "../../helpers/extensions.js";
import { getTotalStatForActor } from "../actor/hunter-combat.js";
import { adjustHunterResource } from "../actor/resources.js";
import { Reaction } from "../../data/mechanics/Reaction.js";

export const BAPTISM_REWARD = new Reaction("baptism", {
  promptOnPlayer: async ({ hunterUuid, hunterId, isLord } = {}) => {
    const hunter = hunterUuid ? await fromUuid(String(hunterUuid)) : (hunterId ? game.actors.get(String(hunterId)) : null);
    if (!hunter || hunter.type !== "hunter") return null;
    if (!hunter.testUserPermission(game.user, "OWNER")) return null;
    await applyBaptismRecovery([hunter]);
    if (isLord) await resolveLordBaptismReward(hunter);
    else await resolveBaptismReward(hunter);
    return { used: true };
  }
});

export async function resolveBaptismReward(hunter) {
  if (!hunter || hunter.type !== "hunter") return;
  const weapons = hunter.items.filter(i => i.type === "weapon");
  if (!weapons.length) {
    ui.notifications.warn("Hunter has no weapons for Baptism reward.");
    return;
  }
  const allowedTiers = getRefugeAllowedWeaponTiers(getPrimaryRefugeActor());

  const weaponAbilityCache = new Map();
  const getAvailableAbilitiesForWeapon = async (weapon) => {
    if (!weapon?.system?.weaponType) return null;
    if (weaponAbilityCache.has(weapon.id)) return weaponAbilityCache.get(weapon.id);
    const weaponType = String(weapon.system.weaponType || "");
    const byTier = {};
    for (const tier of allowedTiers) {
      const docs = await getWeaponAbilityDocs(weaponType, tier);
      byTier[tier] = docs.filter(d => !isDuplicateWeaponAbility(hunter, d));
    }
    weaponAbilityCache.set(weapon.id, byTier);
    return byTier;
  };

  const selectableWeapons = [];
  for (const weapon of weapons) {
    if (!weapon.system?.weaponType) continue;
    const byTier = await getAvailableAbilitiesForWeapon(weapon);
    if (!byTier) continue;
    const hasAny = allowedTiers.some(t => (byTier[t] || []).length > 0);
    if (hasAny) selectableWeapons.push(weapon);
  }

  if (!selectableWeapons.length) {
    ui.notifications.warn("No available weapon abilities to choose for Baptism.");
    return;
  }

  const weaponOptions = selectableWeapons
    .map((w) => `<option value="${w.id}">${w.name} (${w.system.weaponType})</option>`)
    .join("");

  const weapon = await foundry.applications.api.DialogV2.wait({
    window: { title: `${hunter.name}: Baptism Reward` },
    content: `
        <form class="hollows-roll-dialog">
          <div class="form-group">
            <label>Weapon</label>
            <select name="weaponId">${weaponOptions}</select>
          </div>
        </form>
      `,
    rejectClose: false,
    buttons: [
      {
        action: "apply",
        label: "Next",
        default: true,
        callback: (_e, _b, dialog) => {
          const weaponId = String(dialog.element.querySelector("[name=weaponId]")?.value || "");
          return hunter.items.get(weaponId) || null;
        }
      },
      { action: "cancel", label: "Cancel", callback: () => null }
    ]
  }) ?? null;

  if (!weapon) return;
  const weaponType = String(weapon.system?.weaponType || "");
  const docsByTier = await getAvailableAbilitiesForWeapon(weapon);
  if (!docsByTier || !allowedTiers.some(t => (docsByTier[t] || []).length > 0)) {
    ui.notifications.warn(`No new abilities available for ${weaponType}.`);
    return;
  }

  const tierOptions = allowedTiers
      .map(t => `<option value="${t}">Tier ${t}</option>`)
      .join("");
  await foundry.applications.api.DialogV2.wait({
    window: { title: `${hunter.name}: Choose Ability (${weapon.name})` },
    content: `
        <form class="hollows-roll-dialog">
          <div class="form-group">
            <label>Tier</label>
            <select name="tier">${tierOptions}</select>
          </div>
          <div class="form-group">
            <label>Ability</label>
            <select name="abilityId"></select>
          </div>
          <div class="muted ability-empty" hidden>No available abilities for this tier.</div>
        </form>
      `,
    render: (_e, dialog) => {
      const el = dialog.element;
      const refreshOptions = () => {
        const tier = Number(el.querySelector("[name=tier]")?.value || 1);
        const docs = docsByTier[tier] || [];
        const opts = docs.map(d => `<option value="${d.id}">${d.name}</option>`).join("");
        const abilityEl = el.querySelector("[name=abilityId]");
        abilityEl.innerHTML = opts;
        const empty = docs.length === 0;
        abilityEl.disabled = empty;
        el.querySelector(".ability-empty").hidden = !empty;
      };
      el.querySelector("[name=tier]").addEventListener("change", refreshOptions);
      const firstTier = allowedTiers.find(t => (docsByTier[t] || []).length > 0) || allowedTiers[0];
      el.querySelector("[name=tier]").value = String(firstTier);
      refreshOptions();
    },
    rejectClose: false,
    buttons: [
      {
        action: "apply",
        label: "Apply",
        default: true,
        callback: async (_e, _b, dialog) => {
          const el = dialog.element;
          const tier = Number(el.querySelector("[name=tier]")?.value || 1);
          const docs = docsByTier[tier] || [];
          if (!docs.length) {
            ui.notifications.warn(`No abilities available for ${weaponType} Tier ${tier}.`);
            return;
          }
          const abilityId = String(el.querySelector("[name=abilityId]")?.value || "");
          const chosen = docs.find(d => d.id === abilityId) || docs[0];
          if (chosen && !isDuplicateWeaponAbility(hunter, chosen)) {
            await grantWeaponAbilityToHunter(hunter, chosen, "temporary", weapon.id);
          } else if (chosen) {
            ui.notifications.warn("Hunter already has this ability.");
          }
        }
      },
      { action: "cancel", label: "Cancel", callback: () => null }
    ]
  });
}

export async function resolveLordBaptismReward(hunter) {
  if (!hunter || hunter.type !== "hunter") return;
  const temporary = hunter.items
    .filter(i => i.type === "weapon-ability")
    .filter(i => String(i.system?.durationType || "permanent") === "temporary");
  if (!temporary.length) {
    return;
  }

  const options = temporary
    .map(a => `<option value="${a.id}">${a.name} (${a.system.weaponType} T${a.system.tier})</option>`)
    .join("");

  await foundry.applications.api.DialogV2.wait({
    window: { title: `${hunter.name}: Lord Baptism` },
    content: `
        <form class="hollows-roll-dialog">
          <div class="form-group">
            <label>Keep as Permanent</label>
            <select name="keepId">${options}</select>
          </div>
        </form>
      `,
    rejectClose: false,
    buttons: [
      {
        action: "apply",
        label: "Apply",
        default: true,
        callback: async (_e, _b, dialog) => {
          const keepId = String(dialog.element.querySelector("[name=keepId]")?.value || "");
          for (const ability of temporary) {
            if (ability.id === keepId) {
              await ability.update({ "system.durationType": "permanent" });
            } else {
              await ability.delete();
            }
          }
        }
      },
      { action: "cancel", label: "Cancel", callback: () => null }
    ]
  });
}

export async function applyBaptismRecovery(hunters) {
  for (const hunter of hunters) {
    if (!hunter || hunter.type !== "hunter") continue;
    const hardValue = getTotalStatForActor(hunter, "hard");
    const content = `
        <form class="hollows-roll-dialog">
          <div class="form-group">
            <label>Hard</label>
            <div>${hardValue}</div>
          </div>
        </form>
      `;
    await foundry.applications.api.DialogV2.wait({
      window: { title: `${hunter.name}: Baptism Recovery` },
      content,
      rejectClose: false,
      buttons: [
        {
          action: "roll",
          label: "Roll",
          default: true,
          callback: async () => {
            const roll = await (new Roll("1d20")).evaluate();
            const rolled = Number(roll.terms?.[0]?.results?.[0]?.result ?? 20);
            const outcome = evaluateResult(rolled, hardValue, null);
            const success = outcome.label === "Success" ||
              outcome.label === "Superior Success" ||
              outcome.label === "Critical Success";

            const resolveMax = Number(hunter.system.health.resolve.max ?? 0);
            const woundsMax = Number(hunter.system.health.wounds.max ?? 0);
            const halfWounds = Math.floor(woundsMax / 2);
            const currentWounds = Number(hunter.system.health.wounds.value ?? 0);

            let woundDelta = 0;
            let woundNote = "Wounds unchanged.";
            if (success) {
              woundDelta = woundsMax;
              woundNote = `Wounds restored to ${woundsMax}.`;
            } else if (currentWounds < halfWounds) {
              woundDelta = halfWounds - currentWounds;
              woundNote = `Wounds restored to ${halfWounds}.`;
            }
            await adjustHunterResource(hunter, { resolve: resolveMax, wounds: woundDelta });

            await roll.toMessage({
              speaker: ChatMessage.getSpeaker({ actor: hunter }),
              flavor: "Baptism Recovery (Hard)",
              content: `
                  <div class="hollows-chat">
                    <strong>${hunter.name}</strong> tests <strong>Hard</strong> (${hardValue}): <strong>${outcome.label}</strong>.
                    <div>Resolve restored to ${resolveMax}.</div>
                    <div>${woundNote}</div>
                  </div>
                `
            });
          }
        },
        { action: "skip", label: "Skip", callback: () => null }
      ]
    });
  }
}

export async function resolveEntityKillRewardsFromMessage(message) {
  if (!game.user?.isGM || !message) return;
  const defeatedEntity = getActiveEntityActor();
  if (!(await applyInterceptors("entity-kill-rewards", { entity: defeatedEntity }, true))) return;
  const hunters = (() => {
    const list = [];
    const seen = new Set();
    const addHunter = (actor) => {
      if (!actor || actor.type !== "hunter") return;
      const key = String(actor.id || actor.uuid || "");
      if (!key || seen.has(key)) return;
      seen.add(key);
      list.push(actor);
    };
    const combat = game.combat;
    if (combat?.started) {
      for (const c of combat.combatants) {
        addHunter(c.actor);
      }
    }
    if (canvas?.tokens?.placeables) {
      for (const t of canvas.tokens.placeables) {
        addHunter(t.actor);
      }
    }
    return list.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  })();
  if (!hunters.length) {
    ui.notifications.warn("No Hunter combatants or scene tokens found for Baptism rewards.");
    return;
  }

  await foundry.applications.api.DialogV2.wait({
    window: { title: "Entity Defeated" },
    content: `
        <form class="hollows-roll-dialog">
          <div class="form-group">
            <label class="checkbox">
              <input type="checkbox" name="isLord" />
              This Entity was Lord/Lady
            </label>
          </div>
        </form>
      `,
    rejectClose: false,
    buttons: [
      {
        action: "apply",
        label: "Apply",
        default: true,
        callback: async (_e, _b, dialog) => {
          const isLord = !!dialog.element.querySelector("[name=isLord]")?.checked;
          const resourcesOk = await addRefugeResources(isLord ? 5 : 3, isLord ? 1 : 0);
          if (!resourcesOk) {
            ui.notifications.warn("No Refuge actor found. Create a Refuge actor to store Bone/Hearts.");
          }
          for (const hunter of hunters) {
            const owners = game.users
              .filter((u) => !u.isGM && hunter.testUserPermission(u, "OWNER"));
            const owner = owners[0] || null;
            if (owner) {
              await requestBaptismRewardPrompt(hunter, owner, !!isLord);
            } else {
              await applyBaptismRecovery([hunter]);
              if (isLord) {
                await resolveLordBaptismReward(hunter);
              } else {
                await resolveBaptismReward(hunter);
              }
            }
          }
        }
      },
      { action: "cancel", label: "Cancel", callback: () => null }
    ]
  });
}

export async function requestBaptismRewardPrompt(hunter, owner, isLord) {
  if (!hunter || hunter.type !== "hunter" || !owner) return;
  await BAPTISM_REWARD.offer(owner, {
    hunterId: hunter.id,
    hunterUuid: hunter.uuid || null,
    isLord: !!isLord
  });
}
