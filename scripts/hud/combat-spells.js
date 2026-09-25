export function createCombatSpellRenderer({
  actor,
  adapter,
  canRollActor,
  combatItemButton,
  escapeHTML,
  hudState,
  t,
  tf
}) {
  const spellSlots = level => {
    if (level <= 0) {
      return `<span>${t("Combat.Cantrip")}</span>`;
    }

    const pools = adapter.spellSlots(actor, level);

    if (!pools.length) {
      return `<span>${t("Combat.NoSlots")}</span>`;
    }

    return pools
      .map(([value, max, pool]) => {
        const isPact = adapter.spellSlotKind?.(pool) === "pact";
        const dots =
          max <= 10
            ? Array.from(
                { length: max },
                (_, index) =>
                  `<i class="ws-slot ${index < value ? "ws-slot-filled" : ""}"></i>`
              ).join("")
            : "";

        const label = t(isPact ? "Combat.PactSlots" : "Combat.SpellSlots");
        const kind = `<span class="ws-slot-kind" aria-hidden="true">${t(isPact ? "Combat.PactSlotsShort" : "Combat.SpellSlotsShort")}</span>`;
        const poolClass = isPact ? "ws-pact-slots" : "";
        if (!pool || !canRollActor) {
          return `<span class="ws-spell-slots ${poolClass}" title="${label}: ${value}/${max}">${kind}${dots}<b>${value}/${max}</b></span>`;
        }

        return `<button type="button" class="ws-spell-slots ws-spell-slots-edit ws-button ${poolClass}"
          data-action="openspellslots" data-level="${level}" data-pool="${escapeHTML(pool)}"
          title="${t("Combat.EditSpellSlots")}: ${label} ${value}/${max}"
          aria-label="${t("Combat.EditSpellSlots")}: ${label} ${value}/${max}">
          ${kind}${dots}<b>${value}/${max}</b>
        </button>`;
      })
      .join("");
  };

  const spellGroups = items => {
    const filtered = hudState.preparedSpellsOnly
      ? items.filter(item => adapter.isPreparedSpell(item))
      : items;
    const levels = new Map();

    for (const item of filtered) {
      const level = adapter.spellLevel(item);
      const spells = levels.get(level) ?? [];
      spells.push(item);
      levels.set(level, spells);
    }

    return [...levels.entries()]
      .sort(([a], [b]) => a - b)
      .map(
        ([level, spells]) => `
            <section class="ws-spell-level">
              <div class="ws-spell-level-heading">
                <strong>${
                  level === 0
                    ? t("Combat.Cantrips")
                    : tf("Combat.SpellLevel", { level })
                }</strong>
                ${spellSlots(level)}
              </div>
              <div class="ws-combat-item-grid">
                ${spells.map(combatItemButton).join("")}
              </div>
            </section>
          `
      )
      .join("");
  };
  return spellGroups;
}
