// @ts-check
import { renderRecentActions } from "./recent-actions.js";
import { renderHudTarget } from "./target.js";

/** @param {Pick<import('../../types/hud.js').HudActionsOptions, 'visibility' | 'currentMode'>} options */
export function footerCenterMode({ visibility, currentMode }) {
  return currentMode?.() === "combat"
    ? (visibility?.combatFooterMode ?? "target")
    : (visibility?.explorationFooterMode ?? "recent");
}

/** @param {{actorContext: import('../../types/hud.js').ActorContext, adapter: import('../../types/hud.js').HudAdapter, toolState: {tools?: {id: string, name: string, img?: string}[]}, t: import('../../types/hud.js').Translate, escapeHTML: (value: unknown) => string, mode: string}} options */
export function renderFooterCenter(options) {
  const { actorContext, t, escapeHTML, mode } = options;
  if (mode === "target") return renderHudTarget(options);
  if (mode === "none")
    return `<div class="ws-footer-empty" role="group" aria-label="${escapeHTML(t("Footer.Disabled"))}"></div>`;
  return renderRecentActions({ ...options, actor: actorContext.actor });
}
