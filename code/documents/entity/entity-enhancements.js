import { getEntityEnhancementItems } from "../../data/entity/resolvers.js";
import { getContentPacks } from "../../helpers/extensions.js";
import {
  configureEnhancementBuilder,
  getBuilderActionChoiceLabel,
  getBuilderEligibleActionFilter,
  getBuilderGeneratedAbility,
  runEnhancementBuilderHook
} from "./enhancement-builder.js";

async function runActiveEntityEnhancementHook(entityActor, hookName, context = {}) {
  if (!entityActor || entityActor.type !== "entity") return [];
  const results = [];
  for (const enhancementItem of getEntityEnhancementItems(entityActor)) {
    for (const result of await runEnhancementBuilderHook(enhancementItem, hookName, { entityActor, enhancementItem, ...context })) {
      if (result !== undefined) results.push(result);
    }
  }
  return results;
}

export async function maybeRunEntityAttackEnhancementGate(entityActor, context = {}) {
  const results = await runActiveEntityEnhancementHook(entityActor, "beforeEntityAttack", context);
  return { cancelled: results.some((result) => result?.cancelled) };
}

export async function initEntityAttackGroup(entityActor, groupId, { targetCount = 0, rule = "" } = {}) {
  const count = Number(targetCount) || 0;
  const enhancementId = String(rule || "");
  if (!entityActor || !groupId || count <= 0 || !enhancementId) return;
  const groups = entityActor.getFlag("hollows", "attackOutcomeGroups") || {};
  await entityActor.setFlag("hollows", "attackOutcomeGroups", {
    ...groups,
    [groupId]: {
      targetCount: count,
      completedCount: 0,
      anyWoundDamage: false,
      rule: enhancementId
    }
  });
}

export async function recordEntityAttackOutcome(entityActor, groupId, { woundDamage = false } = {}) {
  if (!entityActor || !groupId) return;
  const groups = entityActor.getFlag("hollows", "attackOutcomeGroups") || {};
  const group = groups[groupId];
  if (!group) return;
  const completedCount = Number(group.completedCount ?? 0) + 1;
  const anyWoundDamage = !!group.anyWoundDamage || !!woundDamage;
  if (completedCount < Number(group.targetCount ?? 0)) {
    await entityActor.setFlag("hollows", "attackOutcomeGroups", {
      ...groups,
      [groupId]: { ...group, completedCount, anyWoundDamage }
    });
    return;
  }
  await entityActor.update({ [`flags.hollows.attackOutcomeGroups.-=${groupId}`]: null });
  for (const enhancementItem of getEntityEnhancementItems(entityActor)) {
    if (String(enhancementItem.id || "") !== group.rule) continue;
    await runEnhancementBuilderHook(enhancementItem, "onAttackResolved", { entityActor, enhancementItem, anyWoundDamage });
  }
}

export async function runEntityStartOfTurnEnhancements(entityActor) {
  await runActiveEntityEnhancementHook(entityActor, "onEntityStartTurn");
}

export async function runEntityWhenBrokenEnhancements(entityActor, { sourceHunter = null } = {}) {
  await runActiveEntityEnhancementHook(entityActor, "onEntityBroken", { sourceHunter });
}

export async function runEntityAfterHunterDamageEnhancements(entityActor, context = {}) {
  return runActiveEntityEnhancementHook(entityActor, "afterHunterDamage", context);
}

export async function maybeTriggerEntityInflictsDamageEnhancements(entityActor, targetActor, damageType, damageValue) {
  if (!entityActor || !targetActor || damageValue <= 0) return;
  await runActiveEntityEnhancementHook(entityActor, "onEntityInflictsDamage", {
    targetActor,
    damageType,
    damageValue
  });
}

export async function maybeTriggerEntitySuffersWoundEnhancements(entityActor) {
  await runActiveEntityEnhancementHook(entityActor, "onEntitySuffersWound");
}

function getGeneratedAbilityForEnhancement(enhancementItem) {
  const entityActor = enhancementItem.parent;
  if (!entityActor || entityActor.type !== "entity") return null;
  return entityActor.items.find((item) =>
    item.type === "entityAbility" &&
    String(item.getFlag("hollows", "generatedByEnhancement") || "") === String(enhancementItem.id || "")
  );
}

export async function deleteGeneratedEnhancementAbility(enhancementItem) {
  if (enhancementItem?.parent?.type !== "entity") return;
  const generated = getGeneratedAbilityForEnhancement(enhancementItem);
  if (!generated) return;
  await enhancementItem.parent.deleteEmbeddedDocuments("Item", [generated.id], { hollowsSkipGeneratedCleanup: true });
}

export async function syncGeneratedEnhancementAbility(enhancementItem) {
  const entityActor = enhancementItem.parent;
  if (!entityActor || entityActor.type !== "entity") return;
  const generatedData = getBuilderGeneratedAbility(enhancementItem);
  const existing = getGeneratedAbilityForEnhancement(enhancementItem);
  if (!generatedData) {
    if (existing) await deleteGeneratedEnhancementAbility(enhancementItem);
    return;
  }
  if (existing) {
    await existing.update({ name: generatedData.name, img: generatedData.img, system: generatedData.system, flags: generatedData.flags });
    return;
  }
  await entityActor.createEmbeddedDocuments("Item", [generatedData]);
}

export async function promptEntityEnhancementSelection() {
  const packs = getContentPacks("entity-enhancements").map((id) => game.packs.get(id)).filter(Boolean);
  const docs = (await Promise.all(packs.map((pack) => pack.getDocuments()))).flat();
  const items = docs
    .filter((doc) => doc.type === "entityEnhancement")
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  if (!items.length) { ui.notifications.warn("No Entity Enhancements available."); return null; }
  const options = items.map((doc) => `<option value="${doc.id}">${doc.name}</option>`).join("");
  return await foundry.applications.api.DialogV2.wait({
    window: { title: "Add Enhancement", width: 480 },
    content: `
        <form class="hollows-roll-dialog">
          <div class="form-group">
            <label>Enhancement</label>
            <select name="enhancementId">${options}</select>
          </div>
          <div class="form-group">
            <div class="muted" data-enhancement-meta></div>
          </div>
          <div class="form-group">
            <label>Preview</label>
            <div class="hollows-enhancement-preview" data-enhancement-desc></div>
          </div>
        </form>
      `,
    render: (_e, dialog) => {
      const el = dialog.element;
      const update = () => {
        const id = String(el.querySelector("[name=enhancementId]")?.value || "");
        const doc = items.find((item) => item.id === id);
        const category = String(doc?.system?.category || "default");
        const text = String(doc?.system?.text || "");
        el.querySelector("[data-enhancement-meta]").innerHTML = `<strong>${foundry.utils.escapeHTML(category)}</strong>`;
        el.querySelector("[data-enhancement-desc]").innerHTML = foundry.utils.escapeHTML(text).replace(/\n/g, "<br>");
      };
      el.querySelector("[name=enhancementId]").addEventListener("change", update);
      update();
    },
    rejectClose: false,
    buttons: [
      { action: "apply", label: "Add", default: true, callback: (_e, _b, dialog) => items.find((item) => item.id === String(dialog.element.querySelector("[name=enhancementId]")?.value || "")) || null },
      { action: "cancel", label: "Cancel", callback: () => null }
    ]
  }) ?? null;
}

export async function configureEntityEnhancementItem(entityActor, enhancementItem) {
  if (entityActor?.type !== "entity") return;
  const updateData = await configureEnhancementBuilder(enhancementItem);
  const eligibleAction = getBuilderEligibleActionFilter(enhancementItem);
  if (typeof eligibleAction === "function") {
    const eligibleActions = entityActor.items.filter(eligibleAction);
    if (eligibleActions.length) {
      const label = getBuilderActionChoiceLabel(enhancementItem);
      const actionOptions = eligibleActions.map((item) => `<option value="${item.id}">${foundry.utils.escapeHTML(item.name || "Ability")}</option>`).join("");
      const actionId = await foundry.applications.api.DialogV2.wait({
        window: { title: enhancementItem.name || "Configure Enhancement" },
        content: `
            <form class="hollows-roll-dialog">
              <div class="form-group">
                <label>${label}</label>
                <select name="actionId">${actionOptions}</select>
              </div>
            </form>
          `,
        rejectClose: false,
        buttons: [
          { action: "apply", label: "Apply", default: true, callback: (_e, _b, dialog) => String(dialog.element.querySelector("[name=actionId]")?.value || "") },
          { action: "cancel", label: "Skip", callback: () => "" }
        ]
      }) ?? "";
      const chosen = eligibleActions.find((item) => item.id === actionId);
      if (chosen) {
        updateData["flags.hollows.chosenActionId"] = chosen.id;
      }
    } else {
      ui.notifications.warn(`No eligible actions found for ${enhancementItem.name || "this Enhancement"}.`);
    }
  }
  if (Object.keys(updateData).length) await enhancementItem.update(updateData);
}
