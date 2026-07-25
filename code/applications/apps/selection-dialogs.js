import { getHuntersInZone, getAllHuntersSorted } from "../../canvas/zone.js";

const { DialogV2 } = foundry.applications.api;
const esc = (v) => foundry.utils.escapeHTML(String(v ?? ""));

function selectGroup(name, label, options, selectedValue = null) {
  const opts = options.map((o) => {
    const selected = o.selected || (selectedValue !== null && String(o.value) === String(selectedValue));
    return `<option value="${esc(o.value)}" ${selected ? "selected" : ""}>${esc(o.label)}</option>`;
  }).join("");
  const lbl = label ? `<label>${esc(label)}</label>` : "";
  return `<div class="form-group">${lbl}<select name="${esc(name)}">${opts}</select></div>`;
}

export async function pickOne({ title = "Choose", label = "", options = [], hint = "", applyLabel = "Apply" } = {}) {
  if (!options.length) return null;
  const hintHtml = hint ? `<div class="muted">${esc(hint)}</div>` : "";
  const value = await DialogV2.wait({
    window: { title },
    content: `<form class="hollows-roll-dialog">${hintHtml}${selectGroup("value", label, options)}</form>`,
    rejectClose: false,
    buttons: [
      { action: "ok", label: applyLabel, default: true, callback: (_e, _b, d) => String(d.element.querySelector("[name=value]")?.value || "") },
      { action: "cancel", label: "Cancel", callback: () => null }
    ]
  });
  return value || null;
}

export async function pickMany({ title = "Choose", label = "", options = [], hint = "", applyLabel = "Apply" } = {}) {
  const boxes = options
    .map((o) => {
      const checked = o.selected ? "checked" : "";
      return `<label class="checkbox"><input type="checkbox" name="pick" value="${esc(o.value)}" ${checked} /> ${esc(o.label)}</label>`;
    })
    .join("");
  const lbl = label ? `<label>${esc(label)}</label>` : "";
  const hintHtml = hint ? `<div class="muted">${esc(hint)}</div>` : "";
  return await DialogV2.wait({
    window: { title },
    content: `<form class="hollows-roll-dialog"><div class="form-group">${lbl}${hintHtml}${boxes || "<div class='muted'>Nothing available.</div>"}</div></form>`,
    rejectClose: false,
    buttons: [
      { action: "ok", label: applyLabel, default: true, callback: (_e, _b, d) => [...d.element.querySelectorAll("[name=pick]:checked")].map((el) => String(el.value || "")) },
      { action: "cancel", label: "Cancel", callback: () => null }
    ]
  });
}

export async function confirmDialog({ title = "Confirm", bodyHtml = "", yesLabel = "Apply", noLabel = "Cancel" } = {}) {
  return (await DialogV2.wait({
    window: { title },
    content: `<div class="hollows-roll-dialog">${bodyHtml}</div>`,
    rejectClose: false,
    buttons: [
      { action: "yes", label: yesLabel, default: true, callback: () => true },
      { action: "no", label: noLabel, callback: () => false }
    ]
  })) ?? false;
}

export async function promptForm({
  title = "Choose",
  fields = [],
  bodyHtml = "",
  footerHtml = "",
  applyLabel = "Apply",
  render = null,
  submit = null
} = {}) {
  const body = fields.map((f) => {
    if (f.type === "select") return selectGroup(f.name, f.label, f.options || [], f.value ?? null);
    if (f.type === "number") {
      const attrs = [
        `type="number"`,
        `name="${esc(f.name)}"`,
        f.min !== undefined ? `min="${Number(f.min)}"` : "",
        f.max !== undefined ? `max="${Number(f.max)}"` : "",
        `value="${Number(f.value ?? 0)}"`
      ].filter(Boolean).join(" ");
      return `<div class="form-group"><label>${esc(f.label)}</label><input ${attrs} /></div>`;
    }
    if (f.type === "checkbox") {
      return `<div class="form-group"><label class="checkbox"><input type="checkbox" name="${esc(f.name)}" ${f.value ? "checked" : ""} /> ${esc(f.label)}</label></div>`;
    }
    return "";
  }).join("");
  return await DialogV2.wait({
    window: { title },
    content: `<form class="hollows-roll-dialog">${bodyHtml}${body}${footerHtml}</form>`,
    rejectClose: false,
    render: typeof render === "function" ? render : undefined,
    buttons: [
      { action: "ok", label: applyLabel, default: true, callback: (_e, _b, d) => {
        const out = {};
        const form = d.element.querySelector("form");
        for (const f of fields) {
          const el = form?.elements?.namedItem(f.name);
          if (!el) continue;
          out[f.name] = f.type === "number" ? Number(el.value || 0)
            : f.type === "checkbox" ? !!el.checked
            : String(el.value || "");
        }
        return typeof submit === "function" ? submit(out, d) : out;
      } },
      { action: "cancel", label: "Cancel", callback: () => null }
    ]
  }) ?? null;
}

export async function resolveActionHunter(hunter, { title = "Choose Hunter" } = {}) {
  if (hunter) return hunter;
  if (!game.user?.isGM) return null;
  const hunters = getAllHuntersSorted();
  if (!hunters.length) {
    ui.notifications.warn("No Hunters found.");
    return null;
  }
  const id = await pickOne({ title, label: "Hunter", options: hunters.map((h) => ({ value: h.id, label: h.name })) });
  return id ? game.actors.get(id) : null;
}

export async function chooseOneZone(zones) {
  if (zones.length <= 1) return zones[0] || null;
  return await pickOne({ title: "Choose Zone", label: "Zone", options: zones.map((z) => ({ value: z, label: z })) });
}

export async function chooseOneTarget(tokens, { title = "Choose Target", label = "Target", hint = "", promptSingle = false } = {}) {
  if (tokens.length <= 1 && !promptSingle) return tokens[0] || null;
  const id = await pickOne({ title, label, hint, options: tokens.map((t) => ({ value: t.id, label: t.name })) });
  return id ? tokens.find((t) => t.id === id) || null : null;
}

export async function chooseHunterInZone(zone, title) {
  const hunters = getHuntersInZone(zone);
  if (!hunters.length) {
    ui.notifications.warn(`No Hunters in ${zone}.`);
    return null;
  }
  const id = await pickOne({ title, label: "Target Hunter", options: hunters.map((h) => ({ value: h.id, label: h.name })) });
  return id ? game.actors.get(id) || null : null;
}

export async function promptForZoneSelection(zoneIds, { title = "Choose Zones", single = false } = {}) {
  const candidates = Array.from(new Set((zoneIds || []).filter((z) => !!z)));
  if (!candidates.length) return [];
  if (candidates.length === 1) return candidates;
  if (single) {
    const z = await pickOne({ title, label: "Zone", options: candidates.map((c) => ({ value: c, label: c })) });
    return z ? [z] : [];
  }
  const picked = await pickMany({ title, options: candidates.map((c) => ({ value: c, label: c })) });
  return picked || [];
}
