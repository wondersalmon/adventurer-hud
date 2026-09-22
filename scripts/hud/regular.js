import { renderRegularView } from "../render/index.js";

export function createRegularRenderer(context) {
  const {
    abilityRow,
    actorHeader,
    back,
    combatInitiative,
    combatItemButton,
    combatItems,
    hudState,
    inspirationControl,
    instruments,
    inventoryCategories,
    inventoryItems,
    legend,
    modeNavigation,
    normalTools,
    restControls,
    savingThrowsSection,
    shortcutHint,
    skillsHTML,
    spellGroups,
    t,
    toolSection,
    tools,
    visibility
  } = context;

  function normalHTML() {
    const markup = `
        <div
          id="ws-main"
          class="ws-view"
        >
          ${actorHeader(`${combatInitiative()}${inspirationControl()}`)}

          ${restControls()}

          ${modeNavigation("regular")}

          ${
            visibility.abilityChecks || visibility.savingThrows
              ? `
                <div class="ws-divider"></div>

                <div class="ws-ability-table">
                  ${
                    visibility.abilityChecks
                      ? abilityRow("check", t("Labels.Check"), "fa-dice")
                      : ""
                  }

                  ${visibility.savingThrows ? savingThrowsSection() : ""}
                </div>
              `
              : ""
          }

          ${
            visibility.skills ||
            visibility.tools ||
            visibility.combatSpells ||
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
              visibility.combatSpells
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

        <div
          id="ws-skills"
          class="ws-view ws-hidden"
        >
          ${back(t("Labels.Skills"), "fa-list-check")}

          <div class="ws-divider"></div>

          <div class="ws-scroll">
            <div class="ws-entry-grid">
              ${skillsHTML()}
            </div>
          </div>

          <div class="ws-divider"></div>

          ${legend()}

          ${shortcutHint()}
        </div>

        <div
          id="ws-tools"
          class="ws-view ws-hidden"
        >
          ${back(t("Labels.Tools"), "fa-screwdriver-wrench")}

          <div class="ws-divider"></div>

          <div class="ws-scroll">
            <div class="ws-tools-content">

              ${
                tools.length
                  ? `
                    ${toolSection(
                      t("Labels.Tools"),
                      "fa-screwdriver-wrench",
                      normalTools
                    )}

                    ${toolSection(
                      t("Labels.Instruments"),
                      "fa-music",
                      instruments
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
            tools.length
              ? `
                <div class="ws-divider"></div>
                ${legend()}
              `
              : ""
          }

          ${shortcutHint()}
        </div>

        <div id="ws-spells" class="ws-view ws-hidden">
          ${back(t("Combat.Spells"), "fa-wand-magic-sparkles")}

          <div class="ws-divider"></div>

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
              spellGroups(combatItems("spells")) ||
              `<div class="ws-empty">${t("Combat.EmptyPrepared")}</div>`
            }
          </div>

          ${shortcutHint()}
        </div>

        <div id="ws-inventory" class="ws-view ws-hidden">
          ${back(t("Inventory.Title"), "fa-box-open")}

          <div class="ws-divider"></div>

          <div class="ws-combat-filters ws-inventory-filters" role="group" aria-label="${t("Inventory.Filter")}">
            ${inventoryCategories()
              .map(
                ([category, icon, label]) => `
                  <button
                    type="button"
                    class="ws-combat-filter ws-button ${hudState.inventoryCategory === category ? "ws-active" : ""}"
                    data-action="inventoryfilter"
                    data-category="${category}"
                  >
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
              inventoryItems(hudState.inventoryCategory).length
                ? `<div class="ws-combat-item-grid">${inventoryItems(
                    hudState.inventoryCategory
                  )
                    .map(combatItemButton)
                    .join("")}</div>`
                : `<div class="ws-empty">${t("Inventory.Empty")}</div>`
            }
          </div>

          ${shortcutHint()}
        </div>
      `;

    const template = document.createElement("template");
    template.innerHTML = markup;
    const view = id =>
      template.content.querySelector(`#ws-${id}`)?.outerHTML ?? "";

    return renderRegularView(hudState.currentView, {
      main: () => view("main"),
      inventory: () => view("inventory"),
      skills: () => view("skills"),
      spells: () => view("spells"),
      tools: () => view("tools")
    });
  }

  return { normalHTML };
}
