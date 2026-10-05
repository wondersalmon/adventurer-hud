import { renderItemLayout, itemLayoutKey } from "./item-layout.js";

export function renderInventoryPanel(context) {
  const {
    combatItemButton,
    escapeHTML,
    hudState,
    inventoryCategories,
    inventoryItems,
    inventorySummary,
    sortItems,
    t
  } = context;
  const items = sortItems(inventoryItems(hudState.inventoryCategory));
  return `
      ${inventorySummary?.() ?? ""}


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
            ? renderItemLayout({
                entries: items.map(item => ({
                  key: itemLayoutKey(item),
                  name: item.name,
                  html: combatItemButton(item)
                })),
                scope: `inventory:${hudState.inventoryCategory}`,
                hudState,
                escapeHTML,
                t
              })
            : `<div class="ws-empty">${t("Inventory.Empty")}</div>`
        }
      </div>

  `;
}
