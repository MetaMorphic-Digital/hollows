import { checkCypherUpgrades } from "../item/relic-cypher.js";

const EMPTY_HEALTH = { resolve: { value: 0, max: 0 }, wounds: { value: 0, max: 0 } };

const LINK_KINDS = {
  hazard: linkKind("Actor", "hazard", "hazardIds", "system.trackedHazards", "hazards", hazardSystemFields),
  entity: linkKind("Actor", "entity", "entityIds", "system.trackedEntities", "entities", entitySystemFields),
  thrall: linkKind("Actor", "thrall", "thrallIds", "system.trackedThralls", "thralls", thrallSystemFields),
  rumour: linkKind("Item", "rumour", "rumourIds", "system.rumourIds", "rumours", textSystemFields),
  relic: linkKind("Item", "relic", "relicIds", "system.relicIds", "relics", relicSystemFields)
};

const LINK_KIND_ENTRIES = Object.entries(LINK_KINDS);

function linkKind(documentName, type, sceneField, rootField, publicField, systemFields = null) {
  const contextField = documentName === "Actor"
    ? `tracked${publicField.charAt(0).toUpperCase()}${publicField.slice(1)}`
    : publicField;
  return { documentName, type, sceneField, rootField, publicField, contextField, systemFields };
}

function linkKindConfig(kind) {
  return LINK_KINDS[String(kind || "")] || null;
}

async function fromUuidSafe(uuid) {
  try { return await fromUuid(uuid); } catch (err) { return null; }
}

async function resolveHollowsDocument(ref, collection, documentName) {
  const key = String(ref || "").trim();
  if (!key) return null;
  let doc = collection?.get?.(key) || null;
  if (!doc && key.includes(".")) doc = await fromUuidSafe(key);
  if (doc?.documentName !== documentName) return null;
  return doc || null;
}

export function getHollowsDocumentRef(doc) {
  return String(doc?.uuid || doc?.id || "");
}

export async function resolveHollowDroppedDocument(event) {
  let data = null;
  try {
    data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
  } catch (err) {
    try { data = JSON.parse(event.dataTransfer.getData("text/plain")); } catch (e) {}
  }
  return data?.uuid ? await fromUuidSafe(data.uuid) : null;
}

function documentMatchesLinkKind(doc, config) {
  if (!doc) return false;
  if (doc.documentName !== config.documentName) return false;
  if (doc.type !== config.type) return false;
  return true;
}

function getHollowLinkKindForDocument(doc) {
  for (const [kind, config] of LINK_KIND_ENTRIES) {
    if (documentMatchesLinkKind(doc, config)) return kind;
  }
  return "";
}

export function getHollowLinkedDocuments(kind) {
  const config = linkKindConfig(kind);
  if (!config) return [];
  const collection = config.documentName === "Actor" ? game.actors : game.items;
  return collection.filter((doc) => documentMatchesLinkKind(doc, config));
}

async function resolveHollowsDocumentByConfig(ref, config) {
  const collection = config.documentName === "Actor" ? game.actors : game.items;
  const doc = await resolveHollowsDocument(ref, collection, config.documentName);
  return documentMatchesLinkKind(doc, config) ? doc : null;
}

export async function addHollowRootDroppedDocument(actor, doc) {
  const kind = getHollowLinkKindForDocument(doc);
  if (!kind) return false;
  await addHollowRootDoc(actor, kind, getHollowsDocumentRef(doc));
  return true;
}

export async function addHollowSceneDroppedDocument(actor, sceneIndex, doc) {
  const kind = getHollowLinkKindForDocument(doc);
  if (kind) {
    await addHollowSceneDoc(actor, sceneIndex, kind, getHollowsDocumentRef(doc));
    return true;
  }
  if (doc?.documentName === "Scene") {
    await setHollowSceneLink(actor, sceneIndex, doc);
    return true;
  }
  return false;
}

function getHollowScenesData(actor) {
  const scenes = Array.isArray(actor?.system?.scenes) ? actor.system.scenes : [];
  return foundry.utils.duplicate(scenes);
}

export async function resolveHollowsScene(id) {
  return await resolveHollowsDocument(id, game.scenes, "Scene");
}

export async function resolveHollowsLinkedDocument(kind, ref) {
  const config = linkKindConfig(kind);
  return config ? await resolveHollowsDocumentByConfig(ref, config) : null;
}

export async function prepareHollowLinkContext(actor) {
  const system = actor.system;
  const canManageVisibility = canManageHollowVisibility(actor);
  const publicView = !canManageVisibility;
  const lordRef = String(system?.lordId || "");
  const entityOptions = game.actors.filter(a => a.type === "entity").map(a => {
    const ref = getHollowsDocumentRef(a);
    return {
      id: a.id,
      ref,
      name: a.name,
      selected: lordRef === a.id || lordRef === ref
    };
  });

  const sceneSpecs = Array.isArray(system?.scenes) ? system.scenes : [];
  const scenes = await Promise.all(sceneSpecs.map(async (scene, index) => {
    if (publicView) return publicSceneContext(scene, index);
    return await liveSceneContext(scene, index);
  }));
  const visibleScenes = scenes.filter(Boolean);

  const rootLinks = Object.fromEntries(await Promise.all(LINK_KIND_ENTRIES.map(async ([kind, config]) => [
    config.contextField,
    await resolveRootLinkContexts(actor, kind, publicView)
  ])));

  return {
    canManageVisibility,
    publicView,
    entityOptions,
    scenes: visibleScenes,
    ...rootLinks
  };
}

export async function addHollowScene(actor) {
  const scenes = getHollowScenesData(actor);
  scenes.push(newHollowSceneData(scenes.length));
  await actor.update({ "system.scenes": scenes });
}

export async function removeHollowScene(actor, index) {
  const scenes = getHollowScenesData(actor);
  scenes.splice(index, 1);
  await actor.update({ "system.scenes": scenes });
}

export async function addHollowSceneDoc(actor, index, kind, ref) {
  const scenes = getHollowScenesData(actor);
  const scene = scenes[index];
  if (!scene) return;
  const key = linkKindConfig(kind)?.sceneField;
  if (!key) return;
  scene[key] = addLinkedRef(scene[key], ref);
  if (scene.revealed) scene.publicSnapshot = await buildScenePublicSnapshot(scene, index);
  scenes[index] = scene;
  await actor.update({ "system.scenes": scenes });
}

export async function removeHollowSceneDoc(actor, index, kind, ref) {
  const scenes = getHollowScenesData(actor);
  const scene = scenes[index];
  if (!scene) return;
  const key = linkKindConfig(kind)?.sceneField;
  if (!key) return;
  scene[key] = removeLinkedRef(scene[key], ref);
  if (scene.revealed) scene.publicSnapshot = await buildScenePublicSnapshot(scene, index);
  scenes[index] = scene;
  await actor.update({ "system.scenes": scenes });
}

export async function addHollowSceneFromSceneDoc(actor, sceneDoc) {
  const scenes = getHollowScenesData(actor);
  scenes.push(newHollowSceneData(scenes.length, sceneDoc));
  await actor.update({ "system.scenes": scenes });
}

export async function setHollowSceneLink(actor, index, sceneDoc) {
  const scenes = getHollowScenesData(actor);
  const scene = scenes[index];
  if (!scene) return;
  scene.sceneId = getHollowsDocumentRef(sceneDoc);
  scene.name = sceneDoc.name || scene.name || `Scene ${index + 1}`;
  if (scene.revealed) scene.publicSnapshot = await buildScenePublicSnapshot(scene, index);
  scenes[index] = scene;
  await actor.update({ "system.scenes": scenes });
}

export async function updateHollowSceneField(actor, index, field, value) {
  const scenes = getHollowScenesData(actor);
  if (!scenes[index]) return;
  scenes[index][field] = value;
  if (scenes[index].revealed) scenes[index].publicSnapshot = {
    ...(scenes[index].publicSnapshot || {}),
    [field]: value,
    ...(field === "name" ? { displayName: value || `Scene ${index + 1}` } : {})
  };
  await actor.update({ "system.scenes": scenes }, { render: false });
}

export async function toggleHollowSceneVisibility(actor, index) {
  if (!canManageHollowVisibility(actor)) return false;
  const scenes = getHollowScenesData(actor);
  const scene = scenes[index];
  if (!scene) return false;
  scene.revealed = !scene.revealed;
  scene.publicSnapshot = scene.revealed ? await buildScenePublicSnapshot(scene, index) : {};
  scenes[index] = scene;
  await actor.update({ "system.scenes": scenes });
  return true;
}

export async function toggleHollowLinkVisibility(actor, kind, ref) {
  if (!canManageHollowVisibility(actor)) return false;
  const field = linkKindConfig(kind)?.publicField;
  if (!field) return false;
  const key = `system.publicLinks.${field}`;
  const current = getPublicLinkList(actor, kind);
  const index = current.findIndex((entry) => String(entry?.ref || "") === String(ref || ""));
  if (index >= 0) {
    current.splice(index, 1);
    await actor.update({ [key]: current });
    return true;
  }

  const doc = await resolveHollowsLinkedDocument(kind, ref);
  if (!doc) return false;
  current.push(publicLinkedDocumentSnapshot(kind, ref, doc));
  await actor.update({ [key]: current });
  if (kind === "rumour") await checkCypherUpgrades("rumourRevealed", doc.id);
  return true;
}

export async function createHollowLinkedDocument(kind, { returnRef = false } = {}) {
  const config = linkKindConfig(kind);
  if (!config) return "";
  const cls = config.documentName === "Actor" ? Actor : Item;
  const created = await cls.create(createLinkedDocumentData(kind, config));
  return returnRef ? getHollowsDocumentRef(created) : (created?.id || "");
}

export function canManageHollowVisibility(actor) {
  return !!(game.user?.isGM || actor?.isOwner);
}

function newHollowSceneData(index, sceneDoc = null) {
  return {
    sceneId: sceneDoc ? getHollowsDocumentRef(sceneDoc) : "",
    name: sceneDoc?.name || `Scene ${index + 1}`,
    notes: "",
    revealed: false,
    publicSnapshot: {},
    ...emptySceneLinkLists()
  };
}

function emptySceneLinkLists() {
  return Object.fromEntries(LINK_KIND_ENTRIES.map(([, config]) => [config.sceneField, []]));
}

function createLinkedDocumentData(kind, config) {
  return { name: `New ${kind}`, type: config.type };
}

async function liveSceneContext(scene, index) {
  const [sceneDoc, links] = await Promise.all([
    scene.sceneId ? resolveHollowsScene(scene.sceneId) : Promise.resolve(null),
    resolveSceneLinkContexts(scene, { publicView: false })
  ]);
  const displayName = sceneDoc?.name || scene.name || `Scene ${index + 1}`;
  const thumb = sceneDoc?.thumb || sceneDoc?.background?.src || sceneDoc?.img || "";
  return {
    index,
    name: scene.name || "",
    sceneId: scene.sceneId || "",
    displayName,
    thumb,
    notes: scene.notes || "",
    revealed: !!scene.revealed,
    ...links
  };
}

function publicSceneContext(scene, index) {
  if (!scene?.revealed) return null;
  const snapshot = scene.publicSnapshot || {};
  return {
    index,
    name: scene.name || snapshot.name || "",
    sceneId: scene.sceneId || snapshot.sceneId || "",
    displayName: snapshot.displayName || scene.name || `Scene ${index + 1}`,
    thumb: snapshot.thumb || "",
    notes: scene.notes || snapshot.notes || "",
    revealed: true,
    ...publicSceneLinksContext(snapshot)
  };
}

async function buildScenePublicSnapshot(scene, index) {
  const context = await liveSceneContext(scene, index);
  const snapshot = {
    name: context.name,
    sceneId: context.sceneId,
    displayName: context.displayName,
    thumb: context.thumb,
    notes: context.notes
  };
  for (const [, config] of LINK_KIND_ENTRIES) {
    snapshot[config.publicField] = (context[config.publicField] || []).map(publicContextSnapshot);
  }
  return snapshot;
}

async function resolveRootLinkContexts(actor, kind, publicView) {
  const key = linkKindConfig(kind)?.rootField || "";
  const refs = key ? getHollowRootList(actor, key) : [];
  return await resolveHollowLinkContexts(refs, kind, { actor, publicView });
}

async function resolveSceneLinkContexts(scene, { publicView }) {
  const entries = await Promise.all(LINK_KIND_ENTRIES.map(async ([kind, config]) => [
    config.publicField,
    await resolveHollowLinkContexts(scene?.[config.sceneField], kind, { publicView })
  ]));
  return Object.fromEntries(entries);
}

function publicSceneLinksContext(snapshot) {
  return Object.fromEntries(LINK_KIND_ENTRIES.map(([kind, config]) => [
    config.publicField,
    publicSnapshotLinks(snapshot?.[config.publicField], kind)
  ]));
}

async function resolveHollowLinkContexts(refs, kind, { actor = null, publicView = false } = {}) {
  const list = Array.isArray(refs) ? refs : [];
  if (publicView) {
    const snapshots = getPublicLinkList(actor, kind);
    return list
      .map((ref) => snapshots.find((entry) => String(entry?.ref || "") === String(ref || "")))
      .filter(Boolean)
      .map((entry) => publicSnapshotLinkContext(entry, kind));
  }

  const links = await Promise.all(list.map(async (ref) => ({
    ref: String(ref || ""),
    doc: await resolveHollowsLinkedDocument(kind, ref)
  })));
  const publicRefs = actor ? new Set(getPublicLinkList(actor, kind).map((entry) => String(entry?.ref || ""))) : new Set();
  return links.filter((link) => link.ref && link.doc).map(({ ref, doc }) => ({
    ...linkedDocumentContext(kind, ref, doc),
    revealed: publicRefs.has(String(ref || ""))
  }));
}

function linkedDocumentContext(kind, ref, doc) {
  return enrichLinkedContext(kind, {
    ref,
    id: doc.id,
    uuid: doc.uuid,
    name: doc.name,
    img: doc.img,
    system: linkKindConfig(kind)?.systemFields?.(doc.system) || {}
  });
}

function publicSnapshotLinks(entries, kind) {
  return (Array.isArray(entries) ? entries : []).map((entry) => publicSnapshotLinkContext(entry, kind));
}

function publicSnapshotLinkContext(entry, kind) {
  return enrichLinkedContext(kind, publicContextSnapshot(entry));
}

function publicLinkedDocumentSnapshot(kind, ref, doc) {
  return publicContextSnapshot(linkedDocumentContext(kind, ref, doc));
}

function publicContextSnapshot(context) {
  return {
    ref: String(context?.ref || ""),
    id: String(context?.id || ""),
    uuid: String(context?.uuid || ""),
    name: String(context?.name || ""),
    img: String(context?.img || ""),
    system: foundry.utils.duplicate(context?.system || {})
  };
}

function enrichLinkedContext(kind, context) {
  const systemFields = linkKindConfig(kind)?.systemFields;
  return systemFields ? { ...context, ...systemFields(context.system) } : context;
}

function hazardSystemFields(system = {}) {
  return {
    notes: String(system?.notes || ""),
    stat: String(system?.stat || ""),
    tn: Number(system?.tn ?? 0),
    targetMode: String(system?.targetMode || ""),
    damageSuccessResolve: Number(system?.damageSuccessResolve ?? 0),
    damageFailureWounds: Number(system?.damageFailureWounds ?? 0),
    doomOnFailure: Number(system?.doomOnFailure ?? 0)
  };
}

function entitySystemFields(system = {}) {
  return {
    description: String(system?.description || ""),
    defences: foundry.utils.duplicate(system?.defences || {}),
    health: foundry.utils.duplicate(system?.health || EMPTY_HEALTH)
  };
}

function thrallSystemFields(system = {}) {
  return {
    notes: String(system?.notes || ""),
    stat: String(system?.stat || ""),
    tn: Number(system?.tn ?? 0),
    damage: foundry.utils.duplicate(system?.damage || { resolve: 0, wounds: 0 }),
    health: foundry.utils.duplicate(system?.health || EMPTY_HEALTH)
  };
}

function textSystemFields(system = {}) {
  return { text: String(system?.text || "") };
}

function relicSystemFields(system = {}) {
  const effect = system?.upgraded ? system?.cypher || {} : system;
  return { text: String(effect?.text || "") };
}

function getPublicLinkList(actor, kind) {
  const field = linkKindConfig(kind)?.publicField || "";
  const list = field ? actor?.system?.publicLinks?.[field] : [];
  return Array.isArray(list) ? foundry.utils.duplicate(list) : [];
}

export async function addHollowRootDoc(actor, kind, ref) {
  const key = linkKindConfig(kind)?.rootField || "";
  if (!key) return;
  const current = getHollowRootList(actor, key);
  await actor.update({ [key]: addLinkedRef(current, ref) });
}

export async function removeHollowRootDoc(actor, kind, ref) {
  const key = linkKindConfig(kind)?.rootField || "";
  if (!key) return;
  await actor.update({ [key]: removeLinkedRef(getHollowRootList(actor, key), ref) });
}

function getHollowRootList(actor, key) {
  const current = foundry.utils.getProperty(actor.system, key.replace("system.", ""));
  return Array.isArray(current) ? [...current] : [];
}

function addLinkedRef(currentRaw, ref) {
  const current = Array.isArray(currentRaw) ? [...currentRaw] : [];
  const key = String(ref || "");
  if (key && !current.includes(key)) current.push(key);
  return current;
}

function removeLinkedRef(currentRaw, ref) {
  const current = Array.isArray(currentRaw) ? currentRaw : [];
  const key = String(ref || "");
  return current.filter((entry) => String(entry || "") !== key);
}
