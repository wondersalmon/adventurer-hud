import { renderRegularView } from "../render/index.js";

export function createRegularRenderer(context) {
  const {
    abilitiesSection,
    actorHeader,
    back,
    combatInitiative,
    combatItemButton,
    combatItems,
    favoriteSection,
    healthPanel,
    hudState,
    inspirationControl,
    inventoryCategories,
    inventoryItems,
    legend,
    modeNavigation,
    restControls,
    searchControl,
    searchItems,
    shortcutHint,
    skillFilterHTML,
    skillsHTML,
    spellFilterHTML,
    spellGroups,
    t,
    toolSection,
    toolState
  } = context;

  const availableViews = () => ({
    inventory: true,
    skills: true,
    spells: combatItems("spells").length > 0,
    tools: true
  });

  const inventoryHTML = () => {
    const items = searchItems(inventoryItems(hudState.inventoryCategory));
    return `
    <div id="ws-inventory" class="ws-view ws-hidden">
      ${back(t("Inventory.Title"), "fa-box-open")}

      <div class="ws-divider"></div>

      ${searchControl()}

      <div class="ws-combat-filters ws-inventory-filters" role="group" aria-label="${t("Inventory.Filter")}">
        ${inventoryCategories()
          .map(
            ([category, icon, label]) => `
              <button type="button"
                class="ws-combat-filter ws-button ${hudState.inventoryCategory === category ? "ws-active" : ""}"
                data-action="inventoryfilter" data-category="${category}">
                <i class="fa-solid ${icon}"></i>
                <span>${t(label)}</span>
                <small>${inventoryItems(category).length}</small>
              </button>
            `
          )
          .join("")}
      </div>

      <div class="ws-combat-item-list">
        ${
          items.length
            ? `<div class="ws-combat-item-grid">${items.map(combatItemButton).join("")}</div>`
            : `<div class="ws-empty">${t(hudState.searchQuery ? "Quick.NoResults" : "Inventory.Empty")}</div>`
        }
      </div>

      ${shortcutHint()}
    </div>
  `;
  };

  const mainHTML = () => {
    const { spells: hasSpells } = availableViews();
    const nav = (view, icon, label) =>
      `<button type="button" class="ws-nav ws-button" data-action="view" data-view="${view}"><span class="ws-nav-main"><i class="fa-solid ${icon}"></i>${t(label)}</span><i class="fa-solid fa-chevron-right ws-arrow"></i></button>`;
    return `<div id="ws-main" class="ws-view">
      ${actorHeader()}
      <div class="ws-regular-health">${healthPanel()}</div>
      ${restControls(`${combatInitiative()}${inspirationControl()}`)}
      ${modeNavigation("regular")}
      ${favoriteSection()}
      ${abilitiesSection()}
      <div class="ws-divider"></div>
      <div class="ws-nav-grid">
        ${nav("skills", "fa-list-check", "Labels.Skills")}
        ${nav("tools", "fa-screwdriver-wrench", "Labels.Tools")}
        ${hasSpells ? nav("spells", "fa-wand-magic-sparkles", "Combat.Spells") : ""}
        ${nav("inventory", "fa-box-open", "Inventory.Title")}
      </div>
      ${shortcutHint()}
    </div>`;
  };

  const skillsViewHTML = () => `
        <div
          id="ws-skills"
          class="ws-view ws-hidden"
        >
          ${back(t("Labels.Skills"), "fa-list-check")}

          <div class="ws-divider"></div>

          ${skillFilterHTML()}

          <div class="ws-scroll">
            <div class="ws-entry-grid">
              ${skillsHTML()}
            </div>
          </div>

          <div class="ws-divider"></div>

          ${legend()}

          ${shortcutHint()}
        </div>
      `;

  const toolsViewHTML = () => `
        <div
          id="ws-tools"
          class="ws-view ws-hidden"
        >
          ${back(t("Labels.Tools"), "fa-screwdriver-wrench")}

          <div class="ws-divider"></div>

          <div class="ws-scroll">
            <div class="ws-tools-content">

              ${
                toolState.tools.length
                  ? `
                    ${toolSection(
                      t("Labels.Tools"),
                      "fa-screwdriver-wrench",
                      toolState.normalTools
                    )}

                    ${toolSection(
                      t("Labels.Instruments"),
                      "fa-music",
                      toolState.instruments
                    )}
                  `
                  : `
                    <div class="ws-empty">

                      <i
                        class="
                          fa-solid
                          fa-screwdriver-wrench
                        "
                      ></i>

                      <span>
                        ${t("Tools.Empty")}
                      </span>

                    </div>
                  `
              }

            </div>
          </div>

          ${
            toolState.tools.length
              ? `
                <div class="ws-divider"></div>
                ${legend()}
              `
              : ""
          }

          ${shortcutHint()}
        </div>
      `;

  const spellsViewHTML = () => `
        <div id="ws-spells" class="ws-view ws-hidden">
          ${back(t("Combat.Spells"), "fa-wand-magic-sparkles")}

          <div class="ws-divider"></div>

          ${searchControl()}

          ${spellFilterHTML()}

          <div class="ws-combat-item-list">
            ${
              spellGroups(searchItems(combatItems("spells"))) ||
              `<div class="ws-empty">${t(hudState.searchQuery ? "Quick.NoResults" : "Combat.EmptyPrepared")}</div>`
            }
          </div>

          ${shortcutHint()}
        </div>
      `;

  const normalHTML = () =>
    renderRegularView(hudState.currentView, {
      main: mainHTML,
      inventory: inventoryHTML,
      skills: skillsViewHTML,
      spells: spellsViewHTML,
      tools: toolsViewHTML
    });

  return { availableViews, inventoryHTML, normalHTML };
}
