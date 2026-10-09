import { renderInventoryPanel } from "./items/inventory-panel.js";
import { renderRegularView } from "../render/index.js";

export function createRegularRenderer(context) {
  const {
    abilitiesSection,
    actorHeader,
    back,
    combatStatuses,
    combatItems,
    companionNavigation,
    companionSection,
    favoriteSection,
    healthPanel,
    hudState,
    inspirationControl,
    legend,
    modeNavigation,
    playerStatsHTML,
    restControls,
    globalSearchPanel,
    sortItems,
    shortcutHint,
    skillFilterHTML,
    skillsHTML,
    spellFilterHTML,
    spellGroups,
    t,
    trainedToolsHTML
  } = context;

  const availableViews = () => ({
    inventory: true,
    skills: true,
    spells: combatItems("spells").length > 0
  });

  const inventoryHTML = () => `
    <div id="ws-inventory" class="ws-player-subview">
      ${back(t("Inventory.Title"), "fa-box-open")}
      <div class="ws-divider"></div>
      ${renderInventoryPanel(context)}
    </div>`;

  const mainHTML = (body = null) => {
    const detail = hudState.currentView !== "main";
    const rests = restControls?.() ?? "";
    const { spells: hasSpells } = availableViews();
    const nav = (view, icon, label) => {
      const fallback =
        !detail && view === "skills" && !hudState.explorationSkillsCollapsed;
      const expanded = hudState.currentView === view;
      return `<section class="ws-exploration-section ${expanded ? "ws-expanded" : ""}"><button type="button" class="ws-nav ws-section-toggle ws-button ${expanded ? "ws-active" : ""}" data-action="view" data-view="${view}" ${expanded ? 'aria-current="page"' : ""} data-exploration-section="true" ${fallback ? 'data-exploration-default="true"' : ""} aria-expanded="${expanded}" aria-controls="ws-exploration-content-${view}" title="${t(label)}"><span class="ws-nav-main"><i class="fa-solid ${icon}" aria-hidden="true"></i>${t(label)}</span><i class="fa-solid fa-chevron-${expanded ? "up" : "down"} ws-arrow" aria-hidden="true"></i></button><div id="ws-exploration-content-${view}" class="ws-exploration-section-body" ${fallback ? 'data-exploration-default-body="true"' : ""} ${expanded ? "" : "hidden"}>${expanded || fallback ? body : ""}</div></section>`;
    };
    const navigation = `
      ${nav("skills", "fa-list-check", "Labels.Skills")}
      ${hasSpells ? nav("spells", "fa-wand-magic-sparkles", "Combat.Spells") : ""}
      ${nav("inventory", "fa-box-open", "Inventory.Title")}
    `;
    return `<div id="${detail ? "ws-exploration" : "ws-main"}" data-divider-label="${t("Labels.ResizeColumns")}" class="ws-view ws-player-layout ${detail ? "ws-player-detail" : hudState.explorationSkillsCollapsed ? "ws-exploration-collapsed" : "ws-exploration-default"}">
      ${modeNavigation("regular")}
      <section class="ws-player-basics ws-player-info">
      ${globalSearchPanel?.() ?? ""}
      ${actorHeader(inspirationControl(), rests ? `<div class="ws-exploration-rests" data-hud-block="rests" data-hud-home="info">${rests}</div>` : "")}
      ${companionNavigation?.() ?? ""}
          <div class="ws-regular-health">${healthPanel()}</div>
          ${combatStatuses?.() ?? ""}
          <div class="ws-player-favorites">${favoriteSection()}</div>
          <div class="ws-regular-stats">${playerStatsHTML?.(false) ?? ""}</div>
          ${abilitiesSection()}
          ${companionSection?.() ?? ""}
          ${shortcutHint()}
      </section>
      <section class="ws-player-actions">
      ${navigation}
      </section>
    </div>`;
  };

  const skillsViewHTML = () => `
        <div
          id="ws-skills"
          class="ws-player-subview"
        >
          ${back(t("Labels.Skills"), "fa-list-check")}

          <div class="ws-divider"></div>

          ${skillFilterHTML()}

          <div class="ws-scroll">
            <div class="ws-entry-grid">
              ${skillsHTML()}
            </div>
            ${trainedToolsHTML?.() ?? ""}
          </div>

          <div class="ws-divider"></div>

          ${legend()}

        </div>
      `;

  const spellsViewHTML = () => `
        <div id="ws-spells" class="ws-player-subview">
          ${back(t("Combat.Spells"), "fa-wand-magic-sparkles")}

          <div class="ws-divider"></div>


          ${spellFilterHTML()}

          <div class="ws-combat-item-list">
            ${
              spellGroups(sortItems(combatItems("spells"))) ||
              `<div class="ws-empty">${t("Combat.EmptyPrepared")}</div>`
            }
          </div>

        </div>
      `;

  const normalHTML = () =>
    mainHTML(
      renderRegularView(
        hudState.currentView === "main" ? "skills" : hudState.currentView,
        {
          main: () => null,
          inventory: inventoryHTML,
          skills: skillsViewHTML,
          spells: spellsViewHTML
        }
      )
    );

  return { availableViews, inventoryHTML, normalHTML };
}
