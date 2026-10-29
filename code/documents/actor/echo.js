import { ECHO_TABLE_NAMES, MALIGNANCY_LIST } from "../../data/echo/index.js";
import { chooseHunterWeapon } from "../../helpers/weapon-utils.js";
import { getPrimaryRefugeActor } from "../../data/refuge/index.js";
import { getWeaponAbilityDocs, grantWeaponAbilityToHunter, isDuplicateWeaponAbility } from "./ability-grant.js";
import { runUserQuery, dispatchToGM } from "../../helpers/queries.js";
import { confirmDialog, pickOne, promptForm } from "../../applications/apps/selection-dialogs.mjs";
import { getActiveHollowActor } from "../../canvas/zone.js";
import { setActorFlagSafe } from "../../utils/flag-utils.js";
import { ItemCatalog } from "../../data/item-catalog.js";

const esc = (value) => foundry.utils.escapeHTML(String(value ?? ""));

// ─── Echo Queries ─────────────────────────────────────────────────────────────

// ─── Echo Compendium ──────────────────────────────────────────────────────────

function getEchoTablePacks() {
  return game.packs.filter(pack => (pack.documentName === "RollTable") && pack.visible);
}

/** Whether the four Echo tables are available to this user. */
export async function hasEchoRollContent() {
  const indexes = await Promise.all(getEchoTablePacks().map(pack => pack.getIndex()));
  const names = new Set(indexes.flatMap(index => index.contents.map(entry => entry.name)));
  return Object.values(ECHO_TABLE_NAMES).every(name => names.has(name));
}

// ─── Table Helpers ────────────────────────────────────────────────────────────

async function getEchoTableByName(name) {
  for (const pack of getEchoTablePacks()) {
    const index = await pack.getIndex();
    const entry = index.find(d => String(d.name || "") === String(name || ""));
    if (entry) return pack.getDocument(entry._id);
  }
  return null;
}

// ─── Trophies ─────────────────────────────────────────────────────────────────

async function promptTrophiesModifier() {
  const refuge = getPrimaryRefugeActor();
  const max = refuge?.system.benefits.echoRollModifier ?? 0;
  if (!max) return 0;
  const res = await promptForm({
    title: "Trophies Modifier",
    fields: [{ type: "number", name: "mod", label: `Trophies modifier (-${max} to +${max})`, min: -max, max, value: 0 }],
  });
  return Math.clamp(Number(res?.mod ?? 0), -max, max);
}

// ─── Echo Roll Flow ───────────────────────────────────────────────────────────

async function rollEchoCategory() {
  const table = await getEchoTableByName(ECHO_TABLE_NAMES.category);
  if (!table) {
    ui.notifications?.warn?.("Echo Category table not found.");
    return null;
  }
  const formula = table.formula;
  const roll = await (new Roll(formula)).evaluate();
  const total = Number(roll.total ?? 0);
  const result = table.getResultsForRoll(total)[0];
  const label = String(result?.name || result?.description || "").trim();
  if (!label) ui.notifications?.warn?.("Echo Category roll returned no result.");
  return { label, total };
}

async function rollEchoTableWithCorruption(tableName, corruption, modifier = 0) {
  const table = await getEchoTableByName(tableName);
  if (!table) {
    ui.notifications?.warn?.(`Echo table not found: ${tableName}`);
    return null;
  }
  const formula = table.formula;
  const roll = await (new Roll(formula)).evaluate();
  const total = Number(roll.total ?? 0) + Number(corruption ?? 0) + Number(modifier ?? 0);
  const result = table.getResultsForRoll(total)[0];
  const label = String(result?.name || result?.description || "").trim();
  if (!label) ui.notifications?.warn?.(`Echo table '${tableName}' returned no result.`);
  return { label, total, roll };
}

async function postEchoChat(actor, title, lines = []) {
  if (!actor) return;
  const content = `
    <div class="hollows-chat">
      <div><strong>${esc(title)}</strong></div>
      ${lines.map(l => `<div>${l}</div>`).join("")}
    </div>
  `;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
  });
}

async function postEchoGained(actor, created, suffix = "") {
  await postEchoChat(actor, "Echo Gained", [
    `Added: <strong>${esc(created?.name || "Echo")}</strong>${suffix}.`,
  ]);
}

function echoRollLine(result, corruption, trophyMod) {
  const mod = trophyMod ? ` ${trophyMod >= 0 ? "+" : ""}${trophyMod}` : "";
  return `Roll: <strong>${result?.roll?.total ?? "?"}</strong> + Corruption ${corruption}${mod} = <strong>${result?.total ?? "?"}</strong>.`;
}

function hasEchoDuplicate(actor, data) {
  const category = data.system.category;
  const subtype = data.system.subtype;
  const name = data.name;
  return actor.items.documentsByType.echo.some(echo => {
    if (echo.system.subtype) return (echo.system.category === category) && (echo.system.subtype === subtype);
    return echo.name === name;
  });
}

async function chooseEchoReplacement(actor, echoType) {
  const echoes = actor.items.documentsByType.echo.filter(echo => echo.system.echoType === echoType);
  if (echoes.length < 2) return null;
  return await pickOne({
    title: "Replace Echo",
    label: `Replace an existing ${echoType}`,
    options: echoes.map(e => ({ value: e.id, label: e.name })),
    applyLabel: "Replace",
  });
}

/** Find a compendium Echo matching the rolled subtype and optional weapon or malignancy. */
async function findEchoUuidByMatch({ subtype, weaponType, malignancy }) {
  const entries = await ItemCatalog.getIndex("echo");
  const entry = entries.find(({ system }) => (system.subtype === subtype)
    && ((weaponType === undefined) || (system.weaponType === weaponType))
    && ((malignancy === undefined) || (system.malignancy === malignancy)));
  return entry?.uuid || "";
}

/** Add an Echo selected from a compendium or the world. */
export async function addEchoFromUuid(actor, uuid, overrides = {}) {
  const doc = await fromUuid(uuid);
  if (!doc) {
    ui.notifications.warn(`Echo not found: ${uuid}`);
    return null;
  }
  return addEchoFromDoc(actor, doc, overrides);
}

export async function addEchoFromDoc(actor, doc, overrides = {}) {
  const data = doc.toObject();
  delete data._id;
  const merged = foundry.utils.mergeObject(data, overrides, { inplace: false });
  if (hasEchoDuplicate(actor, merged)) {
    return { duplicate: true };
  }
  const echoType = String(merged.system?.echoType || "");
  if (echoType) {
    const count = actor.items.documentsByType.echo.filter(echo => echo.system.echoType === echoType).length;
    if (count >= 2) {
      const replaceId = await chooseEchoReplacement(actor, echoType);
      if (!replaceId) return null;
      await actor.deleteEmbeddedDocuments("Item", [replaceId]);
    }
  }
  const created = await actor.createEmbeddedDocuments("Item", [merged]);
  return created?.[0] || null;
}

export async function handleCorruptionIncrease(actor, prevValue, nextValue) {
  if (!actor) return;
  if (!game.user?.isGM) return;
  if (!(await hasEchoRollContent())) return;
  const owners = game.users.filter(u => !u.isGM && actor.testUserPermission(u, "OWNER"));
  const owner = owners.find(u => u.active) || null;
  try {
    await runUserQuery(owner || game.user, "hollows.echoRollOffer", {
      actorId: actor.id,
      prev: prevValue,
      next: nextValue,
    });
  } catch (err) {
    console.warn("Hollows | Echo roll offer failed", err);
  }
}

async function promptEchoRoll(actor, prevValue, nextValue) {
  return await confirmDialog({
    title: "Corruption Increased",
    bodyHtml: `<p><strong>${esc(actor?.name || "Hunter")}</strong> gained Corruption (${prevValue} → ${nextValue}).</p><p>Roll an Echo now?</p>`,
    yesLabel: "Roll Echo",
    noLabel: "Skip",
  });
}

export async function rollEchoFlow(actor, attempt = 0) {
  if (!actor || attempt > 5) return;
  const categoryRoll = await rollEchoCategory();
  const category = String(categoryRoll?.label || "");
  if (!category) return;
  await postEchoChat(actor, "Echo Roll", [
    `Category roll: <strong>${categoryRoll.total}</strong> → <strong>${esc(category)}</strong>.`,
  ]);
  const proceed = await confirmDialog({
    title: "Echo Roll",
    bodyHtml: `<p>Category: <strong>${esc(category)}</strong> (rolled ${categoryRoll.total}).</p>`,
    yesLabel: `Roll ${category} Echo`,
    noLabel: "Cancel",
  });
  if (!proceed) return;
  if (category === "Seed") return rollSeedEcho(actor, attempt);
  if (category === "Weapon") return rollWeaponEcho(actor, attempt);
  if (category === "Malignancy") return rollMalignancyEcho(actor, attempt);
}

async function rollSeedEcho(actor, attempt = 0) {
  const corruption = Number(actor.system?.corruption?.value ?? 0);
  const trophyMod = await promptTrophiesModifier();
  const result = await rollEchoTableWithCorruption(ECHO_TABLE_NAMES.seed, corruption, trophyMod);
  const label = String(result?.label || "");
  await postEchoChat(actor, "Seed Echo", [
    echoRollLine(result, corruption, trophyMod),
    `Result: <strong>${esc(label || "None")}</strong>.`,
  ]);
  const echoUuid = await findEchoUuidByMatch({ subtype: label.toLowerCase() });
  if (!echoUuid) return;
  const proceed = await confirmDialog({
    title: "Seed Echo",
    bodyHtml: `<p>Result: <strong>${esc(label)}</strong> (rolled ${result?.total ?? "?"}).</p>`,
    yesLabel: "Gain Echo",
    noLabel: "Cancel",
  });
  if (!proceed) return;
  const created = await addEchoFromUuid(actor, echoUuid);
  if (created?.duplicate) return rollSeedEcho(actor, attempt + 1);
  if (created) {
    await postEchoGained(actor, created, ` (Seed / ${esc(label)})`);
  }
}

/** Grant a Weapon Echo, bind it to its source weapon, and announce it in chat. */
async function createBoundWeaponEcho(actor, echoUuid, weapon, weaponType, displayName) {
  const created = await addEchoFromUuid(actor, echoUuid, {
    name: displayName,
    system: { sourceWeaponId: weapon.id, weaponType },
  });
  if (!created || created.duplicate) return created;
  await created.update({ "system.sourceWeaponId": weapon.id, "system.weaponType": weaponType });
  await postEchoGained(actor, created);
  return created;
}

async function rollWeaponEcho(actor, attempt = 0) {
  const corruption = Number(actor.system?.corruption?.value ?? 0);
  const trophyMod = await promptTrophiesModifier();
  const result = await rollEchoTableWithCorruption(ECHO_TABLE_NAMES.weapon, corruption, trophyMod);
  const label = String(result?.label || "");
  const weapon = await chooseHunterWeapon(actor, "Choose Weapon for Echo");
  if (!weapon) return;
  const weaponType = String(weapon.system?.weaponType || "");
  await postEchoChat(actor, "Weapon Echo", [
    echoRollLine(result, corruption, trophyMod),
    `Result: <strong>${esc(label || "None")}</strong>.`,
    `Weapon: <strong>${esc(weapon.name || "Weapon")}</strong> (${esc(weaponType)}).`,
  ]);
  const proceed = await confirmDialog({
    title: "Weapon Echo",
    bodyHtml: `<p>Result: <strong>${esc(label || "None")}</strong> (rolled ${result?.total ?? "?"}).</p><p>Weapon: <strong>${esc(weapon.name || "Weapon")}</strong>.</p>`,
    yesLabel: "Gain Echo",
    noLabel: "Cancel",
  });
  if (!proceed) return;

  if (label === "Scar") {
    const echoUuid = await findEchoUuidByMatch({ subtype: "scar", weaponType });
    if (!echoUuid) return;
    const created = await createBoundWeaponEcho(actor, echoUuid, weapon, weaponType, `Scar (${weapon.name})`);
    if (created?.duplicate) return rollWeaponEcho(actor, attempt + 1);
    return;
  }

  if (label === "Reinforcement" || label === "Honing" || label === "Secret") {
    const echoUuid = await findEchoUuidByMatch({ subtype: label.toLowerCase() });
    if (!echoUuid) return;
    const created = await createBoundWeaponEcho(actor, echoUuid, weapon, weaponType, `${label} (${weapon.name})`);
    if (created?.duplicate) return rollWeaponEcho(actor, attempt + 1);
  }
}

async function rollMalignancyEcho(actor, attempt = 0) {
  const malignancy = actor.system.malignancy;
  if (!malignancy) {
    const pick = await pickOne({
      title: "Choose Malignancy",
      label: "Malignancy",
      options: MALIGNANCY_LIST.map(m => ({ value: m, label: m })),
      applyLabel: "Choose",
    });
    if (!pick) return;
    await actor.update({ "system.malignancy": pick });
    const infectionUuid = await findEchoUuidByMatch({ subtype: "infection" });
    const created = infectionUuid
      ? await addEchoFromUuid(actor, infectionUuid, { name: `Infection (${pick})`, system: { malignancy: pick } })
      : null;
    if (created?.duplicate) return rollMalignancyEcho(actor, attempt + 1);
    if (created) {
      await postEchoChat(actor, "Malignancy Echo", [
        `Malignancy chosen: <strong>${esc(pick)}</strong>.`,
        `Added: <strong>${esc(created.name || "Infection")}</strong>.`,
      ]);
    }
    return;
  }
  const corruption = Number(actor.system?.corruption?.value ?? 0);
  const trophyMod = await promptTrophiesModifier();
  const result = await rollEchoTableWithCorruption(ECHO_TABLE_NAMES.malignancy, corruption, trophyMod);
  const label = String(result?.label || "");
  await postEchoChat(actor, "Malignancy Echo", [
    `Malignancy: <strong>${esc(malignancy)}</strong>.`,
    echoRollLine(result, corruption, trophyMod),
    `Result: <strong>${esc(label || "None")}</strong>.`,
  ]);
  const echoUuid = await findEchoUuidByMatch({ subtype: label.toLowerCase(), malignancy });
  if (!echoUuid) return;
  const proceed = await confirmDialog({
    title: "Malignancy Echo",
    bodyHtml: `<p>Malignancy: <strong>${esc(malignancy)}</strong>.</p><p>Result: <strong>${esc(label)}</strong> (rolled ${result?.total ?? "?"}).</p>`,
    yesLabel: "Gain Echo",
    noLabel: "Cancel",
  });
  if (!proceed) return;
  const created = await addEchoFromUuid(actor, echoUuid);
  if (created?.duplicate) return rollMalignancyEcho(actor, attempt + 1);
  if (created) await postEchoGained(actor, created);
}

async function applyWeaponSecretEcho(actor, weapon) {
  const weaponType = String(weapon.system?.weaponType || "");
  const existingPermanent = actor.items.filter(i =>
    i.type === "weaponAbility" &&
    String(i.system?.durationType || "") === "permanent" &&
    (String(i.system?.boundWeaponId || "") === weapon.id || String(i.system?.weaponType || "") === weaponType),
  );
  if (!existingPermanent.length) {
    ui.notifications.warn("No permanent abilities to replace for Secret.");
    return;
  }
  const replaceId = await pickOne({
    title: "Secret: Replace Permanent Ability",
    label: "Replace Permanent Ability",
    options: existingPermanent.map(a => ({ value: a.id, label: a.name })),
    applyLabel: "Replace",
  });
  if (!replaceId) return;
  const toReplace = actor.items.get(replaceId);
  const docs = await getWeaponAbilityDocs(weaponType, 3);
  const optionsDocs = docs.filter(d => !isDuplicateWeaponAbility(actor, d));
  if (!optionsDocs.length) {
    ui.notifications.warn(`No Tier 3 abilities available for ${weaponType}.`);
    return;
  }
  const pick = optionsDocs[Math.floor(Math.random() * optionsDocs.length)];
  if (!pick) return;
  await actor.deleteEmbeddedDocuments("Item", [toReplace.id]);
  await grantWeaponAbilityToHunter(actor, pick, "permanent", weapon.id);
  await postEchoChat(actor, "Secret", [
    `<strong>${esc(actor.name)}</strong> gains <strong>${esc(pick.name)}</strong>.`,
  ]);
}

// ─── Seed Echo Effects ────────────────────────────────────────────────────────

async function selectWeaponForEcho(actor, echoItem) {
  const weaponType = String(echoItem.system?.weaponType || "");
  const weapons = actor.items
    .filter(i => i.type === "weapon")
    .filter(w => !weaponType || String(w.system?.weaponType || "") === weaponType);
  if (!weapons.length) {
    const message = weaponType
      ? `No ${weaponType} weapon available for this Echo.`
      : "No weapon available for this Echo.";
    ui.notifications.warn(message);
    return null;
  }
  const pick = await pickOne({
    title: "Select Weapon",
    label: "Weapon",
    options: weapons.map(w => ({
      value: w.id,
      label: `${w.name} (${w.system?.weaponType || "Weapon"})`,
    })),
    applyLabel: "Select",
  });
  return pick ? actor.items.get(String(pick)) : null;
}

async function bindEchoWeapon(actor, echoItem) {
  const current = actor.items.get(String(echoItem.system?.sourceWeaponId || ""));
  const weapon = current || await selectWeaponForEcho(actor, echoItem);
  if (!weapon) return null;
  await echoItem.update({
    "system.sourceWeaponId": weapon.id,
    "system.weaponType": String(weapon.system?.weaponType || ""),
  });
  return weapon;
}

export async function applyEchoAcquisition(actor, echoItem) {
  if (!actor || !echoItem || echoItem.type !== "echo") return;
  const category = String(echoItem.system?.category || "");
  const onAcquire = echoItem.system?.onAcquire || {};
  if (category === "weapon") {
    const weapon = await bindEchoWeapon(actor, echoItem);
    if (weapon && onAcquire.grantTier3Ability) {
      await applyWeaponSecretEcho(actor, weapon);
    }
    return;
  }
  if (category === "seed") {
    await applySeedEchoEffect(actor, echoItem);
  }
}

export async function applySeedEchoEffect(actor, echoItem, options = {}) {
  if (!actor || !echoItem) return;
  const onAcquire = echoItem.system?.onAcquire || {};
  const createsThrall = !!onAcquire.createsThrall;
  let createsHazard = !!onAcquire.createsHazard;
  let enhancesExploration = !!onAcquire.enhancesExplorationRoll;
  if (!createsThrall && !createsHazard && !enhancesExploration) return;

  const subtype = String(echoItem.system?.subtype || echoItem.name || echoItem.id || "");
  const counts = foundry.utils.duplicate(actor.getFlag("hollows", "seedEchoCounts") || {});
  if (options.countAsGain !== false) {
    counts[subtype] = Number(counts[subtype] ?? 0) + 1;
    await actor.setFlag("hollows", "seedEchoCounts", counts);
  }
  const repeat = Number(counts[subtype] ?? 0) > 1;
  const delta = Number(repeat ? onAcquire.explorationRepeatTNMod : onAcquire.explorationTNMod) || 0;

  if (createsHazard && enhancesExploration) {
    const choice = await pickOne({
      title: echoItem.name || "Seed Echo",
      label: "Apply an effect now",
      options: [
        { value: "exploration", label: `Increase TN +${delta}` },
        { value: "hazard", label: "Create Hazard" },
      ],
    });
    if (!choice) return;
    enhancesExploration = choice === "exploration";
    createsHazard = choice === "hazard";
  }

  if (enhancesExploration) {
    const hollow = getActiveHollowActor();
    const next = Number(hollow?.getFlag("hollows", "explorationTNMod") ?? 0) + delta;
    if (hollow) await setActorFlagSafe(hollow, "explorationTNMod", next);
    await postEchoChat(actor, echoItem.name || "Seed Echo", [
      `Exploration TNs +${delta} (current mod: ${next}).`,
    ]);
  }

  if (createsHazard) {
    await requestEchoHazardCreate(actor, delta, echoItem);
  }

  if (createsThrall) {
    await requestEchoWandererCreate(actor, repeat, echoItem);
  }

  if (echoItem.system.state.has("onePerHollow")) {
    const state = new Set(echoItem.system.state);
    state.add("usedThisHollow");
    await echoItem.update({ "system.state": [...state] });
  }
}

// ─── Echo Hazard / Wanderer ───────────────────────────────────────────────────

async function requestEchoHazardCreate(actor, delta, echoItem) {
  await dispatchToGM("echoCreateHazard", {
    actorId: actor.id,
    delta,
    sourceName: echoItem?.name || "",
    hazard: echoItem?.system?.onAcquire?.hazard || {},
  });
}

async function createEchoHazardActor(actor, delta, sourceName = "", stats = {}) {
  const label = String(sourceName || "Echo");
  const name = `${actor?.name || "Hunter"}'s ${label} Hazard`;
  const hazard = await Actor.create({
    name,
    type: "hazard",
    img: "icons/svg/hazard.svg",
    system: {
      category: "hazard",
      stat: "strong",
      tn: Number(stats.tn ?? 9) + Math.max(0, Number(delta ?? 0) - 2),
      targetMode: "any",
      damageSuccessResolve: Number(stats.resolve ?? 2),
      damageFailureWounds: Number(stats.wounds ?? 2),
      doomOnFailure: 0,
      notes: label,
    },
  }, { renderSheet: true });
  await postEchoChat(actor, label, [`Hazard created (${esc(hazard.name)}).`]);
}

async function requestEchoWandererCreate(actor, upgraded, echoItem) {
  await dispatchToGM("echoCreateWanderer", {
    actorId: actor.id,
    upgraded: !!upgraded,
    sourceName: echoItem?.name || "",
    thrall: echoItem?.system?.onAcquire?.thrall || {},
  });
}

async function createEchoWandererThrall(actor, upgraded, sourceName = "", stats = {}) {
  const label = String(sourceName || "Echo");
  const name = `${actor?.name || "Hunter"}'s ${label} Thrall${upgraded ? " (Upgraded)" : ""}`;
  const dResolve = Number(stats.damageResolve ?? 2) + (upgraded ? 1 : 0);
  const dWounds = Number(stats.damageWounds ?? 1) + (upgraded ? 1 : 0);
  const hResolve = Number(stats.healthResolve ?? 4) + (upgraded ? 2 : 0);
  const hWounds = Number(stats.healthWounds ?? 3) + (upgraded ? 2 : 0);
  const thrall = await Actor.create({
    name,
    type: "thrall",
    img: "icons/svg/mystery-man.svg",
    system: {
      stat: "hard",
      tn: Number(stats.tn ?? 8),
      damage: { resolve: dResolve, wounds: dWounds },
      health: { resolve: { value: hResolve, max: hResolve }, wounds: { value: hWounds, max: hWounds } },
      notes: label,
    },
  });
  await postEchoChat(actor, label, [`Thrall created (${esc(thrall.name)}).`]);
}

// ─── Query handlers ───────────────────────────────────────────────────────────
export function registerEchoQueries(registerHandler) {
  registerHandler("hollows.echoRollOffer", async ({ actorId, prev, next } = {}) => {
    const actor = actorId ? game.actors.get(String(actorId)) : null;
    if (!actor) return;
    const wants = await promptEchoRoll(actor, prev, next);
    if (wants) rollEchoFlow(actor);
  });
  registerHandler("hollows.echoCreateHazard", async ({ actorId, delta, sourceName, hazard } = {}) => {
    const actor = actorId ? game.actors.get(String(actorId)) : null;
    if (!actor) return;
    await createEchoHazardActor(actor, delta, sourceName, hazard || {});
  });
  registerHandler("hollows.echoCreateWanderer", async ({ actorId, upgraded, sourceName, thrall } = {}) => {
    const actor = actorId ? game.actors.get(String(actorId)) : null;
    if (!actor) return;
    await createEchoWandererThrall(actor, !!upgraded, sourceName, thrall || {});
  });
}
