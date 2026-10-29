// Refuge action handlers and NPC roles.

const HANDLERS = new Map();

export function registerRefugeActionHandler(type, fn) {
  if (type && typeof fn === "function") HANDLERS.set(String(type), fn);
}

export function getRefugeActionHandler(type) {
  return HANDLERS.get(String(type || "")) || null;
}

// NPC roles surfaced on the refuge sheet.
const NPC_ROLES = [
  { key: "keeper", label: "Keeper" },
  { key: "doctor", label: "Doctor" },
  { key: "apprentice", label: "Apprentice" },
  { key: "smith", label: "Smith" },
  { key: "magus", label: "Magus" },
];

export function getRefugeNpcRoles() {
  return NPC_ROLES;
}
