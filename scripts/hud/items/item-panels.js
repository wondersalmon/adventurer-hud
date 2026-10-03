import { recordDiagnostic, diagnosticsRecording } from "../../diagnostics.js";
import { createItemCategories } from "./item-categories.js";
import { createCombatItemCardRenderer } from "./combat-item-card.js";
import { createCombatSpellRenderer } from "./combat-spells.js";

export function createItemPanelRenderer({
  actor,
  adapter,
  escapeHTML,
  hudState,
  skills = /** @type {string[][]} */ ([]),
  skillsHTML,
  skillFilterHTML,
  spellFilterHTML,
  t,
  tf,
  visibility
}) {
  const {
    featureItems,
    combatItems,
    searchItems,
    combatCategories,
    categoryLabel
  } = createItemCategories({ actor, adapter, hudState, skills, t, visibility });
  const inventoryCategories = () => [
    ["equipped", "fa-shield-halved", "Inventory.Equipped"],
    ["consumables", "fa-flask", "Inventory.Consumables"],
    ["other", "fa-box-open", "Inventory.Other"]
  ];

  const inventoryItems = category =>
    actor.items.filter(item => adapter.inventoryCategory(item) === category);

  const searchControl = () =>
    visibility.search
      ? `<div class="ws-item-search">
          <input type="search" data-action="searchitems" value="${escapeHTML(hudState.searchQuery)}" placeholder="${t("Quick.Search")}" aria-label="${t("Quick.Search")}">
          <button type="button" class="ws-button" data-action="clearsearch" title="${t("Quick.ClearSearch")}" aria-label="${t("Quick.ClearSearch")}"><i class="fa-solid fa-xmark"></i></button>
        </div>`
      : "";
  const combatItemButton = createCombatItemCardRenderer({
    actor,
    adapter,
    escapeHTML,
    hudState,
    t,
    visibility
  });
  const spellGroups = createCombatSpellRenderer({
    actor,
    adapter,
    combatItemButton,
    hudState,
    t,
    tf
  });

  const favoriteSection = () => {
    if (!visibility.favorites) return "";
    const entries = hudState.favoriteEntries
      .map(entry => ({ ...entry, item: actor.items.get(entry.itemId) }))
      .filter(entry => entry.item);
    if (!entries.length) return "";
    return `<section class="ws-favorites">
      <button type="button" class="ws-section-toggle ws-button" data-action="togglefavorites"
        aria-expanded="${hudState.favoritesExpanded}">
        <span><i class="fa-solid fa-star"></i> ${t("Quick.Favorites")} · ${entries.length}</span>
        <i class="fa-solid fa-chevron-${hudState.favoritesExpanded ? "up" : "down"}"></i>
      </button>
      ${hudState.favoritesExpanded ? `<div class="ws-combat-item-grid">${entries.map(entry => combatItemButton(entry.item, { activityId: entry.activityId, inFavorites: true })).join("")}</div>` : ""}
    </section>`;
  };

  const categoryCards = items =>
    items
      .map(item => {
        const category = hudState.combatCategory;
        if (!visibility.gm && category === "special") {
          const activities = adapter
            .itemActivities(item)
            .filter(
              activity =>
                !["action", "bonus", "reaction"].includes(
                  activity.activation?.type
                )
            );
          return activities
            .map(activity =>
              combatItemButton(item, { activityId: activity.id })
            )
            .join("");
        }
        if (!category?.startsWith("activation:")) return combatItemButton(item);
        return adapter
          .itemActivities(item)
          .filter(activity => activity.activation?.type === category.slice(11))
          .map(activity => combatItemButton(item, { activityId: activity.id }))
          .join("");
      })
      .join("");

  const categoryButton = ([category, icon, label, items]) => `
    <button type="button" class="ws-combat-filter ws-button ${hudState.combatCategory === category ? "ws-active" : ""}"
      data-action="combatfilter" data-category="${escapeHTML(category)}" aria-expanded="${hudState.combatCategory === category}">
      <i class="fa-solid ${icon}"></i><span>${escapeHTML(categoryLabel(category, label))}</span><small>${category === "features" ? featureItems(items).length : items.length}</small>
    </button>`;
  const combatActions = () => {
    if (!visibility.gm && hudState.combatCategory?.startsWith("activation:")) {
      const kind = hudState.combatCategory.slice(11);
      hudState.combatCategory = ["action", "bonus", "reaction"].includes(kind)
        ? kind
        : "special";
    }
    if (visibility.gm && visibility.filterActions === false) {
      hudState.combatCategory = null;
      hudState.actionMenuOpen = false;
      const items = searchItems(
        [...actor.items.values()].filter(
          item =>
            !item.flags?.dnd5e?.cachedFor &&
            (["weapon", "spell", "feat", "consumable"].includes(item.type) ||
              adapter.itemActivities(item).length > 0)
        )
      );
      return `<div class="ws-combat-actions">${searchControl()}<div class="ws-combat-item-list"><div class="ws-combat-item-grid">${items.length ? items.map(item => combatItemButton(item)).join("") : `<div class="ws-empty">${t(hudState.searchQuery ? "Quick.NoResults" : "Combat.Empty")}</div>`}</div></div></div>`;
    }
    const categories = combatCategories();
    const featureCategory = categories.find(
      ([category]) => category === "features"
    );
    const skillCategory = categories.find(
      ([category]) => category === "skills"
    );

    if (!categories.length) {
      hudState.combatCategory = null;
      hudState.actionMenuOpen = false;
      return "";
    }

    if (
      visibility.gm &&
      !categories.some(([key]) => key === hudState.combatCategory)
    )
      hudState.combatCategory = categories[0][0];
    const selectedCategory = categories.find(
      ([category]) => category === hudState.combatCategory
    );
    if (hudState.combatCategory && !selectedCategory) {
      hudState.combatCategory = null;
    }
    const isSkills = hudState.combatCategory === "skills";
    const items =
      selectedCategory && !isSkills
        ? searchItems(
            hudState.combatCategory === "features"
              ? featureItems(selectedCategory[3])
              : selectedCategory[3]
          )
        : [];
    if (diagnosticsRecording())
      recordDiagnostic(
        "hud.cards.filter",
        {
          category: hudState.combatCategory,
          requested: selectedCategory?.[3]?.length ?? 0,
          processed: items.length,
          reason: hudState.searchQuery ? "search" : "category",
          searchActive: Boolean(hudState.searchQuery),
          passive: Boolean(hudState.showPassiveFeatures)
        },
        { detailed: true }
      );
    const primary = categories.filter(
      ([category]) => category === "weapons" || category === "spells"
    );
    const actionTypes = categories.filter(
      ([category]) =>
        category !== "weapons" &&
        category !== "spells" &&
        category !== "features" &&
        category !== "skills"
    );
    const selectedAction = actionTypes.find(
      ([category]) => category === hudState.combatCategory
    );

    return `
        <div class="ws-combat-actions">
          <div class="ws-combat-filters">
            ${primary.map(categoryButton).join("")}
            ${
              visibility.gm
                ? actionTypes.map(categoryButton).join("")
                : actionTypes.length
                  ? `
              <button type="button" class="ws-combat-filter ws-button ${selectedAction ? "ws-active" : ""}"
                data-action="toggleactionmenu" aria-expanded="${hudState.actionMenuOpen}">
                <i class="fa-solid ${selectedAction?.[1] ?? "fa-circle-play"}"></i>
                <span>${selectedAction ? escapeHTML(categoryLabel(selectedAction[0], selectedAction[2])) : t("Combat.ActionTypes")}</span>
                <small><i class="fa-solid fa-chevron-down"></i></small>
              </button>`
                  : ""
            }
            ${featureCategory ? categoryButton(featureCategory) : ""}
            ${skillCategory ? categoryButton(skillCategory) : ""}
          </div>
          ${!visibility.gm && hudState.actionMenuOpen && actionTypes.length ? `<div class="ws-action-menu">${actionTypes.map(categoryButton).join("")}</div>` : ""}

          ${hudState.combatCategory && !isSkills ? searchControl() : ""}
          ${isSkills ? skillFilterHTML() : ""}

          ${hudState.combatCategory === "spells" ? spellFilterHTML() : ""}
          ${hudState.combatCategory === "features" ? `<div class="ws-feature-filter"><button type="button" class="ws-button ${hudState.showPassiveFeatures ? "ws-active" : ""}" data-action="featurefilter" aria-pressed="${Boolean(hudState.showPassiveFeatures)}">${t(hudState.showPassiveFeatures ? "Combat.ShowActiveFeatures" : "Combat.ShowPassiveFeatures")}</button></div>` : ""}

          ${
            hudState.combatCategory
              ? `<div class="ws-combat-item-list">
            ${
              isSkills
                ? `<div class="ws-combat-item-grid">${skillsHTML("combat")}</div>`
                : items.length
                  ? hudState.combatCategory === "spells"
                    ? spellGroups(items) ||
                      `<div class="ws-empty">${t("Combat.EmptyPrepared")}</div>`
                    : `<div class="ws-combat-item-grid">${categoryCards(items)}</div>`
                  : `<div class="ws-empty">${t(hudState.searchQuery ? "Quick.NoResults" : hudState.combatCategory === "features" ? (hudState.showPassiveFeatures ? "Combat.EmptyPassiveFeatures" : "Combat.EmptyActiveFeatures") : "Combat.Empty")}</div>`
            }
          </div>`
              : ""
          }
        </div>
      `;
  };

  const gmSpecialActions = (onlyKind = null) =>
    [
      ["legendary", "GM.LegendaryActions", "legact"],
      ["lair", "GM.LairActions", null]
    ]
      .filter(([kind]) => !onlyKind || kind === onlyKind)
      .map(([kind, title, resourceKey]) => {
        const entries = [...actor.items.values()].flatMap(item =>
          adapter
            .itemActivities(item)
            .filter(activity => activity.activation?.type === kind)
            .map(activity => ({ item, activity }))
        );
        if (!entries.length) return "";
        const resource = resourceKey
          ? adapter.npcResource(actor, resourceKey)
          : null;
        return `<section class="ws-gm-special"><h3><span>${t(title)}</span>${resource ? `<b>${resource.value}/${resource.max}</b>` : ""}</h3><div class="ws-combat-item-grid">${entries.map(({ item, activity }) => `<div class="ws-gm-special-row">${combatItemButton(item, { activityId: activity.id })}${kind === "legendary" ? `<span class="ws-gm-action-cost" title="${t("GM.ActionCost")}">${escapeHTML(activity.activation.value ?? 1)}</span>` : ""}</div>`).join("")}</div></section>`;
      })
      .join("");

  return {
    withUsageTargets: combatItemButton.withUsageTargets,
    combatActions,
    gmSpecialActions,
    combatItemButton,
    combatItems,
    favoriteSection,
    inventoryCategories,
    inventoryItems,
    searchControl,
    searchItems,
    spellGroups
  };
}
