export function applySetupRollButtonState(messageId, sr) {
  const buttons = document.querySelectorAll(`[data-message-id="${messageId}"] .hollows-setup-roll`);
  if (!buttons.length) return;
  const isPending = game.hollowsSetupRollPending?.has(messageId);
  for (const btn of buttons) {
    if (sr?.rolled) {
      btn.textContent = "Rolled";
      btn.disabled = true;
      btn.classList.add("disabled");
    } else if (sr?.rolling && !isPending) {
      btn.textContent = "Rolling...";
      btn.disabled = true;
      btn.classList.add("disabled");
    } else if (!sr?.rolling && !isPending) {
      btn.textContent = "Roll Setup";
      btn.disabled = false;
      btn.classList.remove("disabled");
    }
  }
}
