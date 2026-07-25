export const STAT_LABELS = {
  strong: "Strong",
  hard: "Hard",
  quick: "Quick",
  sharp: "Sharp",
  wise: "Wise"
};

export const DEFENCE_LABELS = {
  close: "Close",
  ranged: "Ranged",
  wyrd: "Wyrd"
};

export const HOLLOWS_CONDITIONS = {
  focus: {
    id: "hollowsFocus",
    label: "Focus",
    icon: "systems/hollows/assets/status/focus.webp"
  },
  ready: {
    id: "hollowsReady",
    label: "Ready",
    icon: "systems/hollows/assets/status/ready.webp"
  },
  loaded: {
    id: "hollowsLoaded",
    label: "Loaded",
    icon: "systems/hollows/assets/status/loaded.webp"
  },
  bleeding: {
    id: "hollowsBleeding",
    label: "Bleeding",
    icon: "systems/hollows/assets/status/bleeding.webp"
  },
  elevated: {
    id: "hollowsElevated",
    label: "Elevated",
    icon: "systems/hollows/assets/elevated.webp",
    terrain: true,
    pooled: true
  },
  sheltered: {
    id: "hollowsSheltered",
    label: "Sheltered",
    icon: "systems/hollows/assets/sheltered.webp",
    terrain: true,
    pooled: true
  },
  dying: {
    id: "hollowsDying",
    label: "Dying",
    icon: "icons/svg/skull.svg"
  },
  dead: {
    id: "hollowsDead",
    label: "Dead",
    icon: "icons/svg/skull.svg"
  },
  anchored: {
    id: "hollowsAnchored",
    label: "Anchored",
    icon: "icons/svg/net.svg"
  },
  custom1: {
    id: "hollowsCustom1",
    label: "Custom",
    icon: "icons/svg/aura.svg"
  },
  custom2: {
    id: "hollowsCustom2",
    label: "Custom",
    icon: "icons/svg/aura.svg"
  }
};

export function registerCondition(key, def) {
  HOLLOWS_CONDITIONS[key] = def;
}
