import { OnAttackResultAction } from "../../../mechanics/OnAttackResultAction.js";
import { makeModifierChoices } from "../base-helpers.js";

const MODIFIER_CHOICES = makeModifierChoices("quick", "sharp", "hard");
const BASE_PROFILES = [{ defence: "Close", range: "Close", stat: "Quick" }];

export const BASE_KNIFE_BLEEDING = new OnAttackResultAction({
  key: "knife.form.base.bleeding",
  name: "Knife",
  result: "any",
  damageType: "Wounds",
  timing: "afterDamageApplied",
  weaponType: "Knife",
  handler: async (_actor, ctx) => {
    if (!game.user?.isGM) return {};
    const target = ctx?.targetActor;
    if (!target || (ctx?.targetType !== "entity")) return {};
    const { addCondition } = await import("../../../../documents/actor/conditions.js");
    if (target.statuses.has("bleeding")) return {};
    await addCondition(target, "bleeding");
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: target }),
      content: `<div class="hollows-chat"><strong>${target.name}</strong> begins <strong>Bleeding</strong>.</div>`,
    });
    return {};
  },
});

export function makeKnifeForm({ key, name, label, text, damage, attackProfileAdd, mechanics }) {
  const attackProfiles = attackProfileAdd
    ? [...BASE_PROFILES, attackProfileAdd]
    : BASE_PROFILES;
  return Object.freeze({
    key,
    weaponType: "Knife",
    name,
    label,
    text,
    damage,
    capacity: { max: 0, value: 0 },
    healthBonus: { resolve: 3, wounds: 3 },
    modifierChoices: MODIFIER_CHOICES,
    attackProfiles,
    ...(mechanics?.length ? { mechanics } : {}),
  });
}
