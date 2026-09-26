const VISIBLE_STATUS_LIMIT = 5;
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

  const activeStatuses = () => {
    const configured = configuredStatuses();
    const byId = new Map(configured.map(status => [status.id, status]));
    const statuses = new Map();

    for (const id of actor.statuses ?? []) {
      const status = byId.get(id) ?? { id, name: id };
      statuses.set(id, status);
    }

    for (const effect of typeof actor.allApplicableEffects === "function"
      ? actor.allApplicableEffects()
      : (actor.effects ?? [])) {
      const effectStatuses = [...(effect.statuses ?? [])];

      if (effect.disabled || effect.isSuppressed || !effectStatuses.length) {
        continue;
      }

      for (const id of effectStatuses) {
        const configuredStatus = byId.get(id) ?? {};
        statuses.set(id, {
          ...configuredStatus,
          id,
          name: configuredStatus.name ?? configuredStatus.label ?? effect.name,
          img:
            configuredStatus.img ??
            configuredStatus.icon ??
            effect.img ??
            effect.icon,
          description: effect.description ?? configuredStatus.description
        });
      }
    }

    return [...statuses.values()];
  };

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
      const summary =
        hudState.statusDescriptions?.get(status.id) ?? status.description;
      let description = "";
      if (summary) {
        const node = globalThis.document?.createElement?.("div");
        if (node) {
          node.innerHTML = String(summary);
          description = node.textContent.replace(/\s+/g, " ").trim();
        } else
          description = String(summary)
            .replace(/<[^>]*>/g, "")
            .replace(/\s+/g, " ")
            .trim();
        if (description.length > 300)
          description = `${description.slice(0, 297)}…`;
      }
      const tooltip = description ? `${label}\n${description}` : label;
      const kind = statusKind(status);
      const classes = [
        "ws-status",
        kind && `ws-status-${kind}`,
        newStatusIds.has(status.id) && "ws-status-new"
      ]
        .filter(Boolean)
        .join(" ");
      return `
        <span class="${classes}" role="img" aria-label="${escapeHTML(tooltip)}" title="${escapeHTML(tooltip)}">
          <img src="${escapeHTML(statusIcon(status))}" alt="">
        </span>
      `;
    };
    const remaining = statuses.slice(VISIBLE_STATUS_LIMIT);
    const expanded = Boolean(hudState.conditionsExpanded);

    return `
        <div class="ws-combat-statuses">
          <div class="ws-active-conditions">
            ${statuses.slice(0, VISIBLE_STATUS_LIMIT).map(statusMarkup).join("")}
            ${remaining.length ? `<button type="button" class="ws-status-more ws-button ${remaining.some(status => newStatusIds.has(status.id)) ? "ws-status-new" : ""}" data-action="toggleconditions" aria-expanded="${expanded}" aria-label="${t(expanded ? "Combat.HideConditions" : "Combat.ShowMoreConditions")}" title="${t(expanded ? "Combat.HideConditions" : "Combat.ShowMoreConditions")}">${expanded ? "−" : `+${remaining.length}`}</button>` : ""}
          </div>
          ${expanded && remaining.length ? `<div class="ws-status-extra">${remaining.map(statusMarkup).join("")}</div>` : ""}
        </div>
      `;
  };

  return { combatStatuses };
}
