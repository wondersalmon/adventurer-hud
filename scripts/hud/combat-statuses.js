import { visibleEffectSummaries } from "./effect-summaries.js";

export function createCombatStatusRenderer({
  actor,
  adapter,
  escapeHTML,
  hudState,
  visibility = {},
  t
}) {
  let previousStatusIds = null;

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
    const statuses = visibleEffectSummaries(actor, adapter, visibility);
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

    if (!statuses.length && !hudState.hudEditing) return "";

    const statusMarkup = status => {
      const label = statusLabel(status);
      const uuid = status.reference ?? status.uuid;
      const kind = statusKind(status);
      const concentration =
        kind === "concentrating" ? adapter.concentrationSummary?.(actor) : null;
      const sources = concentration?.names?.length
        ? t("Combat.ConcentrationSources").replace(
            "{spells}",
            concentration.names.join(", ")
          )
        : "";
      const hint =
        actor.isOwner === false
          ? t("Warnings.NoPermission")
          : kind === "concentrating"
            ? t(
                concentration?.count > 1
                  ? "Combat.EndAllConcentrationHint"
                  : "Combat.EndConcentrationHint"
              ).replace("{count}", String(concentration?.count ?? 1))
            : t("Combat.RemoveStatusHint");
      // Native rich tooltip loading replaces its whole content. Use a complete
      // concentration tooltip so its source and removal warning remain visible.
      const tooltip =
        kind === "concentrating"
          ? `<strong>${escapeHTML(label)}</strong>${sources ? `<p>${escapeHTML(sources)}</p>` : ""}<p>${escapeHTML(hint)}</p>`
          : uuid
            ? `<section class="loading" data-uuid="${escapeHTML(uuid)}"><i class="fas fa-spinner fa-spin-pulse"></i></section>`
            : `${escapeHTML(label)}<p>${escapeHTML(hint)}</p>`;
      const classes = [
        "ws-status",
        kind && `ws-status-${kind}`,
        newStatusIds.has(status.id) && "ws-status-new"
      ]
        .filter(Boolean)
        .join(" ");
      return `
        <button type="button" class="${classes}" aria-label="${escapeHTML(label)}" aria-description="${escapeHTML([sources, hint].filter(Boolean).join(". "))}" data-status-id="${escapeHTML(status.id)}" data-tooltip="${escapeHTML(tooltip)}" ${uuid && kind !== "concentrating" ? 'data-tooltip-class="dnd5e2 dnd5e-tooltip effect-tooltip" data-tooltip-direction="RIGHT"' : ""}>
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
          ${hudState.hudEditing ? `<button type="button" class="ws-effect-filter-settings ws-button" data-action="effectsettings" title="${t("Settings.Groups.effects.Name")}" aria-label="${t("Settings.Groups.effects.Name")}"><i class="fa-solid fa-filter" aria-hidden="true"></i></button>` : ""}
          <div class="ws-status-extra" hidden></div>
        </div>
      `;
  };

  return { combatStatuses };
}
