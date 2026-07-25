import { getTokenZone } from "../../canvas/zone.js";

const ENTITY_TEST_CARD_TEMPLATE = "systems/hollows/templates/chat/entity/test-card.html";
const ENTITY_DEFENCE_CARD_TEMPLATE = "systems/hollows/templates/chat/entity/defence-card.html";
const ENTITY_NOTICE_CARD_TEMPLATE = "systems/hollows/templates/chat/entity/notice-card.html";

function esc(value) {
  return foundry.utils.escapeHTML(String(value ?? ""));
}

async function renderCardTemplate(path, data) {
  const renderer = foundry?.applications?.handlebars?.renderTemplate || globalThis.renderTemplate;
  if (typeof renderer !== "function") {
    throw new Error(`Hollows | Template renderer is unavailable for ${path}.`);
  }
  return renderer(path, data);
}

export function getEntityActionWhisper(target) {
  if (!target) return ChatMessage.getWhisperRecipients("GM");
  return game.users
    .filter((u) => u.isGM || target.testUserPermission(u, "OWNER"))
    .map((u) => u.id);
}

async function renderEntityTestCardHtml({
  titleHtml,
  stat = "hard",
  tn = null,
  conditionText = "",
  effectText = "",
  detailsHtml = "",
  buttonLabel = "Roll Check"
} = {}) {
  const tnLabel = tn === null || tn === undefined || tn === "" ? "" : ` vs TN ${Number(tn)}`;
  return renderCardTemplate(
    ENTITY_TEST_CARD_TEMPLATE,
    {
      titleHtml: titleHtml || "Entity test",
      statLabel: esc(stat).toUpperCase(),
      tnLabel,
      conditionText: String(conditionText || ""),
      effectText: String(effectText || ""),
      detailsHtml,
      buttonLabel
    }
  );
}

export async function createEntityTestRequest({
  entityActor = null,
  target = null,
  targetToken = null,
  content = "",
  titleHtml = "",
  kind = "entityTest",
  testName = "Entity Test",
  stat = "hard",
  basicRollMode = "normal",
  tn = null,
  effectText = "",
  conditionText = "",
  detailsHtml = "",
  afterAttack = null,
  followUp = null,
  modifySelfDamage = null,
  targetZone = "",
  targetSnapshot = null,
  allowGM = false,
  move = null,
  buttonLabel = "Roll Check",
  whisper = null
} = {}) {
  const resolvedTargetZone = String(targetZone || (targetToken ? getTokenZone(targetToken) : "") || "");
  const entityTestData = {
    kind,
    targetId: target?.id || "",
    targetTokenUuid: targetToken?.document?.uuid ?? targetToken?.uuid ?? "",
    testName,
    stat,
    basicRollMode,
    tn,
    effectText,
    entityId: entityActor?.id || "",
    targetZone: resolvedTargetZone
  };
  if (afterAttack) entityTestData.afterAttack = afterAttack;
  if (followUp) entityTestData.followUp = followUp;
  if (modifySelfDamage) entityTestData.modifySelfDamage = modifySelfDamage;
  if (targetSnapshot) entityTestData.targetSnapshot = targetSnapshot;
  if (allowGM) entityTestData.allowGM = true;
  if (move) entityTestData.move = move;

  const cardContent = content || await renderEntityTestCardHtml({
    titleHtml,
    stat,
    tn,
    conditionText,
    effectText,
    detailsHtml,
    buttonLabel
  });

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: entityActor || undefined }),
    content: cardContent,
    whisper: whisper || getEntityActionWhisper(target),
    flags: { hollows: { entityTestData } }
  });
}

async function renderEntityNoticeCardHtml({
  titleHtml = "",
  text = "",
  bodyHtml = "",
  emptyText = "No text."
} = {}) {
  return renderCardTemplate(
    ENTITY_NOTICE_CARD_TEMPLATE,
    {
      titleHtml,
      text: String(text || ""),
      bodyHtml,
      emptyText
    }
  );
}

export async function createEntityNoticeCard({
  actor = null,
  titleHtml = "",
  text = "",
  bodyHtml = "",
  emptyText = "No text.",
  whisper = null,
  flavor = ""
} = {}) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: actor || undefined }),
    flavor,
    content: await renderEntityNoticeCardHtml({ titleHtml, text, bodyHtml, emptyText }),
    whisper
  });
}

async function renderEntityDefenceCardHtml({
  titleHtml,
  defenceStat = "hard",
  tn = 0,
  damageResolve = 0,
  damageWounds = 0,
  detailsHtml = ""
} = {}) {
  return renderCardTemplate(
    ENTITY_DEFENCE_CARD_TEMPLATE,
    {
      titleHtml: titleHtml || "Entity attack",
      defenceStatLabel: esc(defenceStat).toUpperCase(),
      tn: Number(tn) || 0,
      damageResolve: Number(damageResolve) || 0,
      damageWounds: Number(damageWounds) || 0,
      detailsHtml
    }
  );
}

export async function createEntityDefenceRequest({
  entityActor = null,
  target = null,
  targetToken = null,
  content = "",
  titleHtml = "",
  attackName = "Attack",
  defenceStat = "hard",
  basicDefenceMode = "normal",
  forceAdvantage = false,
  tn = 0,
  damageResolve = 0,
  damageWounds = 0,
  detailsHtml = "",
  attackData = {},
  whisper = null
} = {}) {
  const targetZone = String(attackData.targetZone || (targetToken ? getTokenZone(targetToken) : "") || "");
  const data = {
    attackName,
    defenceStat,
    basicDefenceMode,
    forceAdvantage: !!forceAdvantage,
    tn,
    damageResolve,
    damageWounds,
    targetId: target?.id || "",
    targetTokenUuid: targetToken?.document?.uuid ?? targetToken?.uuid ?? "",
    targetZone,
    entityId: entityActor?.id || "",
    ...attackData
  };

  const cardContent = content || await renderEntityDefenceCardHtml({
    titleHtml,
    defenceStat,
    tn,
    damageResolve,
    damageWounds,
    detailsHtml
  });

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: entityActor || undefined }),
    content: cardContent,
    whisper: whisper || getEntityActionWhisper(target),
    flags: {
      hollows: {
        defend: { open: true, applied: false },
        attackData: data
      }
    }
  });
}
