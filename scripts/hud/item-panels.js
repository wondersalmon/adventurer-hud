import { itemAvailability, matchesItemSearch } from "./quick-access.js";
import { createCombatItemCardRenderer } from "./combat-item-card.js";
import { createCombatSpellRenderer } from "./combat-spells.js";

export function createItemPanelRenderer({
  actor,
  adapter,
  escapeHTML,
  hudState,
  skills = [],
  skillsHTML,
  skillFilterHTML,
  spellFilterHTML,
  t,
  tf,
  visibility
}) {
  const combatItems = category => adapter.combatItems(actor, category);

  const inventoryCategories = () => [
    ["equipped", "fa-shield-halved", "Inventory.Equipped"],
    ["consumables", "fa-flask", "Inventory.Consumables"],
    ["other", "fa-box-open", "Inventory.Other"]
  ];

  const inventoryItems = category =>
    actor.items.filter(item => adapter.inventoryCategory(item) === category);

  const searchItems = items =>
    (visibility.search
      ? items.filter(item =>
          matchesItemSearch(adapter, item, hudState.searchQuery)
        )
      : [...items]
    ).sort(
      (left, right) =>
        Number(Boolean(itemAvailability(adapter, actor, left).reason)) -
        Number(Boolean(itemAvailability(adapter, actor, right).reason))
    );

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

  const combatCategories = () => {
    const visible = [
      ["weapons", "fa-swords", "Combat.Weapons", true],
      ["spells", "fa-wand-magic-sparkles", "Combat.Spells", true],
      ["action", "fa-circle-play", "Combat.Action", visibility.showActionTypes],
      ["bonus", "fa-bolt", "Combat.BonusAction", visibility.showActionTypes],
      ["reaction", "fa-shield", "Combat.Reaction", visibility.showActionTypes],
      ["special", "fa-star", "Combat.Special", visibility.showActionTypes],
      ["features", "fa-bolt-lightning", "Combat.Features", true]
    ].filter(([, , , enabled]) => enabled);
    if (!visible.length) return [];
    const indexed = adapter.combatItemsByCategory?.(
      actor,
      visible.map(([category]) => category)
    );
    const categories = visible
      .map(([category, icon, label]) => [
        category,
        icon,
        label,
        indexed ? (indexed.get(category) ?? []) : combatItems(category)
      ])
      .filter(([, , , items]) => items.length > 0);
    if (visibility.combatSkills && skills.length) {
      categories.push(["skills", "fa-list-check", "Labels.Skills", skills]);
    }
    return categories;
  };

  const categoryButton = ([category, icon, label, items]) => `
    <button type="button" class="ws-combat-filter ws-button ${hudState.combatCategory === category ? "ws-active" : ""}"
      data-action="combatfilter" data-category="${category}" aria-expanded="${hudState.combatCategory === category}">
      <i class="fa-solid ${icon}"></i><span>${t(label)}</span><small>${items.length}</small>
    </button>`;
  const combatActions = () => {
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

    const selectedCategory = categories.find(
      ([category]) => category === hudState.combatCategory
    );
    if (hudState.combatCategory && !selectedCategory) {
      hudState.combatCategory = null;
    }
    const isSkills = hudState.combatCategory === "skills";
    const items =
      selectedCategory && !isSkills ? searchItems(selectedCategory[3]) : [];
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
              actionTypes.length
                ? `
              <button type="button" class="ws-combat-filter ws-button ${selectedAction ? "ws-active" : ""}"
                data-action="toggleactionmenu" aria-expanded="${hudState.actionMenuOpen}">
                <i class="fa-solid ${selectedAction?.[1] ?? "fa-circle-play"}"></i>
                <span>${selectedAction ? t(selectedAction[2]) : t("Combat.ActionTypes")}</span>
                <small><i class="fa-solid fa-chevron-down"></i></small>
              </button>`
                : ""
            }
            ${featureCategory ? categoryButton(featureCategory) : ""}
            ${skillCategory ? categoryButton(skillCategory) : ""}
          </div>
          ${hudState.actionMenuOpen && actionTypes.length ? `<div class="ws-action-menu">${actionTypes.map(categoryButton).join("")}</div>` : ""}

          ${hudState.combatCategory && !isSkills ? searchControl() : ""}
          ${isSkills ? skillFilterHTML() : ""}

          ${hudState.combatCategory === "spells" ? spellFilterHTML() : ""}

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
                    : `<div class="ws-combat-item-grid">${items.map(combatItemButton).join("")}</div>`
                  : `<div class="ws-empty">${t(hudState.searchQuery ? "Quick.NoResults" : "Combat.Empty")}</div>`
            }
          </div>`
              : ""
          }
        </div>
      `;
  };

  return {
    combatActions,
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
