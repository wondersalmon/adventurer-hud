import { createCombatItemRenderer } from "./combat-items.js";
import { createCombatResourceController } from "./combat-resources.js";
import { createCombatStatusRenderer } from "./combat-statuses.js";
import { renderHealthBar } from "./health-bar.js";
import { renderDeathSaveControl } from "./death-save-control.js";
import { getCurrentCombat } from "../runtime-helpers.js";

export function createCombatRenderer(context) {
  const {
    actor,
    actorHeader,
    adapter,
    abilitiesSection,
    canRollActor,
    canRollDeathSave,
    deathData,
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

  const {
    changeResource,
    combatResources,
    openHpDialog,
    openResourceDialog,
    openSpellSlotsDialog
  } = createCombatResourceController({
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
    canRollActor,
    escapeHTML,
    hudState,
    t,
    tf,
    visibility
  });

  const { combatStatuses } = createCombatStatusRenderer({
    actor,
    escapeHTML,
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

  const healthBar = (hp = adapter.combatStats(actor).hp) =>
    renderHealthBar({
      hp,
      canEdit: canRollActor,
      formatMod,
      t
    });

  const healthPanel = (hp = adapter.combatStats(actor).hp) => `
    <div class="ws-health-stack">
      ${healthBar(hp)}
      ${adapter.capabilities?.deathSaves ? renderDeathSaveControl({ canRoll: canRollDeathSave(), canRollActor, death: deathData(), t }) : ""}
    </div>
  `;

  function combatHTML() {
    const combatant = getCombatant();
    const {
      ac,
      hp,
      speed,
      speedUnits: units,
      proficiencyBonus
    } = adapter.combatStats(actor);
    const combat = getCurrentCombat(game);
    const isTurn = Boolean(
      combat?.started && combatant && combat.combatant?.id === combatant.id
    );

    return `
        <div
          id="ws-combat"
          class="ws-view ws-combat-view"
        >
          ${actorHeader(`${combatInitiative()}${inspirationControl()}`)}

          ${modeNavigation("combat")}

          ${
            isTurn
              ? `<div class="ws-combat-heading ws-current-turn">
              <div class="ws-turn-controls">
                <b>${t("Combat.YourTurn")}</b>
                ${canRollActor ? `<button type="button" class="ws-end-turn ws-button" data-action="endturn" title="${t("Combat.EndTurn")}" aria-label="${t("Combat.EndTurn")}"><i class="fa-solid fa-forward-step" aria-hidden="true"></i>${t("Combat.EndTurn")}</button>` : ""}
              </div>
            </div>`
              : ""
          }

          ${combatStatuses()}

          <div class="ws-combat-stats ${visibility.combatStats ? "" : "ws-hidden"}">
            ${healthPanel(hp)}

            <div class="ws-combat-stat">
              <span>${t("Combat.AC")}</span>
              <strong>${ac}</strong>
            </div>

            <div class="ws-combat-stat">
              <span>${t("Combat.Speed")}</span>
              <strong>${speed}${units ? ` ${escapeHTML(units)}` : ""}</strong>
            </div>

            ${
              proficiencyBonus == null
                ? ""
                : `<div class="ws-combat-stat" title="${t("Combat.ProficiencyBonus")}">
              <span>${t("Combat.ProficiencyBonusShort")}</span>
              <strong>${escapeHTML(proficiencyBonus === "—" ? "—" : formatMod(proficiencyBonus))}</strong>
            </div>`
            }

          </div>

          ${abilitiesSection("combat")}

          ${combatResources()}

          ${favoriteSection()}

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
    healthBar,
    healthPanel,
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
    openSpellSlotsDialog,
    spellGroups
  };
}
