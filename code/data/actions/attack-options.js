const ATTACK_OPTION_PROVIDERS = [];

export function registerAttackOptionProvider(provider) {
  if (typeof provider !== "function") return;
  if (!ATTACK_OPTION_PROVIDERS.includes(provider)) {
    ATTACK_OPTION_PROVIDERS.push(provider);
  }
}

export function getAttackOptions(actor, context = {}) {
  const options = [];
  for (const provider of ATTACK_OPTION_PROVIDERS) {
    const result = provider(actor, context);
    if (Array.isArray(result)) options.push(...result.filter(Boolean));
    else if (result) options.push(result);
  }
  return options;
}

export function renderAttackOptionHtml(options, context = {}) {
  return (Array.isArray(options) ? options : [])
    .map((option) => option?.dialogHtml?.(context) || "")
    .join("");
}

export function prepareAttackOptions(options, root, context = {}) {
  for (const option of Array.isArray(options) ? options : []) {
    option?.prepare?.(root, context);
  }
}

export async function applyAttackOptionBeforeRoll(options, root, actor, attackState, context = {}) {
  for (const option of Array.isArray(options) ? options : []) {
    await option?.beforeRoll?.(root, actor, attackState, context);
    if (attackState?.cancelled) break;
  }
}

export function applyAttackOptionDamageBonuses(options, root, actor, attackState, context = {}) {
  for (const option of Array.isArray(options) ? options : []) {
    option?.damageBonus?.(root, actor, attackState, context);
  }
}

export async function applyAttackOptionAfterDamage(options, root, actor, attackState, context = {}) {
  for (const option of Array.isArray(options) ? options : []) {
    await option?.afterDamage?.(root, actor, attackState, context);
  }
}
