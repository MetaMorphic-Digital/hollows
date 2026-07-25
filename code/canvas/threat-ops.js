/**
 * Canvas-level Threat manipulation helpers. Single source of truth for
 * dialogs that ask the player to pick zones to remove or shift Threat.
 *
 * `removeThreatViaDialog` and `shiftThreatViaDialog` route the picker to
 * the actor's primary owner (via CONFIG.queries) when invoked on GM with a
 * player-owned actor; otherwise they fall back to a local dialog on the
 * caller's client.
 *
 * Consumers wire these in via DSL effects (`removeThreat`,
 * `controlShiftThreat`) and direct calls from weapon-ability reactions
 * (Goad, Misdirection, future).
 */
import { addThreatToZoneSafe } from "./overlays.js";
import { getActorZone, getAdjacentZones, getThreatInZone, getZoneList } from "./zone.js";
import { runUserQuery } from "../helpers/queries.js";

export async function placeThreatFromHunter(actor, zone, amount = 1, {
  source = "",
  reason = "Threat",
  threatOpts = {}
} = {}) {
  const placed = Math.max(0, Number(amount ?? 0) || 0);
  const zoneId = String(zone || "");
  if (!zoneId || placed <= 0) return false;

  // Emit the generic hunter-placed-threat event; reacting abilities subscribe
  // and self-gate.
  if (actor?.type === "hunter") {
    try {
      const { runOnHunterPlacedThreat } = await import("../helpers/weapon-abilities/dispatchers.js");
      await runOnHunterPlacedThreat(actor, zoneId, placed, { source, reason });
    } catch (err) {
      console.warn("Hollows | hunterPlacedThreat dispatch failed", err);
    }
  }

  // Placement locks (Sanctify) are enforced at the addThreatToZone funnel.
  return await addThreatToZoneSafe(zoneId, placed, threatOpts);
}

// ─── Source / destination zone resolution ─────────────────────────────────

function resolveSourceZones(actor, constraint) {
  const myZone = getActorZone(actor) || "";
  switch (constraint) {
    case "self":           return myZone ? [myZone] : [];
    case "adjacent":       return getAdjacentZones(myZone).filter(Boolean);
    case "sameOrAdjacent": return [myZone, ...getAdjacentZones(myZone)].filter(Boolean);
    case "anyWithThreat":  return getZoneList();
    default:               return getZoneList();
  }
}

function resolveDestZones(actor, sourceZone, destConstraint) {
  const myZone = getActorZone(actor) || "";
  switch (destConstraint) {
    case "adjacentToSource":  return getAdjacentZones(sourceZone) || [];
    case "self":              return myZone ? [myZone] : [];
    case "sameOrAdjacent":    return [myZone, ...getAdjacentZones(myZone)].filter(Boolean);
    case "anyZone":           return getZoneList();
    default:                  return getZoneList();
  }
}

function excludeSupportIf(zones, excludeSupport) {
  return excludeSupport ? zones.filter((z) => String(z) !== "Support") : zones;
}

// ─── Remove Threat ────────────────────────────────────────────────────────

function gatherZonesWithThreat() {
  return (getZoneList?.() || []).filter((z) => getThreatInZone(z) > 0);
}

function threatEntries(zones) {
  return Array.from(new Set((zones || []).filter(Boolean)))
    .map((zone) => ({ zone, count: getThreatInZone(zone) || 0 }))
    .filter((entry) => entry.count > 0);
}

function sanitizeThreatRemovals(removals, zones, maxAmount) {
  const allowed = new Set((zones || []).filter(Boolean));
  let remaining = Math.max(0, Number(maxAmount ?? 0) || 0);
  const sanitized = [];
  for (const entry of Array.isArray(removals) ? removals : []) {
    if (remaining <= 0) break;
    const zone = String(entry?.zone || "");
    if (!allowed.has(zone)) continue;
    const current = getThreatInZone(zone) || 0;
    const requested = Math.max(0, Number(entry?.amount ?? 0) || 0);
    const amount = Math.min(requested, current, remaining);
    if (amount <= 0) continue;
    sanitized.push({ zone, amount });
    remaining -= amount;
  }
  return sanitized;
}

async function localPickZone(zones, title = "Remove Threat") {
  const options = zones
    .map((z) => `<option value="${z}">${z} (${getThreatInZone(z)} Threat)</option>`)
    .join("");
  return await foundry.applications.api.DialogV2.wait({
    window: { title },
    content: `<form class="hollows-roll-dialog"><div class="form-group"><label>Zone</label><select name="zone">${options}</select></div></form>`,
    rejectClose: false,
    buttons: [
      { action: "apply", label: "Remove", default: true, callback: (_e, _b, dialog) => String(dialog.element.querySelector("[name=zone]")?.value || "") },
      { action: "cancel", label: "Skip", callback: () => "" }
    ]
  });
}

export async function pickThreatRemovalsFromZones(zones, maxAmount, {
  title = "Remove Threat",
  reason = "Threat",
  scope = "zones"
} = {}) {
  const entries = threatEntries(zones);
  const limit = Math.max(0, Number(maxAmount ?? 0) || 0);
  if (!entries.length || limit <= 0) return [];
  const esc = (value) => foundry.utils.escapeHTML(String(value ?? ""));

  if (entries.length === 1 || scope === "zone") {
    const entry = entries[0];
    const cap = Math.min(entry.count, limit);
    const amount = await foundry.applications.api.DialogV2.wait({
      window: { title },
      content: `
        <form class="hollows-roll-dialog">
          <div><strong>${esc(reason)}</strong>: discard Threat from <strong>${esc(entry.zone)}</strong>.</div>
          <div class="form-group">
            <label>Threat</label>
            <input type="number" name="amount" min="0" max="${cap}" value="${cap}" />
          </div>
        </form>
      `,
      rejectClose: false,
      buttons: [
        { action: "apply", label: "Discard Threat", default: true, callback: (_e, _b, dialog) => Number(dialog.element.querySelector("[name=amount]")?.value ?? 0) },
        { action: "skip", label: "Skip", callback: () => 0 }
      ]
    }) ?? 0;
    return sanitizeThreatRemovals([{ zone: entry.zone, amount }], [entry.zone], limit);
  }

  const rows = entries.map(({ zone, count }) => `
    <div class="form-group">
      <label>${esc(zone)} (${count} Threat)</label>
      <input type="number" name="remove" data-zone="${esc(zone)}" min="0" max="${Math.min(count, limit)}" value="0" />
    </div>
  `).join("");
  const removals = await foundry.applications.api.DialogV2.wait({
    window: { title },
    content: `
      <form class="hollows-roll-dialog">
        <div><strong>${esc(reason)}</strong>: discard up to <strong>${limit}</strong> Threat.</div>
        ${rows}
      </form>
    `,
    rejectClose: false,
    buttons: [
      {
        action: "apply",
        label: "Discard Threat",
        default: true,
        callback: (_e, _b, dialog) => Array.from(dialog.element.querySelectorAll("input[name=remove]")).map((input) => ({
          zone: String(input.dataset.zone || ""),
          amount: Number(input.value ?? 0)
        }))
      },
      { action: "skip", label: "Skip", callback: () => [] }
    ]
  }) ?? [];
  return sanitizeThreatRemovals(removals, entries.map((entry) => entry.zone), limit);
}

export async function removeThreatFromZones(actor, removals, { reason = "Remove Threat" } = {}) {
  const applied = [];
  for (const entry of Array.isArray(removals) ? removals : []) {
    const zone = String(entry?.zone || "");
    const current = getThreatInZone(zone) || 0;
    const amount = Math.min(Math.max(0, Number(entry?.amount ?? 0) || 0), current);
    if (!zone || amount <= 0) continue;
    await addThreatToZoneSafe(zone, -amount);
    applied.push({ zone, amount });
  }
  if (!applied.length) return [];
  const detail = applied.map((r) => `<strong>${r.amount}</strong> from <strong>${foundry.utils.escapeHTML(r.zone)}</strong>`).join(", ");
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: actor || undefined }),
    content: `<div class="hollows-chat"><strong>${actor?.name || "Hunter"}</strong> ${reason}: discards ${detail}.</div>`
  });
  return applied;
}

export async function removeThreatViaDialog(actor, amount, presetZone = null, allowedZones = null) {
  const removeAll = amount === "all";
  if (!removeAll && (!amount || amount <= 0)) return;
  let zone = presetZone;
  if (!zone) {
    let zones = gatherZonesWithThreat();
    if (allowedZones) zones = zones.filter((z) => allowedZones.includes(z));
    if (!zones.length) {
      ui.notifications?.info?.("No Threat on the grid to remove.");
      return;
    }
    let routedToOwner = false;
    if (game.user?.isGM && actor) {
      const owner = game.users.find((u) => !u.isGM && actor.testUserPermission(u, "OWNER"));
      if (owner?.active) {
        routedToOwner = true;
        try {
          zone = await runUserQuery(owner, "hollows.pickThreatZone", { zones }, { notifyOnError: false });
        } catch (err) {
          zone = "";
        }
      }
    }
    if (!routedToOwner) {
      zone = await localPickZone(zones);
    }
    if (!zone) return;
  }
  const current = getThreatInZone(zone) || 0;
  const remove = removeAll ? current : Math.min(amount, current);
  if (remove > 0) {
    await addThreatToZoneSafe(zone, -remove);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: actor || undefined }),
      content: `<div class="hollows-chat"><strong>${actor?.name || "Hunter"}</strong> removes <strong>${remove}</strong> Threat from <strong>${zone}</strong>.</div>`
    });
  }
}

// ─── Shift Threat ─────────────────────────────────────────────────────────

export async function localShiftDialog(actor, { sources, destPerSource, title, amount, reason, resource = "Threat" }) {
  if (!sources.length) return null;
  const sourceOptions = sources
    .map((s) => `<option value="${s.zone}">${s.zone} (${s.count})</option>`)
    .join("");
  const initialFrom = sources[0].zone;
  const initialDest = destPerSource[initialFrom] || [];
  const destOptions = initialDest.map((z) => `<option value="${z}">${z}</option>`).join("");
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title },
    content: `
      <form class="hollows-roll-dialog">
        <div class="form-group"><label>Shift ${amount} ${resource} (${reason})</label></div>
        <div class="form-group"><label>From</label><select name="fromZone">${sourceOptions}</select></div>
        <div class="form-group"><label>To</label><select name="toZone">${destOptions}</select></div>
      </form>
    `,
    rejectClose: false,
    render: (_e, dialog) => {
      const el = dialog.element;
      const updateDest = () => {
        const fromZone = String(el.querySelector("[name=fromZone]")?.value || "");
        const list = destPerSource[fromZone] || [];
        el.querySelector("[name=toZone]").innerHTML = list.map((z) => `<option value="${z}">${z}</option>`).join("");
      };
      el.querySelector("[name=fromZone]").addEventListener("change", updateDest);
      updateDest();
    },
    buttons: [
      {
        action: "apply",
        label: "Shift",
        default: true,
        callback: (_e, _b, dialog) => {
          const el = dialog.element;
          return {
            from: String(el.querySelector("[name=fromZone]")?.value || ""),
            to: String(el.querySelector("[name=toZone]")?.value || "")
          };
        }
      },
      { action: "skip", label: "Skip", callback: () => null }
    ]
  });
  return result || null;
}

/**
 * @param actor                — carrier of the shift ability
 * @param amount               — number of Threat to move (default 1)
 * @param sourceConstraint     — "self" | "adjacent" | "sameOrAdjacent" | "anyWithThreat"
 * @param destConstraint       — "self" | "adjacentToSource" | "sameOrAdjacent" | "anyZone"
 * @param excludeSupport       — drop Support from candidate zones (default true)
 * @param label                — dialog title
 * @param reason               — chat-card reason (e.g. "Control", "Goad", "Misdirection")
 */
export async function shiftThreatViaDialog(actor, {
  amount = 1,
  sourceConstraint = "sameOrAdjacent",
  destConstraint = "adjacentToSource",
  excludeSupport = true,
  label = "Shift Threat",
  reason = "Shift"
} = {}) {
  if (!actor || actor.type !== "hunter") return false;
  if (amount <= 0) return false;

  const destPerSource = {};
  const sourceZones = excludeSupportIf(resolveSourceZones(actor, sourceConstraint), excludeSupport)
    .filter((z) => getThreatInZone(z) >= amount);
  const viableSourceZones = [];
  for (const src of sourceZones) {
    const dests = excludeSupportIf(resolveDestZones(actor, src, destConstraint), excludeSupport)
      .filter((z) => z !== src);
    if (!dests.length) continue;
    destPerSource[src] = dests;
    viableSourceZones.push(src);
  }
  if (!viableSourceZones.length) {
    ui.notifications?.info?.(`No Threat available to shift (${reason}).`);
    return false;
  }
  const sources = viableSourceZones.map((z) => ({ zone: z, count: getThreatInZone(z) }));

  let pick = null;
  let routedToOwner = false;
  if (game.user?.isGM && actor) {
    const owner = game.users.find((u) => !u.isGM && actor.testUserPermission(u, "OWNER"));
    if (owner?.active) {
      routedToOwner = true;
      try {
        pick = await runUserQuery(owner, "hollows.pickShiftThreat", {
          sources, destPerSource, title: label, amount, reason
        }, { notifyOnError: false });
      } catch (err) {
        pick = null;
      }
    }
  }
  if (!routedToOwner) {
    pick = await localShiftDialog(actor, { sources, destPerSource, title: label, amount, reason });
  }
  if (!pick || !pick.from || !pick.to || pick.from === pick.to) return false;
  if (getThreatInZone(pick.from) < amount) return false;
  await addThreatToZoneSafe(pick.from, -amount);
  await addThreatToZoneSafe(pick.to, amount);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="hollows-chat"><strong>${actor.name}</strong> shifts <strong>${amount} Threat</strong> from <strong>${pick.from}</strong> to <strong>${pick.to}</strong> (${reason}).</div>`
  });
  return true;
}
