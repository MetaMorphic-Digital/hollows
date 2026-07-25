export function buildMoveOutcomeCardHtml({
  reason = "",
  moveType = "",
  subjectName = "",
  sourceZone = "",
  destinationZone = "",
  moves = []
}) {
  const esc = (value) => foundry.utils.escapeHTML(String(value ?? ""));
  const reasonText = esc(reason || "");
  const typeText = esc(moveType || "");
  const items = Array.isArray(moves) && moves.length
    ? moves
    : [{ subjectName, sourceZone, destinationZone }];
  const moveLines = items.map((move) => {
    const subjectText = esc(move?.subjectName || "");
    const fromZone = esc(move?.sourceZone || "Unknown");
    const toZone = esc(move?.destinationZone || "");
    return toZone
      ? `<div><strong>${subjectText}</strong>: ${fromZone} &rarr; ${toZone}</div>`
      : `<div><strong>${subjectText}</strong>: ${fromZone}</div>`;
  });

  return `
    <div class="hollows-chat hollows-roll hollows-move-card">
      ${typeText ? `<div><strong>${typeText}</strong></div>` : ""}
      ${reasonText ? `<div>${reasonText}</div>` : ""}
      ${moveLines.join("")}
    </div>
  `;
}
