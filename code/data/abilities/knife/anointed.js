import { EndOfTurnAction } from "../../mechanics/EndOfTurnAction.js";

export const ANOINTED = new EndOfTurnAction({
  key: "knife.t1.anointed",
  weapon: "Knife", tier: 1,
  name: "Anointed",
  text: "Daub your body in the blood of the beast. While the Entity is Bleeding and you are in Close, when your turn ends, restore 2 Resolve.",
  triggers: {
    actorZoneType: "close",
    entityHasCondition: "bleeding"
  },
  effects: [
    { type: "restoreResolve", amount: 2 },
    { type: "chatNotice", message: "<strong>{actor}</strong> restores <strong>2 Resolve</strong> (Anointed)." }
  ]
});
