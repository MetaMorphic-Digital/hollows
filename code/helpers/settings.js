// Item-borne scripts are arbitrary JS and run on every connected client, not
// just the GM's — hence off by default.
export const SETTINGS = {
  allowCustomScripts: "allowCustomScripts",
};

export function registerHollowsSettings() {
  game.settings.register("hollows", SETTINGS.allowCustomScripts, {
    name: "Allow Custom Mechanic Scripts",
    hint: "Weapons of Renown and Weapon Abilities may carry GM-written scripts. "
      + "Those scripts are JavaScript and run on every connected client, not just the GM's. "
      + "Enable only if you trust the source of your content.",
    scope: "world",
    config: true,
    requiresReload: true,
    type: Boolean,
    default: false,
  });
}

/** False before registration, so this is safe to call at any time. */
export function customScriptsAllowed() {
  try {
    return !!game.settings.get("hollows", SETTINGS.allowCustomScripts);
  } catch {
    return false;
  }
}
