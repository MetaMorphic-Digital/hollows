import { AttackRollModifier } from "../../../mechanics/AttackRollModifier.js";
import { makeShotgunForm } from "./base.js";

export const SHOTGUN_SAWN_OFF_FORM = makeShotgunForm({
  key: "Sawn-Off",
  name: "Sawn-Off",
  label: "Sawn-Off",
  text: "Roll with advantage when you attack\nfrom Close with the Shotgun.",
  damage: { resolve: 2, wounds: 2 },
  mechanics: [
    new AttackRollModifier({
      key: "shotgun.form.sawn-off",
      weapon: "Shotgun",
      name: "Sawn-Off",
      scope: "self",
      rollMode: "adv",
      triggers: { actorZoneType: "close" }
    })
  ]
});
