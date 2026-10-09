import { activeEffectSummaries } from "./effect-summaries.js";

const statusPriority = kind => {
  if (kind === "concentrating") return 0;
  if (kind === "bloodied") return 1;
  return 2;
};

export function createCombatStatusRenderer({
  actor,
  adapter,
  escapeHTML,
  hudState,
  t
}) {
  let previousStatusIds = null;

  const configuredStatuses = () => {
    return adapter.statusDefinitions?.() ?? [];
  };

  const activeStatuses = () =>
    activeEffectSummaries(actor, configuredStatuses());

  const combatStatuses = () => {
    const kinds = new Map();
    const statusKind = status => {
      if (!kinds.has(status.id)) {
        const kind = adapter.statusKind?.(status);
        kinds.set(
          status.id,
          kind === "concentrating" || kind === "bloodied" ? kind : null
        );
      }
      return kinds.get(status.id);
    };
    const statuses = activeStatuses().sort(
      (left, right) =>
        statusPriority(statusKind(left)) - statusPriority(statusKind(right))
    );
    const currentStatusIds = new Set(statuses.map(status => status.id));
    const newStatusIds = new Set(
      previousStatusIds
        ? statuses
            .filter(status => !previousStatusIds.has(status.id))
            .map(status => status.id)
        : []
    );
    previousStatusIds = currentStatusIds;
    const statusLabel = status =>
      game.i18n.localize(status.name ?? status.label ?? status.id);
    const statusIcon = status =>
      status.img ?? status.icon ?? "icons/svg/aura.svg";

    if (!statuses.length) {
      return "";
    }

    const statusMarkup = status => {
      const label = statusLabel(status);
      const uuid = status.reference ?? status.uuid;
      const tooltip = uuid
        ? `<section class="loading" data-uuid="${escapeHTML(uuid)}"><i class="fas fa-spinner fa-spin-pulse"></i></section>`
        : label;
      const kind = statusKind(status);
      const classes = [
        "ws-status",
        kind && `ws-status-${kind}`,
        newStatusIds.has(status.id) && "ws-status-new"
      ]
        .filter(Boolean)
        .join(" ");
      return `
        <button type="button" class="${classes}" aria-label="${escapeHTML(label)}" aria-description="${escapeHTML(t("Combat.RemoveStatusHint"))}" data-status-id="${escapeHTML(status.id)}" data-tooltip="${escapeHTML(tooltip)}" ${uuid ? 'data-tooltip-class="dnd5e2 dnd5e-tooltip effect-tooltip" data-tooltip-direction="RIGHT"' : ""}>
          <img src="${escapeHTML(statusIcon(status))}" alt="">
        </button>
      `;
    };
    const expanded = Boolean(hudState.conditionsExpanded);

    return `
        <div class="ws-combat-statuses">
          <div class="ws-active-conditions">
            ${statuses.map(statusMarkup).join("")}
            <button type="button" class="ws-status-more ws-button ${newStatusIds.size ? "ws-status-new" : ""}" data-action="toggleconditions" hidden aria-expanded="${expanded}" aria-label="${t(expanded ? "Combat.HideConditions" : "Combat.ShowMoreConditions")}" title="${t(expanded ? "Combat.HideConditions" : "Combat.ShowMoreConditions")}">${expanded ? "−" : `+${statuses.length}`}</button>
          </div>
          <div class="ws-status-extra" hidden></div>
        </div>
      `;
  };

  return { combatStatuses };
}
