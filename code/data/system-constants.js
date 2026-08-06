export const STAT_LABELS = {
  strong: "Strong",
  hard: "Hard",
  quick: "Quick",
  sharp: "Sharp",
  wise: "Wise",
};

export const DEFENCE_LABELS = {
  close: "Close",
  ranged: "Ranged",
  wyrd: "Wyrd",
};

export const HOLLOWS_CONDITIONS = {
  focus: {
    id: "focus",
    label: "Focus",
    icon: "systems/hollows/assets/status/focus.webp",
  },
  ready: {
    id: "ready",
    label: "Ready",
    icon: "systems/hollows/assets/status/ready.webp",
  },
  loaded: {
    id: "loaded",
    label: "Loaded",
    icon: "systems/hollows/assets/status/loaded.webp",
  },
  bleeding: {
    id: "bleeding",
    label: "Bleeding",
    icon: "systems/hollows/assets/status/bleeding.webp",
  },
  elevated: {
    id: "elevated",
    label: "Elevated",
    icon: "systems/hollows/assets/elevated.webp",
    terrain: true,
    pooled: true,
  },
  sheltered: {
    id: "sheltered",
    label: "Sheltered",
    icon: "systems/hollows/assets/sheltered.webp",
    terrain: true,
    pooled: true,
  },
  dying: {
    id: "dying",
    label: "Dying",
    icon: "icons/svg/skull.svg",
  },
  dead: {
    id: "dead",
    label: "Dead",
    icon: "icons/svg/skull.svg",
  },
  anchored: {
    id: "anchored",
    label: "Anchored",
    icon: "icons/svg/net.svg",
  },
  custom1: {
    id: "custom1",
    label: "Custom",
    icon: "icons/svg/aura.svg",
  },
  custom2: {
    id: "custom2",
    label: "Custom",
    icon: "icons/svg/aura.svg",
  },
};

export function registerCondition(key, def) {
  HOLLOWS_CONDITIONS[key] = def;
}
