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
    skillsHTML,
    spellGroups,
    t,
    toolSection,
    toolState,
    visibility
  } = context;

  const availableViews = () => ({
    inventory: visibility.inventory,
    skills: visibility.skills,
    spells: visibility.combatSpells && combatItems("spells").length > 0,
    tools: visibility.tools
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
    return `
        <div
          id="ws-main"
          class="ws-view"
        >
          ${actorHeader()}

          ${visibility.combatStats ? `<div class="ws-regular-health">${healthPanel()}</div>` : ""}

          ${restControls(`${combatInitiative()}${inspirationControl()}`)}

          ${modeNavigation("regular")}

          ${favoriteSection()}

          ${abilitiesSection()}

          ${
            visibility.skills ||
            visibility.tools ||
            hasSpells ||
            visibility.inventory
              ? `
                <div class="ws-divider"></div>

                <div class="ws-nav-grid">

            ${
              visibility.skills
                ? `
            <button
              type="button"
              class="ws-nav ws-button"
              data-action="view"
              data-view="skills"
            >
              <span class="ws-nav-main">
                <i
                  class="fa-solid fa-list-check"
                ></i>

                ${t("Labels.Skills")}
              </span>

              <i
                class="
                  fa-solid
                  fa-chevron-right
                  ws-arrow
                "
              ></i>
            </button>
            `
                : ""
            }

            ${
              visibility.tools
                ? `
            <button
              type="button"
              class="ws-nav ws-button"
              data-action="view"
              data-view="tools"
            >
              <span class="ws-nav-main">
                <i
                  class="
                    fa-solid
                    fa-screwdriver-wrench
                  "
                ></i>

                ${t("Labels.Tools")}
              </span>

              <i
                class="
                  fa-solid
                  fa-chevron-right
                  ws-arrow
                "
              ></i>
            </button>
            `
                : ""
            }

            ${
              hasSpells
                ? `
            <button
              type="button"
              class="ws-nav ws-button"
              data-action="view"
              data-view="spells"
            >
              <span class="ws-nav-main">
                <i class="fa-solid fa-wand-magic-sparkles"></i>
                ${t("Combat.Spells")}
              </span>
              <i class="fa-solid fa-chevron-right ws-arrow"></i>
            </button>
            `
                : ""
            }

            ${
              visibility.inventory
                ? `
            <button
              type="button"
              class="ws-nav ws-button"
              data-action="view"
              data-view="inventory"
            >
              <span class="ws-nav-main">
                <i class="fa-solid fa-box-open"></i>
                ${t("Inventory.Title")}
              </span>
              <i class="fa-solid fa-chevron-right ws-arrow"></i>
            </button>
            `
                : ""
            }

                </div>
              `
              : ""
          }

          ${shortcutHint()}
        </div>
      `;
  };

  const skillsViewHTML = () => `
        <div
          id="ws-skills"
          class="ws-view ws-hidden"
        >
          ${back(t("Labels.Skills"), "fa-list-check")}

          <div class="ws-divider"></div>

          <div class="ws-skill-filter" role="group" aria-label="${t("Skills.Filter")}">
            <button type="button" class="ws-button ${hudState.proficientSkillsOnly ? "ws-active" : ""}"
              data-action="skillfilter" data-proficient="true" aria-pressed="${hudState.proficientSkillsOnly}">
              ${t("Skills.Trained")}
            </button>
            <button type="button" class="ws-button ${hudState.proficientSkillsOnly ? "" : "ws-active"}"
              data-action="skillfilter" data-proficient="false" aria-pressed="${!hudState.proficientSkillsOnly}">
              ${t("Skills.All")}
            </button>
          </div>

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

          <div class="ws-spell-filter" role="group" aria-label="${t("Combat.SpellFilter")}">
            <button type="button" class="ws-button ${hudState.preparedSpellsOnly ? "ws-active" : ""}" data-action="spellfilter" data-prepared="true">
              ${t("Combat.Prepared")}
            </button>
            <button type="button" class="ws-button ${hudState.preparedSpellsOnly ? "" : "ws-active"}" data-action="spellfilter" data-prepared="false">
              ${t("Combat.AllSpells")}
            </button>
          </div>

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
      inventory: () => (visibility.inventory ? inventoryHTML() : ""),
      skills: skillsViewHTML,
      spells: spellsViewHTML,
      tools: toolsViewHTML
    });

  return { availableViews, inventoryHTML, normalHTML };
}
