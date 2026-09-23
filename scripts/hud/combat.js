import { createCombatItemRenderer } from "./combat-items.js";
import { createCombatResourceController } from "./combat-resources.js";
import { createCombatStatusRenderer } from "./combat-statuses.js";

export function createCombatRenderer(context) {
  const {
    actor,
    actorHeader,
    adapter,
    abilitiesSection,
    canRollActor,
    DialogV2,
    escapeHTML,
    formatMod,
    getCombatant,
    hudState,
    inspirationControl,
    modeNavigation,
    shortcutHint,
    t,
    tf,
    visibility
  } = context;

  const { changeResource, combatResources, openHpDialog, openResourceDialog } =
    createCombatResourceController({
      actor,
      adapter,
      DialogV2,
      escapeHTML,
      hudState,
      t,
      tf,
      visibility
    });

  const {
    combatActions,
    combatItemButton,
    combatItems,
    favoriteSection,
    inventoryCategories,
    inventoryItems,
    searchItems,
    searchControl,
    spellGroups
  } = createCombatItemRenderer({
    actor,
    adapter,
    escapeHTML,
    hudState,
    t,
    tf,
    visibility
  });

  const { combatStatuses } = createCombatStatusRenderer({
    actor,
    canRollActor,
    escapeHTML,
    tf,
    visibility
  });

  const combatInitiative = () => {
    const combatant = getCombatant();

    if (!visibility.initiative || !combatant) {
      return "";
    }

    const rolled = combatant.initiative != null;

    return `
        <button
          type="button"
          class="ws-header-initiative ws-button ${rolled ? "" : "ws-unrolled"}"
          data-action="initiative"
          title="${rolled ? t("Initiative.Rolled") : t("Initiative.Roll")}"
          ${rolled || !canRollActor ? "disabled" : ""}
        >
          <span>${t("Labels.Initiative")}</span>
          <strong>${rolled ? combatant.initiative : "—"}</strong>
        </button>
      `;
  };

  function combatHTML() {
    const combatant = getCombatant();
    const { ac, hp, speed, speedUnits: units } = adapter.combatStats(actor);
    const isTurn = game.combat?.combatant?.id === combatant?.id;
    const hpValue = Number(hp.value ?? 0);
    const hpMax = Number(hp.max ?? 0);
    const tempHp = Number(hp.temp ?? 0);
    const hpPercent =
      hpMax > 0 ? Math.min(100, Math.max(0, (hpValue / hpMax) * 100)) : 0;
    const barScale = Math.max(1, hpMax, hpValue + tempHp);
    const normalWidth = Math.max(0, (hpValue / barScale) * 100);
    const tempWidth = Math.max(0, (tempHp / barScale) * 100);
    const hpColor =
      hpPercent > 50
        ? "var(--success)"
        : `hsl(3 65% ${Math.round(35 + hpPercent * 0.3)}%)`;

    return `
        <div
          id="ws-combat"
          class="ws-view ws-combat-view"
        >
          ${actorHeader(`${combatInitiative()}${inspirationControl()}`)}

          ${modeNavigation("combat")}

          ${
            isTurn || !visibility.modeNavigation
              ? `
            <div class="ws-combat-heading">
              ${visibility.modeNavigation ? "" : `<span><i class="fa-solid fa-shield-halved"></i>${t("Labels.Combat")}</span>`}
              ${isTurn ? `<b>${t("Combat.YourTurn")}</b>` : ""}
            </div>`
              : ""
          }

          <div class="ws-combat-stats ${visibility.combatStats ? "" : "ws-hidden"}">
            <button type="button" class="ws-combat-health ws-button" data-action="edithp"
              title="${t("Combat.EditHP")}" ${canRollActor ? "" : "disabled"}>
              <span class="ws-health-label"><span>${t("Combat.HP")}</span><strong>${hpValue}/${hpMax}</strong>
                ${tempHp > 0 ? `<small>+${tempHp} ${t("Combat.TempHP")}</small>` : ""}
              </span>
              <span class="ws-health-track" aria-hidden="true">
                <span class="ws-health-fill" style="width: ${normalWidth}%; background: ${hpColor}"></span>
                <span class="ws-health-temp-fill" style="width: ${tempWidth}%"></span>
              </span>
              ${Number(hp.tempmax ?? 0) !== 0 ? `<small>${t("Combat.TempMax")} ${formatMod(hp.tempmax)}</small>` : ""}
            </button>

            <div class="ws-combat-stat">
              <span>${t("Combat.AC")}</span>
              <strong>${ac}</strong>
            </div>

            <div class="ws-combat-stat">
              <span>${t("Combat.Speed")}</span>
              <strong>${speed}${units ? ` ${escapeHTML(units)}` : ""}</strong>
            </div>

          </div>

          ${combatStatuses()}

          ${favoriteSection()}

          ${combatActions()}

          ${combatResources()}

          ${abilitiesSection("combat")}

          ${shortcutHint()}
        </div>
      `;
  }

  return {
    changeResource,
    combatActions,
    combatHTML,
    combatInitiative,
    combatItemButton,
    combatItems,
    favoriteSection,
    combatStatuses,
    inventoryCategories,
    inventoryItems,
    searchItems,
    searchControl,
    openHpDialog,
    openResourceDialog,
    spellGroups
  };
}
