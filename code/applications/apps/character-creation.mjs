import { getAvailableWeaponForms, getWeaponPackDocs } from "../../data/weapons/index.js";
import { getWeaponAbilityDocs, grantWeaponAbilityToHunter } from "../../documents/actor/ability-grant.js";
import { getContentPacks } from "../../helpers/extensions.js";
import { getEquipmentPackDocs } from "../../documents/actor/hunter-equipment.js";

export function isNewHunterActor(actor) {
  if (!actor || actor.type !== "hunter") return false;
  const stats = actor.system?.stats || {};
  const allOnes = Object.values(stats).every((v) => Number(v ?? 0) === 1);
  const weapons = actor.items?.filter(i => i.type === "weapon") || [];
  if (weapons.length) return false;
  const identity = actor.system?.identity || {};
  const hasIdentity = !!(identity.faction || identity.origin || identity.seed);
  const bio = actor.system?.bio || {};
  const hasBio = !!(bio.appearance || bio.notes);
  const hasEquipment = !!actor.items?.some((item) => item.type === "equipment" || item.type === "relic");
  return allOnes && !hasIdentity && !hasBio && !hasEquipment;
}

async function loadCharacterCreationData() {
  if (game.hollowsCharacterCreation?.data) return game.hollowsCharacterCreation.data;
  const response = await fetch("systems/hollows/code/data/seeds/character-creation.json");
  if (!response.ok) {
    ui.notifications.warn("Character creation data not found.");
    return null;
  }
  const data = await response.json();
  for (const url of getContentPacks("character-creation")) {
    const extraResponse = await fetch(url);
    if (!extraResponse.ok) continue;
    const extra = await extraResponse.json();
    for (const extraFaction of extra?.factions || []) {
      const faction = data.factions.find(f => f.id === extraFaction.id);
      if (!faction) {
        data.factions.push(extraFaction);
        continue;
      }
      if (extraFaction.origins?.length) faction.origins = [...(faction.origins || []), ...extraFaction.origins];
      if (extraFaction.seeds?.length) faction.seeds = [...(faction.seeds || []), ...extraFaction.seeds];
    }
  }
  game.hollowsCharacterCreation = game.hollowsCharacterCreation || {};
  game.hollowsCharacterCreation.data = data;
  return data;
}

async function applyWeaponFormData(weapon, form) {
  if (!weapon || !form) return;
  await weapon.update({
    "system.capacity.value": Number(form.capacity?.value ?? 0),
  });
}

function formatLongText(text) {
  const safe = foundry.utils.escapeHTML(String(text || ""));
  return safe.replaceAll("\n", "<br/>");
}

async function promptFactionSelection(data, state, allowBack = false) {
  if (!data?.factions?.length) return null;
  const options = data.factions
    .map(f => `<option value="${f.id}">${f.name}</option>`)
    .join("");
  const defaultId = state.factionId || data.factions[0].id;
  const content = `
      <form class="hollows-roll-dialog">
        <div class="form-group">
          <label>Faction</label>
          <select name="factionId">${options}</select>
        </div>
        <div class="form-group">
          <label>Description</label>
          <div class="hollows-longtext" data-faction-desc></div>
        </div>
      </form>
    `;
  const buttons = [];
  if (allowBack) {
    buttons.push({ action: "back", label: "Back", callback: (_e, _b, _dialog) => ({ __back: true }) });
  }
  buttons.push({ action: "next", label: "Next", default: true, callback: (_e, _b, dialog) => String(dialog.element.querySelector("[name=factionId]")?.value || "") });
  return await foundry.applications.api.DialogV2.wait({
    window: { title: "Character Creation: Faction" },
    content,
    render: (_e, dialog) => {
      const el = dialog.element;
      const update = () => {
        const id = String(el.querySelector("[name=factionId]")?.value || "");
        const faction = data.factions.find(f => f.id === id);
        const desc = [
          faction?.description || "",
          faction?.hollows ? `\n\nHollows:\n${faction.hollows}` : "",
          faction?.weapons ? `\n\nWeapons:\n${faction.weapons}` : "",
        ].join("").trim();
        el.querySelector("[data-faction-desc]").innerHTML = formatLongText(desc);
      };
      el.querySelector("[name=factionId]").value = defaultId;
      el.querySelector("[name=factionId]").addEventListener("change", update);
      update();
    },
    buttons,
    rejectClose: false,
    classes: ["hollows", "hollows-wizard", allowBack ? "" : "hollows-wizard-noback"].filter(Boolean),
    position: { width: 760, height: 640 },
  }) ?? null;
}

async function promptOriginSelection(faction, state, allowBack = false) {
  const origins = faction?.origins || [];
  const options = origins
    .map(o => `<option value="${foundry.utils.escapeHTML(o.name)}">${o.name}</option>`)
    .join("");
  const defaultName = state.originName || origins[0]?.name || "__custom__";
  const content = `
      <form class="hollows-roll-dialog">
        <div class="form-group">
          <label>Origin</label>
          <select name="originName">${options}<option value="__custom__">Custom</option></select>
        </div>
        <div class="form-group origin-custom" hidden>
          <label>Custom Origin</label>
          <input type="text" name="originCustom" placeholder="Enter custom origin" />
        </div>
        <div class="form-group">
          <label>Description</label>
          <div class="hollows-longtext" data-origin-desc></div>
        </div>
      </form>
    `;
  const buttons = [];
  if (allowBack) {
    buttons.push({ action: "back", label: "Back", callback: (_e, _b, _dialog) => ({ __back: true }) });
  }
  buttons.push({ action: "next", label: "Next", default: true, callback: (_e, _b, dialog) => {
    const originName = String(dialog.element.querySelector("[name=originName]")?.value || "");
    const originCustom = String(dialog.element.querySelector("[name=originCustom]")?.value || "").trim();
    if (originName === "__custom__" && !originCustom) {
      ui.notifications.warn("Enter a custom Origin.");
      return false;
    }
    return { originName, originCustom };
  } });
  return await foundry.applications.api.DialogV2.wait({
    window: { title: "Character Creation: Origin" },
    content,
    render: (_e, dialog) => {
      const el = dialog.element;
      const update = () => {
        const val = String(el.querySelector("[name=originName]")?.value || "");
        const isCustom = val === "__custom__";
        const customGroup = el.querySelector(".origin-custom");
        if (customGroup) customGroup.hidden = !isCustom;
        if (isCustom) {
          el.querySelector("[data-origin-desc]").innerHTML = "";
          return;
        }
        const origin = origins.find(o => o.name === val);
        el.querySelector("[data-origin-desc]").innerHTML = formatLongText(origin?.text || "");
      };
      el.querySelector("[name=originName]").value = defaultName;
      el.querySelector("[name=originName]").addEventListener("change", update);
      update();
    },
    buttons,
    rejectClose: false,
    classes: ["hollows", "hollows-wizard", allowBack ? "" : "hollows-wizard-noback"].filter(Boolean),
    position: { width: 760, height: 640 },
  }) ?? null;
}

async function promptSeedSelection(faction, allFactions, state, allowBack = false) {
  const seeds = faction.name === "The Outliers"
    ? allFactions.flatMap(f => (f.seeds || []).map(s => ({ ...s, source: f.name })))
    : (faction.seeds || []).map(s => ({ ...s, source: faction.name }));
  if (!seeds.length) return null;
  const options = seeds
    .map(s => `<option value="${foundry.utils.escapeHTML(s.name)}">${s.name} (${s.source})</option>`)
    .join("");
  const defaultName = state.seedName || seeds[0].name;
  const content = `
      <form class="hollows-roll-dialog">
        <div class="form-group">
          <label>Seed</label>
          <select name="seedName">${options}<option value="__custom__">Custom</option></select>
        </div>
        <div class="form-group seed-custom" hidden>
          <label>Custom Seed</label>
          <input type="text" name="seedCustom" placeholder="Enter custom seed" />
        </div>
        <div class="form-group">
          <label>Description</label>
          <div class="hollows-longtext" data-seed-desc></div>
        </div>
      </form>
    `;
  const buttons = [];
  if (allowBack) {
    buttons.push({ action: "back", label: "Back", callback: (_e, _b, _dialog) => ({ __back: true }) });
  }
  buttons.push({ action: "next", label: "Next", default: true, callback: (_e, _b, dialog) => {
    const seedName = String(dialog.element.querySelector("[name=seedName]")?.value || "");
    const seedCustom = String(dialog.element.querySelector("[name=seedCustom]")?.value || "").trim();
    if (seedName === "__custom__" && !seedCustom) {
      ui.notifications.warn("Enter a custom Seed.");
      return false;
    }
    return { seedName, seedCustom };
  } });
  return await foundry.applications.api.DialogV2.wait({
    window: { title: "Character Creation: Seed" },
    content,
    render: (_e, dialog) => {
      const el = dialog.element;
      const update = () => {
        const val = String(el.querySelector("[name=seedName]")?.value || "");
        const isCustom = val === "__custom__";
        const customGroup = el.querySelector(".seed-custom");
        if (customGroup) customGroup.hidden = !isCustom;
        if (isCustom) {
          el.querySelector("[data-seed-desc]").innerHTML = "";
          return;
        }
        const seed = seeds.find(s => s.name === val);
        el.querySelector("[data-seed-desc]").innerHTML = formatLongText(seed?.text || "");
      };
      el.querySelector("[name=seedName]").value = defaultName;
      el.querySelector("[name=seedName]").addEventListener("change", update);
      update();
    },
    buttons,
    rejectClose: false,
    classes: ["hollows", "hollows-wizard", allowBack ? "" : "hollows-wizard-noback"].filter(Boolean),
    position: { width: 760, height: 640 },
  }) ?? null;
}

async function promptStatSelection(state, allowBack = false) {
  const presets = {
    standard: [10, 10, 10, 8, 8],
    specialist: [11, 10, 10, 8, 7],
  };
  const presetKey = state.statPreset || "standard";
  const content = `
      <form class="hollows-roll-dialog">
        <div class="form-group">
          <label>Preset</label>
          <select name="preset">
            <option value="standard">10, 10, 10, 8, 8</option>
            <option value="specialist">11, 10, 10, 8, 7</option>
          </select>
        </div>
        <div class="form-group">
          <label>Assign Stats</label>
          <div class="stat-assign-grid">
            <div><label>Strong</label><select name="stat-strong"></select></div>
            <div><label>Hard</label><select name="stat-hard"></select></div>
            <div><label>Quick</label><select name="stat-quick"></select></div>
            <div><label>Sharp</label><select name="stat-sharp"></select></div>
            <div><label>Wise</label><select name="stat-wise"></select></div>
          </div>
        </div>
      </form>
    `;
  const buttons = [];
  if (allowBack) {
    buttons.push({ action: "back", label: "Back", callback: (_e, _b, _dialog) => ({ __back: true }) });
  }
  buttons.push({ action: "next", label: "Next", default: true, callback: (_e, _b, dialog) => {
    const key = String(dialog.element.querySelector("[name=preset]")?.value || "standard");
    const values = presets[key] || presets.standard;
    const picks = {
      strong: Number(dialog.element.querySelector("[name=stat-strong]")?.value),
      hard: Number(dialog.element.querySelector("[name=stat-hard]")?.value),
      quick: Number(dialog.element.querySelector("[name=stat-quick]")?.value),
      sharp: Number(dialog.element.querySelector("[name=stat-sharp]")?.value),
      wise: Number(dialog.element.querySelector("[name=stat-wise]")?.value),
    };
    const chosen = Object.values(picks).sort((a, b) => a - b);
    const target = values.slice().sort((a, b) => a - b);
    if (chosen.length !== target.length ||
      chosen.some((v, i) => v !== target[i])) {
      ui.notifications.warn("Use each preset value exactly once.");
      return false;
    }
    return { presetKey: key, stats: picks };
  } });
  return await foundry.applications.api.DialogV2.wait({
    window: { title: "Character Creation: Stats" },
    content,
    render: (_e, dialog) => {
      const el = dialog.element;
      const buildOptions = (values) =>
        values.map(v => `<option value="${v}">${v}</option>`).join("");
      const updateValidity = () => {
        const values = {
          strong: Number(el.querySelector("[name=stat-strong]")?.value),
          hard: Number(el.querySelector("[name=stat-hard]")?.value),
          quick: Number(el.querySelector("[name=stat-quick]")?.value),
          sharp: Number(el.querySelector("[name=stat-sharp]")?.value),
          wise: Number(el.querySelector("[name=stat-wise]")?.value),
        };
        const key = String(el.querySelector("[name=preset]")?.value || "standard");
        const target = (presets[key] || presets.standard).slice().sort((a, b) => a - b);
        const chosen = Object.values(values).slice().sort((a, b) => a - b);
        const valid = chosen.length === target.length && chosen.every((v, i) => v === target[i]);
        const nextButton = el.querySelector("button[data-action=\"next\"]");
        if (nextButton) nextButton.disabled = !valid;
      };
      const update = () => {
        const key = String(el.querySelector("[name=preset]")?.value || "standard");
        const values = presets[key] || presets.standard;
        const options = buildOptions(values);
        el.querySelectorAll("[name^='stat-']").forEach((statEl, idx) => {
          const current = statEl.value;
          statEl.innerHTML = options;
          if (current && values.includes(Number(current))) {
            statEl.value = current;
          } else {
            statEl.value = String(values[idx] ?? values[0]);
          }
        });
        updateValidity();
      };
      el.querySelector("[name=preset]").value = presetKey;
      el.querySelector("[name=preset]").addEventListener("change", update);
      el.querySelectorAll("[name^='stat-']").forEach(statEl => statEl.addEventListener("change", updateValidity));
      update();
    },
    buttons,
    rejectClose: false,
    classes: ["hollows", "hollows-wizard", allowBack ? "" : "hollows-wizard-noback"].filter(Boolean),
    position: { width: 760, height: 640 },
  }) ?? null;
}

function getModifierChoicesForWeapon(doc, weaponType, formName) {
  const forms = getAvailableWeaponForms(weaponType);
  const form = forms.find(f => f.name === formName);
  if (form?.modifierChoices?.length) return form.modifierChoices;
  if (doc?.system?.modifierChoices?.length) return doc.system.modifierChoices;
  return [];
}

async function promptWeaponSelection(actor, weaponDocsByType, weaponTypeBlacklist = [], allowBack = false) {
  const available = Array.from(weaponDocsByType.entries())
    .filter(([type]) => !weaponTypeBlacklist.includes(type))
    .map(([type, doc]) => ({ type, doc }))
    .sort((a, b) => a.type.localeCompare(b.type));
  if (!available.length) return null;
  const options = available.map(w => `<option value="${foundry.utils.escapeHTML(w.type)}">${w.type}</option>`).join("");
  const content = `
      <form class="hollows-roll-dialog">
        <div class="form-group">
          <label>Weapon</label>
          <select name="weaponType">${options}</select>
        </div>
        <div class="form-group">
          <label>Form</label>
          <select name="formName"></select>
        </div>
        <div class="form-group">
          <label>Form Details</label>
          <div class="hollows-longtext" data-form-desc></div>
        </div>
        <div class="form-group">
          <label>Core Ability</label>
          <div class="hollows-longtext" data-core-ability></div>
        </div>
        <div class="form-group">
          <label>Attack Profiles</label>
          <div class="hollows-longtext" data-attack-profiles></div>
        </div>
        <div class="form-group">
          <label>Modifier Set</label>
          <select name="modifierChoice"></select>
        </div>
        <div class="form-group">
          <label>Tier 1 Ability</label>
          <select name="abilityId"></select>
        </div>
        <div class="form-group">
          <label>Ability Text</label>
          <div class="hollows-longtext" data-ability-desc></div>
        </div>
      </form>
    `;
  const buttons = [];
  if (allowBack) {
    buttons.push({ action: "back", label: "Back", callback: (_e, _b, _dialog) => ({ __back: true }) });
  }
  buttons.push({ action: "next", label: "Next", default: true, callback: async (_e, _b, dialog) => {
    const weaponType = String(dialog.element.querySelector("[name=weaponType]")?.value || "");
    const formName = String(dialog.element.querySelector("[name=formName]")?.value || "");
    const abilityId = String(dialog.element.querySelector("[name=abilityId]")?.value || "");
    const modifierChoiceId = String(dialog.element.querySelector("[name=modifierChoice]")?.value || "");
    if (!weaponType || !formName || !abilityId) {
      ui.notifications.warn("Select a weapon, form, and ability.");
      return false;
    }
    const doc = weaponDocsByType.get(weaponType);
    const choices = getModifierChoicesForWeapon(doc, weaponType, formName);
    if (choices.length && !modifierChoiceId) {
      ui.notifications.warn("Select a modifier set.");
      return false;
    }
    return { weaponType, formName, abilityId, modifierChoiceId };
  } });
  return await foundry.applications.api.DialogV2.wait({
    window: { title: "Character Creation: Weapon" },
    content,
    render: (_e, dialog) => {
      const el = dialog.element;
      const renderAttackProfiles = (profiles) => {
        if (!profiles.length) return "<div class=\"muted\">No attack profiles.</div>";
        return profiles.map((atk) => {
          const range = foundry.utils.escapeHTML(String(atk.range || ""));
          const stat = foundry.utils.escapeHTML(String(atk.stat || ""));
          const defence = foundry.utils.escapeHTML(String(atk.defence || ""));
          const condition = atk.condition ? ` - ${foundry.utils.escapeHTML(String(atk.condition))}` : "";
          return `<div>With ${stat} from ${range} vs ${defence}${condition}</div>`;
        }).join("");
      };
      const updateForms = async () => {
        const weaponType = String(el.querySelector("[name=weaponType]")?.value || "");
        const doc = weaponDocsByType.get(weaponType);
        const forms = getAvailableWeaponForms(weaponType);
        const formOptions = forms.map(f => `<option value="${foundry.utils.escapeHTML(f.name)}">${f.name}</option>`).join("");
        el.querySelector("[name=formName]").innerHTML = formOptions;
        const updateFormDesc = () => {
          const name = String(el.querySelector("[name=formName]")?.value || "");
          const form = forms.find(f => f.name === name);
          const capacityLine = form?.capacity
            ? `\nCapacity: ${Number(form.capacity.max ?? 0)}`
            : "";
          const desc = [
            form?.text || "",
            form?.damage ? `\nDamage: ${form.damage.resolve}/${form.damage.wounds}` : "",
            capacityLine,
          ].join("").trim();
          el.querySelector("[data-form-desc]").innerHTML = formatLongText(desc);
          const coreText = String(doc?.system?.coreAbility || "");
          el.querySelector("[data-core-ability]").innerHTML = formatLongText(coreText);
          const baseProfiles = doc?.system?.attackProfiles || [];
          const formProfiles = form?.attackProfiles || [];
          const profiles = formProfiles.length ? formProfiles : baseProfiles;
          el.querySelector("[data-attack-profiles]").innerHTML = renderAttackProfiles(profiles);
        };
        const updateModifiers = () => {
          const name = String(el.querySelector("[name=formName]")?.value || "");
          const choices = getModifierChoicesForWeapon(doc, weaponType, name);
          const select = el.querySelector("[name=modifierChoice]");
          if (!choices.length) {
            select.innerHTML = "";
            select.disabled = true;
            return;
          }
          const opts = choices.map(c => `<option value="${c.id}">${c.label}</option>`).join("");
          select.disabled = false;
          select.innerHTML = opts;
        };
        const formNameEl = el.querySelector("[name=formName]");
        formNameEl.removeEventListener("change", formNameEl._changeHandler);
        formNameEl._changeHandler = () => { updateFormDesc(); updateModifiers(); };
        formNameEl.addEventListener("change", formNameEl._changeHandler);
        updateFormDesc();
        updateModifiers();

        const abilities = await getWeaponAbilityDocs(weaponType, 1);
        const abilityOptions = abilities.map(a => `<option value="${a.id}">${a.name}</option>`).join("");
        el.querySelector("[name=abilityId]").innerHTML = abilityOptions;
        const updateAbilityDesc = () => {
          const id = String(el.querySelector("[name=abilityId]")?.value || "");
          const ability = abilities.find(a => a.id === id);
          el.querySelector("[data-ability-desc]").innerHTML = formatLongText(ability?.system?.text || "");
        };
        const abilityEl = el.querySelector("[name=abilityId]");
        abilityEl.removeEventListener("change", abilityEl._changeHandler);
        abilityEl._changeHandler = updateAbilityDesc;
        abilityEl.addEventListener("change", abilityEl._changeHandler);
        updateAbilityDesc();
      };
      el.querySelector("[name=weaponType]").addEventListener("change", updateForms);
      updateForms();
    },
    buttons,
    rejectClose: false,
    classes: ["hollows", "hollows-wizard", allowBack ? "" : "hollows-wizard-noback"].filter(Boolean),
    position: { width: 820, height: 700 },
  }) ?? null;
}

async function promptEquipmentSelection(kind, title, stateKey, state, allowBack = false) {
  const docs = await getEquipmentPackDocs(kind);
  const items = docs
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  if (!items.length) {
    ui.notifications.warn("No equipment available.");
    return null;
  }
  const options = items
    .map(d => `<option value="${d.id}">${d.name}</option>`)
    .join("");
  const defaultId = state?.[stateKey] || items[0].id;
  const content = `
      <form class="hollows-roll-dialog">
        <div class="form-group">
          <label>Equipment</label>
          <select name="equipmentId">${options}</select>
        </div>
        <div class="form-group">
          <label>Description</label>
          <div class="hollows-longtext" data-equip-desc></div>
        </div>
      </form>
    `;
  const buttons = [];
  if (allowBack) {
    buttons.push({ action: "back", label: "Back", callback: (_e, _b, _dialog) => ({ __back: true }) });
  }
  buttons.push({ action: "next", label: "Next", default: true, callback: (_e, _b, dialog) => {
    const id = String(dialog.element.querySelector("[name=equipmentId]")?.value || "");
    return items.find(d => d.id === id) || null;
  } });
  return await foundry.applications.api.DialogV2.wait({
    window: { title },
    content,
    render: (_e, dialog) => {
      const el = dialog.element;
      const update = () => {
        const id = String(el.querySelector("[name=equipmentId]")?.value || "");
        const doc = items.find(d => d.id === id);
        el.querySelector("[data-equip-desc]").innerHTML = formatLongText(doc?.system?.text || "");
      };
      el.querySelector("[name=equipmentId]").value = defaultId;
      el.querySelector("[name=equipmentId]").addEventListener("change", update);
      update();
    },
    buttons,
    rejectClose: false,
    classes: ["hollows", "hollows-wizard", allowBack ? "" : "hollows-wizard-noback"].filter(Boolean),
    position: { width: 760, height: 640 },
  }) ?? null;
}

export async function openCharacterCreationWizard(actor) {
  if (!actor || actor.type !== "hunter") return;
  if (!isNewHunterActor(actor)) {
    ui.notifications.warn("Character creation is only available for new Hunters.");
    return;
  }
  const data = await loadCharacterCreationData();
  if (!data) return;
  const state = actor.getFlag("hollows", "charBuilder") || {};

  const docs = await getWeaponPackDocs();
  if (!docs.length) {
    ui.notifications.warn("No weapons found in compendiums.");
    return;
  }
  const weaponDocsByType = new Map();
  for (const doc of docs) {
    const wt = String(doc.system?.weaponType || doc.name || "");
    if (!wt || weaponDocsByType.has(wt)) continue;
    weaponDocsByType.set(wt, doc);
  }

  const steps = ["faction", "origin"];
  if (data.factions.some(f => (f.seeds || []).length)) steps.push("seed");
  steps.push("stats", "weapon1", "weapon2");
  if (getContentPacks("exploration-equipment").length) steps.push("equipExploration");
  if (getContentPacks("battle-equipment").length) steps.push("equipBattle");
  let stepIndex = 0;
  let faction = null;
  let originPick = null;
  let seedPick = null;
  let statPick = null;
  let weapon1 = null;
  let weapon2 = null;
  let explorationEquip = null;
  let battleEquip = null;

  while (stepIndex < steps.length) {
    const step = steps[stepIndex];
    const allowBack = stepIndex > 0;
    if (step === "faction") {
      const result = await promptFactionSelection(data, state, allowBack);
      if (!result) return;
      if (result?.__back) { stepIndex -= 1; continue; }
      const factionId = result;
      faction = data.factions.find(f => f.id === factionId);
      if (!faction) return;
      state.factionId = factionId;
      stepIndex += 1;
      continue;
    }
    if (step === "origin") {
      if (!faction) { stepIndex = 0; continue; }
      const result = await promptOriginSelection(faction, state, allowBack);
      if (!result) return;
      if (result?.__back) { stepIndex -= 1; continue; }
      originPick = result;
      state.originName = originPick.originName;
      stepIndex += 1;
      continue;
    }
    if (step === "seed") {
      if (!faction) { stepIndex = 0; continue; }
      const result = await promptSeedSelection(faction, data.factions, state, allowBack);
      if (!result) return;
      if (result?.__back) { stepIndex -= 1; continue; }
      seedPick = result;
      state.seedName = seedPick.seedName;
      stepIndex += 1;
      continue;
    }
    if (step === "stats") {
      const result = await promptStatSelection(state, allowBack);
      if (!result) return;
      if (result?.__back) { stepIndex -= 1; continue; }
      statPick = result;
      state.statPreset = statPick.presetKey;
      stepIndex += 1;
      continue;
    }
    if (step === "weapon1") {
      const result = await promptWeaponSelection(actor, weaponDocsByType, [], allowBack);
      if (!result) return;
      if (result?.__back) { stepIndex -= 1; continue; }
      weapon1 = result;
      stepIndex += 1;
      continue;
    }
    if (step === "weapon2") {
      const result = await promptWeaponSelection(actor, weaponDocsByType, [weapon1?.weaponType].filter(Boolean), allowBack);
      if (!result) return;
      if (result?.__back) { stepIndex -= 1; continue; }
      weapon2 = result;
      stepIndex += 1;
      continue;
    }
    if (step === "equipExploration") {
      const result = await promptEquipmentSelection(
        "exploration",
        "Character Creation: Exploration Equipment",
        "explorationEquipId",
        state,
        allowBack,
      );
      if (!result) return;
      if (result?.__back) { stepIndex -= 1; continue; }
      explorationEquip = result;
      state.explorationEquipId = explorationEquip.id;
      stepIndex += 1;
      continue;
    }
    if (step === "equipBattle") {
      const result = await promptEquipmentSelection(
        "battle",
        "Character Creation: Battle Equipment",
        "battleEquipId",
        state,
        allowBack,
      );
      if (!result) return;
      if (result?.__back) { stepIndex -= 1; continue; }
      battleEquip = result;
      state.battleEquipId = battleEquip.id;
      stepIndex += 1;
      continue;
    }
    break;
  }

  if (!faction || !originPick || !statPick || !weapon1 || !weapon2) return;
  if (steps.includes("seed") && !seedPick) return;
  if (steps.includes("equipExploration") && !explorationEquip) return;
  if (steps.includes("equipBattle") && !battleEquip) return;

  await actor.setFlag("hollows", "charBuilder", state);

  const factionText = [
    faction.description || "",
    faction.hollows ? `\n\nHollows:\n${faction.hollows}` : "",
    faction.weapons ? `\n\nWeapons:\n${faction.weapons}` : "",
  ].filter(Boolean).join("");
  const originText = originPick.originName === "__custom__"
    ? ""
    : (faction.origins || []).find(o => o.name === originPick.originName)?.text || "";
  const seedText = (() => {
    if (!seedPick || seedPick.seedName === "__custom__") return "";
    const allSeeds = faction.name === "The Outliers"
      ? data.factions.flatMap(f => (f.seeds || []).map(s => ({ ...s, source: f.name })))
      : (faction.seeds || []).map(s => ({ ...s, source: faction.name }));
    return allSeeds.find(s => s.name === seedPick.seedName)?.text || "";
  })();

  await actor.update({
    "system.identity.faction": faction.name,
    "system.identity.factionText": factionText,
    "system.identity.origin": originPick.originName === "__custom__" ? originPick.originCustom : originPick.originName,
    "system.identity.originText": originText,
    "system.identity.seed": !seedPick ? "" : (seedPick.seedName === "__custom__" ? seedPick.seedCustom : seedPick.seedName),
    "system.identity.seedText": seedText,
    "system.stats.strong": statPick.stats.strong,
    "system.stats.hard": statPick.stats.hard,
    "system.stats.quick": statPick.stats.quick,
    "system.stats.sharp": statPick.stats.sharp,
    "system.stats.wise": statPick.stats.wise,
  });

  const createWeapon = async (pick) => {
    const doc = weaponDocsByType.get(pick.weaponType);
    if (!doc) return null;
    const payload = foundry.utils.deepClone(doc.toObject());
    delete payload._id;
    const created = await actor.createEmbeddedDocuments("Item", [payload]);
    const weapon = created?.[0] || null;
    if (!weapon) return null;
    await weapon.update({ "system.selectedForm": pick.formName });
    const form = getAvailableWeaponForms(pick.weaponType).find(f => f.name === pick.formName);
    if (form) await applyWeaponFormData(weapon, form);
    const modifierChoices = getModifierChoicesForWeapon(doc, pick.weaponType, pick.formName);
    if (modifierChoices.length) {
      const choice = modifierChoices.find(c => c.id === pick.modifierChoiceId) || modifierChoices[0];
      if (choice) {
        await weapon.update({
          "system.modifierChoice": choice.id,
        });
      }
    }
    const abilities = await getWeaponAbilityDocs(pick.weaponType, 1);
    const abilityDoc = abilities.find(a => a.id === pick.abilityId);
    if (abilityDoc) {
      const granted = await grantWeaponAbilityToHunter(actor, abilityDoc, "permanent", weapon.id);
      if (granted) {
        await granted.update({
          "system.boundWeaponId": weapon.id,
          "system.weaponType": pick.weaponType,
        });
      }
    }
    return weapon;
  };

  await createWeapon(weapon1);
  await createWeapon(weapon2);

  const applyEquipment = async (doc) => {
    if (!doc) return null;
    const payload = foundry.utils.deepClone(doc.toObject());
    delete payload._id;
    const created = await actor.createEmbeddedDocuments("Item", [payload]);
    return created?.[0] || null;
  };

  await applyEquipment(explorationEquip);
  await applyEquipment(battleEquip);

  const resolveMax = Number(actor.system.health.resolve.max ?? 0);
  const woundsMax = Number(actor.system.health.wounds.max ?? 0);
  await actor.update({
    "system.health.resolve.value": resolveMax,
    "system.health.wounds.value": woundsMax,
  });

  await actor.unsetFlag("hollows", "charBuilder");
  ui.notifications.info("Character creation complete.");
}
