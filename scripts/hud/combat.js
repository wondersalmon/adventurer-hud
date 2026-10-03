import { createCombatStatusRenderer } from "./combat-statuses.js";
import { renderHealthBar } from "./health-bar.js";
import { renderDeathSaveControl } from "./death-save-control.js";
import {
  defeated,
  hasPlayerOwner,
  renderGmEndCombatButton
} from "./gm/gm-combat.js";
import { getSetting, SETTINGS } from "../settings-access.js";

export function createCombatRenderer(context) {
  const {
    actor,
    actorHeader,
    adapter,
    abilitiesSection,
    canRollActor = false,
    canRollDeathSave,
    companionNavigation,
    companionSection,
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
    gmInitiativeButtons,
    hudState,
    inspirationControl,
    modeNavigation,
    shortcutHint,
    showInitiative = false,
    t,
    visibility
  } = context;

  const canAct = () => Boolean(actor?.isOwner ?? canRollActor);

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

    if (!combatant && !showInitiative) {
      return "";
    }

    const rolled = combatant?.initiative != null;

    return `
        <button
          type="button"
          class="ws-header-initiative ws-button ${rolled ? "" : "ws-unrolled"}"
          data-action="initiative"
          title="${!combatant ? t("Initiative.NotCombatant") : rolled ? t("Initiative.Rolled") : t("Initiative.Roll")}"
          ${!combatant || rolled || !canAct() ? "disabled" : ""}
        >
          <span>${t("Labels.Initiative")}</span>
          <strong>${rolled ? combatant.initiative : "—"}</strong>
        </button>
      `;
  };

  const healthBar = (hp = adapter.combatStats(actor).hp) =>
    renderHealthBar({
      hp,
      canEdit: canAct(),
      formatMod,
      t
    });

  const healthPanel = (hp = adapter.combatStats(actor).hp) => `
    <div class="ws-health-stack">
      ${healthBar(hp)}
      ${actor.type === "npc" || gmHeader ? "" : renderDeathSaveControl({ canRoll: canRollDeathSave(), canRollActor: canAct(), death: deathData(), t })}
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
      if (!getCombatState().combat?.started) {
        return `<div id="ws-combat" class="ws-view ws-combat-view">${gmHeader()}</div>`;
      }
      const legendaryActions = adapter.npcResource(actor, "legact");
      const movement = adapter.npcMovement(actor);
      const resistanceUsage = legendaryResistance
        ? adapter.legendaryResistanceUsage?.(actor)
        : null;
      return `<div id="ws-combat" class="ws-view ws-combat-view ws-gm-view ${deadTurn ? "ws-gm-dead" : ""}">
        <div class="ws-gm-content">
        <div class="ws-gm-selection-summary"><strong>${escapeHTML(actor.name)}</strong><span>${t("Combat.HP")} ${hp.value}/${hp.max}${hp.temp ? ` +${hp.temp}` : ""}</span></div>
        ${gmHeader()}
        <div class="ws-gm-body">
          <section class="ws-gm-info">
            <div class="ws-gm-identity"><img class="ws-gm-selected-portrait" src="${escapeHTML(gmCombatant?.token?.texture?.src || actor.img || "icons/svg/mystery-man.svg")}" alt="${escapeHTML(actor.name)}"><strong>${escapeHTML(actor.name)}</strong><div class="ws-gm-identity-actions"><button type="button" class="ws-button" data-action="gmrollinitiative" data-scope="selected" data-reroll="true" title="${t("GM.RerollSelectedInitiative")}" aria-label="${t("GM.RerollSelectedInitiative")}"><i class="fa-solid fa-rotate" aria-hidden="true"></i></button><button type="button" class="ws-button" data-action="gmresetcombatantinitiative" data-reset-initiative-id="${escapeHTML(gmCombatant?.id)}" title="${t("GM.ResetInitiative")}" aria-label="${t("GM.ResetInitiative")}" ${gmCombatant?.initiative != null ? "" : "disabled"}><i class="fa-solid fa-eraser" aria-hidden="true"></i></button>${defeated(gmCombatant) ? `<button type="button" class="ws-button ws-gm-remove-selected" data-action="gmremove" title="${t("GM.RemoveCreature")}" aria-label="${t("GM.RemoveCreature")}" ${actor.type === "character" || hasPlayerOwner(gmCombatant) ? "disabled" : ""}><i class="fa-solid fa-skull" aria-hidden="true"></i></button>` : ""}<button type="button" class="ws-button" data-action="gmsheet" title="${t("Actor.OpenSheet")}">${t("GM.Sheet")} ↗</button></div></div>
            <div class="ws-combat-stats">${healthPanel(hp)}<div class="ws-combat-stat"><span>${t("Combat.AC")}</span><strong>${ac}</strong></div>${combatInitiative()}${movement.secondary ? `<button type="button" class="ws-combat-stat ws-gm-speed" data-action="gmspeeds" aria-expanded="${Boolean(hudState.gmSpeedsExpanded)}"><span>${t("Combat.Speed")} ▾</span><strong>${escapeHTML(movement.primary)}</strong></button>` : `<div class="ws-combat-stat"><span>${t("Combat.Speed")}</span><strong>${escapeHTML(movement.primary)}</strong></div>`}</div>
            ${movement.secondary ? `<div class="ws-gm-secondary-speed" ${hudState.gmSpeedsExpanded ? "" : "hidden"}>${escapeHTML(movement.secondary)}</div>` : ""}
            ${gmSaves?.() ?? ""}
            <div class="ws-gm-resources">${[
              [legendaryResistance, "GM.LegendaryResistances", "resistance"],
              [legendaryActions, "GM.LegendaryActions", "actions"]
            ]
              .filter(([resource]) => resource)
              .map(([resource, title, kind]) => {
                const control =
                  kind === "actions"
                    ? visibility.filterActions !== false
                      ? `data-action="gmlegendary" aria-expanded="${Boolean(hudState.gmLegendaryExpanded)}"`
                      : "disabled"
                    : resistanceUsage
                      ? `data-action="useactivity" data-item-id="${escapeHTML(resistanceUsage.itemId)}" data-activity-id="${escapeHTML(resistanceUsage.activityId)}"`
                      : "disabled";
                return `<button type="button" class="ws-gm-resource ws-button" ${control}><span>${t(title)}${kind === "actions" && visibility.filterActions !== false ? " ▾" : ""}</span><strong>${resource.value}/${resource.max}</strong>${resource.max <= 10 ? `<span class="ws-gm-resource-dots" aria-hidden="true">${Array.from({ length: resource.max }, (_, index) => `<i class="${index < resource.value ? "ws-filled" : ""}"></i>`).join("")}</span>` : ""}</button>`;
              })
              .join(
                ""
              )}${visibility.filterActions !== false && legendaryActions && hudState.gmLegendaryExpanded ? `<div class="ws-gm-legendary-list">${gmSpecialActions?.("legendary") ?? ""}</div>` : ""}</div>
            ${traits.length ? `<div class="ws-gm-traits">${traits.map(trait => `<div><b>${t(trait.title)}</b><span>${escapeHTML(trait.text)}${trait.bypasses ? ` (${t("GM.BypassedBy")}: ${escapeHTML(trait.bypasses)})` : ""}</span></div>`).join("")}</div>` : ""}
            ${combatStatuses()}
            ${visibility.filterActions !== false && !legendaryActions ? (gmSpecialActions?.("legendary") ?? "") : ""}
            ${visibility.filterActions !== false ? (gmSpecialActions?.("lair") ?? "") : ""}
          </section>
          <section class="ws-gm-action-column">${combatActions()}</section>
        </div>
        </div>
        <div class="ws-gm-tools">${gmTurnControls?.() ?? ""}<button type="button" class="ws-end-turn ws-button" data-action="endturn" ${getCombatState().combat?.started && getCombatState().combat?.combatant ? "" : "disabled"}><i class="fa-solid fa-forward-step" aria-hidden="true"></i>${t("Combat.EndTurn")}</button><div class="ws-gm-more"><button type="button" class="ws-gm-more-toggle" data-action="togglegmtools" aria-expanded="false" aria-controls="ws-gm-more-actions" id="ws-gm-more-toggle" title="${t("GM.MoreActions")}" aria-label="${t("GM.MoreActions")}"><i class="fa-solid fa-ellipsis" aria-hidden="true"></i></button><div class="ws-gm-more-actions" id="ws-gm-more-actions"><button type="button" class="ws-button" data-action="gmcenter"><i class="fa-solid fa-location-crosshairs" aria-hidden="true"></i>${t("GM.ToToken")}</button><button type="button" class="ws-button" data-action="gmping"><i class="fa-solid fa-tower-broadcast" aria-hidden="true"></i>${t("GM.Ping")}</button>${gmInitiativeButtons?.() ?? ""}${gmRemovalButton?.() ?? ""}${renderGmEndCombatButton(getCombatState().combat, t)}</div></div></div>
      </div>`;
    }

    return `
        <div
          id="ws-combat"
          class="ws-view ws-combat-view"
        >
          ${actorHeader(`<div class="ws-actor-quick-controls">${combatInitiative()}${inspirationControl()}</div>`)}

          ${modeNavigation("combat")}
          ${companionNavigation?.() ?? ""}

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
          ${companionSection?.() ?? ""}
          ${isTurn ? `<div class="ws-combat-heading ws-current-turn"><div class="ws-turn-controls"><b>${t("Combat.YourTurn")}</b>${canEndTurn ? `<button type="button" class="ws-end-turn ws-button" data-action="endturn" aria-label="${t("Combat.EndTurn")}"><i class="fa-solid fa-forward-step" aria-hidden="true"></i>${t("Combat.EndTurn")}</button>` : ""}</div></div>` : ""}
          ${combatStatuses()}

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
