const ZERO_MODS = { hard: 0, quick: 0, sharp: 0, strong: 0, wise: 0 };

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

export function makeModifierChoices(stat1, stat2, negStat) {
  return [
    {
      label: `${cap(stat1)} +1 ${cap(stat2)} +1 ${cap(negStat)} -1`,
      modifiers: { ...ZERO_MODS, [stat1]: 1, [stat2]: 1, [negStat]: -1 },
      id: "c1"
    },
    {
      label: `${cap(stat1)} +2 ${cap(negStat)} -1`,
      modifiers: { ...ZERO_MODS, [stat1]: 2, [negStat]: -1 },
      id: "c2"
    },
    {
      label: `${cap(stat2)} +2 ${cap(negStat)} -1`,
      modifiers: { ...ZERO_MODS, [stat2]: 2, [negStat]: -1 },
      id: "c3"
    }
  ];
}
