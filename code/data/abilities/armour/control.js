import { Reaction } from "../../mechanics/Reaction.js";
import { ApplyToZone } from "../../mechanics/ApplyToZone.js";
import { EndOfTurnAction } from "../../mechanics/EndOfTurnAction.js";
import { runManoeuvre } from "../../actions/index.js";

export const CONTROL = new Reaction("control", {
  weapon: "Armour", tier: 1, name: "Control",
  promptOnPlayer: async ({ targetId, action }) => {
    const target = game.actors.get(targetId);
    await runManoeuvre(action, target);
    return { used: true };
  }
});

export const CONTROL_ACTIVE = new ApplyToZone({
  key: "armour.t1.control",
  weapon: "Armour", tier: 1,
  name: "Control",
  label: "Control: Grant Manoeuvre",
  text: "Expend Ready to grant an ally in your area an immediate Reload, Take Cover or Move manoeuvre.",
  cost: { condition: "ready" },
  targetSelection: { scope: "ally", zoneScope: "sameZone", count: 1 },
  subSelect: {
    name: "action",
    label: "Manoeuvre",
    options: [
      { value: "reload", label: "Reload" },
      { value: "take-cover", label: "Take Cover" },
      { value: "move", label: "Move" }
    ]
  },
  effects: [
    { type: "chatNotice", message: "<strong>{actor}</strong> expends <strong>Ready</strong> to grant <strong>{target}</strong> an immediate manoeuvre (Control)." },
    { type: "grantReaction", reaction: "control" }
  ]
});

export const CONTROL_EOT = new EndOfTurnAction({
  key: "armour.t1.control",
  weapon: "Armour", tier: 1,
  name: "Control",
  text: "You unravel the chaos of combat into reason. While you are Ready, when your turn ends, you may Shift 1 Threat in your or an adjacent area.",
  when: ({ actor }) => actor.statuses.has("ready"),
  effects: [
    { type: "controlShiftThreat" }
  ]
});
