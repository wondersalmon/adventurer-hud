import { createCombatItemRenderer } from "./combat-items.js";
import { createCombatResourceController } from "./combat-resources.js";
import { createCombatStatusRenderer } from "./combat-statuses.js";

export function createCombatRenderer(context) {
  const {
    actor,
    actorHeader,
    adapter,
    abilityChecksSection,
    canRollActor,
    DialogV2,
    escapeHTML,
    formatMod,
    getCombatant,
    hudState,
    inspirationControl,
    modeNavigation,
    savingThrowsSection,
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

    return `
        <div
          id="ws-combat"
          class="ws-view ws-combat-view"
        >
          ${actorHeader(`${combatInitiative()}${inspirationControl()}`)}

          ${modeNavigation("combat")}

          <div class="ws-combat-heading">
            <span>
              <i class="fa-solid fa-shield-halved"></i>
              ${t("Labels.Combat")}
            </span>

            ${isTurn ? `<b>${t("Combat.YourTurn")}</b>` : ""}
          </div>

          <div class="ws-combat-stats ${visibility.combatStats ? "" : "ws-hidden"}">
            <button
              type="button"
              class="ws-combat-stat ws-combat-hp ws-editable-stat ws-button"
              data-action="edithp"
              data-hp-field="value"
              title="${t("Combat.EditHP")}"
              ${canRollActor ? "" : "disabled"}
            >
              <span>${t("Combat.HP")}</span>
              <strong>
                ${Number(hp.value ?? 0)} / ${Number(hp.max ?? 0)}
              </strong>
              <i class="fa-solid fa-pen"></i>
            </button>

            <button
              type="button"
              class="ws-combat-stat ws-combat-temp-hp ws-editable-stat ws-button"
              data-action="edithp"
              data-hp-field="temp"
              title="${t("Combat.EditTempHP")}"
              ${canRollActor ? "" : "disabled"}
            >
              <span>${t("Combat.TempHP")}</span>
              <strong>${Number(hp.temp ?? 0)}</strong>
              <i class="fa-solid fa-pen"></i>
            </button>

            ${
              Number(hp.tempmax ?? 0) !== 0
                ? `
                  <div class="ws-combat-stat ws-combat-temp-max">
                    <span>${t("Combat.TempMax")}</span>
                    <strong>${formatMod(hp.tempmax)}</strong>
                  </div>
                `
                : ""
            }

            <div class="ws-combat-stat">
              <span>${t("Combat.AC")}</span>
              <strong>${ac}</strong>
            </div>

            <div class="ws-combat-stat">
              <span>${t("Combat.Speed")}</span>
              <strong>${speed}${units ? ` ${escapeHTML(units)}` : ""}</strong>
            </div>

          </div>

          ${combatResources()}

          ${combatStatuses()}

          ${favoriteSection()}

          ${
            visibility.abilityChecks
              ? `
                <div class="ws-divider"></div>
                <div class="ws-ability-table">
                  ${abilityChecksSection("combat")}
                </div>
              `
              : ""
          }

          ${
            visibility.savingThrows
              ? `
                <div class="ws-divider"></div>
                <div class="ws-ability-table">
                  ${savingThrowsSection("combat")}
                </div>
              `
              : ""
          }

          ${combatActions()}

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
