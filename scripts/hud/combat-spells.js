export function createCombatSpellRenderer({
  actor,
  adapter,
  combatItemButton,
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

        return `<span class="ws-spell-slots ${poolClass}" title="${label}: ${value}/${max}">${kind}${dots}<b>${value}/${max}</b></span>`;
      })
      .join("");
  };

  const spellGroups = items => {
    const filtered = hudState.preparedSpellsOnly
      ? items.filter(item => adapter.isPreparedSpell(item))
      : items;
    const levels = new Map();

    for (const item of new Map(
      filtered.map(item => [item.id ?? item, item])
    ).values()) {
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
                <div class="ws-spell-slot-pools">${spellSlots(level)}</div>
              </div>
              <div class="ws-combat-item-grid">
                ${spells.map(item => combatItemButton(item)).join("")}
              </div>
            </section>
          `
      )
      .join("");
  };
  return spellGroups;
}
