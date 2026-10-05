import { renderInventoryPanel } from "./inventory-panel.js";
import { recordDiagnostic, diagnosticsRecording } from "../../diagnostics.js";
import { createItemCategories } from "./item-categories.js";
import { createCombatItemCardRenderer } from "./combat-item-card.js";
import { createCombatSpellRenderer } from "./combat-spells.js";
import { itemLayoutKey, renderItemLayout } from "./item-layout.js";
import { hudElementHidden } from "../window/hud-layout.js";
import { matchesItemSearch } from "./quick-access.js";

export function createItemPanelRenderer({
  actor,
  adapter,
  escapeHTML,
  hudState,
  inventorySummary,
  skills = /** @type {string[][]} */ ([]),
  skillsHTML,
  searchRolls,
  trainedToolsHTML,
  skillFilterHTML,
  spellFilterHTML,
  t,
  tf,
  visibility
}) {
  const {
    featureItems,
    combatItems,
    sortItems,
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
    visibility.search && !hudElementHidden(hudState, "search")
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
    tf,
    escapeHTML
  });

  const globalSearchPanel = () => {
    const control = searchControl();
    if (!control) return "";
    const query = hudState.searchQuery.trim();
    let results = "";
    if (query) {
      const needle = query.toLocaleLowerCase();
      const entries = sortItems(
        [...actor.items.values()].filter(
          item =>
            !item.flags?.dnd5e?.cachedFor &&
            matchesItemSearch(adapter, item, query)
        )
      ).flatMap(item => {
        // A matching item appears once; matching activities keep their native route.
        if (
          String(item.name ?? "")
            .toLocaleLowerCase()
            .includes(needle)
        )
          return [
            {
              key: itemLayoutKey(item),
              name: item.name,
              html: combatItemButton(item)
            }
          ];
        return adapter
          .itemActivities(item)
          .filter(
            activity =>
              activity.id &&
              String(activity.name ?? "")
                .toLocaleLowerCase()
                .includes(needle)
          )
          .map(activity => ({
            key: itemLayoutKey(item, activity.id),
            name: `${item.name}: ${activity.name}`,
            html: combatItemButton(item, { activityId: activity.id })
          }));
      });
      const rolls = searchRolls?.(query) ?? "";
      results = `<div class="ws-search-results" role="region" aria-label="${t("Quick.SearchResults")}">${entries.length ? renderItemLayout({ entries, scope: "search:all", hudState, escapeHTML, t }) : ""}${rolls}${!entries.length && !rolls ? `<div class="ws-empty" role="status">${t("Quick.NoResults")}</div>` : ""}</div>`;
    }
    return `<section class="ws-global-search">${control}${results}</section>`;
  };

  const favoriteSection = () => {
    if (!visibility.favorites) return "";
    const entries = hudState.favoriteEntries
      .map(entry => ({ ...entry, item: actor.items.get(entry.itemId) }))
      .filter(entry => entry.item);
    return `<section class="ws-favorites">
      <button type="button" class="ws-section-toggle ws-button" data-action="togglefavorites"
        aria-expanded="${hudState.favoritesExpanded}">
        <span><i class="fa-solid fa-star"></i> ${t("Quick.Favorites")} · ${entries.length}</span>
        <i class="fa-solid fa-chevron-${hudState.favoritesExpanded ? "up" : "down"}"></i>
      </button>
      ${hudState.favoritesExpanded ? (entries.length ? `<div class="ws-combat-item-grid">${entries.map(entry => combatItemButton(entry.item, { activityId: entry.activityId, inFavorites: true })).join("")}</div>` : `<div class="ws-empty ws-favorites-empty">${t("Quick.EmptyFavoritesHint")}</div>`) : ""}
    </section>`;
  };

  const organizedCards = (items, scope, activityEntries = false) => {
    const entries = items.flatMap(item => {
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
        return activities.map(activity => ({
          item,
          activityId: activity.id,
          name: `${item.name}: ${activity.name}`
        }));
      }
      if (!activityEntries || !category?.startsWith("activation:"))
        return [{ item, activityId: null, name: item.name }];
      return adapter
        .itemActivities(item)
        .filter(activity => activity.activation?.type === category.slice(11))
        .map(activity => ({
          item,
          activityId: activity.id,
          name: `${item.name}: ${activity.name}`
        }));
    });
    return renderItemLayout({
      scope,
      hudState,
      escapeHTML,
      t,
      entries: entries.map(({ item, activityId, name }) => ({
        key: itemLayoutKey(item, activityId),
        name,
        html: combatItemButton(item, { activityId })
      }))
    });
  };

  const categoryButton = ([category, icon, label, items], extraClass = "") => `
    <button type="button" class="ws-combat-filter ws-button ${extraClass} ${hudState.combatCategory === category ? "ws-active" : ""}"
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
      const items = sortItems(
        [...actor.items.values()].filter(
          item =>
            !item.flags?.dnd5e?.cachedFor &&
            (["weapon", "spell", "feat", "consumable"].includes(item.type) ||
              adapter.itemActivities(item).length > 0)
        )
      );
      return `<div class="ws-combat-actions"><div class="ws-combat-item-list">${items.length ? organizedCards(items, "combat:all") : `<div class="ws-empty">${t("Combat.Empty")}</div>`}</div></div>`;
    }
    const categories = combatCategories();
    const inventoryCategory = visibility.gm
      ? null
      : [
          "inventory",
          "fa-box-open",
          "Inventory.Title",
          [...actor.items.values()].filter(
            item => adapter.inventoryCategory?.(item) != null
          )
        ];
    if (inventoryCategory) categories.push(inventoryCategory);
    const featureCategory = categories.find(
      ([category]) => category === "features"
    );
    const skillCategory = categories.find(
      ([category]) => category === "skills"
    );

    if (!categories.length) {
      hudState.combatCategory = null;
      return "";
    }

    const available = categories.filter(
      ([key]) =>
        !hudState.hudLayouts?.[`combat:tabs`]?.hidden.includes(`tab:${key}`)
    );
    if (
      visibility.gm &&
      !available.some(([key]) => key === hudState.combatCategory)
    )
      hudState.combatCategory = available[0]?.[0] ?? null;
    const selectedCategory = available.find(
      ([category]) => category === hudState.combatCategory
    );
    if (hudState.combatCategory && !selectedCategory) {
      hudState.combatCategory = null;
    }
    const isSkills = hudState.combatCategory === "skills";
    const items =
      selectedCategory && !isSkills
        ? sortItems(
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
          reason: "category",
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
        category !== "skills" &&
        category !== "inventory"
    );

    return `
        <div class="ws-combat-actions">
          <div class="ws-combat-filters">
            ${primary.map(category => categoryButton(category)).join("")}
            ${actionTypes.map(category => categoryButton(category)).join("")}
            ${featureCategory ? categoryButton(featureCategory) : ""}
            ${skillCategory ? categoryButton(skillCategory) : ""}
            ${inventoryCategory ? categoryButton(inventoryCategory) : ""}
          </div>

          ${isSkills ? skillFilterHTML() : ""}

          ${hudState.combatCategory === "spells" ? spellFilterHTML() : ""}
          ${hudState.combatCategory === "features" ? `<div class="ws-feature-filter"><button type="button" class="ws-button ${hudState.showPassiveFeatures ? "ws-active" : ""}" data-action="featurefilter" aria-pressed="${Boolean(hudState.showPassiveFeatures)}">${t(hudState.showPassiveFeatures ? "Combat.ShowActiveFeatures" : "Combat.ShowPassiveFeatures")}</button></div>` : ""}

          ${
            hudState.combatCategory === "inventory"
              ? renderInventoryPanel({
                  combatItemButton,
                  escapeHTML,
                  hudState,
                  inventoryCategories,
                  inventoryItems,
                  inventorySummary,
                  sortItems,
                  t
                })
              : hudState.combatCategory
                ? `<div class="ws-combat-item-list">
            ${
              isSkills
                ? `<div class="ws-combat-item-grid">${skillsHTML("combat")}</div>${trainedToolsHTML?.() ?? ""}`
                : items.length
                  ? hudState.combatCategory === "spells"
                    ? spellGroups(items) ||
                      `<div class="ws-empty">${t("Combat.EmptyPrepared")}</div>`
                    : organizedCards(
                        items,
                        `combat:${hudState.combatCategory}${hudState.combatCategory === "features" ? (hudState.showPassiveFeatures ? ":passive" : ":active") : ""}`,
                        true
                      )
                  : `<div class="ws-empty">${t(hudState.combatCategory === "features" ? (hudState.showPassiveFeatures ? "Combat.EmptyPassiveFeatures" : "Combat.EmptyActiveFeatures") : "Combat.Empty")}</div>`
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
        const cards = entries.map(({ item, activity }) => ({
          key: itemLayoutKey(item, activity.id),
          name: `${item.name}: ${activity.name}`,
          html: `<div class="ws-gm-special-row">${combatItemButton(item, { activityId: activity.id })}${kind === "legendary" ? `<span class="ws-gm-action-cost" title="${t("GM.ActionCost")}">${escapeHTML(activity.activation.value ?? 1)}</span>` : ""}</div>`
        }));
        return `<section class="ws-gm-special"><h3><span>${t(title)}</span>${resource ? `<b>${resource.value}/${resource.max}</b>` : ""}</h3>${renderItemLayout({ entries: cards, scope: `gm:${kind}`, hudState, escapeHTML, t })}</section>`;
      })
      .join("");

  return {
    withUsageTargets: combatItemButton.withUsageTargets,
    combatActions,
    gmSpecialActions,
    combatItemButton,
    combatItems,
    favoriteSection,
    inventorySummary,
    inventoryCategories,
    inventoryItems,
    escapeHTML,
    globalSearchPanel,
    sortItems,
    spellGroups
  };
}
