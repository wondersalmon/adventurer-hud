import { recordDiagnostic, diagnosticsRecording } from "../../diagnostics.js";
import { itemLayoutKey, renderItemLayout } from "./item-layout.js";
export function createCombatSpellRenderer({
  actor,
  adapter,
  combatItemButton,
  hudState,
  t,
  tf,
  escapeHTML,
  visibility
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

        return `<button type="button" class="ws-spell-slots ws-button ${poolClass}" data-action="editspellslots" data-spell-pool="${escapeHTML(pool)}" ${actor.isOwner ? "" : "disabled"} aria-label="${escapeHTML(label + ": " + value + "/" + max + " — " + t("Combat.EditSlots"))}" title="${escapeHTML(label + ": " + value + "/" + max + " — " + t("Combat.EditSlots"))}">${kind}${dots}<b>${value}/${max}</b></button>`;
      })
      .join("");
  };

  const spellGroups = items => {
    const filtersEnabled = visibility?.spellPreparation !== false;
    const sourceAvailable =
      filtersEnabled &&
      hudState.spellSource &&
      (adapter.spellSources?.(actor) ?? []).some(
        source => source.source === hudState.spellSource
      );
    const sourceItems = sourceAvailable
      ? items.filter(
          item => adapter.spellSourceId?.(item) === hudState.spellSource
        )
      : items;
    const filtered = !filtersEnabled
      ? items
      : hudState.unpreparedSpellsOnly
        ? sourceItems.filter(
            item =>
              adapter.spellPreparation?.(item)?.canPrepare &&
              !adapter.isPreparedSpell(item)
          )
        : hudState.preparedSpellsOnly
          ? sourceItems.filter(item => adapter.isPreparedSpell(item))
          : sourceItems;
    if (diagnosticsRecording())
      recordDiagnostic(
        "hud.cards.filter",
        {
          category: "spells",
          reason: "prepared-only",
          preparedOnly: filtersEnabled && hudState.preparedSpellsOnly,
          requested: items.length,
          processed: filtered.length
        },
        { detailed: true }
      );
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
            <details class="ws-spell-level" data-spell-level="${level}" open>
              <summary class="ws-spell-level-heading">
                <strong>${
                  level === 0
                    ? t("Combat.Cantrips")
                    : tf("Combat.SpellLevel", { level })
                }</strong>
                <div class="ws-spell-slot-pools">${spellSlots(level)}</div>
              </summary>
              ${renderItemLayout({ scope: `spells:${level}`, hudState, escapeHTML, t, entries: spells.map(item => ({ key: itemLayoutKey(item), name: item.name, html: combatItemButton(item) })) })}
            </details>
          `
      )
      .join("");
  };
  return spellGroups;
}
