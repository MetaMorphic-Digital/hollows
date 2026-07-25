import { outcomeClassFromLabel } from "../../dice/roll-outcome.js";

export function buildStandardRollCardHtml({
  actorName,
  title,
  statLabel,
  statValue = null,
  tn,
  results,
  mode,
  chosen,
  useFocus = false,
  extraLines = [],
  footerHtml = "",
  subtitleHtml = ""
}) {
  const tnText = tn === null || Number.isNaN(tn) ? "-" : String(tn);
  const outcomeClass = outcomeClassFromLabel(chosen?.outcome?.label);
  const statText = statValue === null || statValue === undefined || statValue === ""
    ? `<strong>${statLabel}</strong>`
    : `<strong>${statLabel}</strong> ${statValue}`;
  const details = [
    `<div>TN: ${tnText}</div>`,
    useFocus ? `<div>Focus: spent for Advantage</div>` : "",
    `<div>Rolls: ${Array.isArray(results) ? results.join(", ") : ""}${mode === "normal" ? "" : ` (${mode})`}</div>`,
    `<div>Chosen: ${chosen?.value ?? ""}</div>`,
    `<div>Result: <strong>${chosen?.outcome?.label ?? ""}</strong></div>`,
    ...extraLines.filter(Boolean)
  ].filter(Boolean).join("");

  return `
    <div class="hollows-chat hollows-roll ${outcomeClass}">
      <div><strong>${actorName}</strong> ${title} (${statText})</div>
      ${subtitleHtml}
      ${details}
      ${footerHtml}
    </div>
  `;
}
