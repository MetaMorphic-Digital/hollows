/**
 * Use manoeuvre — Hunter-side. Options come from the active Entity's Special
 * abilities that have "Use Action Available" (`system.special.use.enabled`).
 *
 * The Hunter picks an option, resolves a target (per `use.target`/`use.scope`),
 * optionally rolls a test, and the resulting Curse remove/transfer is applied
 * GM-side by reusing the After-Attack applier (signed `curseTarget`/`curseZone`
 * via `requestAfterAttackApply`) — no new player→GM plumbing.
 *
 */
import {
  getActiveEntityActor, getActorZone, getAdjacentZones,
  getHunterTokensInZone, getZoneCurseValue, getZoneList
} from "../../canvas/zone.js";
import { getEntityEngineAbilities } from "../entity/resolvers.js";
import { isEntityEngineAbilityActive } from "../../documents/entity/entity-stats.js";
import { chooseOneTarget, chooseOneZone } from "../../applications/apps/selection-dialogs.js";
import { getTotalStatForActor } from "../../documents/actor/hunter-combat.js";
import { HunterStatRollFlow } from "../../dice/flow.js";
import { isSuccessOutcomeLabel } from "../../dice/roll-outcome.js";
import { requestAfterAttackApply } from "../../documents/entity/attack-effects.js";
import { buildStandardRollCardHtml } from "../../applications/ui/roll-card.js";
import { removeSpecialConditionSlot, getHunterSpecialConditions } from "../../documents/actor/conditions.js";
import { getFocusCount, adjustHunterResource } from "../../documents/actor/resources.js";
import { getEffectiveWeaponDamage } from "../weapons/resolvers.js";

const cap = (s) => String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1);

/** Magnitude to remove/transfer for a resolved outcome. */
function resolveAmount(result, current, fixed) {
  if (result === "removeNothing") return 0;
  if (result === "removeAmount") return Math.max(0, Number(fixed) || 0);
  return Math.max(0, Number(current) || 0); // removeAll
}

function dedupeTokens(tokens) {
  return Array.from(new Map((tokens || []).filter(Boolean).map((t) => [t.id, t])).values());
}

async function pickUseOption(options) {
  const optHtml = options
    .map((a, i) => `<option value="${i}">${a.name} — ${a.system?.special?.use?.mode || ""}</option>`)
    .join("");
  const idx = await foundry.applications.api.DialogV2.wait({
    window: { title: "Use" },
    content: `<form class="hollows-roll-dialog"><div class="form-group"><label>Option</label><select name="opt">${optHtml}</select></div></form>`,
    rejectClose: false,
    buttons: [
      { action: "ok", label: "Confirm", default: true, callback: (_e, _b, d) => String(d.element.querySelector("[name=opt]")?.value ?? "") },
      { action: "cancel", label: "Cancel", callback: () => "" }
    ]
  });
  if (idx === "") return null;
  return options[Number(idx)] || null;
}

/** Resolve who/where the Use applies to. Returns { kind: "hunter"|"zone", hunters: [], zone } or null on cancel. */
async function resolveUseTargets(actor, use) {
  const targetSel = String(use.target || "selfOnly");
  const scope = String(use.scope || "anywhere");
  const actorZone = getActorZone(actor);

  if (targetSel === "zone") {
    let zone = actorZone;
    if (scope === "anywhere") zone = await chooseOneZone(getZoneList());
    else if (scope === "adjacentZone") zone = await chooseOneZone(getAdjacentZones(actorZone));
    if (!zone) return null;
    return { kind: "zone", hunters: [], zone };
  }

  if (targetSel === "selfOnly") {
    return { kind: "hunter", hunters: [actor], zone: actorZone };
  }

  // selectHunter / allHunters — candidates drawn from the scope's zones (incl. adjacent).
  const zones = scope === "allInZone" ? [actorZone]
    : scope === "adjacentZone" ? getAdjacentZones(actorZone)
    : getZoneList();
  const tokens = dedupeTokens(zones.flatMap((z) => getHunterTokensInZone(z)));
  if (!tokens.length) {
    ui.notifications.warn("No Hunter target in range.");
    return null;
  }
  let chosen;
  if (targetSel === "allHunters") {
    chosen = tokens;
  } else {
    const picked = await chooseOneTarget(tokens, { title: "Select Hunter", label: "Hunter" });
    if (!picked) return null;
    chosen = [picked];
  }
  return { kind: "hunter", hunters: chosen.map((t) => t.actor).filter(Boolean), zone: actorZone };
}

async function applyCurseGroup(target, zone, group, entityId) {
  await requestAfterAttackApply(target, zone || "", [{
    ...group,
    applyIfLogic: "and",
    applyIfConditions: [{ condition: "always" }]
  }], entityId, null, {});
}

/** Dynamic amount = the acting Hunter's weapon damage (R or W); prompts Select Weapon if they carry several. */
async function resolveWeaponDamage(actor, source) {
  const weapons = actor?.items?.filter((i) => i.type === "weapon") || [];
  if (!weapons.length) return 0;
  let weapon = weapons[0];
  if (weapons.length > 1) {
    const optHtml = weapons.map((w, i) => `<option value="${i}">${w.name}</option>`).join("");
    const idx = await foundry.applications.api.DialogV2.wait({
      window: { title: "Select Weapon" },
      content: `<form class="hollows-roll-dialog"><div class="form-group"><label>Weapon</label><select name="w">${optHtml}</select></div></form>`,
      rejectClose: false,
      buttons: [
        { action: "ok", label: "Confirm", default: true, callback: (_e, _b, d) => String(d.element.querySelector("[name=w]")?.value ?? "0") },
        { action: "cancel", label: "Cancel", callback: () => "" }
      ]
    });
    if (idx === "") return 0;
    weapon = weapons[Number(idx)] || weapons[0];
  }
  const dmg = getEffectiveWeaponDamage(weapon);
  return Math.max(0, Number(source === "weaponWounds" ? dmg.wounds : dmg.resolve) || 0);
}

function useOptions(entity) {
  return getEntityEngineAbilities(entity, ["special", "doom"])
    .filter((a) => a.system?.special?.use?.enabled && isEntityEngineAbilityActive(entity, a));
}

/** True if the active scene Entity offers any usable Use option (for surfacing the Use button). */
export function hasActiveUseOptions() {
  const entity = getActiveEntityActor();
  return !!entity && useOptions(entity).length > 0;
}

/** Run a resolved Use ability (test + curse/condition effect + chat) on the given targets. */
async function applyUseEffect(actor, entity, ability, resolved) {
  const use = ability.system.special.use;
  const mode = String(use.mode || "removeCurse");

  // Optional test → success/failure picks the outcome.
  let rollData = null;
  let outcome = "success";
  if (use.test?.enabled) {
    const statKey = String(use.test.stat || "hard");
    const flow = await new HunterStatRollFlow(actor, {
      title: `Use: ${ability.name}`,
      statLabel: cap(statKey),
      statValue: getTotalStatForActor(actor, statKey),
      tn: Number(use.test.tn || 0),
      focusCount: getFocusCount(actor),
      spendFocus: async () => adjustHunterResource(actor, { focus: -1 })
    }).roll();
    if (!flow) return;
    rollData = flow;
    const label = flow.chosen?.outcome?.label || "";
    outcome = isSuccessOutcomeLabel(label) ? "success" : "failure";
  }
  const success = outcome === "success";
  const result = success ? String(use.onSuccess || "removeAll") : String(use.onFailure || "removeNothing");
  const amountMode = success ? use.amountSuccessMode : use.amountFailureMode;
  const amountSource = success ? use.amountSuccessSource : use.amountFailureSource;
  let amount = success ? use.amountSuccess : use.amountFailure;
  if (result === "removeAmount" && String(amountMode) === "dynamic") {
    amount = await resolveWeaponDamage(actor, amountSource);
  }
  const damage = success ? use.damageSuccess : use.damageFailure;

  const lines = [];

  // ── Removal / transfer (skipped on removeNothing) ──
  if (mode === "removeSpecialCondition" && result !== "removeNothing") {
    let removedAny = false;
    for (const hunter of (resolved.kind === "hunter" ? resolved.hunters : [])) {
      if (result === "removeAmount") {
        const slots = getHunterSpecialConditions(hunter).map((c) => c.slot).filter(Boolean)
          .slice(0, Math.max(0, Number(amount) || 0));
        for (const slot of slots) { if (await removeSpecialConditionSlot(hunter, slot)) removedAny = true; }
        if (slots.length) lines.push(`Removes ${slots.length} Special Condition(s) from <strong>${hunter.name}</strong>.`);
      } else if (await removeSpecialConditionSlot(hunter)) {
        removedAny = true;
        lines.push(`Removes all Special Conditions from <strong>${hunter.name}</strong>.`);
      }
    }
    if (!removedAny) lines.push("No Special Condition to remove.");
  } else if (mode === "transferCurse" && result !== "removeNothing") {
    // Hunter end + their zone are the two transfer ends.
    const hunter = resolved.hunters[0] || actor;
    const zone = resolved.zone;
    const from = String(use.transferFrom || "zone");
    const to = String(use.transferTo || "hunter");
    const sourceCurrent = from === "zone" ? getZoneCurseValue(zone) : Number(hunter?.system?.curse?.value ?? 0);
    const amt = resolveAmount(result, sourceCurrent, amount);
    if (amt > 0 && from !== to) {
      const group = {};
      group.curseZone = (from === "zone" ? -amt : 0) + (to === "zone" ? amt : 0);
      group.curseTarget = (from === "hunter" ? -amt : 0) + (to === "hunter" ? amt : 0);
      await applyCurseGroup(from === "hunter" || to === "hunter" ? hunter : null, zone, group, entity.id);
      lines.push(`Transfers <strong>${amt}</strong> Curse from <strong>${from === "zone" ? zone : hunter.name}</strong> to <strong>${to === "zone" ? zone : hunter.name}</strong>.`);
    }
  } else if (mode === "removeCurse" && result !== "removeNothing" && resolved.kind === "zone") {
    const amt = resolveAmount(result, getZoneCurseValue(resolved.zone), amount);
    if (amt > 0) {
      await applyCurseGroup(null, resolved.zone, { curseZone: -amt }, entity.id);
      lines.push(`Removes <strong>${amt}</strong> Curse from <strong>${resolved.zone}</strong>.`);
    }
  } else if (mode === "removeCurse" && result !== "removeNothing") {
    for (const hunter of resolved.hunters) {
      const amt = resolveAmount(result, Number(hunter?.system?.curse?.value ?? 0), amount);
      if (amt > 0) {
        await applyCurseGroup(hunter, getActorZone(hunter), { curseTarget: -amt }, entity.id);
        lines.push(`Removes <strong>${amt}</strong> Curse from <strong>${hunter.name}</strong>.`);
      }
    }
  }

  // ── Damage — on a test it hits the roller (self); without a test, the resolved targets. ──
  if (Number(damage?.resolve) || Number(damage?.wounds)) {
    const dmgTargets = use.test?.enabled ? [actor] : (resolved.kind === "hunter" ? resolved.hunters : []);
    for (const hunter of dmgTargets) {
      await applyCurseGroup(hunter, getActorZone(hunter), { targetDelta: { resolve: Number(damage.resolve || 0), wounds: Number(damage.wounds || 0) } }, entity.id);
      lines.push(`Deals <strong>${Number(damage.resolve || 0)}/${Number(damage.wounds || 0)}</strong> (R/W) to <strong>${hunter.name}</strong>.`);
    }
  }

  if (!lines.length) lines.push("No effect.");

  // Chat card — roll card when a test was made, otherwise a plain summary.
  const title = `Use: ${ability.name}`;
  let content;
  if (rollData) {
    content = buildStandardRollCardHtml({
      actorName: actor.name,
      title,
      statLabel: cap(use.test.stat),
      statValue: getTotalStatForActor(actor, String(use.test.stat || "hard")),
      tn: Number(use.test.tn || 0),
      results: rollData.results,
      mode: rollData.effectiveMode,
      chosen: rollData.chosen,
      useFocus: rollData.useFocus,
      extraLines: lines.map((l) => `<div>${l}</div>`)
    });
  } else {
    content = `<div class="hollows-chat"><div class="attack-title">${actor.name} — ${title}</div>${lines.map((l) => `<div>${l}</div>`).join("")}</div>`;
  }
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: title,
    content,
    rolls: rollData?.roll ? [rollData.roll] : []
  });
}

export async function openUseForActor(actor) {
  if (!actor || actor.type !== "hunter") return;
  const entity = getActiveEntityActor();
  if (!entity) {
    ui.notifications.warn("No active Entity in the scene.");
    return;
  }
  const options = useOptions(entity);
  if (!options.length) {
    ui.notifications.warn(`${entity.name} offers no Use options right now.`);
    return;
  }
  const ability = options.length > 1 ? await pickUseOption(options) : options[0];
  if (!ability) return;
  const resolved = await resolveUseTargets(actor, ability.system.special.use);
  if (!resolved) return;
  await applyUseEffect(actor, entity, ability, resolved);
}

/** Auto-trigger: a manoeuvre fires matching Use abilities on the acting Hunter (with confirmation). */
export async function triggerUseOnManoeuvre(actor, manoeuvreKey) {
  if (!actor || actor.type !== "hunter") return;
  const entity = getActiveEntityActor();
  if (!entity) return;
  const key = String(manoeuvreKey || "");
  const matching = useOptions(entity).filter((a) => {
    const list = a.system?.special?.use?.applyOnManoeuvre;
    return Array.isArray(list) && list.includes(key);
  });
  for (const ability of matching) {
    const ok = await foundry.applications.api.DialogV2.wait({
      window: { title: "Entity Use" },
      content: `<div class="hollows-roll-dialog"><div>Trigger <strong>${ability.name}</strong> from <strong>${entity.name}</strong> on your manoeuvre?</div></div>`,
      rejectClose: false,
      buttons: [
        { action: "yes", label: "Trigger", default: true, callback: () => true },
        { action: "no", label: "Skip", callback: () => false }
      ]
    }) ?? false;
    if (!ok) continue;
    await applyUseEffect(actor, entity, ability, { kind: "hunter", hunters: [actor], zone: getActorZone(actor) });
  }
}
