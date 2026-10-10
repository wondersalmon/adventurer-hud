import { createCombatStatusRenderer } from "./combat-statuses.js";
import { diceTrayButton } from "./components.js";
import { renderHealthBar } from "./health-bar.js";
import { renderDeathSaveControl } from "./death-save-control.js";
import {
  defeated,
  hasPlayerOwner,
  renderGmHiddenButton,
  renderGmDefeatedButton,
  renderGmRevealButton,
  renderGmEndCombatButton
} from "./gm/gm-combat.js";
import { getSetting, SETTINGS } from "../settings-access.js";
import { scTurnLabel } from "../compatibility/sc-venaerys-initiative.js";
import { renderScPhaseStatus } from "./combat-initiative.js";

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
    globalSearchPanel,
    deathData,
    escapeHTML,
    formatMod,
    favoriteSection,
    getCombatState,
    gmHeader,
    gmCombatant,
    gmSaves,
    gmSpecialActions,
    gmInitiativeButtons,
    gmRemovalButton,
    gmTurnControls,
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
    const { combatant, sc } = getCombatState();

    if (!combatant && !showInitiative) {
      return "";
    }

    const rolled = combatant?.initiative != null;

    return `
        <button
          type="button"
          class="ws-header-initiative ws-button ${rolled ? "" : "ws-unrolled"}"
          data-action="initiative"
          title="${sc ? t("SC.RollInTracker") : !combatant ? t("Initiative.NotCombatant") : rolled ? t("Initiative.Rolled") : t("Initiative.Roll")}"
          ${!combatant || rolled || !canAct() || sc ? "disabled" : ""}
        >
          <span>${t("Labels.Initiative")}</span>
          <strong>${sc && !sc.usesInitiative ? "—" : rolled ? combatant.initiative : "—"}</strong>
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
  const playerStatsHTML = (includeInitiative = true) => {
    const { ac, speed, speedUnits } = adapter.combatStats(actor);
    const movement = adapter.npcMovement?.(actor) ?? {
      primary: `${speed}${speedUnits ? ` ${speedUnits}` : ""}`,
      secondary: ""
    };
    return `<div class="ws-combat-stats ws-player-stats ${includeInitiative ? "" : "ws-no-initiative"}">
      <div class="ws-combat-stat"><span>${t("Combat.AC")}</span><strong>${ac}</strong></div>
      ${includeInitiative ? `<div class="ws-player-initiative-slot">${!getCombatState().combatant ? `<div class="ws-combat-stat"><span>${t("Labels.Initiative")}</span><strong>—</strong></div>` : ""}</div>` : ""}
      ${movement.secondary ? `<button type="button" class="ws-combat-stat ws-player-speed ws-button" data-action="togglespeeds" aria-expanded="${Boolean(hudState.gmSpeedsExpanded)}" aria-controls="ws-player-secondary-speed"><span>${t("Combat.Speed")} ▾</span><strong>${escapeHTML(movement.primary)}</strong></button>` : `<div class="ws-combat-stat"><span>${t("Combat.Speed")}</span><strong>${escapeHTML(movement.primary)}</strong></div>`}

      ${movement.secondary ? `<div class="ws-player-secondary-speed" id="ws-player-secondary-speed" ${hudState.gmSpeedsExpanded ? "" : "hidden"}>${escapeHTML(movement.secondary)}</div>` : ""}
    </div>`;
  };
  function combatHTML() {
    const { isTurn, canEndTurn, sc } = getCombatState();
    const endLabel = sc ? scTurnLabel(sc, t) : t("Combat.EndTurn");
    const { ac, hp } = adapter.combatStats(actor);
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
      const search = globalSearchPanel?.() ?? "";
      const resistanceUsage = legendaryResistance
        ? adapter.legendaryResistanceUsage?.(actor)
        : null;
      return `<div id="ws-combat" class="ws-view ws-combat-view ws-gm-view ${deadTurn ? "ws-gm-dead" : ""}">
        <div class="ws-gm-content">
        <div class="ws-gm-selection-summary"><strong>${escapeHTML(actor.name)}</strong><span>${t("Combat.HP")} ${hp.value}/${hp.max}${hp.temp ? ` +${hp.temp}` : ""}</span></div>
        ${gmHeader()}
        <div class="ws-gm-body">
          <section class="ws-gm-info">
            <div class="ws-gm-identity"><button type="button" class="ws-button ws-gm-selected-image" data-action="gmimage" data-combatant-id="${escapeHTML(gmCombatant?.id)}" title="${t("GM.OpenImage")}" aria-label="${t("GM.OpenImage")}"><img class="ws-gm-selected-portrait" src="${escapeHTML(gmCombatant?.token?.texture?.src || actor.img || "icons/svg/mystery-man.svg")}" alt=""></button><button type="button" class="ws-button ws-gm-name" data-action="gmsheet" title="${t("Actor.OpenSheet")}"><strong>${escapeHTML(actor.name)}</strong></button>${search ? `<details class="ws-gm-search" ${hudState.searchQuery ? "open" : ""}><summary title="${t("Quick.Search")}" aria-label="${t("Quick.Search")}"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i></summary>${search}</details>` : ""}</div>
            <div class="ws-gm-identity-actions" role="group" aria-label="${t("GM.CreatureControls")}"><button type="button" class="ws-button" data-action="gmping" title="${t("GM.Ping")}" aria-label="${t("GM.Ping")}"><i class="fa-solid fa-tower-broadcast" aria-hidden="true"></i><span>${t("GM.Ping")}</span></button><button type="button" class="ws-button" data-action="gmcenter" title="${t("GM.ToToken")}" aria-label="${t("GM.ToToken")}"><i class="fa-solid fa-location-crosshairs" aria-hidden="true"></i><span>${t("GM.ToToken")}</span></button>${renderGmHiddenButton(gmCombatant, t, escapeHTML)}${renderGmDefeatedButton(gmCombatant, t, escapeHTML)}${defeated(gmCombatant) && actor.type === "npc" && !hasPlayerOwner(gmCombatant) ? `<button type="button" class="ws-button ws-gm-remove-selected" data-action="gmremove" title="${t("GM.RemoveCreature")}" aria-label="${t("GM.RemoveCreature")}"><i class="fa-solid fa-trash-can" aria-hidden="true"></i><span>${t("GM.RemoveCreature")}</span></button>` : ""}</div>
            ${healthPanel(hp)}<div class="ws-combat-stats"><div class="ws-combat-stat"><span>${t("Combat.AC")}</span><strong>${ac}</strong></div>${combatInitiative()}${movement.secondary ? `<button type="button" class="ws-combat-stat ws-gm-speed" data-action="gmspeeds" aria-expanded="${Boolean(hudState.gmSpeedsExpanded)}"><span>${t("Combat.Speed")} ▾</span><strong>${escapeHTML(movement.primary)}</strong></button>` : `<div class="ws-combat-stat"><span>${t("Combat.Speed")}</span><strong>${escapeHTML(movement.primary)}</strong></div>`}
            ${movement.secondary ? `<div class="ws-gm-secondary-speed" ${hudState.gmSpeedsExpanded ? "" : "hidden"}>${escapeHTML(movement.secondary)}</div>` : ""}</div>
            ${combatStatuses()}
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
            ${traits.length ? `<section class="ws-gm-traits"><details class="ws-gm-defenses"><summary>${t("GM.Defenses")}</summary>${traits.map(trait => `<div><b>${t(trait.title)}</b><span>${escapeHTML(trait.text)}${trait.bypasses ? ` (${t("GM.BypassedBy")}: ${escapeHTML(trait.bypasses)})` : ""}</span></div>`).join("")}</details></section>` : ""}
            ${visibility.filterActions !== false && !legendaryActions ? (gmSpecialActions?.("legendary") ?? "") : ""}
            ${visibility.filterActions !== false ? (gmSpecialActions?.("lair") ?? "") : ""}
          </section>
          <section class="ws-gm-action-column">${combatActions()}</section>
        </div>
        </div>
        <div class="ws-gm-tools">${diceTrayButton(t)}${gmTurnControls?.() ?? ""}<button type="button" class="ws-end-turn ws-button" data-action="endturn" ${getCombatState().combat?.started && getCombatState().combat?.combatant && (!sc || sc.valid) ? "" : "disabled"}><i class="fa-solid fa-forward-step" aria-hidden="true"></i>${t(sc ? "SC.NextPhase" : "Combat.EndTurn")}</button><div class="ws-gm-more"><button type="button" class="ws-gm-more-toggle" data-action="togglegmtools" aria-expanded="false" aria-controls="ws-gm-more-actions" id="ws-gm-more-toggle" title="${t("GM.MoreActions")}" aria-label="${t("GM.MoreActions")}"><i class="fa-solid fa-ellipsis" aria-hidden="true"></i></button><div class="ws-gm-more-actions" id="ws-gm-more-actions">${renderGmRevealButton(getCombatState().combat, t)}${gmInitiativeButtons?.() ?? ""}${gmRemovalButton?.() ?? ""}${renderGmEndCombatButton(getCombatState().combat, t)}</div></div></div>
      </div>`;
    }

    return `
        <div
          id="ws-combat"
          class="ws-view ws-combat-view ws-player-layout" data-divider-label="${t("Labels.ResizeColumns")}"
        >
          ${modeNavigation("combat")}
          <section class="ws-player-info">
          ${globalSearchPanel?.() ?? ""}
          ${renderScPhaseStatus(sc, t, escapeHTML)}
          ${actorHeader(`${inspirationControl()}${combatInitiative()}${isTurn ? `<button type="button" class="ws-header-control ws-header-end-turn ws-button ws-active" data-action="endturn" title="${t("Combat.YourTurn")} · ${endLabel}" aria-label="${endLabel}" ${canEndTurn ? "" : "disabled"}><i class="fa-solid fa-forward-step" aria-hidden="true"></i><span>${endLabel}</span></button>` : ""}`)}

          ${companionNavigation?.() ?? ""}

          ${healthPanel(hp)}
          ${combatStatuses()}
          <div class="ws-player-favorites">${favoriteSection()}</div>

          ${playerStatsHTML()}

          ${abilitiesSection("combat")}
          ${companionSection?.() ?? ""}
          ${shortcutHint()}
          </section>

          <section class="ws-player-actions">
          ${combatActions()}

          </section>
        </div>
      `;
  }

  return {
    combatHTML,
    combatInitiative,
    healthPanel,
    playerStatsHTML,
    combatStatuses
  };
}
