// Connects external modules to the core system.

const CONTENT_PACKS = new Map();

export function registerContentPack(type, packId) {
  const list = CONTENT_PACKS.get(type) ?? [];
  if (!list.includes(packId)) list.push(packId);
  CONTENT_PACKS.set(type, list);
}

export function getContentPacks(type) {
  return CONTENT_PACKS.get(type) ?? [];
}

const SERVICES = new Map();

export function registerService(name, fn) {
  SERVICES.set(name, fn);
}

export function getService(name) {
  return SERVICES.get(name) || null;
}

const INTERCEPTORS = new Map();

export function registerInterceptor(event, fn) {
    const list = INTERCEPTORS.get(event) ?? [];
    list.push(fn);
    INTERCEPTORS.set(event, list);
}

export async function applyInterceptors(event, ctx, value) {
    for (const fn of INTERCEPTORS.get(event) ?? []) {
        value = await fn(ctx, value);
    }
    return value;
}

// For synchronous seams (document pre-hooks) where a returned Promise cannot veto.
export function applyInterceptorsSync(event, ctx, value) {
    for (const fn of INTERCEPTORS.get(event) ?? []) {
        value = fn(ctx, value);
    }
    return value;
}
