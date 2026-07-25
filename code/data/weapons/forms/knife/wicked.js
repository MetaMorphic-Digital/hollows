import { OnAttackResultAction } from "../../../mechanics/OnAttackResultAction.js";
import { adjustHunterResource } from "../../../../documents/actor/resources.js";
import { makeKnifeForm, BASE_KNIFE_BLEEDING } from "./base.js";

const KNIFE_WICKED_HEAL = new OnAttackResultAction({
  key: "knife.form.wicked.heal",
  name: "Wicked",
  result: "any",
  damageType: "Wounds",
  timing: "afterDamageApplied",
  weaponType: "Knife",
  handler: async (actor) => {
    if (!actor || actor.type !== "hunter") return {};
    await adjustHunterResource(actor, { wounds: 1 });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="hollows-chat"><strong>${actor.name}</strong> heals <strong>1 Wound</strong> (Wicked).</div>`
    });
    return {};
  }
});

export const KNIFE_WICKED_FORM = makeKnifeForm({
  key: "Wicked",
  name: "Wicked",
  label: "Wicked",
  text: "When you inflict Wound damage\nwith this Weapon, heal 1 Wound.",
  damage: { resolve: 1, wounds: 3 },
  mechanics: [KNIFE_WICKED_HEAL, BASE_KNIFE_BLEEDING]
});
