import { scTurnLabel } from "../compatibility/sc-venaerys-initiative.js";

/** A visible phase summary; raw phase names and hidden DCs never reach markup. */
export function renderScPhaseStatus(sc, t, escapeHTML) {
  if (!sc) return "";
  const name = !sc.valid
    ? t("SC.Unavailable")
    : !sc.currentPhaseId
      ? t("SC.PhasedCombat")
      : (sc.currentName ?? t("SC.WaitingGm"));
  const half =
    sc.currentName && sc.half
      ? ` · ${t(sc.half === "move" ? "SC.Movement" : "SC.Actions")}`
      : "";
  const status = sc.isTurn ? ` · ${scTurnLabel(sc, t)}` : "";
  const extra = sc.extraTurn
    ? `<small class="ws-sc-extra">${escapeHTML(t("SC.ExtraTurn"))}</small>`
    : "";
  const progress = sc.progress
    ? `<small class="ws-sc-progress">${escapeHTML(t("SC.Progress").replace("{completed}", String(sc.progress.completed)).replace("{total}", String(sc.progress.total)))}</small>`
    : "";
  return `<div class="ws-sc-phase" role="status"><span>${escapeHTML(name + half + status)}${extra}${progress}</span><button type="button" class="ws-button" data-action="sctracker" title="${t("SC.OpenTracker")}" aria-label="${t("SC.OpenTracker")}"><i class="fa-solid fa-list" aria-hidden="true"></i>${t("SC.Tracker")}</button></div>`;
}
