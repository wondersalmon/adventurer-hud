export function renderDeathSaveControl({ canRoll, canRollActor, death, t }) {
  if (death.hp > 0) return "";

  if (death.failure >= 3) {
    return `<div class="ws-death-outcome" role="status">${t("Death.YouDied")}</div>`;
  }

  return `<button type="button" class="ws-death-roll ws-button"
    data-action="death" title="${canRoll ? t("Death.Roll") : t("Death.NotRequired")}"
    ${canRollActor && canRoll ? "" : "disabled"}>
    <span><i class="fa-solid fa-dice-d20" aria-hidden="true"></i>${t("Death.Roll")}</span>
    <i class="fa-solid fa-chevron-right ws-arrow" aria-hidden="true"></i>
  </button>`;
}
