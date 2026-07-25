// Seeding functions for compendium packs that have no auto-seed mechanism.
// Each function checks if the target pack is empty and seeds it from the
// corresponding JSON file in code/data/seeds/ if so.

async function loadSeedJson(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return res.json();
  } catch (err) {
    console.warn(`Hollows | Failed to load seed data: ${url}`, err);
    return null;
  }
}

export async function seedPackIfEmpty(packKey, jsonPath, label) {
  if (!game.user?.isGM) return;
  const pack = game.packs.get(packKey);
  if (!pack) {
    console.warn(`Hollows | Pack not found: ${packKey}`);
    return;
  }
  const index = await pack.getIndex();
  if (index.size > 0) return;

  const docs = await loadSeedJson(jsonPath);
  if (!Array.isArray(docs) || !docs.length) {
    console.warn(`Hollows | No seed data for ${label}`);
    return;
  }

  // Unlock unconditionally: the client-side `pack.locked` cache can disagree
  // with the server (stale compendiumConfiguration), and the server is the one
  // that rejects the create.
  const wasLocked = pack.locked;
  try {
    await pack.configure({ locked: false });
    await pack.documentClass.createDocuments(docs, { pack: pack.collection, keepId: true });
    console.log(`Hollows | Seeded ${docs.length} ${label} entries`);
  } finally {
    if (wasLocked) await pack.configure({ locked: true });
  }
}

export async function ensureWeaponAbilitiesSeeded() {
  await seedPackIfEmpty("hollows.weapon-abilities", "systems/hollows/code/data/seeds/weapon-abilities.json", "weapon abilities");
}

export async function ensureWeaponsSeeded() {
  await seedPackIfEmpty("hollows.weapons", "systems/hollows/code/data/seeds/weapons.json", "weapons");
}
