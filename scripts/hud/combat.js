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
    const tempPercent =
      hpMax > 0 ? Math.min(100, Math.max(0, (tempHp / hpMax) * 100)) : 100;

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
            <div class="ws-combat-health ${hpMax > 0 && hpPercent <= 25 ? "ws-health-critical" : ""}">
              <button type="button" class="ws-health-main ws-button" data-action="edithp"
                data-hp-field="value" title="${t("Combat.EditHP")}" ${canRollActor ? "" : "disabled"}>
                <span>${t("Combat.HP")}</span>
                <strong>${hpValue} / ${hpMax}</strong>
                ${Number(hp.tempmax ?? 0) !== 0 ? `<small>${t("Combat.TempMax")} ${formatMod(hp.tempmax)}</small>` : ""}
              </button>
              <div class="ws-health-track" role="meter" aria-label="${t("Combat.HP")}" aria-valuemin="0"
                aria-valuenow="${Math.min(Math.max(0, hpValue), Math.max(1, hpMax))}" aria-valuemax="${Math.max(1, hpMax)}">
                <span style="width: ${hpPercent}%"></span>
              </div>
              <button type="button" class="ws-health-temp ws-button" data-action="edithp"
                data-hp-field="temp" title="${t("Combat.EditTempHP")}" ${canRollActor ? "" : "disabled"}>
                <span>${t("Combat.TempHP")}</span><strong>+${tempHp}</strong>
              </button>
              ${tempHp > 0 ? `<div class="ws-temp-track"><span style="width: ${tempPercent}%"></span></div>` : ""}
            </div>

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
