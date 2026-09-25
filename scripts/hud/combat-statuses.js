export function createCombatStatusRenderer({ actor, escapeHTML, visibility }) {
  const configuredStatuses = () => {
    const statuses = Array.isArray(CONFIG.statusEffects)
      ? CONFIG.statusEffects
      : [...(CONFIG.statusEffects?.values?.() ?? [])];
    return statuses.filter(status => status?.id);
  };

  const activeStatuses = () => {
    const configured = configuredStatuses();
    const byId = new Map(configured.map(status => [status.id, status]));
    const statuses = new Map();

    for (const id of actor.statuses ?? []) {
      const status = byId.get(id) ?? { id, name: id };
      statuses.set(id, status);
    }

    for (const effect of actor.effects ?? []) {
      const effectStatuses = [...(effect.statuses ?? [])];

      if (effect.disabled || !effectStatuses.length) {
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
            effect.icon
        });
      }
    }

    return [...statuses.values()];
  };

  const combatStatuses = () => {
    if (!visibility.conditions) {
      return "";
    }

    const statuses = activeStatuses();
    const statusLabel = status =>
      game.i18n.localize(status.name ?? status.label ?? status.id);
    const statusIcon = status =>
      status.img ?? status.icon ?? "icons/svg/aura.svg";

    if (!statuses.length) {
      return "";
    }

    return `
        <div class="ws-combat-statuses">
          <div class="ws-active-conditions">
            ${statuses
              .map(status => {
                const label = statusLabel(status);

                return `
                  <span class="ws-status" role="img" aria-label="${escapeHTML(label)}" title="${escapeHTML(label)}">
                    <img src="${escapeHTML(statusIcon(status))}" alt="">
                  </span>
                `;
              })
              .join("")}
          </div>
        </div>
      `;
  };

  return { combatStatuses };
}
