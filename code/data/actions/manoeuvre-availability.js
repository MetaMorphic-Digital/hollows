const MANOEUVRE_AVAILABILITY_PROVIDERS = [];

export function registerManoeuvreAvailabilityProvider(provider) {
  if (typeof provider !== "function") return;
  if (!MANOEUVRE_AVAILABILITY_PROVIDERS.includes(provider)) {
    MANOEUVRE_AVAILABILITY_PROVIDERS.push(provider);
  }
}

export function getRegisteredManoeuvreAvailability(actor, manoeuvre, context = {}) {
  const ctx = { source: "granted", ...context };
  for (const provider of MANOEUVRE_AVAILABILITY_PROVIDERS) {
    const result = provider(actor, String(manoeuvre || ""), ctx);
    if (result?.available === false) {
      return { available: false, reason: result.reason || "" };
    }
  }
  return { available: true, reason: "" };
}
