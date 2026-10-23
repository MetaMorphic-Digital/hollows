import { getContentPacks } from "../../helpers/extensions.js";

/** Collect the system weapon pack and weapon packs registered by content modules. */
export function getWeaponsPacks() {
  return [
    game.packs.get("hollows.weapons") ||
      game.packs.find((p) => (p.metadata?.package === "hollows") && (p.metadata?.name === "weapons")),
    ...getContentPacks("weapons").map((id) => game.packs.get(id)),
  ].filter(Boolean);
}

/** Load Weapon items from the registered weapon packs. */
export async function getWeaponPackDocs() {
  const packDocs = await Promise.all(getWeaponsPacks().map((p) => p.getDocuments()));
  return packDocs.flat().filter((d) => d.type === "weapon");
}
