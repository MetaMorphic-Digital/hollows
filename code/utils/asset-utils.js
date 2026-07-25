export function getDefaultHollowsAssetImage(docType, name = "", category = "") {
  const typeKey = String(docType || "").trim().toLowerCase();
  if (typeKey === "thrall") return "systems/hollows/assets/thrall.webp";
  if (typeKey === "hazard") return "systems/hollows/assets/hazard.webp";
  if (typeKey === "relic") return "systems/hollows/assets/relic.webp";
  return "";
}

export function isGenericFoundryImage(path = "") {
  const value = String(path || "").trim().toLowerCase();
  if (!value) return true;
  return value.startsWith("icons/svg/") || value === "icons/mystery-man.svg";
}
