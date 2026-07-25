import { pickOne } from "./selection-dialogs.js";
import {
  getHollowLinkedDocuments,
  getHollowsDocumentRef
} from "../../documents/actor/hollow-links.js";

function titleCase(value) {
  const key = String(value || "");
  return key.charAt(0).toUpperCase() + key.slice(1);
}

export async function chooseHollowSceneKind() {
  const kind = await pickOne({
    title: "Scene Add",
    label: "Add to Scene",
    applyLabel: "Next",
    options: [
      { value: "hazard", label: "Hazard" },
      { value: "entity", label: "Entity" },
      { value: "thrall", label: "Thrall" },
      { value: "rumour", label: "Rumour" },
      { value: "relic", label: "Relic" }
    ]
  });
  return kind || "";
}

export async function chooseHollowSceneAddMode(kind) {
  const label = titleCase(kind);
  const mode = await pickOne({
    title: `Add ${label}`,
    label: `Add ${label}`,
    applyLabel: "Next",
    options: [
      { value: "existing", label: "Add Existing" },
      { value: "create", label: "Create" }
    ]
  });
  return mode === "existing" || mode === "create" ? mode : "";
}

export async function chooseHollowSceneIndex(scenes) {
  const list = Array.isArray(scenes) ? scenes : [];
  if (!list.length) return null;
  const value = await pickOne({
    title: "Choose Scene",
    label: "Scene",
    applyLabel: "Add",
    options: list.map((scene, index) => ({
      value: String(index),
      label: scene.name || `Scene ${index + 1}`
    }))
  });
  if (value === null) return null;
  const index = Number(value);
  return Number.isInteger(index) ? index : null;
}

export async function chooseHollowSceneAttach(sceneDoc, scenes) {
  const options = [{ value: "new", label: "Create New Scene" }];
  if (Array.isArray(scenes) && scenes.length) {
    options.push({ value: "existing", label: "Attach to Existing" });
  }
  const mode = await pickOne({
    title: "Scene Drop",
    label: "Attach this Scene to Hollow?",
    hint: sceneDoc?.name || "",
    applyLabel: "Choose",
    options
  });
  if (mode === "new") return { mode: "new" };
  if (mode !== "existing") return null;
  const index = await chooseHollowSceneIndex(scenes);
  return index === null ? null : { mode: "existing", index };
}

export async function chooseHollowLinkedDocument(kind, { returnRef = true } = {}) {
  const matches = getHollowLinkedDocuments(kind);
  if (!matches.length) {
    ui.notifications.warn(`No existing ${kind} documents found.`);
    return "";
  }
  const label = titleCase(kind);
  return await pickOne({
    title: `Select ${label}`,
    label,
    applyLabel: "Add",
    options: matches.map((doc) => ({
      value: returnRef ? getHollowsDocumentRef(doc) : doc.id,
      label: doc.name
    }))
  }) || "";
}
