import { createCombatStatusRenderer } from "./combat-statuses.js";
import { renderHealthBar } from "./health-bar.js";
import { renderDeathSaveControl } from "./death-save-control.js";

export function createCombatRenderer(context) {
  const {
    actor,
    actorHeader,
    adapter,
    abilitiesSection,
    canRollActor,
    canRollDeathSave,
    combatActions,
    deathData,
    escapeHTML,
    formatMod,
    favoriteSection,
    getCombatState,
    hudState,
    inspirationControl,
    modeNavigation,
    shortcutHint,
    t,
    visibility
  } = context;

  const { combatStatuses } = createCombatStatusRenderer({
    actor,
    adapter,
    escapeHTML,
    hudState,
    t,
    visibility
  });

  const combatInitiative = () => {
    const { combatant } = getCombatState();

    if (!combatant) {
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
      ${renderDeathSaveControl({ canRoll: canRollDeathSave(), canRollActor, death: deathData(), t })}
    </div>
  `;

  function combatHTML() {
    const { isTurn, canEndTurn } = getCombatState();
    const {
      ac,
      hp,
      speed,
      speedUnits: units,
      proficiencyBonus
    } = adapter.combatStats(actor);

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
                ${canEndTurn ? `<button type="button" class="ws-end-turn ws-button" data-action="endturn" aria-label="${t("Combat.EndTurn")}"><i class="fa-solid fa-forward-step" aria-hidden="true"></i>${t("Combat.EndTurn")}</button>` : ""}
              </div>
            </div>`
              : ""
          }

          ${combatStatuses()}

          <div class="ws-combat-stats">
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

          ${favoriteSection()}

          ${combatActions()}

          ${shortcutHint()}
        </div>
      `;
  }

  return {
    combatHTML,
    combatInitiative,
    healthPanel,
    combatStatuses
  };
}
