import { createCombatStatusRenderer } from "./combat-statuses.js";
import { renderHealthBar } from "./health-bar.js";
import { renderDeathSaveControl } from "./death-save-control.js";
import { defeated } from "./gm-combat.js";
import { getSetting, SETTINGS } from "../settings.js";

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
    gmHeader,
    gmCombatant,
    gmSaves,
    gmSpecialActions,
    gmRemovalButton,
    gmTurnControls,
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
      ${actor.type === "npc" ? "" : renderDeathSaveControl({ canRoll: canRollDeathSave(), canRollActor, death: deathData(), t })}
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
    const legendaryResistance = gmHeader
      ? adapter.npcResource(actor, "legres")
      : null;
    const traits = gmHeader ? adapter.npcTraits(actor) : [];
    const deadTurn =
      gmHeader &&
      getSetting(SETTINGS.gmHighlightDead) &&
      isTurn &&
      defeated(gmCombatant);

    if (gmHeader) {
      const legendaryActions = adapter.npcResource(actor, "legact");
      const movement = adapter.npcMovement(actor);
      const resistanceUsage = legendaryResistance
        ? adapter.legendaryResistanceUsage?.(actor)
        : null;
      return `<div id="ws-combat" class="ws-view ws-combat-view ws-gm-view ${deadTurn ? "ws-gm-dead" : ""}">
        <div class="ws-gm-content">
        ${gmHeader()}
        <div class="ws-gm-body">
          <section class="ws-gm-info">
            <div class="ws-gm-identity"><strong>${escapeHTML(actor.name)}</strong><button type="button" class="ws-button" data-action="gmsheet" title="${t("Actor.OpenSheet")}">${t("GM.Sheet")} ↗</button></div>
            <div class="ws-combat-stats">${healthPanel(hp)}<div class="ws-combat-stat"><span>${t("Combat.AC")}</span><strong>${ac}</strong></div>${combatInitiative()}${movement.secondary ? `<button type="button" class="ws-combat-stat ws-gm-speed" data-action="gmspeeds" aria-expanded="${Boolean(hudState.gmSpeedsExpanded)}"><span>${t("Combat.Speed")} ▾</span><strong>${escapeHTML(movement.primary)}</strong></button>` : `<div class="ws-combat-stat"><span>${t("Combat.Speed")}</span><strong>${escapeHTML(movement.primary)}</strong></div>`}</div>
            ${movement.secondary ? `<div class="ws-gm-secondary-speed" ${hudState.gmSpeedsExpanded ? "" : "hidden"}>${escapeHTML(movement.secondary)}</div>` : ""}
            <div class="ws-gm-resources">${[
              [legendaryResistance, "GM.LegendaryResistances", "resistance"],
              [legendaryActions, "GM.LegendaryActions", "actions"]
            ]
              .filter(([resource]) => resource)
              .map(([resource, title, kind]) => {
                const control =
                  kind === "actions"
                    ? `data-action="gmlegendary" aria-expanded="${Boolean(hudState.gmLegendaryExpanded)}"`
                    : resistanceUsage
                      ? `data-action="useactivity" data-item-id="${escapeHTML(resistanceUsage.itemId)}" data-activity-id="${escapeHTML(resistanceUsage.activityId)}"`
                      : "disabled";
                return `<button type="button" class="ws-gm-resource ws-button" ${control}><span>${t(title)}${kind === "actions" ? " ▾" : ""}</span><strong>${resource.value}/${resource.max}</strong>${resource.max <= 10 ? `<span class="ws-gm-resource-dots" aria-hidden="true">${Array.from({ length: resource.max }, (_, index) => `<i class="${index < resource.value ? "ws-filled" : ""}"></i>`).join("")}</span>` : ""}</button>`;
              })
              .join(
                ""
              )}${legendaryActions && hudState.gmLegendaryExpanded ? `<div class="ws-gm-legendary-list">${gmSpecialActions?.("legendary") ?? ""}</div>` : ""}</div>
            ${traits.length ? `<div class="ws-gm-traits">${traits.map(trait => `<div><b>${t(trait.title)}</b><span>${escapeHTML(trait.text)}${trait.bypasses ? ` (${t("GM.BypassedBy")}: ${escapeHTML(trait.bypasses)})` : ""}</span></div>`).join("")}</div>` : ""}
            ${combatStatuses()}
          </section>
          <section class="ws-gm-action-column">${combatActions()}</section>
          <section class="ws-gm-special-column">${gmSpecialActions?.("lair") ?? ""}${gmSaves?.() ?? ""}</section>
        </div>
        </div>
        <div class="ws-gm-tools">${gmTurnControls?.() ?? ""}<button type="button" class="ws-button" data-action="gmcenter"><i class="fa-solid fa-location-crosshairs" aria-hidden="true"></i>${t("GM.ToToken")}</button><button type="button" class="ws-button" data-action="gmping"><i class="fa-solid fa-tower-broadcast" aria-hidden="true"></i>${t("GM.Ping")}</button>${gmRemovalButton?.() ?? ""}${deadTurn ? `<button type="button" class="ws-button" data-action="gmremove"><i class="fa-solid fa-trash" aria-hidden="true"></i>${t("GM.RemoveCreature")}</button>` : ""}<button type="button" class="ws-end-turn ws-button" data-action="endturn" ${canEndTurn ? "" : "disabled"}><i class="fa-solid fa-forward-step" aria-hidden="true"></i>${t("Combat.EndTurn")}</button></div>
      </div>`;
    }

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
