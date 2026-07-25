export function evaluateResult(rollValue, statValue, tn) {
  if (rollValue === 20) {
    return { label: "Critical Failure", rank: 0 };
  }
  if (rollValue === statValue) {
    return { label: "Critical Success", rank: 4 };
  }
  if (rollValue > statValue) {
    return { label: "Failure", rank: 1 };
  }
  if (tn === null || Number.isNaN(tn)) {
    return { label: "Success", rank: 2 };
  }
  if (rollValue < tn) {
    return { label: "Success", rank: 2 };
  }
  return { label: "Superior Success", rank: 3 };
}

export function chooseRollResult(results, statValue, tn, mode) {
  const outcomeFor = (value) => evaluateResult(value, statValue, tn);
  const outcomes = results.map((r) => ({ value: r, outcome: outcomeFor(r) }));
  let chosen = outcomes[0];
  if (mode === "adv") {
    chosen = outcomes.reduce((best, cur) => (cur.outcome.rank > best.outcome.rank ? cur : best), outcomes[0]);
  } else if (mode === "dis") {
    chosen = outcomes.reduce((worst, cur) => (cur.outcome.rank < worst.outcome.rank ? cur : worst), outcomes[0]);
  }
  return { chosen, outcomes };
}

export function outcomeClassFromLabel(label) {
  switch (label) {
    case "Critical Success":
      return "critical-success";
    case "Superior Success":
      return "superior-success";
    case "Success":
      return "success";
    case "Failure":
      return "failure";
    case "Critical Failure":
      return "critical-failure";
    default:
      return "neutral";
  }
}

export function isSuccessOutcomeLabel(label) {
  return label === "Success" || label === "Superior Success" || label === "Critical Success";
}

export function isFailureOutcomeLabel(label) {
  return label === "Failure" || label === "Critical Failure";
}
