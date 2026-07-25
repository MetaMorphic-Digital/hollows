const DEFENCE_OPTION_PROVIDERS = [];

export function registerDefenceOptionProvider(provider) {
  if (typeof provider !== "function") return;
  if (!DEFENCE_OPTION_PROVIDERS.includes(provider)) {
    DEFENCE_OPTION_PROVIDERS.push(provider);
  }
}

export function getDefenceOptions(actor, context = {}) {
  const options = [];
  for (const provider of DEFENCE_OPTION_PROVIDERS) {
    const result = provider(actor, context);
    if (Array.isArray(result)) options.push(...result.filter(Boolean));
    else if (result) options.push(result);
  }
  return options;
}

export function renderDefenceOptionHtml(options, context = {}) {
  return (Array.isArray(options) ? options : [])
    .map((option) => option?.dialogHtml?.(context) || "")
    .join("");
}

export async function applyDefenceOptionBeforeRoll(options, root, actor, defenceState, context = {}) {
  for (const option of Array.isArray(options) ? options : []) {
    await option?.beforeRoll?.(root, actor, defenceState, context);
  }
}

export async function applyDefenceOptionMitigation(actor, damageState = {}, context = {}) {
  const out = {
    damageType: damageState.damageType || "",
    damageValue: Math.max(0, Number(damageState.damageValue || 0)),
    notes: Array.isArray(damageState.notes) ? damageState.notes : [],
    suppressSheltered: !!damageState.suppressSheltered
  };
  const options = getDefenceOptions(actor, context);
  for (const option of options) {
    const result = await option?.mitigation?.(actor, out, context);
    if (!result) continue;
    if (result.damageValue != null) out.damageValue = Math.max(0, Number(result.damageValue || 0));
    if (result.note) out.notes.push(result.note);
    if (result.suppressSheltered) out.suppressSheltered = true;
  }
  return out;
}
